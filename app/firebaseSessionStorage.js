// firebaseSessionStorage.js
import admin from "firebase-admin";
import { Session } from "@shopify/shopify-api";

const serviceAccount = {
    "type": "service_account",
    "project_id": "cod-rules",
    "private_key_id": "ef1ab4251da3f7e04dd54fb78a284fe11bf6beba",
    "private_key": process.env.GOOGLE_PRIVATE_KEY,
    "client_email": "firebase-adminsdk-fbsvc@cod-rules.iam.gserviceaccount.com",
    "client_id": "112140114786647885711",
    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
    "token_uri": "https://oauth2.googleapis.com/token",
    "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
    "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/firebase-adminsdk-fbsvc%40cod-rules.iam.gserviceaccount.com",
    "universe_domain": "googleapis.com"
}

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
    });
}

const db = admin.firestore();

export class FirebaseSessionStorage {
    async storeSession(session) {
        const sessionObj = typeof session.toObject === 'function' ? session.toObject() : { ...session };
        await db.collection("sessions").doc(session.id).set(sessionObj);
        return true;
    }

    async loadSession(id) {
        const doc = await db.collection("sessions").doc(id).get();
        if (!doc.exists) return undefined;

        const data = doc.data();
        if (data.expires && data.expires.toDate) {
            data.expires = data.expires.toDate();
        } else if (data.expires && (typeof data.expires === 'string' || typeof data.expires === 'number')) {
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

        return snapshot.docs.map(doc => {
            const data = doc.data();
            if (data.expires && data.expires.toDate) {
                data.expires = data.expires.toDate();
            } else if (data.expires && (typeof data.expires === 'string' || typeof data.expires === 'number')) {
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
        snapshot.docs.forEach(doc => batch.delete(doc.ref));
        await batch.commit();
        return true;
    }
}