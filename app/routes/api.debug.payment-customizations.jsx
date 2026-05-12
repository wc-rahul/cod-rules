import { authenticate } from "../shopify.server";

const PAYMENT_CUSTOMIZATIONS_LIST_QUERY = `
  query PaymentCustomizationsList {
    paymentCustomizations(first: 250) {
      nodes {
        id
        title
        enabled
        functionId
        createdAt
        __typename
      }
    }   
  }
`;

export const action = async ({ request }) => {
  try {
    const { admin } = await authenticate.admin(request);

    const resp = await admin.graphql(PAYMENT_CUSTOMIZATIONS_LIST_QUERY);
    const json = await resp.json();

    // log server-side for terminal inspection
    console.log("DEBUG paymentCustomizations list:", JSON.stringify(json, null, 2));

    return new Response(JSON.stringify({ ok: true, result: json }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Debug endpoint error", err);
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};

export const loader = async () => new Response(null, { status: 405 });
