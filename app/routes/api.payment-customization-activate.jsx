import { authenticate } from "../shopify.server";

const PAYMENT_CUSTOMIZATION_ACTIVATION_MUTATION = `
  mutation PaymentCustomizationActivation($ids: [ID!]!, $enabled: Boolean!) {
    paymentCustomizationActivation(ids: $ids, enabled: $enabled) {
      ids
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
    let body;
    if (contentType.includes("application/json")) {
      body = await request.json();
    } else {
      const fd = await request.formData();
      const idsStr = fd.get("ids");
      body = {
        ids: idsStr ? JSON.parse(idsStr) : [],
        enabled: fd.get("enabled") ? fd.get("enabled") === "true" : true,
      };
    }

    const ids = Array.isArray(body.ids) ? body.ids : [];
    const enabled = typeof body.enabled === "boolean" ? body.enabled : (body.enabled === "true");

    if (!ids.length) {
      return new Response(JSON.stringify({ ok: false, error: "ids required" }), { status: 400, headers: { "Content-Type": "application/json" } });
    }

    const resp = await admin.graphql(PAYMENT_CUSTOMIZATION_ACTIVATION_MUTATION, { variables: { ids, enabled } });
    const json = await resp.json();

    const userErrors = json?.data?.paymentCustomizationActivation?.userErrors ?? [];
    if (userErrors.length) {
      return new Response(JSON.stringify({ ok: false, userErrors }), { status: 400, headers: { "Content-Type": "application/json" } });
    }

    const returnedIds = json?.data?.paymentCustomizationActivation?.ids ?? [];
    return new Response(JSON.stringify({ ok: true, ids: returnedIds }), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (err) {
    console.error("payment-customization-activate error", err);
    return new Response(JSON.stringify({ ok: false, error: String(err) }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
};

export const loader = async () => new Response(null, { status: 405 });
