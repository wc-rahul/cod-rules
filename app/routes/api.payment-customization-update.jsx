import { authenticate } from "../shopify.server";

const PAYMENT_CUSTOMIZATION_UPDATE_MUTATION = `
  mutation PaymentCustomizationUpdate($id: ID!, $paymentCustomization: PaymentCustomizationInput!) {
    paymentCustomizationUpdate(id: $id, paymentCustomization: $paymentCustomization) {
      paymentCustomization {
        id
        title
        enabled
      }
      userErrors {
        field
        message
      }
    }
  }
`;

export const action = async ({ request }) => {
  try {
    const { admin } = await authenticate.admin(request);

    const contentType = (request.headers.get("content-type") || "").toLowerCase();
    let payload;
    if (contentType.includes("application/json")) {
      payload = await request.json();
    } else {
      const fd = await request.formData();
      const id = fd.get("id");
      const pcStr = fd.get("paymentCustomization");
      payload = { id, paymentCustomization: pcStr ? JSON.parse(pcStr) : null };
    }

    const id = payload.id;
    const paymentCustomization = payload.paymentCustomization;

    if (!id || !paymentCustomization) {
      return new Response(JSON.stringify({ ok: false, error: "id and paymentCustomization required" }), { status: 400, headers: { "Content-Type": "application/json" } });
    }

    // Normalize metafield namespace/key if caller used legacy "payment_rules"
    if (Array.isArray(paymentCustomization.metafields)) {
      paymentCustomization.metafields = paymentCustomization.metafields.map((m) => {
        const nm = { ...m };
        if (nm.namespace === "payment_rules") {
          nm.namespace = "$app:cod-rules-payment";
        }
        // If caller passed a dynamic key (rule id), normalize to fixed key expected by extension
        if (nm.key && nm.key !== "function-configuration") {
          nm.key = "function-configuration";
        }
        return nm;
      });
    }

    const resp = await admin.graphql(PAYMENT_CUSTOMIZATION_UPDATE_MUTATION, { variables: { id, paymentCustomization } });
    const json = await resp.json();

    const userErrors = json?.data?.paymentCustomizationUpdate?.userErrors ?? [];
    if (userErrors.length) {
      return new Response(JSON.stringify({ ok: false, userErrors }), { status: 400, headers: { "Content-Type": "application/json" } });
    }

    const pc = json?.data?.paymentCustomizationUpdate?.paymentCustomization ?? null;
    return new Response(JSON.stringify({ ok: true, paymentCustomization: pc }), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (err) {
    console.error("payment-customization-update error", err);
    return new Response(JSON.stringify({ ok: false, error: String(err) }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
};

export const loader = async () => new Response(null, { status: 405 });
