// ==========================
// src/app/company/[ticker]/page.tsx — TAM YENİDEN YAZIM
// ==========================

import "server-only";
import type { Metadata } from "next";
import { headers, cookies } from "next/headers";
import CompanyPageClient from "./CompanyPageClient";

/**
 * Amaç:
 *  - FIN/KAP/PRICES/DASH dokümanlarını sağlam şekilde çekmek
 *  - Dönem seçimini (aynı dönem) deterministik yapmak
 *  - Bilanço eşitliğini (Varlıklar = Yükümlülükler + Özkaynaklar) garanti etmek
 *  - Esnek ama güvenli parse/normalizasyon yardımcıları sağlamak
 *  - Önceki sürümde tespit edilen hataları düzeltmek:
 *      (1) toNum regex
 *      (2) dönem anahtarı regex & sıralama
 *      (3) Toplam Kaynaklar fallback mantığı
 */

// ---------- Tipler ----------
export const dynamic = "force-dynamic";

type FirestoreDoc<T = any> = { ok: boolean; data?: T };
export type SheetTable = { header: string[]; rows: any[] };

// Client tarafına iletilecek şekil
export type PageData = {
  ticker: string;
  generalInfo: any;
  valuationRatios: any; // { pe, pb, ps, evEbitda, netDebtEbitda, ... }
  balanceSheet: {
    assetsItems: Array<{ name: string; value: number }>;
    liabilitiesItems: Array<{ name: string; value: number }>;
    equityItems: Array<{ name: string; value: number }>;
  };
  incomeStatement: any;
  cashFlow: any[];
  ownership: any;
  management: { name: string; position: string }[];
};

// ---------- Yardımcılar (GENEL) ----------
function safeString(x: unknown): string {
  if (x == null) return "";
  if (typeof x === "string") return x;
  try { return String(x); } catch { return ""; }
}

function toNum(x: any): number | null {
  if (x == null) return null;
  if (typeof x === "number") return Number.isFinite(x) ? x : null;
  if (typeof x !== "string") return null;
  const s = x.trim();
  if (!s) return null;
  // Düzeltme: sadece binlik nokta ve ondalık virgül dönüştürülür
  const norm = s.replace(/\./g, "").replace(/,/g, ".");
  const n = Number(norm);
  return Number.isFinite(n) ? n : null;
}

function defined<T>(v: T | null | undefined): v is T { return v != null; }

// ---------- Dönem Yardımcıları ----------
const PERIOD_RX = /^(\d{4})\s*[\/.\-]\s*(\d{1,2})$/i; // 2025/06, 2025-9, 2025.12

function isPeriodKey(k: string): boolean { return PERIOD_RX.test(k); }

function parsePeriodSortKey(k: string): number {
  const m = safeString(k).match(PERIOD_RX);
  if (!m) return -Infinity;
  const y = +m[1];
  const mm = +m[2];
  // Çeyrek sırası (Q1=3, Q2=6, Q3=9, Q4=12) — diğer aylar varsa takvim ayını kullan
  const qOrderMap: Record<number, number> = { 3: 1, 6: 2, 9: 3, 12: 4 };
  const q = qOrderMap[mm] ?? mm / 3; // kaba sıralama
  return y * 100 + (Number.isFinite(q) ? q : 0);
}

// ---------- FIN tablosu yardımcıları ----------
function pickPeriods(fin: SheetTable): string[] {
  const h = fin?.header ?? [];
  // İlk 5 sütun meta, sonrası dönem — new -> old olduğu varsayımı korunuyor
  return h.slice(5);
}

function rowByCode(fin: SheetTable): Record<string, any> {
  const map: Record<string, any> = {};
  for (const r of fin?.rows || []) {
    const code = safeString((r as any)?.kod ?? (r as any)?.Kod).trim();
    if (code) map[code] = r;
  }
  return map;
}

function latestNonEmpty(row: any, periodKeys: string[]): number | null {
  if (!row) return null;
  // periodKeys new->old
  for (const k of periodKeys) {
    const v = toNum(row?.[k]);
    if (v != null) return v;
  }
  return null;
}

function readAt(row: any, periodKey: string | null): number | null {
  if (!row || !periodKey) return null;
  return toNum(row[periodKey]);
}

// Aynı dönemi seç: TOPLAM VARLIKLAR (1BL), KV Yük. (2A), UV Yük. (2B) aynı anda dolu ilk dönem
function pickCommonPeriod(fin: SheetTable, codes: Record<string, any>): string | null {
  const periods = pickPeriods(fin) // new -> old
    .filter(isPeriodKey)
    .sort((a, b) => parsePeriodSortKey(b) - parsePeriodSortKey(a));
  const musts = ["1BL", "2A", "2B"]; // toplam varlıklar + iki yükümlülük bacağı
  for (const p of periods) {
    const ok = musts.every(k => toNum(codes[k]?.[p]) != null);
    if (ok) return p;
  }
  return periods[0] ?? null;
}

// ---------- KAP/DASH genel yardımcıları ----------
function mapByKey(rows: any[], keyFields = ["field", "key", "name", "kod", "id"]): Record<string, any> {
  const m: Record<string, any> = {};
  for (const r of rows || []) {
    for (const k of keyFields) {
      const v = safeString((r as any)?.[k]);
      if (v) { m[v] = r; break; }
    }
  }
  return m;
}

function dashRowsFromDoc(doc: any): any[] {
  if (!doc) return [];
  if (Array.isArray(doc?.rows)) return doc.rows;
  if (Array.isArray(doc)) return doc;
  return Object.values(doc);
}

function latestValFromDashRow(row: any): number | null {
  const keys = Object.keys(row || {})
    .filter(isPeriodKey)
    .sort((a, b) => parsePeriodSortKey(b) - parsePeriodSortKey(a));
  for (const k of keys) {
    const v = toNum(row[k]);
    if (v != null) return v;
  }
  return null;
}

function findDashRow(rows: any[], keys: string[]): any | null {
  for (const r of rows) {
    const code = safeString((r as any)?.Kod ?? (r as any)?.kod);
    const label = safeString((r as any)?.Kalem ?? (r as any)?.kalem ?? (r as any)?.name ?? (r as any)?.field);
    if (!code && !label) continue;
    if (keys.some(k => k && (code === k || label === k))) return r;
  }
  return null;
}

function dashLatest(rows: any[], ...keys: string[]): number | null {
  const r = findDashRow(rows, keys);
  return r ? latestValFromDashRow(r) : null;
}

// ---------- PRICES özel eşleme ----------
function mapPricesByKeyField(rows: any[]): Record<string, any> {
  const m: Record<string, any> = {};
  for (const r of rows || []) {
    const kod = safeString((r as any)?.Kod ?? (r as any)?.kod);
    const field = safeString((r as any)?.Field ?? (r as any)?.field);
    if (kod && field) m[`${kod}_${field}`] = r;
    else if (kod) m[kod] = r;
  }
  return m;
}

// ---------- Fetch yardımcıları ----------
async function getBaseUrl(): Promise<string> {
  const envBase = process.env.NEXT_PUBLIC_BASE_URL?.trim();
  if (envBase) return envBase.replace(/\/+$/, "");
  const vercelUrl = process.env.VERCEL_URL?.trim();
  if (vercelUrl) return `https://${vercelUrl.replace(/^https?:\/+/, "")}`;
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
  const bypass = h.get("x-vercel-protection-bypass") || process.env.VERCEL_PROTECTION_BYPASS;
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
    console.error("[getSheetDoc] fetch error", path, e);
    return null;
  }
}

// ---------- Meta ----------
export async function generateMetadata({ params }: { params: { ticker: string } }): Promise<Metadata> {
  const ticker = params.ticker?.toUpperCase?.() || "TICKER";
  return {
    title: `${ticker} Hisse Analizi ve Finansal Veriler | EasyFin`,
    description: `${ticker} için temel oranlar, bilanço ve nakit akışı özetleri.`,
  };
}

// ---------- Sayfa (Server) ----------
export default async function CompanyPage({ params }: { params: { ticker: string } }) {
  const ticker = (params?.ticker || "").toUpperCase();

  // Veri çekimi
  const [fin, kap, prices, dash] = await Promise.all([
    getSheetDoc<SheetTable>(`tickers/${ticker}/sheets/FIN.table`),
    getSheetDoc<SheetTable>(`tickers/${ticker}/sheets/KAP.table`),
    getSheetDoc<SheetTable>(`tickers/${ticker}/sheets/PRICES.table`),
    getSheetDoc<any>(`tickers/${ticker}/sheets/DASH.table`),
  ]);

  if (!fin) {
    return (
      <main className="bg-gray-900 text-white min-h-screen flex items-center justify-center">
        <div className="text-center p-8 bg-gray-800 rounded-2xl shadow-xl">
          <h1 className="text-3xl font-bold text-red-500">Veri Bulunamadı</h1>
          <p className="mt-4 text-gray-300">
            <code>[{ticker}]</code> için <b>FIN.table</b> bulunamadı.
          </p>
        </div>
      </main>
    );
  }

  // FIN — kodlar ve dönemler
  const periodsRaw = pickPeriods(fin).filter(isPeriodKey);
  const periods = periodsRaw.sort((a, b) => parsePeriodSortKey(b) - parsePeriodSortKey(a)); // new->old
  const codes = rowByCode(fin);

  // PRICES
  const priceRows = Array.isArray((prices as any)?.rows)
    ? (prices as any).rows
    : Array.isArray(prices as any)
      ? (prices as any)
      : Object.values((prices as any) || {});
  const pMap = mapPricesByKeyField(priceRows);

  const lastPrice =
    toNum(pMap?.["Price1_fiyat"]?.Value ?? pMap?.["Price1_fiyat"]?.value) ??
    toNum(pMap?.["Price1_Fiyat"]?.Value ?? pMap?.["Price1_Fiyat"]?.value);

  const marketCap =
    toNum(pMap?.["Price2_piyasa_değeri"]?.Value ?? pMap?.["Price2_piyasa_değeri"]?.value) ??
    toNum(pMap?.["Price2_piyasa_degeri"]?.Value ?? pMap?.["Price2_piyasa_degeri"]?.value);

  // KAP
  const kapRows = (kap?.rows || []) as any[];
  const kapMap = mapByKey(kapRows, ["field", "key", "name", "kod", "id"]);
  const getKapExact = (path: string): string => {
    const r = kapMap[path];
    if (!r) return "";
    const v = (r as any)?.value ?? (r as any)?.Value ?? (r as any)?.val ?? (r as any)?.data ?? "";
    return typeof v === "string" ? v : String(v ?? "");
  };

  // DASH
  const dashRows = dashRowsFromDoc(dash);
  const dashLatestOr = (fallback: number | null, ...keys: string[]) => {
    const v = dashLatest(dashRows, ...keys);
    return v != null ? v : fallback;
  };

  // GELİR TABLOSU (kodlar)
  const netSales     = codes["3C"];
  const costOfSales  = codes["3CA"];
  const grossProfit  = codes["3D"];
  const mktExp       = codes["3DA"];
  const adminExp     = codes["3DB"];
  const rndExp       = codes["3DC"];
  const opProfit     = codes["3DF"];
  const netIncome    = codes["3Z"]; // Ana Ortaklık Payları
  const depAmort     = codes["4B"];

  const lastRevenue  = dashLatestOr(latestNonEmpty(netSales, periods), "Dash2", "Satış Gelirleri");
  const lastCOGS     = dashLatestOr(latestNonEmpty(costOfSales, periods), "Dash3", "Satışların Maliyeti (-)");
  const lastGross    = dashLatestOr(latestNonEmpty(grossProfit, periods), "Dash4", "BRÜT KAR (ZARAR)");
  const lastDep      = dashLatestOr(latestNonEmpty(depAmort, periods), "Dash8", "Amortisman Giderleri");
  const lastOpProfit = dashLatestOr(latestNonEmpty(opProfit, periods), "Dash11", "FAALİYET KARI (ZARARI)");
  const lastNI       = dashLatestOr(latestNonEmpty(netIncome, periods), "Dash15", "Ana Ortaklık Net Karı");

  const dM = dashLatest(dashRows, "Dash5", "Pazarlama Giderleri (-)");
  const dA = dashLatest(dashRows, "Dash6", "Genel Yönetim Giderleri (-)");
  const dR = dashLatest(dashRows, "Dash7", "Araştırma Geliştirme Giderleri (-)") ?? 0;
  const lastOpex = ((): number | null => {
    if (dM != null && dA != null) return (dM ?? 0) + (dA ?? 0) + (dR ?? 0);
    const m = latestNonEmpty(mktExp, periods);
    const a = latestNonEmpty(adminExp, periods);
    const r = latestNonEmpty(rndExp, periods) ?? 0;
    return [m, a].some(x => x == null) ? null : (m ?? 0) + (a ?? 0) + r;
  })();

  // BİLANÇO — ORTAK DÖNEM
  const commonP = pickCommonPeriod(fin, codes);

  // Toplamlar
  const totalAssets = readAt(codes["1BL"], commonP); // TOPLAM VARLIKLAR

  const stLiab = readAt(codes["2A"], commonP) ?? 0; // KV Yükümlülükler
  const ltLiab = readAt(codes["2B"], commonP) ?? 0; // UV Yükümlülükler
  const totalLiab = stLiab + ltLiab;

  // Özkaynak toplamı: önce 2N, yoksa 2O(Ana Ort.) + 2ODA(Azınlık)
  const equityN  = readAt(codes["2N"], commonP);
  const equityO  = readAt(codes["2O"], commonP) ?? 0;
  const equityMI = readAt(codes["2ODA"], commonP) ?? 0;
  const totalEquity = equityN ?? (equityO + equityMI);

  const totalSourcesCalc = (totalLiab ?? 0) + (totalEquity ?? 0);
  const totalSourcesReported = readAt(codes["2ODB"], commonP); // yalnız kontrol amaçlı

  // Bilanço eşitliği kontrolü — diff 0 olmalı
  const balanceDiff = (totalAssets ?? 0) - (totalSourcesCalc ?? 0);
  if (Math.abs(balanceDiff) > 0.5) { // tolerans: 0.5 TL
    console.warn("[BALANCE-CHECK] Eşitsizlik:", {
      ticker, commonP, totalAssets, totalLiab, totalEquity, totalSourcesCalc, totalSourcesReported, balanceDiff,
    });
  }

  // Varlık/Yükümlülük/Özkaynak kalem havuzları — aynı dönemden oku
  const pv = (code: string, name: string) => {
    const v = readAt(codes[code], commonP);
    return v != null ? { key: code, name, value: v } : null;
  };

  const assetsPool = [
    pv("1AA", "Nakit ve Benzerleri"),
    pv("1AB", "KV Finansal Yatırımlar"),
    pv("1AC", "Ticari Alacaklar (KV)"),
    pv("1AF", "Stoklar"),
    pv("1AH", "Diğer Dönen Varlıklar"),
    pv("1BG", "Maddi Duran Varlıklar"),
    pv("1BH", "Maddi Olmayan Duran Varlıklar"),
    pv("1BC", "UV Finansal Yatırımlar"),
    pv("1BD", "Özkaynak Yöntemi Yatırımları"),
    pv("1BF", "Yatırım Amaçlı Gayrimenkuller"),
    pv("1BJ", "Ertelenmiş Vergi Varlığı"),
    pv("1BK", "Diğer Duran Varlıklar"),
  ].filter(defined).filter(x => x.value > 0).sort((a,b)=>b.value-a.value);

  const liabilitiesPool = [
    pv("2AA", "KV Finansal Borçlar"),
    pv("2AAGAA", "Ticari Borçlar (KV)"),
    pv("2BA", "UV Finansal Borçlar"),
    pv("2BBA", "Ticari Borçlar (UV)"),
    pv("2BF", "Kıdem Tazm. ve Benzeri Karş."),
    pv("2BG", "Ertelenmiş Vergi Yük."),
    pv("2BH", "Diğer Uzun Vadeli Yük."),
  ].filter(defined).filter(x => x.value > 0).sort((a,b)=>b.value-a.value);

  const equityPool = [
    pv("2OA", "Ödenmiş Sermaye"),
    pv("2OCE", "Geçmiş Yıllar K/Z"),
    pv("2OCF", "Dönem Net K/Z"),
    pv("2OCB", "Değer Artış Fonları"),
    pv("2Oca", "Hisse Senedi İhraç Primleri"),
    pv("2OD", "Diğer Özsermaye Kalemleri"),
    pv("2ODA", "Azınlık Payları"),
  ].filter(defined).filter(x => x.value > 0).sort((a,b)=>b.value-a.value);

  type KV = { name: string; value: number };
  function top4PlusOtherToTotal(pool: KV[], total: number | null): KV[] {
    const list = (pool || []).filter(x => x.value > 0).sort((a,b)=>b.value-a.value);
    if (!total || total <= 0) return list.slice(0, 5);
    const top4 = list.slice(0, 4);
    const sumTop4 = top4.reduce((s, x) => s + x.value, 0);
    const other = Math.max(total - sumTop4, 0);
    return [...top4, { name: "Diğer", value: other }];
  }

  const assetsItems      = top4PlusOtherToTotal(assetsPool, totalAssets);
  const liabilitiesItems = top4PlusOtherToTotal(liabilitiesPool, totalLiab);
  const equityItems      = top4PlusOtherToTotal(equityPool, totalEquity);

  // TTM
  function sumLastN(row: any, periodKeys: string[], n: number): number | null {
    if (!row) return null;
    const vals: number[] = [];
    for (const k of periodKeys) {
      const v = toNum(row?.[k]);
      if (v != null) vals.push(v);
      if (vals.length >= n) break;
    }
    if (vals.length < n) return null;
    return vals.slice(0, n).reduce((a, b) => a + b, 0);
  }

  const ttmSales  = sumLastN(netSales, periods, 4);
  const ttmDep    = sumLastN(depAmort, periods, 4);
  const ttmNI     = sumLastN(netIncome, periods, 4);
  const ttmGross  = sumLastN(grossProfit, periods, 4);
  const ttmM      = sumLastN(mktExp, periods, 4);
  const ttmA      = sumLastN(adminExp, periods, 4);
  const ttmR      = sumLastN(rndExp, periods, 4) ?? 0;
  const ttmEBITDA = (ttmGross != null && ttmM != null && ttmA != null && ttmDep != null)
    ? ttmGross + ttmM + ttmA + ttmR + ttmDep
    : null;

  // Net Borç
  const cash      = latestNonEmpty(codes["1AA"], periods) ?? 0;
  const stDebt    = latestNonEmpty(codes["2AA"], periods) ?? 0;
  const ltDebt    = latestNonEmpty(codes["2BA"], periods) ?? 0;
  const netDebt   = stDebt + ltDebt - cash;

  // Değerleme rasyoları (DASH)
  const pe        = dashLatest(dashRows, "Dash25", "F/K");
  const pb        = dashLatest(dashRows, "Dash26", "PD/DD");
  const ps        = dashLatest(dashRows, "Dash27", "FD/Satışlar", "FD/Satış");
  const evEbitda  = dashLatest(dashRows, "Dash28", "FD/FAVÖK");
  const ndEbitda  = dashLatest(dashRows, "Dash29", "Net Borç/FAVÖK");

  // KAP — Genel bilgiler
  const companyName =
    getKapExact("general.trade_name") ||
    getKapExact("summary.trade_name") ||
    `${ticker} A.Ş.`;
  const sector    = getKapExact("summary.sektor_ana") || "";
  const subSector = getKapExact("summary.sektor_alt") || "";
  const address   = getKapExact("general.merkez_adresi") || "";
  const website   = getKapExact("summary.internet_adresi") || "";

  // KAP — Ortaklık/İştirak/Yönetim
  const kapKeys = Object.keys(kapMap);

  // Sermaye 5 üstü
  const shareholders: Array<{ name: string; value: number }> = [];
  for (const k of kapKeys) {
    const m = k.match(/^ownership\.sermaye_5ustu\[(\d+)\]\.Ortağın Adı-Soyadı\/Ticaret Ünvanı$/i);
    if (m) {
      const i = Number(m[1]);
      const name = getKapExact(`ownership.sermaye_5ustu[${i}].Ortağın Adı-Soyadı/Ticaret Ünvanı`) || "Ortak";
      const pct  = toNum(getKapExact(`ownership.sermaye_5ustu[${i}].Sermayedeki Payı(%)`));
      if (name && pct != null) shareholders.push({ name, value: pct });
    }
  }
  if (!shareholders.length) shareholders.push({ name: "Veri Bekleniyor", value: 100 });

  // Bağlı ortaklıklar
  const subsidiaries: string[] = [];
  for (const k of kapKeys) {
    const m = k.match(/^ownership\.bagli_ortakliklar\[(\d+)\]\.Ticaret Ünvanı$/i);
    if (m) {
      const v = getKapExact(k);
      if (v) subsidiaries.push(v);
    }
  }
  if (!subsidiaries.length) subsidiaries.push("Veri Bekleniyor");

  // Yönetim
  const management: Array<{ name: string; position: string }> = [];
  for (const k of kapKeys) {
    const m = k.match(/^board_members\[(\d+)\]\.Adı-Soyadı$/i);
    if (m) {
      const idx = Number(m[1]);
      const name = getKapExact(`board_members[${idx}].Adı-Soyadı`);
      const role = getKapExact(`board_members[${idx}].Görevi`) || "Yönetim Kurulu Üyesi";
      if (name) management.push({ name, position: role });
    }
  }
  if (!management.length) management.push({ name: "Veri Bekleniyor", position: "Yönetim Kurulu" });

  // Waterfall — FCF
  const wNWC = dashLatest(dashRows, "DashNWC", "Net İşletme Sermayesi", "NWC") ?? 0;
  const wOth = dashLatest(dashRows, "DashOthers", "Diğer") ?? 0;
  const wFCF = dashLatest(dashRows, "DashFCF", "Serbest Nakit Akım") ?? ((lastNI ?? 0) + (lastDep ?? 0) + wNWC + wOth);

  // Client veri paketi
  const pageData: PageData = {
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
      ps,
      evEbitda,
      netDebtEbitda: ndEbitda,
      earnings: ttmNI,                                      // TTM Net Kâr
      bookValue: latestNonEmpty(codes["2N"], periods) ?? latestNonEmpty(codes["2O"], periods), // Defter Değeri
      sales: ttmSales,                                      // TTM Satışlar
      ebitda: ttmEBITDA,
      netDebt: netDebt,
    },
    balanceSheet: {
      assetsItems,
      liabilitiesItems,
      equityItems,
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

  // Son bir kez bilanço eşitliği (UI tarafında da doğru toplama için)
  if ((totalAssets ?? 0) !== (totalSourcesCalc ?? 0)) {
    // UI tarafı görselleştirme yapıyor; burada sadece uyaralım
    console.warn(`[${ticker}] Balance mismatch Δ=`, (totalAssets ?? 0) - (totalSourcesCalc ?? 0));
  }

  return <CompanyPageClient data={pageData} />;
}
