import { authenticate } from "../shopify.server";

const PAYMENT_CUSTOMIZATION_CREATE_MUTATION = `
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
      paymentCustomization {
        id
        title
        enabled
        metafield(namespace: "$app:cod-rules-payment", key: "function-configuration") {
          id
          type
          value
        }
      }
      userErrors {
        field
        message
        code
      }
    }
  }
`;

export const action = async ({ request }) => {
  try {
    const { admin } = await authenticate.admin(request);

    // Support JSON and form submissions
    const contentType = (request.headers.get("content-type") || "").toLowerCase();
    let payload;
    if (contentType.includes("application/json")) {
      payload = await request.json();
    } else {
      const fd = await request.formData();
      const rulesStr = fd.get("rules");
      payload = {
        rules: rulesStr ? JSON.parse(rulesStr) : {},
        title: fd.get("title") ?? null,
        key: fd.get("key") ?? null,
      };
    }

    const rulesObject = payload.rules ?? {};
    const rulesJson = JSON.stringify(rulesObject);

    const functionHandle = process.env.PAYMENT_FUNCTION_HANDLE;
    if (!functionHandle) {
      return new Response(JSON.stringify({ ok: false, error: "PAYMENT_FUNCTION_HANDLE not configured" }), { status: 400, headers: { "Content-Type": "application/json" } });
    }

    const title = payload.title ?? process.env.APP_NAME ?? "Payment Rules";

    let resp = await admin.graphql(PAYMENT_CUSTOMIZATION_CREATE_MUTATION, {
      variables: { functionHandle, title, rulesJson },
    });
    let result = await resp.json();

    let userErrors = result?.data?.paymentCustomizationCreate?.userErrors ?? [];

    // If function is missing, try PAYMENT_FUNCTION_UID fallback if provided
    const isFunctionMissing = userErrors.some((e) => /Function .* not found/i.test(e.message) || /function.*not found/i.test(e.message));
    const functionUid = process.env.PAYMENT_FUNCTION_UID ?? null;
    if (isFunctionMissing && functionUid && functionUid !== functionHandle) {
      console.log("Retry PaymentCustomizationCreate with PAYMENT_FUNCTION_UID", functionUid);
      resp = await admin.graphql(PAYMENT_CUSTOMIZATION_CREATE_MUTATION, { variables: { functionHandle: functionUid, title, rulesJson } });
      result = await resp.json();
      userErrors = result?.data?.paymentCustomizationCreate?.userErrors ?? [];
    }

    if (userErrors.length) {
      console.error("payment-customization-create userErrors:", JSON.stringify(userErrors, null, 2));
      return new Response(JSON.stringify({ ok: false, userErrors, mutationRespJson: result }), { status: 400, headers: { "Content-Type": "application/json" } });
    }

    const pc = result?.data?.paymentCustomizationCreate?.paymentCustomization ?? null;
    return new Response(JSON.stringify({ ok: true, paymentCustomization: pc }), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (err) {
    console.error("payment-customization-create error", err);
    return new Response(JSON.stringify({ ok: false, error: String(err) }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
};

export const loader = async () => new Response(null, { status: 405 });
