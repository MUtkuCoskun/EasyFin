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

// --------- DASH/KAP tolerant lookups ----------
function rowValueLike(
  row: any,
  keys: string[] = ["value", "val", "v", "deger", "deg"]
): number | null {
  for (const k of keys) {
    const n = toNum(row?.[k]);
    if (n != null) return n;
  }
  return null;
}
function rowText(row: any): string {
  const cands = [
    "ratio",
    "metric",
    "name",
    "field",
    "key",
    "kod",
    "id",
    "title",
    "tur",
    "başlık",
    "baslik",
  ];
  for (const k of cands) {
    const v = row?.[k];
    if (typeof v === "string" && v.trim()) return v;
  }
  return Object.values(row || {})
    .filter((x) => typeof x === "string")
    .join(" ")
    .slice(0, 200);
}
function findDashNumber(rows: any[], needles: Array<string | RegExp>): number | null {
  for (const r of rows || []) {
    const txt = rowText(r).toLowerCase();
    if (
      needles.some((n) =>
        typeof n === "string" ? txt.includes(n.toLowerCase()) : n.test(txt)
      )
    ) {
      const v = rowValueLike(r);
      if (v != null) return v;
      for (const val of Object.values(r)) {
        const n = toNum(val as any);
        if (n != null) return n;
      }
    }
  }
  return null;
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
    getSheetDoc<SheetTable>(`tickers/${ticker}/sheets/DASH.table`),
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

  const periods = pickPeriods(fin); // new → old
  const codes = rowByCode(fin);

  // --- PRICES (tolerant)
  const pRow = prices?.rows?.[0] || {};
  const lastPrice = toNum(pRow?.["fiyat"]) ?? toNum(pRow?.["price"]);
  const marketCap =
    toNum(pRow?.["piyasa_değeri"]) ??
    toNum(pRow?.["piyasa_deÄŸeri"]) ??
    toNum(pRow?.["market_cap"]) ??
    toNum(pRow?.["marketcap"]);

  // --- IS rows by code (robust to missing)
  const netSales = codes["3C"];
  const costOfSales = codes["3CA"] ?? codes["3CB"] ?? codes["3C-1"];
  const grossProfit = codes["3D"];
  const mktExp = codes["3DA"];
  const adminExp = codes["3DB"];
  const rndExp = codes["3DC"];
  const opProfit = codes["3DF"];
  const netIncome = codes["3Z"];
  const depAmort = codes["4B"];

  const lastRevenue = latestNonEmpty(netSales, periods);
  const lastCOGS = latestNonEmpty(costOfSales, periods);
  const lastGross = latestNonEmpty(grossProfit, periods);

  const lastOpexDirect = latestNonEmpty(codes["3DD"], periods);
  const m = latestNonEmpty(mktExp, periods);
  const a = latestNonEmpty(adminExp, periods);
  const r = latestNonEmpty(rndExp, periods) ?? 0;
  const lastOpex =
    lastOpexDirect ?? ([m, a].some((x) => x == null) ? null : (m ?? 0) + (a ?? 0) + r);

  const lastOpProfit = latestNonEmpty(opProfit, periods);
  const lastNI = latestNonEmpty(netIncome, periods);
  const lastDep = latestNonEmpty(depAmort, periods);

  // --- Balance sheet
  const cash = latestNonEmpty(codes["1AA"], periods);
  const receivables = latestNonEmpty(codes["1AC"], periods);
  const inventory = latestNonEmpty(codes["1AD"], periods);
  const stDebt = latestNonEmpty(codes["2AA"], periods);
  const ltDebt = latestNonEmpty(codes["2BA"], periods);
  const equity = latestNonEmpty(codes["2O"], periods);

  const currLiab = latestNonEmpty(codes["2A"], periods);
  const nonCurrLiab = latestNonEmpty(codes["2B"], periods);
  const totalDebt = (stDebt ?? 0) + (ltDebt ?? 0);
  const otherLiab =
    currLiab != null && nonCurrLiab != null
      ? Math.max(currLiab + nonCurrLiab - totalDebt, 0)
      : null;

  // --- TTM
  const ttmSales = sumLastN(netSales, periods, 4);
  const ttmDep = sumLastN(depAmort, periods, 4);
  const ttmNI = sumLastN(netIncome, periods, 4);
  const ttmGross = sumLastN(grossProfit, periods, 4);
  const ttmM = sumLastN(mktExp, periods, 4);
  const ttmA = sumLastN(adminExp, periods, 4);
  const ttmR = sumLastN(rndExp, periods, 4) ?? 0;
  const ttmEBITDA =
    ttmGross != null && ttmM != null && ttmA != null && ttmDep != null
      ? ttmGross + ttmM + ttmA + ttmR + ttmDep
      : null;

  const netDebt = totalDebt - (cash ?? 0);

  // --- DASH ratios
  const dashRows = Array.isArray(dash?.rows) ? dash!.rows : [];
  const pe =
    findDashNumber(dashRows, [/f\/k|price.*earn|p\/e/i]) ??
    (marketCap != null && ttmNI ? marketCap / ttmNI : null);
  const pb = findDashNumber(dashRows, [/pd\/dd|p\/b|price.*book/i]);
  const ps =
    findDashNumber(dashRows, [/f\/s|p\/s|price.*sales/i]) ??
    (marketCap != null && ttmSales ? marketCap / ttmSales : null);
  const evEbitda =
    findDashNumber(dashRows, [/fd\/favök|fd\/favok|ev\/ebitda/i]) ??
    (marketCap != null && ttmEBITDA != null
      ? (marketCap + (netDebt ?? 0)) / ttmEBITDA
      : null);
  const ndEbitda =
    findDashNumber(dashRows, [/net.*borç.*favök|net.*borc.*favok|nd\/ebitda/i]) ??
    (ttmEBITDA ? (netDebt ?? 0) / ttmEBITDA : null);

  // --- KAP flatten
  const kapRows: Array<{ field: string; value: string }> = Array.isArray(kap?.rows)
    ? kap!.rows.map((r: any) => ({
        field: String(r?.field ?? r?.Field ?? r?.key ?? r?.name ?? ""),
        value: String(r?.value ?? r?.Value ?? r?.val ?? r?.data ?? ""),
      }))
    : [];
  const getKap = (needle: string): string => {
    const row = kapRows.find((r) => r.field.toLowerCase().includes(needle.toLowerCase()));
    return row?.value || "";
  };

  // --- Ownership
  const shareholders = kapRows
    .filter((r) => /sermayedeki pay[ıi]/i.test(r.field) && !/toplam/i.test(r.field))
    .map((r) => {
      const name = r.field.replace(/sermayedeki pay[ıi]/i, "").trim() || "Ortak";
      const num = parseFloat(r.value.replace("%", "").replace(",", "."));
      return { name, value: isNaN(num) ? 0 : num };
    })
    .filter((s) => s.value > 0);

  const subsidiaries = Array.from(
    new Set(
      kapRows
        .filter((r) => /bağlı ortaklık|iştirak/i.test(r.field))
        .map((r) => r.value)
        .filter(Boolean)
    )
  );
  const managementList =
    kapRows
      .filter((r) => /yönetim kurulu|board/i.test(r.field))
      .map((r) => ({ name: r.value || r.field, position: r.field })) || [];

  // --- Waterfall
  const dashFCF = findDashNumber(dashRows, [/free.*cash.*flow|fcf/i]);
  const dashNWC = findDashNumber(dashRows, [/net.*working.*capital|işletme.*serm/i]);
  const dashOthers = findDashNumber(dashRows, [/other|diğer/i]);

  const wNI = lastNI ?? null;
  const wDep = lastDep ?? null;
  const wNWC = dashNWC ?? 0;
  const wOth = dashOthers ?? 0;
  const wFCF = dashFCF ?? ((wNI ?? 0) + (wDep ?? 0) + (wNWC ?? 0) + (wOth ?? 0));

  // --- Treemap arrays in billions ₺
  const toB = (x: number | null) => (x == null ? 0 : x / 1e9);
  const assetsArr = [
    { name: "Nakit + KV Yat.", value: toB(cash), color: "#14b8a6" },
    { name: "Alacaklar", value: toB(receivables), color: "#22d3ee" },
    { name: "Stoklar", value: toB(inventory), color: "#0ea5e9" },
  ].filter((d) => d.value > 0);
  const liabArr = [
    { name: "Özkaynaklar", value: toB(equity ?? 0), color: "#60a5fa" },
    { name: "Toplam Borç", value: toB(totalDebt), color: "#ef4444" },
    ...(otherLiab != null ? [{ name: "Diğer Yük.", value: toB(otherLiab), color: "#f59e0b" }] : []),
  ].filter((d) => d.value > 0);

  // ---- Build page data for client
  const pageData = {
    ticker,
    generalInfo: {
      companyName: getKap("ticaret ünvanı") || `${ticker} A.Ş.`,
      marketCap,
      lastPrice,
      sector: getKap("sektör") || getKap("sektoru") || "",
      subSector: getKap("alt sektör") || getKap("altsektör") || "",
      address: getKap("adres"),
      website: getKap("internet sitesi") || getKap("web") || "",
    },
    valuationRatios: {
      pe,
      pb,
      ps,
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
      opex: lastOpex,
      earnings: lastOpProfit,
    },
    cashFlow: [
      { name: "Net Kâr", value: wNI },
      { name: "Amortisman", value: wDep },
      { name: "İşletme Serm.", value: wNWC },
      { name: "Diğer", value: wOth },
      { name: "Serbest Nakit", value: wFCF, isResult: true },
    ],
    ownership: {
      shareholders: shareholders.length ? shareholders : [{ name: "Veri Bekleniyor", value: 100 }],
      subsidiaries: subsidiaries.length ? subsidiaries : ["Veri Bekleniyor"],
    },
    management: managementList.length
      ? managementList
      : [{ name: "Veri Bekleniyor", position: "Yönetim Kurulu" }],
  };

  return <CompanyPageClient data={pageData} />;
}
