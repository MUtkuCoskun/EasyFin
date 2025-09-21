// src/lib/firebaseAdmin.ts  (SERVER)
import { getApps, initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

let app = getApps()[0];
if (!app) {
  const json = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!json) throw new Error("FIREBASE_SERVICE_ACCOUNT env not set");
  const creds = JSON.parse(json);
  app = initializeApp({
    credential: cert({
      projectId: creds.project_id,
      clientEmail: creds.client_email,
      privateKey: creds.private_key,
    }),
  });
}
export const adminDb = getFirestore(app);
