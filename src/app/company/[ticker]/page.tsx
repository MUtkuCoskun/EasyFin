// src/app/company/[ticker]/page.tsx
import "server-only";
import { headers, cookies } from "next/headers";
import type { Metadata } from "next";
import { FiTrendingUp, FiBarChart2, FiActivity, FiDollarSign, FiFileText, FiLink } from "react-icons/fi";


export const dynamic = "force-dynamic"; // her istekte taze çek

type FirestoreDoc<T = any> = {
  ok: boolean;
  path?: string;
  data?: T;
  type?: "document" | "collection";
  count?: number;
};

type SheetTable = {
  header: string[];
  rows: any[];
};

// ---------- BASE URL ----------
function getBaseUrl(): string {
  const envBase = process.env.NEXT_PUBLIC_BASE_URL?.trim();
  if (envBase) return envBase.replace(/\/+$/, "");

  const vercelUrl = process.env.VERCEL_URL?.trim();
  if (vercelUrl) return `https://${vercelUrl.replace(/\/+$/, "")}`;

  try {
    const h = headers();
    const host = h.get("x-forwarded-host") || h.get("host");
    const proto = h.get("x-forwarded-proto") || (host?.startsWith("localhost") ? "http" : "https");
    if (host) return `${proto}://${host}`.replace(/\/+$/, "");
  } catch {
    // headers() bazı ortamlarda erişilemeyebilir
  }

  return "http://localhost:3000";
}

function buildApiUrl(path: string): string {
  const rel = `/api/debug/firestore?path=${encodeURIComponent(path)}`;
  // Absolute şart (Node fetch relative URL'i kabul etmiyor)
  return new URL(rel, getBaseUrl()).toString();
}

// ---------- AUTH FORWARD ----------
function buildAuthHeaders(): HeadersInit {
  const h = headers();
  const c = cookies();

  const out: Record<string, string> = {};

  // Preview/Prod koruması genelde cookie ile doğrular
  const cookieStr = c.toString();
  if (cookieStr) out["cookie"] = cookieStr;

  // Basic auth vb. varsa
  const auth = h.get("authorization");
  if (auth) out["authorization"] = auth;

  // Vercel Preview Protection bypass header
  const bypassHeader = h.get("x-vercel-protection-bypass") || process.env.VERCEL_PROTECTION_BYPASS;
  if (bypassHeader) out["x-vercel-protection-bypass"] = bypassHeader;

  // (opsiyonel) iç işaret
  out["x-internal-ssr"] = "1";

  return out;
}

// ---------- API FETCH ----------
async function getSheetDoc<T = any>(path: string): Promise<T | null> {
  // Doküman/koleksiyon guard: doküman = çift segment
  const segs = path.split("/").filter(Boolean);
  if (segs.length % 2 !== 0) {
    console.error("[getSheetDoc] Koleksiyon path (doküman bekleniyordu):", path);
    return null;
  }

  const url = buildApiUrl(path);

  try {
    const res = await fetch(url, {
      cache: "no-store",
      headers: buildAuthHeaders(),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error("[getSheetDoc] !res.ok", res.status, url, text?.slice(0, 400));
      return null;
    }
    const json = (await res.json()) as FirestoreDoc<T> & { exists?: boolean };
    if (!json?.ok) {
      console.error("[getSheetDoc] json.ok=false", url, json);
      return null;
    }
    return json.data ?? null;
  } catch (e) {
    console.error("[getSheetDoc] fetch error", url, e);
    return null;
  }
}

// ---------- helpers ----------
function toNum(x: any): number | null {
  if (x == null) return null;
  if (typeof x === "number") return isFinite(x) ? x : null;
  if (typeof x !== "string") return null;
  const s = x.trim();
  if (!s) return null;
  // TR formatı: "1.234.567,89" → "1234567.89"
  const norm = s.replace(/\./g, "").replace(/,/g, ".");
  const n = Number(norm);
  return isFinite(n) ? n : null;
}

function fmt(n: number | null | undefined, opt: Intl.NumberFormatOptions = {}) {
  if (n == null || !isFinite(n)) return "–";
  return new Intl.NumberFormat("tr-TR", opt).format(n);
}

function fmtMoney(n: number | null | undefined) {
  if (n == null || !isFinite(n)) return "–";
  return new Intl.NumberFormat("tr-TR", {
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(n);
}

function pickPeriods(fin: SheetTable): string[] {
  // FIN.table: ilk 5 kolon meta, sonra dönem kolonları (yeni ⇒ eski)
  const h = fin.header ?? [];
  return h.slice(5);
}

function rowByCode(fin: SheetTable): Record<string, any> {
  const map: Record<string, any> = {};
  for (const r of fin.rows || []) {
    if (r && typeof r.kod === "string") map[r.kod] = r;
  }
  return map;
}

function latestNonEmpty(row: any, periodKeys: string[]): number | null {
  for (const key of periodKeys) {
    const v = toNum(row?.[key]);
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

function quarterSeries(
  formula: (k: string) => number | null,
  periodKeys: string[],
  take: number
) {
  const out: { period: string; value: number | null }[] = [];
  for (let i = 0; i < Math.min(take, periodKeys.length); i++) {
    out.push({ period: periodKeys[i], value: formula(periodKeys[i]) });
  }
  return out;
}

// ---------- Page ----------
export async function generateMetadata({
  params,
}: {
  params: { ticker: string };
}): Promise<Metadata> {
  const ticker = params.ticker?.toUpperCase?.() || "TICKER";
  return {
    title: `${ticker} • EasyFin • Fütüristik Finansal Analiz`,
  };
}

export default async function CompanyPage({ params }: { params: { ticker: string } }) {
  const ticker = (params?.ticker || "").toUpperCase();

  // Firestore'dan 5 tabloyu çek
  const [fin, tidy, kap, prices, dash] = await Promise.all([
    getSheetDoc<SheetTable>(`tickers/${ticker}/sheets/FIN.table`),
    getSheetDoc<SheetTable>(`tickers/${ticker}/sheets/FIN.tidy`), // ileride grafik/filtre için hazır
    getSheetDoc<SheetTable>(`tickers/${ticker}/sheets/KAP.table`),
    getSheetDoc<SheetTable>(`tickers/${ticker}/sheets/PRICES.table`),
    getSheetDoc<SheetTable>(`tickers/${ticker}/sheets/DASH.table`),
  ]);

  if (!fin) {
    return (
      <main className="bg-gray-900 text-white min-h-screen flex items-center justify-center">
        <div className="text-center p-8 bg-gray-800 rounded-2xl shadow-xl">
          <h1 className="text-3xl font-bold text-red-500">Hata</h1>
          <p className="mt-4 text-gray-300">
            <code className="bg-gray-700 p-1 rounded">[{ticker}]</code> için FIN.table verisi bulunamadı.
          </p>
          <p className="mt-2 text-xs text-gray-500">
            İstenen Firestore path: <code>tickers/{ticker}/sheets/FIN.table</code>
          </p>
        </div>
      </main>
    );
  }

  // === DATA PROCESSING (UNCHANGED) ===
  const periods = pickPeriods(fin);
  const codes = rowByCode(fin);

  const pRow = prices?.rows?.[0] || {};
  const lastPrice = toNum(pRow?.["fiyat"]);
  const lastMcap = toNum(pRow?.["piyasa_değeri"]) ?? toNum(pRow?.["piyasa_deÄŸeri"]);

  const netSales = codes["3C"];
  const grossProfit = codes["3D"];
  const mktExp = codes["3DA"];
  const adminExp = codes["3DB"];
  const rndExp = codes["3DC"];
  const depAmort = codes["4B"];
  const opProfit = codes["3DF"];
  const parentNI = codes["3Z"];
  const cash = codes["1AA"];
  const stDebt = codes["2AA"];
  const ltDebt = codes["2BA"];
  const parentEquity = codes["2O"];

  const ttmSales = sumLastN(netSales, periods, 4);
  const ttmGross = sumLastN(grossProfit, periods, 4);
  const ttmDep = sumLastN(depAmort, periods, 4);
  const ttmMkt = sumLastN(mktExp, periods, 4);
  const ttmAdm = sumLastN(adminExp, periods, 4);
  const ttmRND = sumLastN(rndExp, periods, 4) ?? 0;

  const ttmEBITDA =
    ttmGross != null && ttmMkt != null && ttmAdm != null && ttmDep != null
      ? ttmGross + ttmMkt + ttmAdm + ttmRND + ttmDep
      : null;
  const ttmNI = sumLastN(parentNI, periods, 4);

  const lastCash = latestNonEmpty(cash, periods);
  const lastStDebt = latestNonEmpty(stDebt, periods);
  const lastLtDebt = latestNonEmpty(ltDebt, periods);
  const lastEquity = latestNonEmpty(parentEquity, periods);

  const netDebt = (lastStDebt ?? 0) + (lastLtDebt ?? 0) - (lastCash ?? 0);

  const pe = lastMcap != null && ttmNI ? lastMcap / ttmNI : null;
  const ps = lastMcap != null && ttmSales ? lastMcap / ttmSales : null;
  const pb = lastMcap != null && lastEquity ? lastMcap / lastEquity : null;
  const evEbitda = lastMcap != null && ttmEBITDA ? (lastMcap + (netDebt ?? 0)) / ttmEBITDA : null;
  const ndEbitda = ttmEBITDA ? (netDebt ?? 0) / ttmEBITDA : null;

  const take = 8;
  const qSales = quarterSeries((k) => toNum(netSales?.[k]) ?? null, periods, take);
  const qNI = quarterSeries((k) => toNum(parentNI?.[k]) ?? null, periods, take);
  const qEBITDA = quarterSeries((k) => {
    const gp = toNum(grossProfit?.[k]);
    const mk = toNum(mktExp?.[k]);
    const ad = toNum(adminExp?.[k]);
    const rd = toNum(rndExp?.[k]) ?? 0;
    const dp = toNum(depAmort?.[k]);
    if ([gp, mk, ad, dp].some((v) => v == null)) return null;
    return (gp ?? 0) + (mk ?? 0) + (ad ?? 0) + rd + (dp ?? 0);
  }, periods, take);

  const kapRows: Array<{ field: string; value: string }> = Array.isArray(kap?.rows)
    ? kap!.rows.map((r: any) => ({
        field: String(r?.field ?? ""),
        value: String(r?.value ?? ""),
      }))
    : [];
  
  const companyName = kapRows.find(r => r.field.toLowerCase().includes('şirketin ticaret ünvanı'))?.value || `${ticker} A.Ş.`;


  // === NEW FUTURISTIC UI ===
  return (
    <div className="bg-gray-900 text-gray-200 min-h-screen font-sans">
      <main className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
        {/* Header */}
        <header className="mb-8">
          <h1 className="text-4xl md:text-5xl font-bold text-white tracking-tighter">{companyName} ({ticker})</h1>
          <p className="text-lg text-cyan-400">Kapsamlı Temel Analiz Raporu</p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Column */}
          <div className="lg:col-span-2 space-y-8">
            {/* Key Metrics Section */}
            <Section title="Anlık Değerler" icon={<FiActivity />}>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <MetricCard title="Son Fiyat" value={`${fmt(lastPrice, { minimumFractionDigits: 2 })} ₺`} />
                <MetricCard title="Piyasa Değeri" value={fmtMoney(lastMcap) + " ₺"} />
                <MetricCard title="Net Borç" value={fmtMoney(netDebt ?? null) + " ₺"} note="Son Bilanço" />
                <MetricCard title="TTM Satışlar" value={fmtMoney(ttmSales) + " ₺"} note="Son 12 Ay" />
                <MetricCard title="TTM FAVÖK" value={fmtMoney(ttmEBITDA) + " ₺"} note="Son 12 Ay" />
                <MetricCard title="TTM Net Kar" value={fmtMoney(ttmNI) + " ₺"} note="Son 12 Ay" />
              </div>
            </Section>

            {/* Valuation Section */}
            <Section title="Değerleme Çarpanları" icon={<FiDollarSign />}>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                  <RatioCard title="F/K" value={pe} />
                  <RatioCard title="PD/DD" value={pb} />
                  <RatioCard title="FD/Satış" value={ps} />
                  <RatioCard title="FD/FAVÖK" value={evEbitda} />
                  <RatioCard title="Net Borç/FAVÖK" value={ndEbitda} />
              </div>
            </Section>

            {/* Quarterly Series */}
             <Section title="Çeyreklik Performans" icon={<FiBarChart2 />}>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <MiniSeriesTable title="Satışlar" series={qSales} />
                    <MiniSeriesTable title="FAVÖK" series={qEBITDA} />
                    <MiniSeriesTable title="Net Kar" series={qNI} />
                </div>
            </Section>
          </div>
          
          {/* Right Sidebar */}
          <aside className="space-y-8">
              {/* Financial Health Snapshot */}
              <Section title="Finansal Sağlık" icon={<FiTrendingUp />}>
                  <HealthBar 
                      title="Kısa Vade Varlıklar" 
                      value={latestNonEmpty(codes["1A"], periods)} 
                      total={latestNonEmpty(codes["1"], periods)}
                      color="bg-cyan-500"
                  />
                  <HealthBar 
                      title="Kısa Vade Yükümlülükler" 
                      value={latestNonEmpty(codes["2A"], periods)}
                      total={latestNonEmpty(codes["2"], periods)}
                      color="bg-orange-500"
                  />
                   <HealthBar 
                      title="Özkaynaklar" 
                      value={lastEquity}
                      total={(latestNonEmpty(codes["2"], periods) ?? 0) + (lastEquity ?? 0)}
                      color="bg-emerald-500"
                  />
              </Section>

              {/* KAP Info */}
              <Section title="KAP Bilgileri" icon={<FiFileText />}>
                <div className="space-y-3">
                  {kapRows.slice(0, 5).map((r, i) => (
                    <div key={i} className="bg-gray-800/50 p-3 rounded-lg text-sm">
                      <p className="text-xs text-gray-400 truncate">{r.field}</p>
                      <p className="font-medium text-white break-words">{r.value || "—"}</p>
                    </div>
                  ))}
                </div>
              </Section>

              {/* Raw Docs */}
              <Section title="Ham Veri Linkleri" icon={<FiLink />}>
                <div className="flex flex-col space-y-2 text-sm">
                    <a className="text-cyan-400 hover:text-cyan-300 transition-colors" href={buildApiUrl(`tickers/${ticker}/sheets/FIN.table`)}>FIN.table</a>
                    <a className="text-cyan-400 hover:text-cyan-300 transition-colors" href={buildApiUrl(`tickers/${ticker}/sheets/KAP.table`)}>KAP.table</a>
                    <a className="text-cyan-400 hover:text-cyan-300 transition-colors" href={buildApiUrl(`tickers/${ticker}/sheets/PRICES.table`)}>PRICES.table</a>
                </div>
              </Section>
          </aside>
        </div>
      </main>
    </div>
  );
}

// ---- NEW FUTURISTIC UI COMPONENTS ----

const Section = ({ title, icon, children }: { title: string; icon?: React.ReactNode, children: React.ReactNode }) => (
    <section className="bg-gray-800/50 p-5 rounded-2xl border border-gray-700/50 shadow-lg backdrop-blur-sm">
        <div className="flex items-center mb-4">
            <div className="text-cyan-400 mr-3">{icon}</div>
            <h2 className="text-xl font-bold text-white tracking-tight">{title}</h2>
        </div>
        <div>{children}</div>
    </section>
);

const MetricCard = ({ title, value, note }: { title: string, value: string, note?: string }) => (
    <div className="bg-gray-900/70 p-4 rounded-xl border border-gray-700/50 transition-all duration-300 hover:bg-gray-700/50 hover:scale-105 cursor-pointer">
        <p className="text-sm text-gray-400">{title}</p>
        <p className="text-2xl font-semibold text-white mt-1">{value}</p>
        {note && <p className="text-xs text-gray-500 mt-1">{note}</p>}
    </div>
);

const RatioCard = ({ title, value }: { title: string, value: number | null }) => {
    const isHigh = (value || 0) > 25;
    const isLow = (value || 0) < 0;
    
    let colorClass = 'text-white';
    if(value !== null) {
      if(isHigh) colorClass = 'text-red-400';
      if(isLow) colorClass = 'text-yellow-400';
    }

    return (
        <div className="flex flex-col items-center justify-center bg-gray-900/70 p-4 rounded-xl border border-gray-700/50 transition-all duration-300 hover:bg-gray-700/50 hover:scale-105 cursor-pointer text-center">
            <p className="text-sm text-gray-400">{title}</p>
            <p className={`text-3xl font-bold mt-1 ${colorClass}`}>
                {fmt(value, {maximumFractionDigits: 2})}
            </p>
        </div>
    );
};

const MiniSeriesTable = ({ title, series }: { title: string, series: { period: string, value: number | null }[] }) => (
    <div className="bg-gray-900/70 p-4 rounded-xl border border-gray-700/50 h-full">
        <h3 className="font-semibold text-white mb-3">{title}</h3>
        <div className="space-y-2 text-sm">
            {series.slice(0, 5).map((item, i) => (
                <div key={i} className="flex justify-between items-center border-b border-gray-800 pb-1 last:border-0">
                    <span className="text-gray-400">{item.period}</span>
                    <span className={`font-medium ${item.value === null ? 'text-gray-500' : item.value > 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {fmtMoney(item.value)}
                    </span>
                </div>
            ))}
        </div>
    </div>
);

const HealthBar = ({ title, value, total, color }: { title: string, value: number | null, total: number | null, color: string}) => {
    const percentage = (total && value) ? (value / total) * 100 : 0;
    
    return (
      <div className="mb-4 last:mb-0">
        <div className="flex justify-between items-end mb-1">
          <p className="text-sm text-gray-300">{title}</p>
          <p className="text-lg font-bold text-white">{fmtMoney(value)} ₺</p>
        </div>
        <div className="w-full bg-gray-700 rounded-full h-2.5">
          <div 
            className={`${color} h-2.5 rounded-full transition-all duration-500`} 
            style={{ width: `${percentage}%` }}
          ></div>
        </div>
      </div>
    );
};
