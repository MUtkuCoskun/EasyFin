// src/app/company/[ticker]/page.tsx
import React from "react";
import Link from "next/link";
import Navbar from "../../components/Navbar";
import { adminDb } from "../../../lib/firebaseAdmin";

export const revalidate = 120;
export const runtime = "nodejs";

/* ----------------------------- Types ----------------------------- */
type PageParams = { ticker: string };

type PriceRow = { ts: string; close: number };

type CompanyDoc = {
  name?: string;
  sector?: string;
  sektor_ana?: string;
  sektor_alt?: string;
  website?: string;
  internet_adresi?: string;
  market?: string;
  islem_gordugu_pazar?: string;
  indices?: string[];
  dahil_oldugu_endeksler?: string[];
  address?: string;
  merkez_adresi?: string;
  free_float_ratio?: number;
  fiili_dolasim_oran?: number;
  free_float_mcap?: number;
  fiili_dolasim_tutar_tl?: number;
  last?: number;
  mcap?: number;
  shares_outstanding?: number;
};

type MetaRow = {
  full_name: string | null;
  description: string | null;
  free_float: number | null;
  market_cap: number | null;
};

type Ratios = {
  mcap: number | null;
  equity_value: number | null;
  ttm_net_income: number | null;
  ttm_revenue: number | null;
  pb: number | null;
  pe_ttm: number | null;
  net_margin_ttm: number | null; // NI/Rev (TTM)
  roe_ttm_simple: number | null; // NI/Equity (last)
};

type SeriesRow = {
  period: string;
  revenue_q: number | null;
  net_income_q: number | null;
  equity_value: number | null;
};

type BoardRow = {
  name: string;
  role: string | null;
  is_executive: boolean | null;
  gender: string | null;
  profession: string | null;
  first_elected: string | null;
  equity_pct: number | null;
  represented_share_group: string | null;
};
type OwnRow = { holder: string; pct: number | null; voting_pct: number | null; paid_in_tl: number | null };
type SubRow = {
  company: string;
  activity: string | null;
  paid_in_capital: number | null;
  share_amount: number | null;
  currency: string | null;
  share_pct: number | null;
  relation: string | null;
};
type VoteRow = { field: string; value: string | null };
type K47Row = { m1?: string | null; m2?: string | null; m3?: string | null; m4?: string | null; m5?: number | null; m6?: number | null; m7?: number | null };
type RawKapPayload = { kap?: any; bilanco?: any };

/* ----------------------------- Utils ----------------------------- */
function toNumber(x: any): number | null {
  if (x == null) return null;
  if (typeof x === "number") return Number.isFinite(x) ? x : null;
  if (typeof x === "string") {
    const trimmed = x.trim();
    if (!trimmed || trimmed === "-" || trimmed === "–") return null;
    const neg = /^\(.*\)$/.test(trimmed); // (....) negatif
    let s = trimmed.replace(/[()%]/g, "").replace(/\s+/g, "");
    // TR style -> normalize
    s = s.replace(/\./g, "").replace(/,/g, ".");
    const n = Number(s);
    if (!Number.isFinite(n)) return null;
    return neg ? -n : n;
  }
  return null;
}
const pct = (n: number | null | undefined) => (n == null ? null : n > 1 ? n / 100 : n);
const fmtNum = (n?: number | null, d = 0) =>
  n == null ? "—" : new Intl.NumberFormat("tr-TR", { maximumFractionDigits: d }).format(n);
const fmtPct = (n?: number | null, d = 1) => (n == null ? "—" : `${(n * 100).toFixed(d)}%`);

function isPlainObject(x: any): x is Record<string, any> {
  return x && typeof x === "object" && !Array.isArray(x);
}
function getHeaderFromTableObj(table: any): string[] {
  if (!table || typeof table !== "object") return [];
  const cand = table.header || table.columns || table.periods || [];
  return Array.isArray(cand) ? cand.slice() : [];
}
function getRowsFromTableObj(table: any): Record<string, any>[] {
  if (!table || typeof table !== "object") return [];
  const r1 = (table as any).rows;
  if (Array.isArray(r1)) return r1.filter(isPlainObject);
  if (isPlainObject(r1)) return Object.values(r1).filter(isPlainObject);
  const r2 = (table as any).data;
  if (Array.isArray(r2)) return r2.filter(isPlainObject);
  if (isPlainObject(r2)) return Object.values(r2).filter(isPlainObject);
  const blacklist = new Set(["header", "columns", "periods", "rows", "data"]);
  const vals = Object.entries(table)
    .filter(([k, v]) => !blacklist.has(k) && isPlainObject(v))
    .map(([_, v]) => v);
  return vals.filter(isPlainObject);
}
function normPeriod(p: string): string {
  const m = String(p).match(/^(\d{4})[\/\-](\d{1,2})$/);
  return m ? `${m[1]}/${m[2].padStart(2, "0")}` : String(p);
}

/* ---------------------------- Loaders ---------------------------- */
async function loadCompanyDoc(ticker: string): Promise<CompanyDoc & { ticker: string }> {
  const d = await adminDb.collection("tickers").doc(ticker).get();
  const c = (d.exists ? (d.data() as any) : {}) as CompanyDoc;
  return { ticker, ...(c || {}) };
}

async function readFinLastValue(ticker: string, code: string): Promise<number | null> {
  try {
    const fin = await adminDb.collection("tickers").doc(ticker).collection("sheets").doc("FIN.table").get();
    if (!fin.exists) return null;
    const table: any = fin.data();
    const header = getHeaderFromTableObj(table);
    const cols = header.slice(5);
    const rows = getRowsFromTableObj(table);
    const row = rows.find((r) => (r?.kod ?? r?.code ?? r?.Kod) === code) || null;
    if (!row || !cols.length) return null;
    const lastCol = cols.at(-1)!;
    return toNumber(row[lastCol]);
  } catch {
    return null;
  }
}

async function loadPriceSeries(ticker: string, limit = 240): Promise<{ last: number | null; series: PriceRow[] }> {
  // 1) prices alt koleksiyonu
  try {
    const snap = await adminDb
      .collection("tickers")
      .doc(ticker)
      .collection("prices")
      .orderBy("ts", "desc")
      .limit(limit)
      .get();
    if (!snap.empty) {
      const rows = snap.docs
        .map((d: any) => {
          const x = d.data();
          const raw = x?.ts;
          let ts: string | null = null;
          if (typeof raw === "string") ts = raw;
          else if (typeof raw === "number") ts = new Date(raw < 2_000_000_000 ? raw * 1000 : raw).toISOString();
          else if (raw?.toDate) ts = raw.toDate().toISOString();
          const close = Number(x?.close);
          if (!ts || Number.isNaN(close)) return null as any;
          return { ts, close };
        })
        .filter(Boolean) as PriceRow[];
      const series = rows.reverse();
      return { last: series.at(-1)?.close ?? null, series };
    }
  } catch {}

  // 2) PRICES.table fallback
  try {
    const doc = await adminDb.collection("tickers").doc(ticker).collection("sheets").doc("PRICES.table").get();
    if (!doc.exists) return { last: null, series: [] };
    const table: any = doc.data();
    const header = getHeaderFromTableObj(table);
    const rows = getRowsFromTableObj(table);

    // tek satırlı tablo veya isimli satır
    let priceRow =
      rows.find((r) => {
        const keyName = (r?.Kalem || r?.kalem || r?.name || "").toString().toLowerCase();
        return /^(close|kapanış|kapanis|price|fiyat)$/.test(keyName);
      }) ||
      rows.find((r) => {
        try {
          return Object.keys(r).some((k) => /^(close|kapanış|kapanis|price|fiyat)$/i.test(k));
        } catch {
          return false;
        }
      }) ||
      rows[0];

    if (!priceRow) return { last: null, series: [] };

    const periodKeys = header.length ? header.filter((p: string) => p !== "Kalem") : Object.keys(priceRow);
    const series = periodKeys
      .filter((k) => /^\d{4}[\/\-]\d{1,2}$/.test(k))
      .slice(-limit)
      .map((p: string) => {
        const v = toNumber(priceRow[p]);
        return v == null ? null : { ts: normPeriod(p), close: v };
      })
      .filter(Boolean) as PriceRow[];

    return { last: series.at(-1)?.close ?? null, series };
  } catch {
    return { last: null, series: [] };
  }
}

async function loadFINandRatios(ticker: string): Promise<{ ratios: Ratios | null; series12: SeriesRow[] }> {
  // hazır ratios doc varsa kullan
  try {
    const d = await adminDb.collection("tickers").doc(ticker).collection("analytics").doc("ratios").get();
    if (d.exists) return { ratios: (d.data() as any) as Ratios, series12: [] };
  } catch {}

  // FIN.table’dan hesapla
  try {
    const fin = await adminDb.collection("tickers").doc(ticker).collection("sheets").doc("FIN.table").get();
    if (!fin.exists) return { ratios: null, series12: [] };
    const table: any = fin.data();
    const header = getHeaderFromTableObj(table);
    const cols: string[] = header.slice(5);
    const rows = getRowsFromTableObj(table);

    const getByCode = (code: string) => rows.find((r) => (r?.kod ?? r?.code ?? r?.Kod) === code) || null;
    const rev = getByCode("3C"); // hasılat (çeyreklik)
    const ni = getByCode("3Z"); // net kâr (çeyreklik)
    const eq = getByCode("2O"); // özkaynak (nokta)

    const last4 = cols.slice(-4);
    const sum4 = (row: any) => {
      if (!row) return null;
      const vals = last4.map((p) => toNumber(row?.[p])).filter((v) => v != null) as number[];
      return vals.length ? vals.reduce((a, b) => a + b, 0) : null;
    };

    const ttm_revenue = sum4(rev);
    const ttm_net_income = sum4(ni);
    const equity_value = eq ? toNumber(eq[cols.at(-1)!]) : null;

    const series12: SeriesRow[] = cols
      .map((p) => ({
        period: normPeriod(p),
        revenue_q: rev ? toNumber(rev[p]) : null,
        net_income_q: ni ? toNumber(ni[p]) : null,
        equity_value: eq ? toNumber(eq[p]) : null,
      }))
      .filter((r) => r.revenue_q != null || r.net_income_q != null || r.equity_value != null)
      .sort((a, b) => a.period.localeCompare(b.period))
      .slice(-12);

    const ratios: Ratios = {
      mcap: null,
      equity_value: equity_value ?? null,
      ttm_net_income,
      ttm_revenue,
      pb: null,
      pe_ttm: null,
      net_margin_ttm: ttm_revenue && ttm_net_income ? ttm_net_income / ttm_revenue : null,
      roe_ttm_simple: ttm_net_income && equity_value ? ttm_net_income / equity_value : null,
    };
    return { ratios, series12 };
  } catch {
    return { ratios: null, series12: [] };
  }
}

async function loadMeta(ticker: string): Promise<MetaRow> {
  try {
    const base = adminDb.collection("tickers").doc(ticker);
    const [metaDocSnap, tickDocSnap] = await Promise.all([base.collection("meta").doc("default").get(), base.get()]);
    const m: any = metaDocSnap?.exists ? metaDocSnap.data() : {};
    const c: any = tickDocSnap?.exists ? tickDocSnap.data() : {};
    return {
      full_name: (m?.full_name ?? c?.full_name ?? c?.name) ?? null,
      description: (m?.description ?? c?.description) ?? null,
      free_float: (m?.free_float ?? c?.free_float ?? c?.fiili_dolasim_oran ?? c?.free_float_ratio) ?? null,
      market_cap: (m?.market_cap ?? c?.market_cap ?? c?.mcap) ?? null,
    };
  } catch {
    return { full_name: null, description: null, free_float: null, market_cap: null };
  }
}

async function loadKAP(ticker: string) {
  try {
    const base = adminDb.collection("tickers").doc(ticker).collection("kap");
    const [boardSnap, ownSnap, subsSnap, votesSnap, k47Doc, rawDoc] = await Promise.all([
      base.doc("board_members").collection("rows").get(),
      base.doc("ownership").collection("rows").get(),
      base.doc("subsidiaries").collection("rows").get(),
      base.doc("vote_rights").collection("rows").get(),
      base.doc("k47").get(),
      base.doc("raw").get(),
    ]);

    const board = (boardSnap?.docs?.map((d) => d.data()) as BoardRow[]) ?? [];
    const own = (ownSnap?.docs?.map((d) => d.data()) as OwnRow[]) ?? [];
    const subs = (subsSnap?.docs?.map((d) => d.data()) as SubRow[]) ?? [];
    const votes = (votesSnap?.docs?.map((d) => d.data()) as VoteRow[]) ?? [];
    const k47 = (k47Doc?.exists ? (k47Doc.data() as any) : {}) as K47Row;
    const raw = (rawDoc?.exists ? (rawDoc.data() as any) : null) as RawKapPayload | null;

    return { board, own, subs, votes, k47, raw };
  } catch {
    return { board: [], own: [], subs: [], votes: [], k47: {}, raw: null };
  }
}

async function loadDASH(ticker: string): Promise<{ header: string[]; rows: any[] }> {
  try {
    const dash = await adminDb.collection("tickers").doc(ticker).collection("sheets").doc("DASH.table").get();
    if (!dash.exists) return { header: [], rows: [] };
    const table: any = dash.data();
    return { header: getHeaderFromTableObj(table), rows: getRowsFromTableObj(table) };
  } catch {
    return { header: [], rows: [] };
  }
}

/* ----------------------------- UI bits --------------------------- */
const Section = ({ id, title, children }: React.PropsWithChildren<{ id: string; title: string }>) => (
  <section id={id} className="scroll-mt-24">
    <h2 className="text-xl font-semibold mb-4">{title}</h2>
    <div className="space-y-4">{children}</div>
  </section>
);

const Card = ({ title, children }: React.PropsWithChildren<{ title?: string }>) => (
  <div className="rounded-2xl bg-[#0F162C] border border-[#2A355B] p-5">
    {title ? <h3 className="font-semibold mb-3">{title}</h3> : null}
    <div className="text-slate-300/90">{children}</div>
  </div>
);

const Kpi = ({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) => (
  <div className="rounded-xl bg-[#0F162C] border border-[#2A355B] p-4">
    <div className="text-xs opacity-70">{label}</div>
    <div className="text-2xl font-semibold mt-1">{value}</div>
    {sub ? <div className="text-xs opacity-60 mt-1">{sub}</div> : null}
  </div>
);

function MiniLine({ data, yKey, w = 800, h = 220 }: { data: any[]; yKey: string; w?: number; h?: number }) {
  const vals = data.map((d) => Number(d?.[yKey] ?? NaN)).filter((v) => !Number.isNaN(v));
  if (!data?.length || !vals.length) return <div className="text-slate-400">Veri yok</div>;
  const pad = 12;
  const min = Math.min(...vals),
    max = Math.max(...vals);
  const sx = (i: number) => pad + (i / Math.max(1, data.length - 1)) * (w - pad * 2);
  const sy = (v: number) => pad + (1 - (v - min) / ((max - min) || 1)) * (h - pad * 2);
  const path = data
    .map((r, i) => {
      const v = Number(r?.[yKey]);
      if (Number.isNaN(v)) return null;
      return `${i ? "L" : "M"} ${sx(i)} ${sy(v)}`;
    })
    .filter(Boolean)
    .join(" ");
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`}>
      <path d={path} fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}
function MiniBar({ data, yKey, w = 800, h = 220 }: { data: any[]; yKey: string; w?: number; h?: number }) {
  const vals = data.map((d) => Number(d?.[yKey] ?? NaN)).filter((v) => !Number.isNaN(v));
  if (!data?.length || !vals.length) return <div className="text-slate-400">Veri yok</div>;
  const pad = 12;
  const min = Math.min(0, ...vals),
    max = Math.max(0, ...vals);
  const bw = ((w - pad * 2) / data.length) * 0.8;
  const sx = (i: number) => pad + (i + 0.5) * ((w - pad * 2) / data.length) - bw / 2;
  const sy = (v: number) => pad + (1 - (v - min) / ((max - min) || 1)) * (h - pad * 2);
  const y0 = sy(0);
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`}>
      {data.map((r, i) => {
        const v = Number(r?.[yKey]);
        if (Number.isNaN(v)) return null;
        const y = sy(Math.max(v, 0)),
          yNeg = sy(Math.min(v, 0));
        const rectY = v >= 0 ? y : y0;
        const rectH = Math.abs(y0 - (v >= 0 ? y : yNeg));
        const fill = v >= 0 ? "#22c55e" : "#ef4444";
        return <rect key={i} x={sx(i)} y={rectY} width={bw} height={rectH} fill={fill} rx="2" />;
      })}
      <line x1={pad} x2={w - pad} y1={y0} y2={y0} stroke="#334155" strokeDasharray="4 4" />
    </svg>
  );
}
function MiniPriceChart({ data, w = 800, h = 220 }: { data: PriceRow[]; w?: number; h?: number }) {
  if (!data?.length) return <div className="text-slate-400">Veri yok</div>;
  const pad = 12,
    ys = data.map((d) => Number(d.close));
  const min = Math.min(...ys),
    max = Math.max(...ys);
  const sx = (i: number) => pad + (i / Math.max(1, data.length - 1)) * (w - pad * 2);
  const sy = (v: number) => pad + (1 - (v - min) / ((max - min) || 1)) * (h - pad * 2);
  const d = data.map((r, i) => `${i ? "L" : "M"} ${sx(i)} ${sy(ys[i])}`).join(" ");
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`}>
      <path d={d} fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

/* ------------------------------ Page ------------------------------ */
export default async function Page({ params }: { params: PageParams }) {
  const t = (params.ticker || "").toUpperCase();

  // Paralel yükleme
  const [{ ticker, ...c }, priceBlock, finBlock, kap, meta, dash] = await Promise.all([
    loadCompanyDoc(t),
    loadPriceSeries(t, 240),
    loadFINandRatios(t),
    loadKAP(t),
    loadMeta(t),
    loadDASH(t),
  ]);

  const sharesPaidIn = (await readFinLastValue(t, "2OA")) ?? c.shares_outstanding ?? null; // nominal 1 TL
  const lastFromDoc = c.last ?? null;
  const last = priceBlock.last ?? lastFromDoc ?? null;
  const mcapDirect = c.mcap ?? null;
  const mcapDerived = last != null && sharesPaidIn != null ? last * sharesPaidIn : null;
  const mcap = mcapDirect ?? mcapDerived ?? null;

  // ratios tamamla
  const ratios: Ratios | null = finBlock.ratios
    ? {
        ...finBlock.ratios,
        mcap,
        pb: finBlock.ratios.pb ?? (mcap && finBlock.ratios.equity_value ? mcap / finBlock.ratios.equity_value : null),
        pe_ttm:
          finBlock.ratios.pe_ttm ?? (mcap && finBlock.ratios.ttm_net_income ? mcap / finBlock.ratios.ttm_net_income : null),
      }
    : null;

  const indices = (c.indices || c.dahil_oldugu_endeksler || []) as string[];
  const sector = c.sector ?? c.sektor_ana ?? c.sektor_alt;
  const website = c.website ?? c.internet_adresi;

  // DASH'ten “öne çıkanlar” (ilk 6 metrik)
  const dashKpis = (() => {
    const header = dash.header || [];
    const rows = dash.rows || [];
    if (!rows.length) return [] as { label: string; value: string }[];
    const labelKey = ["Kalem", "ad_tr", "ad", "field", "name"].find((k) => k in rows[0]) || "Kalem";
    const valueKeys = header.filter((h) => h !== labelKey).slice(-1); // son kolon son dönem
    const lastKey = valueKeys[0];
    return rows.slice(0, 6).map((r: any) => ({
      label: String(r[labelKey] ?? "").trim() || "—",
      value: fmtNum(toNumber(r[lastKey])),
    }));
  })();

  // KAP > %5 paylar
  const fivePlus = (kap.own || []).filter((o) => (o.pct ?? 0) >= 5);

  const ffMetaRatio = pct(meta.free_float);

  return (
    <main className="min-h-screen relative">
      <div className="absolute inset-0 bg-gradient-to-b from-[#0B0D16] to-[#131B35]" />
      <Navbar />

      <div className="mx-auto max-w-7xl px-4 pt-[64px] md:pt-[72px] pb-24 relative z-10">
        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <Link href="/companies" className="text-sm text-slate-300 hover:text-white">
            ← Şirketler
          </Link>
          <div />
        </div>

        <div className="mt-4 rounded-2xl border border-[#2A355B] bg-[#0F162C] p-5">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <div className="text-2xl font-semibold">{meta.full_name || c.name || t}</div>
              <div className="text-sm text-slate-400">{sector || "—"}</div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Kpi label="Fiyat" value={last == null ? "—" : `${last.toFixed(2)} ₺`} />
              <Kpi label="Piyasa Değeri" value={mcap == null ? "—" : `${fmtNum(Math.round(mcap))} ₺`} />
              <Kpi label="Halka Açıklık" value={fmtPct(ffMetaRatio, 1)} />
              <Kpi label="Pay Adedi (Nom.)" value={fmtNum(sharesPaidIn ?? null, 0)} />
            </div>
          </div>
          {website ? (
            <div className="mt-3 text-sm">
              Web:{" "}
              <a className="underline" href={website} target="_blank" rel="noreferrer">
                {website}
              </a>
            </div>
          ) : null}
          {indices?.length ? (
            <div className="mt-2 text-xs text-slate-300/90">
              Endeksler:{" "}
              {indices.map((e, i) => (
                <span key={i} className="inline-block mr-2 mb-1 rounded-full border border-white/10 bg-white/5 px-2 py-0.5">
                  {e}
                </span>
              ))}
            </div>
          ) : null}
        </div>

        {/* Overview */}
        <div className="mt-8 grid grid-cols-12 gap-6">
          <div className="col-span-12 lg:col-span-8">
            <Section id="price" title="Fiyat ve Performans">
              <Card>
                <div className="font-semibold mb-3">Fiyat (son {priceBlock.series.length} nokta)</div>
                <MiniPriceChart data={priceBlock.series} />
                <div className="text-xs opacity-60 mt-2">Son fiyat: {last == null ? "—" : `${last.toFixed(2)} ₺`}</div>
              </Card>
            </Section>

            <Section id="valuation" title="Değerleme">
              <div className="grid gap-4 md:grid-cols-5">
                <Kpi label="F/K (TTM)" value={fmtNum(ratios?.pe_ttm ?? null, 2)} sub="Son 4 çeyrek net kâr" />
                <Kpi label="PD/DD (P/B)" value={fmtNum(ratios?.pb ?? null, 2)} sub="Piyasa değ./Özkaynak" />
                <Kpi label="Net Marj (TTM)" value={fmtPct(ratios?.net_margin_ttm ?? null, 1)} sub="Net Kâr / Hasılat" />
                <Kpi label="ROE (TTM)" value={fmtPct(ratios?.roe_ttm_simple ?? null, 1)} sub="Net Kâr / Özkaynak" />
                <Kpi label="TTM Hasılat" value={`${fmtNum(ratios?.ttm_revenue ?? null, 0)} ₺`} sub="Son 4 çeyrek toplam" />
              </div>
            </Section>

            <Section id="financials" title="Finansallar (Son 12 Çeyrek)">
              <div className="grid gap-4 md:grid-cols-2">
                <Card title="Net Kâr (Çeyreklik)">
                  <MiniBar data={finBlock.series12.map((r) => ({ y: r.net_income_q }))} yKey="y" />
                </Card>
                <Card title="Hasılat (Çeyreklik)">
                  <MiniBar data={finBlock.series12.map((r) => ({ y: r.revenue_q }))} yKey="y" />
                </Card>
              </div>
              <Card title="Özkaynak (Son 12 Dönem)">
                <MiniLine data={finBlock.series12.map((r) => ({ y: r.equity_value }))} yKey="y" />
              </Card>
            </Section>

            <Section id="kap" title="KAP Verileri">
              <div className="grid gap-4">
                <Card title="≥ %5 Sermaye Payı (Özet)">
                  {fivePlus.length ? (
                    <ul className="text-sm space-y-2">
                      {fivePlus.map((o, i) => (
                        <li key={i} className="flex items-center justify-between">
                          <span>{o.holder}</span>
                          <span className="opacity-80">{fmtNum(o.pct ?? null, 2)}%</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    "—"
                  )}
                </Card>

                <Card title="Yönetim Kurulu">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="text-slate-400 border-b border-[#2A355B]">
                        <tr>
                          <th className="py-2 text-left">Ad Soyad</th>
                          <th className="py-2 text-left">Görev</th>
                          <th className="py-2 text-left">İcrada mı</th>
                          <th className="py-2 text-right">Pay (%)</th>
                          <th className="py-2 text-left">İlk Seçilme</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(kap.board || []).map((b, i) => (
                          <tr key={i} className="border-b border-[#141b35]">
                            <td className="py-2">{b.name ?? "—"}</td>
                            <td className="py-2">{b.role ?? "—"}</td>
                            <td className="py-2">{b.is_executive == null ? "—" : b.is_executive ? "Evet" : "Hayır"}</td>
                            <td className="py-2 text-right">{b.equity_pct == null ? "—" : fmtNum(b.equity_pct, 2)}</td>
                            <td className="py-2">{b.first_elected ?? "—"}</td>
                          </tr>
                        ))}
                        {!kap.board?.length ? (
                          <tr>
                            <td colSpan={5} className="py-2 text-slate-400">
                              Veri yok
                            </td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>
                </Card>

                <Card title="Ortaklık Yapısı">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="text-slate-400 border-b border-[#2A355B]">
                        <tr>
                          <th className="py-2 text-left">Ortak</th>
                          <th className="py-2 text-right">Sermaye Payı (%)</th>
                          <th className="py-2 text-right">Oy Hakkı (%)</th>
                          <th className="py-2 text-right">Tutar (TL)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(kap.own || []).map((o, i) => (
                          <tr key={i} className="border-b border-[#141b35]">
                            <td className="py-2">{o.holder}</td>
                            <td className="py-2 text-right">{o.pct == null ? "—" : fmtNum(o.pct, 2)}</td>
                            <td className="py-2 text-right">{o.voting_pct == null ? "—" : fmtNum(o.voting_pct, 2)}</td>
                            <td className="py-2 text-right">{o.paid_in_tl == null ? "—" : fmtNum(o.paid_in_tl, 0)}</td>
                          </tr>
                        ))}
                        {!kap.own?.length ? (
                          <tr>
                            <td colSpan={4} className="py-2 text-slate-400">
                              Veri yok
                            </td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>
                </Card>

                <Card title="Bağlı Ortaklıklar">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="text-slate-400 border-b border-[#2A355B]">
                        <tr>
                          <th className="py-2 text-left">Şirket</th>
                          <th className="py-2 text-left">Faaliyet</th>
                          <th className="py-2 text-right">Pay (%)</th>
                          <th className="py-2 text-right">Pay Tutarı</th>
                          <th className="py-2 text-right">Ödenmiş Sermaye</th>
                          <th className="py-2 text-left">PB</th>
                          <th className="py-2 text-left">İlişki</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(kap.subs || []).map((s, i) => (
                          <tr key={i} className="border-b border-[#141b35]">
                            <td className="py-2">{s.company}</td>
                            <td className="py-2">{s.activity ?? "—"}</td>
                            <td className="py-2 text-right">{s.share_pct == null ? "—" : fmtNum(s.share_pct, 2)}</td>
                            <td className="py-2 text-right">{s.share_amount == null ? "—" : fmtNum(s.share_amount, 0)}</td>
                            <td className="py-2 text-right">{s.paid_in_capital == null ? "—" : fmtNum(s.paid_in_capital, 0)}</td>
                            <td className="py-2">{s.currency ?? "—"}</td>
                            <td className="py-2">{s.relation ?? "—"}</td>
                          </tr>
                        ))}
                        {!kap.subs?.length ? (
                          <tr>
                            <td colSpan={7} className="py-2 text-slate-400">
                              Veri yok
                            </td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>
                </Card>

                <Card title="Oy Hakları">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="text-slate-400 border-b border-[#2A355B]">
                        <tr>
                          <th className="py-2 text-left">Alan</th>
                          <th className="py-2 text-left">Değer</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(kap.votes || []).map((v, i) => (
                          <tr key={i} className="border-b border-[#141b35]">
                            <td className="py-2">{v.field}</td>
                            <td className="py-2">{v.value ?? "—"}</td>
                          </tr>
                        ))}
                        {!kap.votes?.length ? (
                          <tr>
                            <td colSpan={2} className="py-2 text-slate-400">
                              Veri yok
                            </td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>
                </Card>

                <Card title="SPK Kurumsal Yönetim (4.7)">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="text-slate-400 border-b border-[#2A355B]">
                        <tr>
                          <th className="py-2">M1</th>
                          <th className="py-2">M2</th>
                          <th className="py-2">M3</th>
                          <th className="py-2">M4</th>
                          <th className="py-2 text-right">M5</th>
                          <th className="py-2 text-right">M6</th>
                          <th className="py-2 text-right">M7</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td className="py-2">{kap.k47?.m1 ?? "—"}</td>
                          <td className="py-2">{kap.k47?.m2 ?? "—"}</td>
                          <td className="py-2">{kap.k47?.m3 ?? "—"}</td>
                          <td className="py-2">{kap.k47?.m4 ?? "—"}</td>
                          <td className="py-2 text-right">{kap.k47?.m5 == null ? "—" : fmtNum(kap.k47?.m5, 2)}</td>
                          <td className="py-2 text-right">{kap.k47?.m6 == null ? "—" : fmtNum(kap.k47?.m6, 2)}</td>
                          <td className="py-2 text-right">{kap.k47?.m7 == null ? "—" : fmtNum(kap.k47?.m7, 2)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </Card>

                <details className="rounded-xl border border-[#2A355B] p-4 bg-[#0F162C]/60">
                  <summary className="cursor-pointer list-none select-none">Ham KAP JSON (debug)</summary>
                  <pre className="text-xs overflow-x-auto whitespace-pre-wrap mt-3">
                    {JSON.stringify(kap.raw?.kap ?? kap.raw ?? {}, null, 2)}
                  </pre>
                </details>
              </div>
            </Section>
          </div>

          <div className="col-span-12 lg:col-span-4">
            <Section id="about" title="Özet ve Kısa Bilgiler">
              <Card title="Şirket Hakkında">
                <div className="text-sm whitespace-pre-wrap">{meta.description || "—"}</div>
              </Card>
              <Card title="Kısa Bilgiler">
                <ul className="space-y-2 text-sm">
                  <li>
                    <span className="opacity-70">İnternet Adresi:</span>{" "}
                    {website ? (
                      <a className="underline" href={website} target="_blank" rel="noreferrer">
                        {website}
                      </a>
                    ) : (
                      "—"
                    )}
                  </li>
                  <li>
                    <span className="opacity-70">Pazar:</span> {c.islem_gordugu_pazar ?? c.market ?? "—"}
                  </li>
                  <li>
                    <span className="opacity-70">Merkez:</span> {c.merkez_adresi ?? c.address ?? "—"}
                  </li>
                  <li>
                    <span className="opacity-70">Fiili Dolaşım:</span> {fmtPct(pct(c.fiili_dolasim_oran ?? c.free_float_ratio ?? null), 1)}
                  </li>
                  <li>
                    <span className="opacity-70">Fiili Dolaşım Tutarı:</span> {fmtNum(c.fiili_dolasim_tutar_tl ?? c.free_float_mcap ?? null, 0)} ₺
                  </li>
                  <li>
                    <span className="opacity-70">Piyasa Değeri (META):</span> {fmtNum(meta.market_cap ?? null, 0)} ₺
                  </li>
                </ul>
              </Card>

              <Section id="dash" title="DASH — Öne Çıkanlar">
                <div className="grid gap-3 md:grid-cols-2">
                  {dashKpis.length
                    ? dashKpis.map((k, i) => <Kpi key={i} label={k.label} value={k.value} />)
                    : [<div key="empty" className="text-slate-400">Veri yok</div>]}
                </div>
              </Section>
            </Section>
          </div>
        </div>
      </div>
    </main>
  );
}
