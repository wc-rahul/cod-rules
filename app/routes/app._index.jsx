import { useEffect, useState } from "react";
import { useFetcher, useNavigate } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  await authenticate.admin(request);

  return null;
};

export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
};

export default function Index() {
  const navigate = useNavigate();
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchRules();
  }, []);

  const fetchRules = async () => {
    try {
      const response = await fetch("/api/rules/all");
      const data = await response.json();
      setRules(data);
    } catch (error) {
      console.error("Error fetching rules:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateRule = () => {
    navigate("/app/rules?new=true");
  };

  const handleCardClick = (ruleId) => {
    navigate(`/app/rules?ruleId=${ruleId}`);
  };

  return (
    <div style={{ padding: "20px" }}>
      <div style={{ marginBottom: "20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1>COD Smart App</h1>
        <button-primary onClick={handleCreateRule}>
          Generate a Rules
        </button-primary>
      </div>

      <card style={{ padding: "0" }}>
        <div style={{ padding: "16px" }}>
          <h2>All Rules</h2>
        </div>
      </card>

      {loading ? (
        <div style={{ marginTop: "20px", textAlign: "center" }}>Loading rules...</div>
      ) : rules.length === 0 ? (
        <div style={{ marginTop: "20px", textAlign: "center", color: "#666" }}>
          No rules created yet. Click "Generate a Rules" to create one.
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "16px", marginTop: "16px" }}>
          {rules.map((rule) => (
            <card
              key={rule.ruleId}
              onClick={() => handleCardClick(rule.ruleId)}
              style={{ cursor: "pointer", padding: "16px" }}
            >
              <div>
                <h3 style={{ margin: "0 0 8px 0" }}>{rule.shop}</h3>
                <p style={{ margin: "0 0 8px 0", color: "#666", fontSize: "12px" }}>
                  ID: {rule.ruleId}
                </p>
                <p style={{ margin: "0", color: "#999", fontSize: "12px" }}>
                  Updated: {new Date(rule.updatedAt).toLocaleDateString()}
                </p>
              </div>
            </card>
          ))}
        </div>
      )}
    </div>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
