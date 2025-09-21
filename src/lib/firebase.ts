import { initializeApp, getApps } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// Project settings > General > Web app config'inden aldığın config:
const firebaseConfig = {
  apiKey: "AIzaSyCKybZRK2pOX1CSsec3YXLOuHbLdzsp5uM",
  authDomain: "lazyfin-7d4fc.firebaseapp.com",
  projectId: "lazyfin-7d4fc",
  storageBucket: "lazyfin-7d4fc.firebasestorage.app",
  messagingSenderId: "722056899828",
  appId: "1:722056899828:web:03c925b279dfc909ea82a1",
  measurementId: "G-BG0D7L0NZW"
};

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
export const db = getFirestore(app);
