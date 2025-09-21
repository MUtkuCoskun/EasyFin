// ESKİ:
// import * as admin from "firebase-admin";
// admin.initializeApp();
// const db = admin.firestore();

import { initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore"; // <-- Timestamp eklendi
import * as functions from "firebase-functions";
import { google } from "googleapis";

initializeApp();
const db = getFirestore();



const TZ = "Europe/Istanbul";
const FOLDER_ID = process.env.EASYFIN_FOLDER_ID; // GitHub secret'tan gelecek

const SCOPES = [
  "https://www.googleapis.com/auth/drive.readonly",
  "https://www.googleapis.com/auth/spreadsheets.readonly"
];
function auth() {
  return new google.auth.GoogleAuth({ scopes: SCOPES });
}

async function listSheetsInFolder(folderId: string) {
  const drive = google.drive({ version: "v3", auth: auth() });
  const files: { id: string; name: string }[] = [];
  let pageToken: string | undefined;
  do {
    const res = await drive.files.list({
      q: `'${folderId}' in parents and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`,
      fields: "nextPageToken, files(id,name)",
      pageSize: 1000,
      pageToken
    });
    files.push(...(res.data.files || []).map(f => ({ id: f.id!, name: f.name! })));
    pageToken = res.data.nextPageToken || undefined;
  } while (pageToken);
  return files;
}

async function getSheet2D(spreadsheetId: string, sheetName: string) {
  const sheets = google.sheets({ version: "v4", auth: auth() });
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!A1:Z10000`
  });
  const values = (res.data.values || []) as any[][];
  if (!values.length) return { header: [] as string[], rows: [] as any[] };
  const header = values[0].map(x => String(x ?? "").trim());
  const rows = values.slice(1).map(r => {
    const o: any = {};
    for (let i = 0; i < header.length; i++) o[header[i] || `col${i + 1}`] = r[i] ?? "";
    return o;
  });
  return { header, rows };
}

function finToTidy(fin: { header: string[]; rows: any[] }) {
  if (fin.header.length < 6) return [] as any[];
  const periods = fin.header.slice(5);
  const out: any[] = [];
  for (const r of fin.rows) {
    const code = String(r["kod"] ?? "").trim();
    if (!code) continue;
    for (const p of periods) {
      const v = r[p];
      if (v === "" || v == null || isNaN(Number(v))) continue;
      out.push({
        code, period: p, value: Number(v),
        currency: r["para_birimi"] || "", grp: r["grup"] || "",
        ad_tr: r["ad_tr"] || "", ad_en: r["ad_en"] || ""
      });
    }
  }
  return out;
}

async function ingestOne(fileId: string, ticker: string) {
  const FIN   = await getSheet2D(fileId, "FIN");
  const KAP   = await getSheet2D(fileId, "KAP");
  const DASH  = await getSheet2D(fileId, "DASH");
  const PRICE = await getSheet2D(fileId, "PRICES");

  const base = db.collection("tickers").doc(ticker.toUpperCase()).collection("sheets");
  const batch = db.batch();
  batch.set(base.doc("FIN.table"),  FIN, { merge: true });
  batch.set(base.doc("FIN.tidy"),   { rows: finToTidy(FIN) }, { merge: true });
  if (KAP.header.length)   batch.set(base.doc("KAP.table"),   KAP,   { merge: true });
  if (DASH.header.length)  batch.set(base.doc("DASH.table"),  DASH,  { merge: true });
  if (PRICE.header.length) batch.set(base.doc("PRICES.table"), PRICE, { merge: true });
  batch.set(db.collection("tickers").doc(ticker.toUpperCase()), {
    updatedAt: admin.firestore.Timestamp.now()
  }, { merge: true });
  await batch.commit();
}

// Tek şirketi manuel tetiklemek için
export const ingestOnce = functions.https.onRequest(async (req, res) => {
  try {
    if (!FOLDER_ID) { res.status(500).send("EASYFIN_FOLDER_ID missing"); return; }
    const ticker = String(req.query.ticker || "").toUpperCase();
    if (!ticker) { res.status(400).send("ticker?"); return; }
    const files = await listSheetsInFolder(FOLDER_ID);
    const f = files.find(x => x.name.toUpperCase() === ticker);
    if (!f) { res.status(404).send("not found"); return; }
    await ingestOne(f.id, f.name);
    res.send("ok");
  } catch (e: any) {
    res.status(500).send(String(e));
  }
});

// Tüm şirketleri zamanlanmış çalıştırma (09:00 ve 18:00 TR)
export const ingestAll = functions.pubsub
  .schedule("0 9,18 * * *").timeZone(TZ)
  .onRun(async () => {
    if (!FOLDER_ID) throw new Error("EASYFIN_FOLDER_ID missing");
    const files = await listSheetsInFolder(FOLDER_ID);
    const chunk = <T>(a: T[], n: number) =>
      Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, (i + 1) * n));
    for (const grp of chunk(files, 20)) {
      await Promise.all(grp.map(f => ingestOne(f.id, f.name)));
    }
    return null;
  });
