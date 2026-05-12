import { authenticate } from "../shopify.server";
import { FirebaseSessionStorage } from "../firebaseSessionStorage";

const storage = new FirebaseSessionStorage();

async function upsertShopMetafield(admin, ownerId, key, value) {
	// Upsert shop-scoped metafield as fallback
	const METAFIELDS_SET_MUTATION = `
	  mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
		metafieldsSet(metafields: $metafields) {
		  metafields {
			id
			key
			namespace
			type
			value
		  }
		  userErrors {
			field
			message
		  }
		}
	  }
	`;
	const variables = {
		metafields: [
			{
				ownerId,
				// Keep shop fallback in the same app namespace so it's easier to reconcile
				namespace: "$app:cod-rules-payment",
				key,
				type: "json",
				value,
			},
		],
	};
	const resp = await admin.graphql(METAFIELDS_SET_MUTATION, { variables });
	return resp.json();
}

const PAYMENT_CUSTOMIZATION_CREATE = `
	mutation PaymentCustomizationCreate($functionHandle: String!, $title: String!, $rulesJson: String!) {
		paymentCustomizationCreate(
			paymentCustomization: {
				functionHandle: $functionHandle
				title: $title
				enabled: true
				metafields: [
					{
						namespace: "$app:cod-rules-payment"
						key: "function-configuration"
						type: "json"
						value: $rulesJson
					}
				]
			}
		) {
			paymentCustomization { id }
			userErrors { field message code }
		}
	}
`;

const PAYMENT_CUSTOMIZATION_UPDATE = `
	mutation PaymentCustomizationUpdate($id: ID!, $paymentCustomization: PaymentCustomizationInput!) {
		paymentCustomizationUpdate(id: $id, paymentCustomization: $paymentCustomization) {
			paymentCustomization { id }
			userErrors { field message code }
		}
	}
`;

const PAYMENT_CUSTOMIZATION_ACTIVATION = `
  mutation PaymentCustomizationActivation($ids: [ID!]!, $enabled: Boolean!) {
    paymentCustomizationActivation(ids: $ids, enabled: $enabled) {
      ids
      userErrors { field message }
    }
  }
`;

const GET_PC_METAFIELDS = `
	query GetPaymentCustomizationMetafields($id: ID!) {
		node(id: $id) {
			... on PaymentCustomization {
				id
				metafields(first: 10, namespace: "$app:cod-rules-payment") {
					edges {
						node {
							id
							namespace
							key
							type
							value
						}
					}
				}
			}
		}
	}
`;

const PAYMENT_CUSTOMIZATIONS_LIST_QUERY = `
  query PaymentCustomizationsList {
    paymentCustomizations(first: 250) {
      nodes {
        id
        title
        enabled
        functionId
        __typename
      }
    }
  }
`;

// POST only endpoint — sets active rule and syncs PaymentCustomization (create/update + activate/deactivate)
export const action = async ({ request }) => {
	try {
		const { admin, session } = await authenticate.admin(request);
		const shop = session.shop;

		const body = await request.json();
		const { ruleId } = body;
		if (!ruleId) {
			return new Response(JSON.stringify({ ok: false, error: "ruleId required" }), { status: 400, headers: { "Content-Type": "application/json" } });
		}

		// Persist activeRuleId on shop doc
		await storage.setActiveRule(shop, ruleId);

		// Load rule document to get JSON to push to payment customization
		const ruleDoc = await storage.loadRules(shop, ruleId);
		if (!ruleDoc) {
			return new Response(JSON.stringify({ ok: false, error: "rule not found" }), { status: 404, headers: { "Content-Type": "application/json" } });
		}

		// Prepare rule JSON to push into metafield
		const rulesJsonValue = JSON.stringify({ ...ruleDoc, firestoreId: ruleId });

		// Find existing paymentCustomization id saved on shop doc (if any)
		const shopDoc = await storage.getShopDoc(shop);
		let existingPcId = shopDoc?.paymentCustomizationId ?? null;

		// Fetch shop GID (owner) for fallback metafield upsert
		const shopResp = await admin.graphql(`{ shop { id } }`);
		const shopJson = await shopResp.json();
		const ownerId = shopJson?.data?.shop?.id ?? null;

		// function handle and title
		const functionHandle = process.env.PAYMENT_FUNCTION_HANDLE ?? null;
		const title = ruleDoc?.rulename ?? ruleDoc?.name ?? process.env.APP_NAME ?? "COD Smart App";
		// Use fixed namespace/key pair expected by the extension so the function receives configuration
		const key = "function-configuration";

		// Check configured scopes for mutations (helpful for debugging permission errors)
		const configuredScopes = (process.env.SCOPES || "").split(",").map((s) => s.trim()).filter(Boolean);
		const requiredScopes = ["write_payment_customizations", "write_metafields"];
		const missingScopes = requiredScopes.filter((s) => !configuredScopes.includes(s));

		let mutationRespJson = null;
		let pcId = null;
		let usedFallback = false;

		// Try update if we have an existing PC id
		if (existingPcId) {
			// Try to read existing metafield id so we can update it instead of creating a new metafield
			let existingMfId = null;
			try {
				const mfResp = await admin.graphql(GET_PC_METAFIELDS, { variables: { id: existingPcId } });
				const mfJson = await mfResp.json();
				const edges = mfJson?.data?.node?.metafields?.edges ?? [];
				for (const e of edges) {
					const n = e.node;
					if (n?.key === key && n?.namespace === "$app:cod-rules-payment") {
						existingMfId = n.id;
						break;
					}
				}
			} catch (err) {
				console.warn("Failed to fetch existing metafield id", err);
			}

			const input = {
				title,
				enabled: true,
				metafields: [
					{
						// include id when present so API updates the existing metafield
						id: existingMfId,
						namespace: "$app:cod-rules-payment",
						key,
						type: "json",
						value: rulesJsonValue,
					},
				],
			};
			const resp = await admin.graphql(PAYMENT_CUSTOMIZATION_UPDATE, { variables: { id: existingPcId, paymentCustomization: input } });
			mutationRespJson = await resp.json();
			const userErrors = mutationRespJson?.data?.paymentCustomizationUpdate?.userErrors ?? [];
			if (userErrors.length) {
				// If function missing or other errors, fallback to shop metafield
				const isFunctionMissing = userErrors.some((e) => /Function .* not found/i.test(e.message) || /function.*not found/i.test(e.message));
				if (!isFunctionMissing) {
					console.error("PaymentCustomization update failed userErrors:", JSON.stringify(userErrors, null, 2));
					return new Response(JSON.stringify({ ok: false, errors: userErrors, mutationRespJson, missingScopes }), { status: 500, headers: { "Content-Type": "application/json" } });
				}
				// Try retrying with PAYMENT_FUNCTION_UID (if configured) before falling back
				const functionUid = process.env.PAYMENT_FUNCTION_UID ?? null;
				if (functionUid && functionUid !== functionHandle) {
					console.log("Retrying PaymentCustomizationCreate with PAYMENT_FUNCTION_UID", functionUid);
					const retryResp = await admin.graphql(PAYMENT_CUSTOMIZATION_CREATE, { variables: { functionHandle: functionUid, title, rulesJson: rulesJsonValue } });
					const retryJson = await retryResp.json();
					const retryErrors = retryJson?.data?.paymentCustomizationCreate?.userErrors ?? [];
					if (!retryErrors.length) {
						mutationRespJson = retryJson;
						pcId = retryJson?.data?.paymentCustomizationCreate?.paymentCustomization?.id ?? null;
						if (pcId) {
							await storage.setPaymentCustomizationId(shop, pcId);
						}
						console.log("Retry create succeeded with PAYMENT_FUNCTION_UID", pcId);
					} else {
						console.warn("Retry create still failed", JSON.stringify(retryErrors, null, 2));
					}
				}
				// function missing -> fallback
				if (!ownerId) {
					console.warn("Function missing and ownerId unavailable; returning fallback note");
					return new Response(JSON.stringify({ ok: true, activeRuleId: ruleId, paymentCustomization: null, note: "function handle not found and ownerId unavailable", missingScopes }), { status: 200, headers: { "Content-Type": "application/json" } });
				}
				const mfJson = await upsertShopMetafield(admin, ownerId, key, rulesJsonValue);
				usedFallback = true;
				console.log("Falling back to shop metafield (update). mutationRespJson:", JSON.stringify(mutationRespJson, null, 2));
				return new Response(JSON.stringify({ ok: true, activeRuleId: ruleId, fallback: "metafield", metafieldResult: mfJson, mutationRespJson, missingScopes }), { status: 200, headers: { "Content-Type": "application/json" } });
			}
			pcId = mutationRespJson?.data?.paymentCustomizationUpdate?.paymentCustomization?.id ?? null;
		} else {
			// Create new PaymentCustomization (requires functionHandle)
			if (!functionHandle) {
				// If function handle is not configured, fallback to shop metafield
				if (!ownerId) {
					console.warn("PAYMENT_FUNCTION_HANDLE not set and ownerId unavailable");
					return new Response(JSON.stringify({ ok: true, activeRuleId: ruleId, paymentCustomization: null, note: "PAYMENT_FUNCTION_HANDLE not set and ownerId unavailable", missingScopes }), { status: 200, headers: { "Content-Type": "application/json" } });
				}
				const mfJson = await upsertShopMetafield(admin, ownerId, key, rulesJsonValue);
				usedFallback = true;
				console.log("Falling back to shop metafield because PAYMENT_FUNCTION_HANDLE unset");
				return new Response(JSON.stringify({ ok: true, activeRuleId: ruleId, fallback: "metafield", metafieldResult: mfJson, note: "PAYMENT_FUNCTION_HANDLE not configured", missingScopes }), { status: 200, headers: { "Content-Type": "application/json" } });
			}

			const resp = await admin.graphql(PAYMENT_CUSTOMIZATION_CREATE, { variables: { functionHandle, title, rulesJson: rulesJsonValue } });
			mutationRespJson = await resp.json();
			const userErrors = mutationRespJson?.data?.paymentCustomizationCreate?.userErrors ?? [];
			if (userErrors.length) {
				const isFunctionMissing = userErrors.some((e) => /Function .* not found/i.test(e.message) || /function.*not found/i.test(e.message));
				if (!isFunctionMissing) {
					console.error("PaymentCustomization create failed userErrors:", JSON.stringify(userErrors, null, 2));
					return new Response(JSON.stringify({ ok: false, errors: userErrors, mutationRespJson, missingScopes }), { status: 500, headers: { "Content-Type": "application/json" } });
				}
				// fallback to metafield
				if (!ownerId) {
					return new Response(JSON.stringify({ ok: true, activeRuleId: ruleId, paymentCustomization: null, note: "function handle not found and ownerId unavailable" }), { status: 200, headers: { "Content-Type": "application/json" } });
				}
				const mfJson = await upsertShopMetafield(admin, ownerId, key, rulesJsonValue);
				usedFallback = true;
				console.log("Falling back to shop metafield (create). mutationRespJson:", JSON.stringify(mutationRespJson, null, 2));
				return new Response(JSON.stringify({ ok: true, activeRuleId: ruleId, fallback: "metafield", metafieldResult: mfJson, mutationRespJson, missingScopes }), { status: 200, headers: { "Content-Type": "application/json" } });
			}
			pcId = mutationRespJson?.data?.paymentCustomizationCreate?.paymentCustomization?.id ?? null;
			// Persist pcId on shop doc for future updates
			if (pcId) {
				await storage.setPaymentCustomizationId(shop, pcId);
			}
		}

		// If we did not get a pcId, fallback to metafield
		if (!pcId) {
			if (!ownerId) {
				console.warn("Mutation returned no pcId and ownerId unavailable");
				return new Response(JSON.stringify({ ok: true, activeRuleId: ruleId, paymentCustomization: null, note: "mutation returned no id and ownerId unavailable", mutationRespJson, missingScopes }), { status: 200, headers: { "Content-Type": "application/json" } });
			}
			const mfJson = await upsertShopMetafield(admin, ownerId, key, rulesJsonValue);
			usedFallback = true;
			console.log("Falling back to shop metafield (no pcId). mutationRespJson:", JSON.stringify(mutationRespJson, null, 2));
			return new Response(JSON.stringify({ ok: true, activeRuleId: ruleId, fallback: "metafield", metafieldResult: mfJson, mutationRespJson, missingScopes }), { status: 200, headers: { "Content-Type": "application/json" } });
		}

		// Activate the target paymentCustomization and deactivate others so only one is active
		// 1) fetch all paymentCustomizations to find other ids
		const listResp = await admin.graphql(PAYMENT_CUSTOMIZATIONS_LIST_QUERY);
		const listJson = await listResp.json();
		const nodes = listJson?.data?.paymentCustomizations?.nodes ?? [];
		const allIds = nodes.map((n) => n.id).filter(Boolean);

		// deactivate others (ids without pcId)
		const otherIds = allIds.filter((id) => id !== pcId);
		try {
			if (otherIds.length) {
				await admin.graphql(PAYMENT_CUSTOMIZATION_ACTIVATION, { variables: { ids: otherIds, enabled: false } });
			}
			// activate target
			await admin.graphql(PAYMENT_CUSTOMIZATION_ACTIVATION, { variables: { ids: [pcId], enabled: true } });
		} catch (e) {
			// activation may fail; log and continue (we still consider pc created/updated)
			console.warn("paymentCustomizationActivation error", e);
		}

		// Success: return mutation result and list for debug
		return new Response(JSON.stringify({
			ok: true,
			activeRuleId: ruleId,
			paymentCustomizationId: pcId,
			mutationRespJson,
			paymentCustomizationsList: listJson,
			usedFallback,
		}), { status: 200, headers: { "Content-Type": "application/json" } });

	} catch (err) {
		console.error("Set active error", err);
		return new Response(JSON.stringify({ ok: false, error: String(err) }), { status: 500, headers: { "Content-Type": "application/json" } });
	}
};

export const loader = async () => new Response(null, { status: 405 });
