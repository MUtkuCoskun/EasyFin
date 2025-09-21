// src/lib/firebaseAdmin.ts
import { getApps, initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

let app = getApps()[0];
if (!app) {
  const saJson = process.env.FIREBASE_SERVICE_ACCOUNT; // Vercel Secret (JSON string)
  if (!saJson) throw new Error("FIREBASE_SERVICE_ACCOUNT env not set");
  const creds = JSON.parse(saJson);

  app = initializeApp({
    credential: cert({
      projectId: creds.project_id,
      clientEmail: creds.client_email,
      privateKey: creds.private_key,
    }),
  });
}

export const adminDb = getFirestore(app);
