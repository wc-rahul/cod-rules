// firebaseSessionStorage.js
import admin from "firebase-admin";
import { Session } from "@shopify/shopify-api";

console.log('=====================>>>>>>>>>', process.env.SHOPIFY_DB_PRIVATE_KEY);
const serviceAccount = {
    "type": "service_account",
    "project_id": "cod-rules",
    "private_key_id": "ef1ab4251da3f7e04dd54fb78a284fe11bf6beba",
    "private_key": "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDwks37riNBzJol\n458KVWSOetOa20yaP6KujKUqOC0HxbDrYUTJfL529+NHh7UFkvjNMZ7tJkbQrNxg\nzRYDnZDdgzSllhxhk3QkxlcUoBTpuAEFPkQXSyrkEhSvALnz4R8F3B27bpcM6ksU\n+GN34IAfgPMO/eZZkCiOPd3C4BKdNzB7r4ACaSgej10Qmq0cOo8EShqAbOSpT3ma\n10e76L8GYZAg9pg2Ih4IuEOX6hHV1vgOKdx3KxODq2k2dgG5m2iXngtX6jFr4jPO\nvHZO+zZTTrwh3CRetu0fwMPpOHmoeDj7++rSNdO1VwDaHW2cQ+jKuOmiCDWSRMCF\na5NnITgJAgMBAAECggEAFaEFREb5jtgP1dnl+ckH+OgMb/meefxq/77Pt1YvSj8Z\nCG3e1YSnH81qpuA0bhNdgMlLd25/uGbfi2kfkmSkr8hflTGZTKE0CdML5OP9mAO9\n577w4pfp+8ZaYLTegxGEN1knvSsUs98OsAx4Q5YGFDmvi0iti0jdiehVsJ3Hs/r5\nJCZfc7XdpHewQLR1tzEWrMpdsUPYgxuzBA/EYnMz53tIpdTRGSBCzY754GbDMBTK\nbiJ+F+vzWzJ6td4gWVCuq7fpdweftMFbDO0tbdtGXg98GVcmHH6ufDQZIWWiuo1E\ns2klkort37tMecJduz+VG1Shwdw5+Q+dDMA/Z0wnZwKBgQD9EuZ0yWc7wVjwLRAN\n7YwwcfiK7kDcCLze8MfSK5wOm00lj8khu7kkk5RpYFm1VN5qjmLMrwjHmwDxOr01\nDgOjl3xpsOI88TnaUWQXfFNCVVn4kkMB6x0eHgCg/whOBeCL+EaMRh6pocRlvd2Q\nxxh6U3bkARXR/uVpkqE7q9VHIwKBgQDzWuc6auSnPxE/FdZVIkrozD8wxSJgVdVx\nWU7hZfESZ/jqZjAUeGVXqN3eV7dduEmrMuD7j4jQNu++FdORd+Vs4tKKsWdn+3vr\nHuUWtKz4AsVOF/vQL0gG2zsOfqMC4WVf1jB4qloDEW3TaJf3pF8nor0N5gdyUEkj\n8I3t8TSM4wKBgFoOFLXwSW0JI3XsAy+BnYZLuC7wE2J5NYR72A9g91p3Rx+bp+36\nGCr83S4WXDXbqn3uhxfhHVWyQcaVqWiswPzA1kPh7s/S40xd9CkrU5FiP+7lVTTk\njmr+MCkaN8FT9BC625flB9pDN1khFCwFvR8ifkcqX7JnawmDZR6PyghTAoGBALna\n/yW6ZY7lt8I6Z0r1ucg51TjmFe8FHtJGptu2A3tPNOevy6CWoq9kJK6ex0goavr5\nDKKTaKW8jzTZbo92xh12zd1mx9a+VlGncsb4jfGMDCwsXQEOWzABVwUm6lBU3Btp\ndfNyBvS45uvCwe07+ABJZaGrwJwpfPKZ0Yub38qJAoGAE46kIUB4D0jaTRlDdqs4\nQKVC9mn+lcf+/QRZmxscer2/bHVTJA4QlNNsQ2DdZMq8jkND3pufqXYegLX/OcPy\nkOkIWSv4cJ08Iq8JqSY6dKsX2GKuacgucfPu5SBEmdIq1D2E/sV9mytc3x+iGhvT\nQKVJ7csuajnA9gw35KA6t30=\n-----END PRIVATE KEY-----\n",
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