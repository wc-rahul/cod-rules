// firebaseSessionStorage.js
import admin from "firebase-admin";
import { Session } from "@shopify/shopify-api";

const serviceAccount = {
    "type": process.env.GOOGLE_TYPE,
    "project_id": process.env.GOOGLE_PROJECT_ID,
    "private_key_id": process.env.GOOGLE_PRIVATE_KEY_ID,
    "private_key": process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    "client_email": process.env.GOOGLE_CLIENT_EMAIL,
    "client_id": process.env.GOOGLE_CLIENT_ID,
    "auth_uri": process.env.GOOGLE_AUTH_URI,
    "token_uri": process.env.GOOGLE_TOKEN_URI,
    "auth_provider_x509_cert_url": process.env.GOOGLE_AUTH_PROVIDER_CERT_URL,
    "client_x509_cert_url": process.env.GOOGLE_CLIENT_CERT_URL,
    "universe_domain": process.env.GOOGLE_UNIVERSE_DOMAIN
};

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
    });
}

const db = admin.firestore();

export class FirebaseSessionStorage {

    // ─── Session methods (unchanged) ──────────────────────────────────────────

    async storeSession(session) {
        const sessionObj = typeof session.toObject === "function"
            ? session.toObject()
            : { ...session };
        await db.collection("sessions").doc(session.id).set(sessionObj);
        return true;
    }

    async loadSession(id) {
        const doc = await db.collection("sessions").doc(id).get();
        if (!doc.exists) return undefined;

        const data = doc.data();
        if (data.expires?.toDate) {
            data.expires = data.expires.toDate();
        } else if (data.expires && (typeof data.expires === "string" || typeof data.expires === "number")) {
            data.expires = new Date(data.expires);
        }
        return new Session(data);
    }

    async deleteSession(id) {
        await db.collection("sessions").doc(id).delete();
        return true;
    }

    async findSessionsByShop(shop) {
        const snapshot = await db
            .collection("sessions")
            .where("shop", "==", shop)
            .get();

        return snapshot.docs.map((doc) => {
            const data = doc.data();
            if (data.expires?.toDate) {
                data.expires = data.expires.toDate();
            } else if (data.expires && (typeof data.expires === "string" || typeof data.expires === "number")) {
                data.expires = new Date(data.expires);
            }
            return new Session(data);
        });
    }

    async deleteSessions(shop) {
        const snapshot = await db
            .collection("sessions")
            .where("shop", "==", shop)
            .get();

        const batch = db.batch();
        snapshot.docs.forEach((doc) => batch.delete(doc.ref));
        await batch.commit();
        return true;
    }

    // ─── Rules methods ────────────────────────────────────────────────────────

    /**
     * Save (or overwrite) the COD rules for a shop.
     *
     * Document path:  rules/{shop}
     * Document shape:
     * {
     *   shop:        "example.myshopify.com",
     *   updatedAt:   Firestore Timestamp,
     *   rules: {
     *     countryRule, provinceRules, pincodeRules,
     *     productRule, collectionRule,
     *     productTagRule, customerTagRule,
     *     orderRangeRule,
     *     // selectionIds stored separately — only needed to re-open pickers,
     *     // not needed at checkout evaluation time
     *     _productSelectionIds
     *   }
     * }
     *
     * The document ID is the shop domain so there is always exactly one rules
     * document per shop — no duplicates, no orphaned records.
     *
     * @param {string} shop   - e.g. "example.myshopify.com"
     * @param {object} rules  - the full object returned by buildFinalResult()
     * @returns {string}      - the document ID (= shop)
     */
    async saveRules(shop, rules) {
        // Pull selectionIds out of productRule before saving — they are only
        // needed by the frontend picker, not by checkout rule evaluation.
        const { productRule, ...rest } = rules;
        const { selectionIds, ...productRuleCore } = productRule ?? {};

        const payload = {
            shop,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            rules: {
                ...rest,
                productRule: productRuleCore,
                // Keep selectionIds in a separate key so the loader can
                // restore the picker state without polluting the hot-path data.
                _productSelectionIds: selectionIds ?? [],
            },
        };

        await db.collection("rules").doc(shop).set(payload);
        return shop; // document ID = shop domain
    }

    /**
     * Load the COD rules for a shop.
     *
     * @param {string} shop
     * @returns {{ shop, updatedAt, rules } | null}
     */
    async loadRules(shop) {
        const doc = await db.collection("rules").doc(shop).get();
        if (!doc.exists) return null;

        const data = doc.data();

        // Convert Firestore Timestamp → JS Date for convenience
        if (data.updatedAt?.toDate) {
            data.updatedAt = data.updatedAt.toDate();
        }

        return data;   // { shop, updatedAt, rules: { ... } }
    }
}