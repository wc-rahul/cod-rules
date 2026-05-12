import { useLoaderData, useNavigate } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { FirebaseSessionStorage } from "../firebaseSessionStorage";
import { useState } from "react";

const storage = new FirebaseSessionStorage();

export const loader = async ({ request }) => {
	// Ensure admin auth
	const { admin, session } = await authenticate.admin(request);
	const shop = session.shop;

	// Load all rule documents for this shop and the shop-level doc
	const rules = await storage.getAllRulesByShop(shop);
	const shopDoc = await storage.getShopDoc(shop);
	const activeRuleId = shopDoc?.activeRuleId ?? null;

	return { rules, activeRuleId };
};

export default function Index() {
	const { rules, activeRuleId } = useLoaderData();
	const navigate = useNavigate();
	const [loadingRuleId, setLoadingRuleId] = useState(null);

	const handleCreateRule = () => navigate("/app/rules?new=true");
	const handleEdit = (ruleId) => navigate(`/app/rules?ruleId=${ruleId}`);

	// call server endpoint to set active; update UI state while waiting
	const setActive = async (ruleId) => {
		if (!ruleId) return;
		setLoadingRuleId(ruleId);
		try {
			const resp = await fetch("/api/rules/set-active", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ ruleId }),
			});
			const json = await resp.json();

			// Log everything returned from server for debugging
			console.log("Set-active response:", json);

			if (!resp.ok) {
				console.error("Set active failed", json);
				alert(json?.error || (json?.errors && JSON.stringify(json.errors)) || "Failed to set active rule");
				return;
			}

			// If server used fallback to metafield, show that clearly
			if (json?.fallback === "metafield" || json?.usedFallback) {
				console.warn("PaymentCustomization not used — metafield fallback applied", json);
				alert("Activated via metafield fallback. Check server logs and debug info in console.");
				// reload so UI shows active badge
				location.reload();
				return;
			}

			// If mutation response exists but paymentCustomizations list is empty, surface debug info
			if (json?.paymentCustomizationsList?.data?.paymentCustomizations?.nodes?.length === 0) {
				console.warn("paymentCustomizations query returned empty list after activation", json?.paymentCustomizationsList);
				alert("Created/updated PaymentCustomization, but listing returned empty. Check console for detailed response.");
				console.log("mutationRespJson:", json?.mutationRespJson);
				console.log("verifyJson:", json?.verifyJson);
				console.log("paymentCustomizationsList:", json?.paymentCustomizationsList);
				return;
			}

			// Success — reload to reflect active rule
			location.reload();
		} catch (err) {
			console.error(err);
			alert(err?.message ?? "Error setting active rule");
		} finally {
			setLoadingRuleId(null);
		}
	};

	return (
		<>
			<s-page>
        <s-section background="subdued">

          <s-stack direction="block" gap="small" style={{ padding: 16 }}>
            {/* Header row with primary action */}
            <s-stack direction="inline" align="center" justify="space-between">
              <div>
                <h1 style={{ margin: 0 }}>COD Smart App</h1>
              </div>
              <s-button variant="primary" onClick={handleCreateRule}>
                Generate a Rules
              </s-button>
            </s-stack>

            {/* Cards container */}
            <s-card>
              <div slot="header" style={{ padding: "12px 16px" }}>
                <h2 style={{ margin: 0 }}>All Rules</h2>
              </div>

              <div style={{ padding: 16 }}>
                {rules.length === 0 ? (
                  <div style={{ textAlign: "center", color: "#666", padding: 20 }}>
                    No rules created yet. Click "Generate a Rules" to create one.
                  </div>
                ) : (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
                    {rules.map((rule) => (
                      <s-clickable
                        key={rule.ruleId}
                        border="base"
                        padding="base"
                        background="subdued"
                        borderRadius="base"
                        style={{ display: "block" }}
                      >
                        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 8 }}>
                          <div style={{ fontWeight: 600 }}>{rule.rulename ?? rule.shop ?? rule.ruleId}</div>
                          <div style={{ color: "#666", fontSize: 12 }}>{rule.shop ? `Store: ${rule.shop}` : `ID: ${rule.ruleId}`}</div>
                          <div style={{ color: "#999", fontSize: 12 }}>Updated: {rule.updatedAt ? new Date(rule.updatedAt).toLocaleString() : "-"}</div>
                        </div>

                        {/* Action row: Edit + Set active */}
                        <s-stack direction="inline" gap="small">
                          <s-button variant="secondary" onClick={() => handleEdit(rule.ruleId)}>Edit</s-button>

                          {activeRuleId === rule.ruleId ? (
                            <s-button variant="primary" disabled>
                              Active
                            </s-button>
                          ) : (
                            <s-button
                              variant="primary"
                              loading={loadingRuleId === rule.ruleId}
                              onClick={() => setActive(rule.ruleId)}
                            >
                              Set active
                            </s-button>
                          )}
                        </s-stack>
                      </s-clickable>
                    ))}
                  </div>
                )}
              </div>
            </s-card>
          </s-stack>
        </s-section>
			</s-page>
		</>
	);
}

export const headers = (headersArgs) => {
	return boundary.headers(headersArgs);
};
