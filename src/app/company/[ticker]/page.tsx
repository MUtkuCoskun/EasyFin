// src/app/company/[ticker]/page.tsx
import "server-only";
import type { Metadata } from "next";

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

// ---- Helpers ----

// API URL'yi güvenli kur: default relative, opsiyonel NEXT_PUBLIC_BASE_URL override
function buildApiUrl(path: string) {
  const rel = `/api/debug/firestore?path=${encodeURIComponent(path)}`;
  const base = process.env.NEXT_PUBLIC_BASE_URL?.trim();
  return base ? `${base}${rel}` : rel;
}

async function getSheetDoc<T = any>(path: string): Promise<T | null> {
  // Doküman / koleksiyon guard: doküman = çift segment sayısı
  const segs = path.split("/").filter(Boolean);
  if (segs.length % 2 !== 0) {
    console.error("[getSheetDoc] Koleksiyon path verilmiş (doküman bekleniyordu):", path);
    return null;
  }

  const url = buildApiUrl(path);

  try {
    const res = await fetch(url, { cache: "no-store" });
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
    // /api/debug/firestore dokümanda { ok, data } döndürür
    return json.data ?? null;
  } catch (e) {
    console.error("[getSheetDoc] fetch error", url, e);
    return null;
  }
}

function toNum(x: any): number | null {
  if (x == null) return null;
  if (typeof x === "number") return isFinite(x) ? x : null;
  if (typeof x !== "string") return null;
  const s = x.trim();
  if (!s) return null;
  // TR formatı "15,59", binlik "1.234.567,89"
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

// ---- Page ----
export async function generateMetadata({
  params,
}: {
  params: { ticker: string };
}): Promise<Metadata> {
  const ticker = params.ticker?.toUpperCase?.() || "TICKER";
  return {
    title: `${ticker} • Finansal Analiz`,
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
      <main className="mx-auto max-w-6xl p-6">
        <h1 className="text-2xl font-semibold">[{ticker}]</h1>
        <p className="mt-4 text-red-600">
          FIN.table bulunamadı. Firestore path: <code>tickers/{ticker}/sheets/FIN.table</code>
        </p>
        <div className="mt-2 text-sm text-gray-500">
          API: <code>/api/debug/firestore?path=tickers%2F{ticker}%2Fsheets%2FFIN.table</code>
        </div>
      </main>
    );
  }

  const periods = pickPeriods(fin); // yeni → eski
  const codes = rowByCode(fin);

  // PRICES
  const pRow = prices?.rows?.[0] || {};
  const lastPrice = toNum(pRow?.["fiyat"]);
  const lastMcap = toNum(pRow?.["piyasa_değeri"]) ?? toNum(pRow?.["piyasa_deÄŸeri"]);

  // Temel kalemler
  const netSales = codes["3C"];
  const grossProfit = codes["3D"];
  const mktExp = codes["3DA"]; // negatif
  const adminExp = codes["3DB"]; // negatif
  const rndExp = codes["3DC"]; // çoğu şirkette 0
  const depAmort = codes["4B"];
  const opProfit = codes["3DF"];
  const parentNI = codes["3Z"];

  // Bilanço kalemleri
  const cash = codes["1AA"];
  const stDebt = codes["2AA"];
  const ltDebt = codes["2BA"];
  const parentEquity = codes["2O"];

  // TTM hesapları (son 4 çeyrek)
  const ttmSales = sumLastN(netSales, periods, 4);
  const ttmGross = sumLastN(grossProfit, periods, 4);
  const ttmDep = sumLastN(depAmort, periods, 4);
  const ttmMkt = sumLastN(mktExp, periods, 4);
  const ttmAdm = sumLastN(adminExp, periods, 4);
  const ttmRND = sumLastN(rndExp, periods, 4) ?? 0;

  // EBITDA ≈ Brüt Kar + Paz. + GY + AR-GE + Amortisman (giderler negatif geldiği için topluyoruz)
  const ttmEBITDA =
    ttmGross != null && ttmMkt != null && ttmAdm != null && ttmDep != null
      ? ttmGross + ttmMkt + ttmAdm + ttmRND + ttmDep
      : null;

  const ttmNI = sumLastN(parentNI, periods, 4);

  // Son bilanço değerleri (en yeni dönem)
  const lastCash = latestNonEmpty(cash, periods);
  const lastStDebt = latestNonEmpty(stDebt, periods);
  const lastLtDebt = latestNonEmpty(ltDebt, periods);
  const lastEquity = latestNonEmpty(parentEquity, periods);

  const netDebt = (lastStDebt ?? 0) + (lastLtDebt ?? 0) - (lastCash ?? 0);

  // Oranlar
  const pe = lastMcap != null && ttmNI ? lastMcap / ttmNI : null;
  const ps = lastMcap != null && ttmSales ? lastMcap / ttmSales : null;
  const pb = lastMcap != null && lastEquity ? lastMcap / lastEquity : null;
  const evEbitda = lastMcap != null && ttmEBITDA ? (lastMcap + (netDebt ?? 0)) / ttmEBITDA : null;
  const ndEbitda = ttmEBITDA ? (netDebt ?? 0) / ttmEBITDA : null;

  // Grafik/seri için birkaç kalem (son 8 çeyrek)
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

  // KAP (flatten tablo: header ["field","value"])
  const kapRows: Array<{ field: string; value: string }> = Array.isArray(kap?.rows)
    ? kap!.rows.map((r: any) => ({
        field: String(r?.field ?? r?.Field ?? r?.key ?? ""),
        value: String(r?.value ?? r?.Value ?? r?.val ?? ""),
      }))
    : [];

  const kapQuick = kapRows
    .filter(
      (r) =>
        /audit|denet|board|kurul|sermaye|pay|oy|ortak/i.test(r.field) ||
        /bağımsız denet|yeminli mali müşavir/i.test(r.value)
    )
    .slice(0, 12);

  return (
    <main className="mx-auto max-w-7xl p-6 space-y-8">
      {/* Header */}
      <section className="flex flex-col gap-2">
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">
          {ticker} • Finansal Analiz
        </h1>
        <p className="text-sm text-gray-500">Kaynaklar: FIN, PRICES, KAP, DASH (Firestore)</p>
      </section>

      {/* Price & KPI Cards */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card title="Fiyat">
          <div className="text-2xl font-semibold">
            {lastPrice == null
              ? "–"
              : fmt(lastPrice, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{" "}
            ₺
          </div>
          <div className="text-xs text-gray-500 mt-1">Anlık</div>
        </Card>
        <Card title="Piyasa Değeri">
          <div className="text-2xl font-semibold">{fmtMoney(lastMcap)}</div>
          <div className="text-xs text-gray-500 mt-1">₺</div>
        </Card>
        <Card title="Net Borç">
          <div className="text-2xl font-semibold">{fmtMoney(netDebt ?? null)}</div>
          <div className="text-xs text-gray-500 mt-1">Son bilanço</div>
        </Card>
        <Card title="TTM Satış">
          <div className="text-2xl font-semibold">{fmtMoney(ttmSales)}</div>
          <div className="text-xs text-gray-500 mt-1">Son 4 çeyrek</div>
        </Card>
        <Card title="TTM FAVÖK">
          <div className="text-2xl font-semibold">{fmtMoney(ttmEBITDA)}</div>
          <div className="text-xs text-gray-500 mt-1">Son 4 çeyrek</div>
        </Card>
      </section>

      {/* Valuation Ratios */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <Metric title="F/K (TTM)" value={pe} digits={2} />
        <Metric title="F/S (TTM)" value={ps} digits={2} />
        <Metric title="PD/DD" value={pb} digits={2} />
        <Metric title="FD/FAVÖK (TTM)" value={evEbitda} digits={2} />
        <Metric title="Net Borç/FAVÖK (TTM)" value={ndEbitda} digits={2} />
      </section>

      {/* Quarterly mini tables */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <MiniSeries title="Satış Gelirleri (Ç)" series={qSales} />
        <MiniSeries title="FAVÖK (Ç)" series={qEBITDA} />
        <MiniSeries title="Ana Ort. Net Kar (Ç)" series={qNI} />
      </section>

      {/* KAP Snapshot */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">KAP Özeti</h2>
        {kapRows.length === 0 ? (
          <div className="text-sm text-gray-500">KAP.table bulunamadı veya boş.</div>
        ) : (
          <>
            {kapQuick.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {kapQuick.map((r, i) => (
                  <div key={i} className="rounded-xl border p-3 bg-white">
                    <div className="text-xs uppercase text-gray-500 truncate">{r.field}</div>
                    <div className="text-sm font-medium mt-1 break-words">{r.value || "—"}</div>
                  </div>
                ))}
              </div>
            )}
            <details className="mt-2">
              <summary className="cursor-pointer text-sm text-gray-600 hover:text-gray-800">
                Tüm KAP alanlarını göster
              </summary>
              <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2">
                {kapRows.slice(0, 200).map((r, i) => (
                  <div key={i} className="rounded-lg border p-2 bg-white">
                    <div className="text-[11px] text-gray-500 truncate">{r.field}</div>
                    <div className="text-sm font-medium break-words">{r.value || "—"}</div>
                  </div>
                ))}
              </div>
            </details>
          </>
        )}
      </section>

      {/* Raw access links */}
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Ham Dokümanlar</h2>
        <ul className="list-disc ml-5 text-sm text-blue-700">
          <li>
            <a
              className="underline"
              href={`/api/debug/firestore?path=${encodeURIComponent(`tickers/${ticker}/sheets/FIN.table`)}`}
            >
              FIN.table
            </a>
          </li>
          <li>
            <a
              className="underline"
              href={`/api/debug/firestore?path=${encodeURIComponent(`tickers/${ticker}/sheets/FIN.tidy`)}`}
            >
              FIN.tidy
            </a>
          </li>
          <li>
            <a
              className="underline"
              href={`/api/debug/firestore?path=${encodeURIComponent(`tickers/${ticker}/sheets/KAP.table`)}`}
            >
              KAP.table
            </a>
          </li>
          <li>
            <a
              className="underline"
              href={`/api/debug/firestore?path=${encodeURIComponent(`tickers/${ticker}/sheets/PRICES.table`)}`}
            >
              PRICES.table
            </a>
          </li>
          <li>
            <a
              className="underline"
              href={`/api/debug/firestore?path=${encodeURIComponent(`tickers/${ticker}/sheets/DASH.table`)}`}
            >
              DASH.table
            </a>
          </li>
        </ul>
      </section>
    </main>
  );
}

// ---- UI bits (Tailwind only) ----
function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border p-4 bg-white shadow-sm">
      <div className="text-xs text-gray-500">{title}</div>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function Metric({ title, value, digits = 2 }: { title: string; value: number | null; digits?: number }) {
  return (
    <div className="rounded-2xl border p-4 bg-white shadow-sm">
      <div className="text-xs text-gray-500">{title}</div>
      <div className="mt-1 text-2xl font-semibold">
        {value == null || !isFinite(value) ? "–" : fmt(value, { maximumFractionDigits: digits })}
      </div>
    </div>
  );
}

function MiniSeries({
  title,
  series,
}: {
  title: string;
  series: { period: string; value: number | null }[];
}) {
  const head = ["Dönem", "Değer"];
  return (
    <div className="rounded-2xl border p-4 bg-white shadow-sm">
      <div className="text-sm font-semibold mb-2">{title}</div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500">
              {head.map((h) => (
                <th key={h} className="py-1 pr-2">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {series.map((r, i) => (
              <tr key={i} className="border-t">
                <td className="py-1 pr-4 whitespace-nowrap">{r.period}</td>
                <td className="py-1 pr-4">{fmt(r.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
