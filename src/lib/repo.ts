// src/lib/repo.ts
import { adminDb } from "./firebaseAdmin";

// Eski Supabase sorgularına isim/çıktı olarak yakın fonksiyonlar:

export async function getRecentTickers(limit = 12) {
  const snap = await adminDb
    .collection("tickers")
    .orderBy("updatedAt", "desc")
    .limit(limit)
    .get();

  return snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
}

export async function getAllTickers() {
  const snap = await adminDb.collection("tickers").get();
  return snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
}

export async function getCompanyDoc(ticker: string) {
  const doc = await adminDb.collection("tickers").doc(ticker).get();
  return doc.exists ? ({ id: doc.id, ...(doc.data() as any) }) : null;
}

export async function getFinTidyRows(ticker: string) {
  const snap = await adminDb
    .collection("tickers").doc(ticker)
    .collection("sheets").doc("FIN.tidy")
    .collection("rows")
    .orderBy("period", "asc")
    .get();

  return snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
}

// İstersen ileride ratios, prices, KAP için de benzer işlevler ekleriz.
