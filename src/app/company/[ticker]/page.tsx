// ==========================
// src/app/company/[ticker]/page.tsx
// ==========================
import "server-only";
import { headers, cookies } from "next/headers";
import type { Metadata } from "next";
import CompanyPageClient from "./CompanyPageClient";

export const dynamic = "force-dynamic";

type FirestoreDoc<T = any> = { ok: boolean; data?: T };
type SheetTable = { header: string[]; rows: any[] };

// --------- COMMON HELPERS ----------
function toNum(x: any): number | null {
  if (x == null) return null;
  if (typeof x === "number") return isFinite(x) ? x : null;
  if (typeof x !== "string") return null;
  const s = x.trim();
  if (!s) return null;
  const norm = s.replace(/\./g, "").replace(/,/g, ".");
  const n = Number(norm);
  return isFinite(n) ? n : null;
}
function pickPeriods(fin: SheetTable): string[] {
  const h = fin.header ?? [];
  return h.slice(5); // first 5 meta, afterwards periods new->old
}
function rowByCode(fin: SheetTable): Record<string, any> {
  const map: Record<string, any> = {};
  for (const r of fin.rows || []) {
    if (r && typeof r.kod === "string") map[r.kod] = r;
  }
  return map;
}
function latestNonEmpty(row: any, periodKeys: string[]): number | null {
  for (const k of periodKeys) {
    const v = toNum(row?.[k]);
    if (v != null) return v;
  }
  return null;
}
function sumLastN(row: any, periodKeys: string[], n: number): number | null {
  if (!row) return null;
  const vals: number[] = [];
  for (let i = 0; i < periodKeys.length && vals.length < n; i++) {
    const v = toNum(row[periodKeys[i]]);
    if (v != null) vals.push(v);
  }
  if (vals.length < n) return null;
  return vals.slice(0, n).reduce((a, b) => a + b, 0);
}

// --------- EXACT LOOKUP HELPERS ----------
function mapByKey(
  rows: any[],
  keyFields = ["kod", "key", "id", "name", "field", "başlık", "baslik"]
): Record<string, any> {
  const m: Record<string, any> = {};
  for (const r of rows || []) {
    for (const k of keyFields) {
      const v = (r as any)?.[k];
      if (typeof v === "string" && v.trim()) {
        m[v.trim()] = r;
        break;
      }
    }
  }
  return m;
}
function numFromRow(r: any): number | null {
  if (!r) return null;
  const cands = ["Value", "value", "val", "v", "deger", "deg", "amount", "sonuc", "result"];
  for (const c of cands) {
    const n = toNum((r as any)?.[c]);
    if (n != null) return n;
  }
  for (const v of Object.values(r)) {
    const n = toNum(v as any);
    if (n != null) return n;
  }
  return null;
}

// PRICES için ÖZEL: Kod + Field → tekil anahtar
function mapPricesByKeyField(rows: any[]): Record<string, any> {
  const m: Record<string, any> = {};
  for (const r of rows || []) {
    const kod = (r?.Kod ?? r?.kod)?.toString().trim();
    const field = (r?.Field ?? r?.field)?.toString().trim();
    if (kod && field) {
      m[`${kod}_${field}`] = r; // örn: "Price1_fiyat"
    } else if (kod) {
      m[kod] = r; // nadiren Field yoksa
    }
  }
  return m;
}

// --------- DASH HELPERS (Firestore map → rows & latest-period pick) ----------
function dashRowsFromDoc(doc: any): any[] {
  if (!doc) return [];
  // bazen { header, rows } olabilir; bazen doğrudan field map (1:{...}, 2:{...})
  if (Array.isArray(doc.rows)) return doc.rows;
  if (Array.isArray(doc)) return doc;
  return Object.values(doc);
}
function isPeriodKey(k: string) {
  return /^\d{4}\s*[\/\-.]\s*(\d{1,2})$/.test(k); // 2025/6, 2024-12 vb.
}
function parsePeriodSortKey(k: string) {
  const m = k.match(/^(\d{4})\s*[\/\-.]\s*(\d{1,2})$/);
  if (!m) return -Infinity;
  const y = +m[1], mm = +m[2];
  const qOrder = ({3: 1, 6: 2, 9: 3, 12: 4} as Record<number, number>)[mm] ?? 0;
  return y * 10 + qOrder; // büyük olan daha yeni
}
function latestValFromDashRow(row: any): number | null {
  const keys = Object.keys(row || {})
    .filter(isPeriodKey)
    .sort((a, b) => parsePeriodSortKey(b) - parsePeriodSortKey(a)); // new -> old
  for (const k of keys) {
    const v = toNum(row[k]);
    if (v != null) return v;
  }
  return null;
}
function findDashRow(rows: any[], keys: string[]): any | null {
  for (const r of rows) {
    const code = (r?.Kod ?? r?.kod ?? "").toString().trim();
    const label = (r?.Kalem ?? r?.kalem ?? r?.name ?? r?.field ?? "").toString().trim();
    if (!code && !label) continue;
    if (keys.some(k => k && (code === k || label === k))) return r;
  }
  return null;
}
function dashLatest(rows: any[], ...keys: string[]): number | null {
  const r = findDashRow(rows, keys);
  return r ? latestValFromDashRow(r) : null;
}

// --------- BASE URL + AUTH (ASYNC) ----------
async function getBaseUrl(): Promise<string> {
  const envBase = process.env.NEXT_PUBLIC_BASE_URL?.trim();
  if (envBase) return envBase.replace(/\/+$/, "");
  const vercelUrl = process.env.VERCEL_URL?.trim();
  if (vercelUrl) return `https://${vercelUrl.replace(/\/+$/, "")}`;
  try {
    const h = await headers();
    const host = h.get("x-forwarded-host") || h.get("host");
    const proto =
      h.get("x-forwarded-proto") || (host?.startsWith("localhost") ? "http" : "https");
    if (host) return `${proto}://${host}`.replace(/\/+$/, "");
  } catch {}
  return "http://localhost:3000";
}
async function buildApiUrl(path: string): Promise<string> {
  const rel = `/api/debug/firestore?path=${encodeURIComponent(path)}`;
  return new URL(rel, await getBaseUrl()).toString();
}
async function buildAuthHeaders(): Promise<HeadersInit> {
  const h = await headers();
  const c = await cookies();
  const out: Record<string, string> = {};
  const cookieStr = c.toString();
  if (cookieStr) out["cookie"] = cookieStr;
  const auth = h.get("authorization");
  if (auth) out["authorization"] = auth;
  const bypass =
    h.get("x-vercel-protection-bypass") || process.env.VERCEL_PROTECTION_BYPASS;
  if (bypass) out["x-vercel-protection-bypass"] = String(bypass);
  out["x-internal-ssr"] = "1";
  return out;
}
async function getSheetDoc<T = any>(path: string): Promise<T | null> {
  const segs = path.split("/").filter(Boolean);
  if (segs.length % 2 !== 0) {
    console.error("[getSheetDoc] expected DOCUMENT path, got:", path);
    return null;
  }
  const url = await buildApiUrl(path);
  try {
    const res = await fetch(url, { cache: "no-store", headers: await buildAuthHeaders() });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error("[getSheetDoc] !ok", res.status, url, text.slice(0, 300));
      return null;
    }
    const json = (await res.json()) as FirestoreDoc<T>;
    if (!json?.ok) {
      console.error("[getSheetDoc] json.ok=false", url, json);
      return null;
    }
    return (json.data ?? null) as any;
  } catch (e) {
    console.error("[getSheetDoc] fetch error", url, e);
    return null;
  }
}

// --------- PAGE META ----------
export async function generateMetadata({
  params,
}: {
  params: { ticker: string };
}): Promise<Metadata> {
  const ticker = params.ticker?.toUpperCase?.() || "TICKER";
  return {
    title: `${ticker} Hisse Analizi ve Finansal Veriler | EasyFin`,
    description: `${ticker} için temel oranlar, bilanço ve nakit akışı özetleri.`,
  };
}

// --------- PAGE (SERVER) ----------
export default async function CompanyPage({ params }: { params: { ticker: string } }) {
  const ticker = (params?.ticker || "").toUpperCase();

  const [fin, kap, prices, dash] = await Promise.all([
    getSheetDoc<SheetTable>(`tickers/${ticker}/sheets/FIN.table`),
    getSheetDoc<SheetTable>(`tickers/${ticker}/sheets/KAP.table`),
    getSheetDoc<SheetTable>(`tickers/${ticker}/sheets/PRICES.table`),
    getSheetDoc<any>(`tickers/${ticker}/sheets/DASH.table`), // DASH.map olabilir
  ]);

  if (!fin) {
    return (
      <main className="bg-gray-900 text-white min-h-screen flex items-center justify-center">
        <div className="text-center p-8 bg-gray-800 rounded-2xl shadow-xl">
          <h1 className="text-3xl font-bold text-red-500">Veri Bulunamadı</h1>
          <p className="mt-4 text-gray-300">
            <code>[{ticker}]</code> için FIN.table bulunamadı.
          </p>
        </div>
      </main>
    );
  }

  // ---------- FIN (kod ile kesin eşleme) ----------
  const periods = pickPeriods(fin); // new → old
  const codes = rowByCode(fin);

  // ---------- PRICES (KESİN: Kod + Field → Value) ----------
  const priceRows = Array.isArray(prices?.rows)
    ? (prices as any).rows
    : Array.isArray(prices as any)
    ? (prices as any)
    : Object.values((prices as any) || {});
  const pMapPrices = mapPricesByKeyField(priceRows);

  // Price1_fiyat → Son fiyat, Price2_piyasa_değeri → Piyasa değeri
  const lastPrice =
    toNum(pMapPrices?.["Price1_fiyat"]?.Value ?? pMapPrices?.["Price1_fiyat"]?.value) ??
    toNum(pMapPrices?.["Price1_Fiyat"]?.Value ?? pMapPrices?.["Price1_Fiyat"]?.value);

  const marketCap =
    toNum(
      pMapPrices?.["Price2_piyasa_değeri"]?.Value ??
        pMapPrices?.["Price2_piyasa_değeri"]?.value
    ) ??
    toNum(
      pMapPrices?.["Price2_piyasa_degeri"]?.Value ??
        pMapPrices?.["Price2_piyasa_degeri"]?.value
    );

  // ---------- KAP (summary.* / general.* exact path)
  const kapMap = mapByKey(kap?.rows || [], ["field", "key", "name", "kod", "id"]);
  const getKapExact = (path: string): string => {
    const r = kapMap[path];
    if (!r) return "";
    const v = (r as any)?.value ?? (r as any)?.Value ?? (r as any)?.val ?? (r as any)?.data ?? "";
    return typeof v === "string" ? v : String(v ?? "");
  };

  // ---------- DASH (SADECE DASH — rasyolar buradan, en yeni dönem) ----------
  const dashRows = dashRowsFromDoc(dash);

  // --- Income Statement (kesin kodlar) ---
  const netSales     = codes["3C"];
  const costOfSales  = codes["3CA"];
  const grossProfit  = codes["3D"];
  const mktExp       = codes["3DA"];
  const adminExp     = codes["3DB"];
  const rndExp       = codes["3DC"];
  const opProfit     = codes["3DF"];
  const netIncome    = codes["3Z"];
  const depAmort     = codes["4B"];

  // Dash öncelikli (varsa), yoksa FIN'den
  const lastRevenue  = dashLatest(dashRows, "Dash2","Satış Gelirleri") ?? latestNonEmpty(netSales, periods);
  const lastCOGS     = dashLatest(dashRows, "Dash3","Satışların Maliyeti (-)") ?? latestNonEmpty(costOfSales, periods);
  const lastGross    = dashLatest(dashRows, "Dash4","BRÜT KAR (ZARAR)") ?? latestNonEmpty(grossProfit, periods);
  const lastDep      = dashLatest(dashRows, "Dash8","Amortisman Giderleri") ?? latestNonEmpty(depAmort, periods);
  const lastOpProfit = dashLatest(dashRows, "Dash11","FAALİYET KARI (ZARARI)") ?? latestNonEmpty(opProfit, periods);
  const lastNI       = dashLatest(dashRows, "Dash15","Ana Ortaklık Net Karı") ?? latestNonEmpty(netIncome, periods);

  // OPEX (Dash varsa topla; yoksa FIN)
  const dM = dashLatest(dashRows, "Dash5","Pazarlama Giderleri (-)");
  const dA = dashLatest(dashRows, "Dash6","Genel Yönetim Giderleri (-)");
  const dR = dashLatest(dashRows, "Dash7","Araştırma Geliştirme Giderleri (-)");
  const lastOpex =
    dM != null && dA != null
      ? (dM ?? 0) + (dA ?? 0) + (dR ?? 0)
      : (() => {
          const m = latestNonEmpty(mktExp, periods);
          const a = latestNonEmpty(adminExp, periods);
          const r = latestNonEmpty(rndExp, periods) ?? 0;
          return [m, a].some((x) => x == null) ? null : (m ?? 0) + (a ?? 0) + r;
        })();

  // ---------- Balance Sheet (kesin kodlar) ----------
  const cash         = latestNonEmpty(codes["1AA"], periods);
  const receivables  = latestNonEmpty(codes["1AC"], periods);
  const inventory    = latestNonEmpty(codes["1AF"], periods); // Stoklar = 1AF
  const stDebt       = latestNonEmpty(codes["2AA"], periods);
  const ltDebt       = latestNonEmpty(codes["2BA"], periods);
  const equity       = latestNonEmpty(codes["2O"],  periods);

  const currLiab     = latestNonEmpty(codes["2A"], periods);
  const nonCurrLiab  = latestNonEmpty(codes["2B"], periods);
  const totalDebt    = (stDebt ?? 0) + (ltDebt ?? 0);
  const otherLiab =
    currLiab != null && nonCurrLiab != null
      ? Math.max(currLiab + nonCurrLiab - totalDebt, 0)
      : null;

  // ---------- TTM ----------
  const ttmSales   = sumLastN(netSales, periods, 4);
  const ttmDep     = sumLastN(depAmort, periods, 4);
  const ttmNI      = sumLastN(netIncome, periods, 4);
  const ttmGross   = sumLastN(grossProfit, periods, 4);
  const ttmM       = sumLastN(mktExp, periods, 4);
  const ttmA       = sumLastN(adminExp, periods, 4);
  const ttmR       = sumLastN(rndExp, periods, 4) ?? 0;
  const ttmEBITDA  =
    ttmGross != null && ttmM != null && ttmA != null && ttmDep != null
      ? ttmGross + ttmM + ttmA + ttmR + ttmDep
      : null;

  const netDebt = (stDebt ?? 0) + (ltDebt ?? 0) - (cash ?? 0);

  // ---------- Değerleme (yalnız DASH; en yeni dönem) ----------
  // Not: Kodlar projedeki yeni mapping: Dash31..Dash35. Eski exportlarda Dash25 olabilir (F/K).
  const pe        = dashLatest(dashRows, "Dash25", "F/K");
  const pb        = dashLatest(dashRows, "Dash26", "PD/DD");
  const evSales   = dashLatest(dashRows, "Dash27", "FD/Satışlar", "FD/Satış");
  const evEbitda  = dashLatest(dashRows, "Dash28", "FD/FAVÖK");
  const ndEbitda  = dashLatest(dashRows, "Dash29", "Net Borç/FAVÖK");

  // ---------- KAP exact (ad, sektör, adres, web) ----------
  const companyName =
    getKapExact("general.trade_name") ||
    getKapExact("summary.trade_name") ||
    `${ticker} A.Ş.`;
  const sector    = getKapExact("summary.sektor_ana") || "";
  const subSector = getKapExact("summary.sektor_alt") || "";
  const address   = getKapExact("general.merkez_adresi");
  const website   = getKapExact("summary.internet_adresi") || "";

  // ---------- Ownership ----------
  let shareholders: Array<{ name: string; value: number }> = [];
  const kapKeys = Object.keys(kapMap);
  const indices = new Set<number>();
  for (const k of kapKeys) {
    const m = k.match(/^ownership\.sermaye_5ustu\[(\d+)\]\.Sermayedeki Payı\(%\)$/i);
    if (m) indices.add(Number(m[1]));
  }
  for (const i of Array.from(indices).sort((a, b) => a - b)) {
    const name = getKapExact(`ownership.sermaye_5ustu[${i}].Ortağın Adı-Soyadı/Ticaret Ünvanı`) || "Ortak";
    const pct  = toNum(getKapExact(`ownership.sermaye_5ustu[${i}].Sermayedeki Payı(%)`));
    if (name && pct != null) shareholders.push({ name, value: pct });
  }
  if (!shareholders.length) shareholders = [{ name: "Veri Bekleniyor", value: 100 }];

  const subsidiaries: string[] = [];
  for (const k of kapKeys) {
    const m = k.match(/^ownership\.bagli_ortakliklar\[(\d+)\]\.Ticaret Ünvanı$/i);
    if (m) {
      const v = getKapExact(k);
      if (v) subsidiaries.push(v);
    }
  }
  if (!subsidiaries.length) subsidiaries.push("Veri Bekleniyor");

  // Yönetim (Adı-Soyadı + Görevi)
  const management: Array<{ name: string; position: string }> = [];
  for (const k of kapKeys) {
    const m = k.match(/^board_members\[(\d+)\]\.Adı-Soyadı$/i);
    if (m) {
      const idx = m[1];
      const name = getKapExact(`board_members[${idx}].Adı-Soyadı`);
      const role = getKapExact(`board_members[${idx}].Görevi`) || "Yönetim Kurulu Üyesi";
      if (name) management.push({ name, position: role });
    }
  }
  if (!management.length) management.push({ name: "Veri Bekleniyor", position: "Yönetim Kurulu" });

  // ---------- Waterfall ----------
  const wNWC = dashLatest(dashRows, "DashNWC", "Net İşletme Sermayesi", "NWC") ?? 0;
  const wOth = dashLatest(dashRows, "DashOthers", "Diğer") ?? 0;
  const wFCF =
    dashLatest(dashRows, "DashFCF", "Serbest Nakit Akım") ??
    ((lastNI ?? 0) + (lastDep ?? 0) + wNWC + wOth);

  // ---------- Treemap arrays (₺ bn) ----------
  const toB = (x: number | null) => (x == null ? 0 : x / 1e9);
  const assetsArr = [
    { name: "Nakit + KV Yat.", value: toB(cash), color: "#14b8a6" },
    { name: "Alacaklar", value: toB(receivables), color: "#22d3ee" },
    { name: "Stoklar", value: toB(inventory), color: "#0ea5e9" },
  ].filter((d) => d.value > 0);
  const liabArr = [
    { name: "Özkaynaklar", value: toB(equity ?? 0), color: "#60a5fa" },
    { name: "Toplam Borç", value: toB((stDebt ?? 0) + (ltDebt ?? 0)), color: "#ef4444" },
    ...(otherLiab != null ? [{ name: "Diğer Yük.", value: toB(otherLiab), color: "#f59e0b" }] : []),
  ].filter((d) => d.value > 0);

  // ---- Build page data ----
  const pageData = {
    ticker,
    generalInfo: {
      companyName,
      marketCap,
      lastPrice,
      sector,
      subSector,
      address,
      website,
    },
    valuationRatios: {
      pe,
      pb,
      evSales,       // UI'da "Fiyat/Satış" yazıyorsa etiketi güncelle veya PS için ayrı satır ekle
      evEbitda,
      netDebtEbitda: ndEbitda,
    },
    balanceSheet: {
      assets: assetsArr,
      liabilities: liabArr,
    },
    incomeStatement: {
      revenue: lastRevenue,
      cost: lastCOGS,
      grossProfit: lastGross,
      expenses: null,
      earnings: lastOpProfit,
      opex: lastOpex,
    },
    cashFlow: [
      { name: "Net Kâr", value: lastNI },
      { name: "Amortisman", value: lastDep },
      { name: "İşletme Serm.", value: wNWC },
      { name: "Diğer", value: wOth },
      { name: "Serbest Nakit", value: wFCF, isResult: true },
    ],
    ownership: {
      shareholders,
      subsidiaries,
    },
    management,
  };

  return <CompanyPageClient data={pageData} />;
}
