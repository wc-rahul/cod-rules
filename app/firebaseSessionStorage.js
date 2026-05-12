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
    async saveRules(shop, rules, ruleId = null) {
        const { productRule, ...rest } = rules;
        const { selectionIds, ...productRuleCore } = productRule ?? {};

        const id = ruleId ?? db.collection("rules").doc().id;

        // determine display name (prefer explicit 'rulename' or 'name' in the payload)
        const displayName = rest.rulename ?? rest.name ?? `Rule ${id}`;

        const ruleEntry = {
            ruleId: id,
            shop,
            rulename: displayName, // required display name for index cards
            ...rest,
            productRule: productRuleCore,
            _productSelectionIds: selectionIds ?? [],
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };

        const shopDocRef = db.collection("rules").doc(shop);
        // Ensure shop doc exists
        await shopDocRef.set({ shop }, { merge: true });

        // Write rule as its own document under subcollection rulesList
        await shopDocRef.collection("rulesList").doc(id).set(ruleEntry, { merge: true });

        return id;
    }

    /**
     * Load a single rule document from rules/{shop}/rulesList/{ruleId},
     * or when ruleId omitted return the shop doc (not the subcollection).
     */
    async loadRules(shop, ruleId = null) {
        if (!shop) {
            throw new Error("shop is a required parameter");
        }

        const shopDocRef = db.collection("rules").doc(shop);

        if (ruleId) {
            const doc = await shopDocRef.collection("rulesList").doc(ruleId).get();
            if (!doc.exists) return null;
            const data = doc.data();
            if (data.updatedAt?.toDate) data.updatedAt = data.updatedAt.toDate();
            return data;
        }

        // Return top-level shop doc if needed
        const doc = await shopDocRef.get();
        if (!doc.exists) return null;
        const data = doc.data();
        if (data.updatedAt?.toDate) data.updatedAt = data.updatedAt.toDate();
        return data;
    }

    /**
     * Get all rule documents for a shop as an array.
     * Path: rules/{shop}/rulesList/{ruleId}
     */
    async getAllRulesByShop(shop) {
        if (!shop) throw new Error("shop is a required parameter");
        const snapshot = await db.collection("rules").doc(shop).collection("rulesList").get();
        return snapshot.docs.map((doc) => {
            const data = doc.data();
            if (data.updatedAt?.toDate) data.updatedAt = data.updatedAt.toDate();
            return data;
        });
    }

    // Set the active rule id on the shop doc (rules/{shop}.activeRuleId)
    async setActiveRule(shop, ruleId) {
        if (!shop) throw new Error("shop is required");
        const shopDocRef = db.collection("rules").doc(shop);
        await shopDocRef.set({ activeRuleId: ruleId }, { merge: true });
        return ruleId;
    }

    // Store the shop-level paymentCustomizationId so we can reuse it
    async setPaymentCustomizationId(shop, paymentCustomizationId) {
        if (!shop) throw new Error("shop is required");
        const shopDocRef = db.collection("rules").doc(shop);
        await shopDocRef.set({ paymentCustomizationId }, { merge: true });
        return paymentCustomizationId;
    }

    // Read top-level shop doc for metadata (activeRuleId, paymentCustomizationId, etc.)
    async getShopDoc(shop) {
        if (!shop) throw new Error("shop is required");
        const doc = await db.collection("rules").doc(shop).get();
        if (!doc.exists) return null;
        const data = doc.data();
        return data;
    }
}