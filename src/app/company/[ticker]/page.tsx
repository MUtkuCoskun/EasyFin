import Navbar from '../../components/Navbar'
import Link from 'next/link'
import CompanyHeader from './CompanyHeader'
import SidebarNav from './SidebarNav'
import Section from './Section'
import { adminDb } from "../../../lib/firebaseAdmin";

export const revalidate = 120
export const runtime = 'nodejs'

type PageParams = { ticker: string }
type PriceRow = { ts: string; close: number }

type RatiosRow = {
  ticker?: string
  mcap: number | null
  equity_value: number | null
  ttm_net_income: number | null
  ttm_revenue: number | null
  pb: number | null
  pe_ttm: number | null
  net_margin_ttm: number | null
  roe_ttm_simple: number | null
}

type SeriesRow = {
  period: string
  net_income_q: number | null
  revenue_q: number | null
  equity_value: number | null
}

type BoardRow = {
  name: string
  role: string | null
  is_executive: boolean | null
  gender: string | null
  profession: string | null
  first_elected: string | null
  equity_pct: number | null
  represented_share_group: string | null
}
type OwnRow = { holder: string; pct: number | null; voting_pct: number | null; paid_in_tl: number | null }
type SubRow = {
  company: string
  activity: string | null
  paid_in_capital: number | null
  share_amount: number | null
  currency: string | null
  share_pct: number | null
  relation: string | null
}
type VoteRow = { field: string; value: string | null }
type K47Row = { m1?: string | null; m2?: string | null; m3?: string | null; m4?: string | null; m5?: number | null; m6?: number | null; m7?: number | null }
type RawKapPayload = { kap?: any; bilanco?: any }

type CompanyInfo = {
  ticker: string
  name?: string
  sector?: string
  sektor_ana?: string
  sektor_alt?: string
  internet_adresi?: string
  islem_gordugu_pazar?: string
  dahil_oldugu_endeksler?: string[] | null
  merkez_adresi?: string
  fiili_dolasim_oran?: number | null
  fiili_dolasim_tutar_tl?: number | null
  last: number | null
  mcap: number | null
}

/* ---------- META ---------- */
type MetaRow = {
  full_name: string | null
  description: string | null
  free_float: number | null
  market_cap: number | null
}

/* ============= Firestore loader’ları (SSR) ============= */
function toNumber(x: any): number | null {
  if (x == null) return null;
  if (typeof x === "number") return Number.isFinite(x) ? x : null;
  if (typeof x === "string") {
    const s = x.replace(/\./g, "").replace(/,/g, ".").replace(/\s/g, "");
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}
function normPeriod(p: string): string {
  const m = String(p).match(/^(\d{4})[\/\-](\d{1,2})$/);
  return m ? `${m[1]}/${m[2].padStart(2,"0")}` : String(p);
}

function pickRow(rows: any[], names: string[]): any | null {
  const arr = Array.isArray(rows) ? rows : Object.values(rows || {});
  const want = names.map(s=>s.toLowerCase());
  for (const r of arr) {
    const k = (r?.Kalem || r?.kalem || r?.name || "").toString().toLowerCase();
    if (want.includes(k)) return r;
  }
  for (const r of arr) {
    const k = (r?.Kalem || r?.kalem || r?.name || "").toString().toLowerCase();
    if (want.some(w => k.includes(w))) return r;
  }
  return null;
}

async function loadMeta(ticker: string): Promise<MetaRow> {
  try {
    const base = adminDb.collection('tickers').doc(ticker)
    const [metaDocSnap, tickDocSnap] = await Promise.all([
      base.collection('meta').doc('default').get(),
      base.get(),
    ])
    const m: any = metaDocSnap?.exists ? metaDocSnap.data() : {}
    const c: any = tickDocSnap?.exists ? tickDocSnap.data() : {}
    return {
      full_name: (m?.full_name ?? c?.full_name) ?? null,
      description: (m?.description ?? c?.description) ?? null,
      free_float: (m?.free_float ?? c?.free_float) ?? null,
      market_cap: (m?.market_cap ?? c?.market_cap) ?? null,
    }
  } catch { return { full_name:null, description:null, free_float:null, market_cap:null } }
}

async function loadCompany(ticker: string): Promise<CompanyInfo> {
  try {
    const d = await adminDb.collection('tickers').doc(ticker).get()
    const c: any = d?.exists ? d.data() : {}

    const ps = await adminDb
      .collection('tickers').doc(ticker)
      .collection('prices')
      .orderBy('ts','desc').limit(1).get()

    const last = ps?.docs?.[0]?.get('close') ?? (c?.last ?? null)
    const shares = c?.shares_outstanding ? Number(c.shares_outstanding) : null
    const mcap = (last && shares) ? (last * shares) : (c?.mcap ?? null)

    return {
      ticker,
      name: c?.name ?? ticker,
      sector: c?.sector ?? undefined,
      sektor_ana: c?.sector_main ?? c?.sektor_ana ?? undefined,
      sektor_alt: c?.sector_sub ?? c?.sektor_alt ?? undefined,
      internet_adresi: c?.website ?? c?.internet_adresi ?? undefined,
      islem_gordugu_pazar: c?.market ?? c?.islem_gordugu_pazar ?? undefined,
      dahil_oldugu_endeksler: (c?.indices as string[] | null) ?? c?.dahil_oldugu_endeksler ?? null,
      merkez_adresi: c?.address ?? c?.merkez_adresi ?? undefined,
      fiili_dolasim_oran: (c?.free_float_ratio ?? c?.fiili_dolasim_oran ?? null),
      fiili_dolasim_tutar_tl: (c?.free_float_mcap ?? c?.fiili_dolasim_tutar_tl ?? null),
      last: last ?? null,
      mcap
    }
  } catch {
    return { ticker, last:null, mcap:null }
  }
}

async function loadPrices(ticker: string, limit = 240): Promise<PriceRow[]> {
  // A) tickers/{T}/prices alt koleksiyonu varsa onu kullan
  try {
    const snap = await adminDb.collection("tickers").doc(ticker)
      .collection("prices").orderBy("ts","desc").limit(limit).get();
    if (!snap.empty) {
      const rows = snap.docs.map((d:any) => {
        const x = d.data();
        const raw = x?.ts;
        let ts:string|null=null;
        if (typeof raw === "string") ts = raw;
        else if (typeof raw === "number") ts = new Date(raw < 2_000_000_000 ? raw*1000 : raw).toISOString();
        else if (raw?.toDate) ts = raw.toDate().toISOString();
        const close = Number(x?.close);
        if (!ts || Number.isNaN(close)) return null as any;
        return { ts, close };
      }).filter(Boolean) as PriceRow[];
      return rows.reverse();
    }
  } catch {}

  // B) PRICES.table dokümanından oku
  try {
    const doc = await adminDb.collection("tickers").doc(ticker)
      .collection("sheets").doc("PRICES.table").get();
    if (!doc.exists) return [];
    const data:any = doc.data();
    const header: string[] = data?.header || [];
    // olası satırlar arasından "fiyat/price/close/kapanış" satırını yakala
    const rows = Object.values({ ...data, header: undefined }) as any[];
    const priceRow =
      rows.find(r => Object.keys(r).some(k => /^(close|kapanış|kapanis|price|fiyat)$/i.test(k))) || null;

    if (!priceRow) return [];
    const out = header
      .filter((p:string) => p !== "Kalem")
      .slice(-limit)
      .map((p:string) => {
        const v = toNumber(priceRow[p]);
        if (v == null) return null as any;
        return { ts: normPeriod(p), close: v };
      })
      .filter(Boolean) as PriceRow[];

    return out;
  } catch {
    return [];
  }
}



  // B) tickers/{T}/sheets/PRICES.table (opsiyonel)
  try {
    const d = await adminDb.collection('tickers').doc(ticker)
      .collection('sheets').doc('PRICES.table').get();
    if (!d.exists) return [];
    const obj:any = d.data();
    const header: string[] = obj?.header || [];
    const row = pickRow(Object.values({ ...obj, header: undefined }), [
      'close','kapanış','kapanis','price','fiyat'
    ]);
    if (!row) return [];
    const out = header.slice(-limit).map(p=>{
      const v = toNumber(row[p]);
      if (v==null) return null as any;
      return { ts: normPeriod(String(p)), close: v };
    }).filter(Boolean) as PriceRow[];
    return out;
  } catch { return []; }
}


async function loadRatios(ticker: string): Promise<RatiosRow | null> {
  // varsa hazır analytics
  try {
    const d = await adminDb.collection("tickers").doc(ticker)
      .collection("analytics").doc("ratios").get();
    if (d.exists) return d.data() as any;
  } catch {}

  try {
    const fin = await adminDb.collection("tickers").doc(ticker)
      .collection("sheets").doc("FIN.table").get();
    if (!fin.exists) return null;

    const data:any = fin.data();
    const cols: string[] = (data?.header || []).slice(5);
    const rows = Object.values({ ...data, header: undefined }) as any[];

    const get = (code:string) =>
      rows.find(r => (r?.kod || r?.code || r?.Kod) === code) || null;

    const rev = get("3C");
    const ni  = get("3Z");
    const eq  = get("2O");

    const last4 = cols.slice(-4);
    const sum = (row:any) =>
      last4.map((p)=>toNumber(row?.[p])).filter(v=>v!=null).reduce((a,b)=>a!+b!,0) || null;

    const ttm_revenue = rev ? sum(rev) : null;
    const ttm_net_income = ni ? sum(ni) : null;
    const equity_value = eq ? toNumber(eq[cols.at(-1)!]) : null;

    const cd = await adminDb.collection("tickers").doc(ticker).get().catch(()=>null as any);
    const c:any = cd?.exists ? cd.data() : {};
    const mcap = c?.mcap ?? null;

    const pb  = mcap && equity_value ? mcap / equity_value : null;
    const pe  = mcap && ttm_net_income ? mcap / ttm_net_income : null;
    const net_margin_ttm = ttm_net_income && ttm_revenue ? ttm_net_income / ttm_revenue : null;
    const roe_ttm_simple = ttm_net_income && equity_value ? ttm_net_income / equity_value : null;

    return { mcap: mcap ?? null, equity_value: equity_value ?? null,
             ttm_net_income, ttm_revenue, pb, pe_ttm: pe,
             net_margin_ttm, roe_ttm_simple };
  } catch { return null; }
}



async function loadSeriesLast12(ticker: string): Promise<SeriesRow[]> {
  try {
    const doc = await adminDb.collection("tickers").doc(ticker)
      .collection("sheets").doc("FIN.table").get();
    if (!doc.exists) return [];

    const data:any = doc.data();
    const header: string[] = (data?.header || []) as string[]; // ["kod","ad_tr","ad_en","para_birimi","grup", "2025/6", ...]
    const cols = header.slice(5); // sadece dönem sütunları
    const rows = Object.values({ ...data, header: undefined }) as any[];

    const byCode = (code:string) =>
      rows.find(r => (r?.kod || r?.code || r?.Kod) === code) || null;

    const rev = byCode("3C"); // Satış Gelirleri (çeyreklik)
    const ni  = byCode("3Z"); // Ana Ortaklık Net Karı (çeyreklik)
    const eq  = byCode("2O"); // Ana Ortaklığa Ait Özkaynaklar (nokta)

    if (!cols.length || (!rev && !ni && !eq)) return [];

    const arr: SeriesRow[] = cols.map((p:string) => ({
      period: normPeriod(p),
      revenue_q: rev ? toNumber(rev[p]) : null,
      net_income_q: ni ? toNumber(ni[p]) : null,
      equity_value: eq ? toNumber(eq[p]) : null,
    }))
      // en az bir değer olsun
      .filter(r => r.revenue_q!=null || r.net_income_q!=null || r.equity_value!=null)
      .sort((a,b)=> a.period.localeCompare(b.period))
      .slice(-12);

    return arr;
  } catch { return []; }
}



function findFirstByKeyRegex(obj: any, re: RegExp): string | null {
  const seen = new Set<any>()
  const stack = [obj]
  while (stack.length) {
    const cur = stack.pop()
    if (!cur || typeof cur !== 'object' || seen.has(cur)) continue
    seen.add(cur)
    for (const k of Object.keys(cur)) {
      try {
        const v = cur[k]
        if (re.test(k)) {
          if (typeof v === 'string' && v.trim()) return v.trim()
          if (typeof v === 'object') {
            const inner = findFirstByKeyRegex(v, /ad|firma|name|kuruluş|kurulus/i)
            if (inner) return inner
          }
        }
        if (typeof v === 'string' && re.test(v) && v.trim()) return v.trim()
        if (v && typeof v === 'object') stack.push(v)
      } catch {}
    }
  }
  return null
}

async function loadKAP(ticker: string) {
  try {
    const base = adminDb.collection('tickers').doc(ticker).collection('kap')
    const [boardSnap, ownSnap, subsSnap, votesSnap, k47Doc, rawDoc] = await Promise.all([
      base.doc('board_members').collection('rows').get(),
      base.doc('ownership').collection('rows').get(),
      base.doc('subsidiaries').collection('rows').get(),
      base.doc('vote_rights').collection('rows').get(),
      base.doc('k47').get(),
      base.doc('raw').get(),
    ])

    const board = boardSnap?.docs?.map(d=>d.data()) as BoardRow[] ?? []
    const own = ownSnap?.docs?.map(d=>d.data()) as OwnRow[] ?? []
    const subs = subsSnap?.docs?.map(d=>d.data()) as SubRow[] ?? []
    const votes = votesSnap?.docs?.map(d=>d.data()) as VoteRow[] ?? []
    const k47 = (k47Doc?.exists ? (k47Doc.data() as any) : {}) as K47Row
    const raw = (rawDoc?.exists ? (rawDoc.data() as any) : null) as RawKapPayload | null
    const auditFirm = raw ? (findFirstByKeyRegex(raw, /denetim|audit|bağımsız.?denetim|bagimsiz.?denetim/i) || null) : null
    return { board, own, subs, votes, k47, raw, denetim_kurulusu: auditFirm }
  } catch {
    return { board:[], own:[], subs:[], votes:[], k47:{}, raw:null, denetim_kurulusu:null }
  }
}

/* ================= Mini chart helpers & UI helpers (değişmeden) ================= */

function MiniLine({ data, yKey, w = 800, h = 220 }: { data: any[]; yKey: string; w?: number; h?: number }) {
  const vals = data.map(d => Number(d?.[yKey] ?? NaN)).filter(v => !Number.isNaN(v))
  if (!data?.length || !vals.length) return <div className="text-slate-400">Veri yok</div>
  const pad = 12
  const min = Math.min(...vals), max = Math.max(...vals)
  const sx = (i: number) => pad + (i / Math.max(1, data.length - 1)) * (w - pad * 2)
  const sy = (v: number) => pad + (1 - ((v - min) / ((max - min) || 1))) * (h - pad * 2)
  const path = data.map((r, i) => {
    const v = Number(r?.[yKey]); if (Number.isNaN(v)) return null
    return `${i ? 'L' : 'M'} ${sx(i)} ${sy(v)}`
  }).filter(Boolean).join(' ')
  return <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`}>
    <path d={path} fill="none" stroke="currentColor" strokeWidth="2" />
  </svg>
}

function MiniBar({ data, yKey, w = 800, h = 220 }: { data: any[]; yKey: string; w?: number; h?: number }) {
  const vals = data.map(d => Number(d?.[yKey] ?? NaN)).filter(v => !Number.isNaN(v))
  if (!data?.length || !vals.length) return <div className="text-slate-400">Veri yok</div>
  const pad = 12
  const min = Math.min(0, ...vals), max = Math.max(0, ...vals)
  const bw = (w - pad * 2) / data.length * 0.8
  const sx = (i: number) => pad + (i + 0.5) * ((w - pad * 2) / data.length) - bw / 2
  const sy = (v: number) => pad + (1 - ((v - min) / ((max - min) || 1))) * (h - pad * 2)
  const y0 = sy(0)
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`}>
      {data.map((r, i) => {
        const v = Number(r?.[yKey]); if (Number.isNaN(v)) return null
        const y = sy(Math.max(v, 0)), yNeg = sy(Math.min(v, 0))
        const rectY = v >= 0 ? y : y0
        const rectH = Math.abs(y0 - (v >= 0 ? y : yNeg))
        const fill = v >= 0 ? '#22c55e' : '#ef4444'
        return <rect key={i} x={sx(i)} y={rectY} width={bw} height={rectH} fill={fill} rx="2" />
      })}
      <line x1={pad} x2={w - pad} y1={y0} y2={y0} stroke="#334155" strokeDasharray="4 4" />
    </svg>
  )
}

function MiniPriceChart({ data, w = 800, h = 220 }: { data: PriceRow[]; w?: number; h?: number }) {
  if (!data?.length) return <div className="text-slate-400">Veri yok</div>
  const pad = 12, ys = data.map(d => Number(d.close))
  const min = Math.min(...ys), max = Math.max(...ys)
  const sx = (i: number) => pad + (i / Math.max(1, data.length - 1)) * (w - pad * 2)
  const sy = (v: number) => pad + (1 - ((v - min) / ((max - min) || 1))) * (h - pad * 2)
  const d = data.map((r, i) => `${i ? 'L' : 'M'} ${sx(i)} ${sy(ys[i])}`).join(' ')
  return <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`}><path d={d} fill="none" stroke="currentColor" strokeWidth="2" /></svg>
}

function Card({ title, children }: React.PropsWithChildren<{ title: string }>) {
  return <div className="rounded-2xl bg-[#0F162C] border border-[#2A355B] p-5">
    <h3 className="font-semibold">{title}</h3>
    <div className="mt-3 text-slate-300/90">{children}</div>
  </div>
}
function Tag({ children }: React.PropsWithChildren<{}>) {
  return <span className="inline-block text-xs px-2 py-1 rounded-full bg-white/10 border border-white/10 mr-2 mb-2">{children}</span>
}
function fmtNum(n?: number | null, d = 0) {
  return (n ?? null) === null ? '—' : new Intl.NumberFormat('tr-TR', { maximumFractionDigits: d }).format(n!)
}
function fmtPct(n?: number | null, d = 1) {
  return (n ?? null) === null ? '—' : `${(n! * 100).toFixed(d)}%`
}
function SimpleTable({
  cols, rows, empty = 'Veri yok'
}: { cols: { key: string; title: string; align?: 'left'|'right' }[], rows: any[], empty?: string }) {
  if (!rows?.length) return <div className="text-slate-400">{empty}</div>
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-slate-400 border-b border-[#2A355B]">
          <tr>
            {cols.map((c,i) => (
              <th key={i} className={`py-2 ${c.align==='right'?'text-right':'text-left'}`}>{c.title}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r,ri) => (
            <tr key={ri} className="border-b border-[#141b35]">
              {cols.map((c,ci) => (
                <td key={ci} className={`py-2 ${c.align==='right'?'text-right':'text-left'}`}>
                  {r[c.key] ?? '—'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
function Details({ summary, children }: React.PropsWithChildren<{ summary: string }>) {
  return (
    <details className="rounded-xl border border-[#2A355B] p-4 bg-[#0F162C]/60">
      <summary className="cursor-pointer list-none select-none">{summary}</summary>
      <div className="mt-3">{children}</div>
    </details>
  )
}

/* ================= PAGE ================= */

export default async function Page({ params }: { params: PageParams }) {
  const t = (params.ticker || '').toUpperCase()

  const [company, prices, ratios, series, kap, meta] = await Promise.all([
    loadCompany(t),
    loadPrices(t, 240),
    loadRatios(t),
    loadSeriesLast12(t),
    loadKAP(t),
    loadMeta(t),
  ])

  const sections = [
    { id: 'overview', title: 'Genel Bakış' },
    { id: 'valuation', title: 'Değerleme' },
    { id: 'performance', title: 'Geçmiş Performans' },
    { id: 'kap', title: 'KAP Verileri' },
    { id: 'other', title: 'Diğer Bilgiler' },
  ]

  const sermaye5ustu = (kap.own || []).filter(o => (o.pct ?? 0) >= 5)

  const ffMetaRatio = meta.free_float != null
    ? (meta.free_float > 1 ? meta.free_float / 100 : meta.free_float)
    : null

  return (
    <main className="min-h-screen relative">
      <div className="absolute inset-0 bg-gradient-to-b from-[#0B0D16] to-[#131B35]" />
      <Navbar />
      <div className="mx-auto max-w-7xl px-4 pt-[64px] md:pt-[72px] pb-24 relative z-20">
        <div className="flex items-center justify-between gap-4">
          <Link href="/companies" className="text-sm text-slate-300 hover:text-white">← Şirketler</Link>
          <div />
        </div>

        <div className="mt-4 grid grid-cols-12 gap-6">
          <aside className="hidden lg:block lg:col-span-3">
            <SidebarNav sections={sections} />
          </aside>

          <div className="col-span-12 lg:col-span-9">
            <div id="company-sticky" className="sticky top-[64px] md:top-[72px] z-30">
              <CompanyHeader company={{
                ticker: t,
                name: company.name,
                sector: company.sector ?? company.sektor_ana ?? company.sektor_alt,
                website: company.internet_adresi,
                quote: { last: company.last ?? undefined, currency: 'TRY', mcap: company.mcap ?? null }
              }} />
            </div>

            <div className="space-y-12 mt-6">
              <Section id="overview" title="Genel Bakış">
                <div className="grid gap-4 md:grid-cols-2">
                  <Card title="Şirket Hakkında">
                    <div className="space-y-2">
                      <div className="text-base font-semibold">
                        {meta.full_name || company.name || '—'}
                      </div>
                      <div className="text-sm whitespace-pre-wrap">
                        {meta.description || '—'}
                      </div>
                    </div>
                  </Card>
                  <Card title="Kısa Bilgiler">
                    <ul className="space-y-2 text-sm">
                      <li><span className="opacity-70">İnternet Adresi:</span> {company.internet_adresi ? <a className="underline" href={company.internet_adresi} target="_blank" rel="noreferrer">{company.internet_adresi}</a> : '—'}</li>
                      <li><span className="opacity-70">İşlem Gördüğü Pazar:</span> {company.islem_gordugu_pazar ?? '—'}</li>
                      <li><span className="opacity-70">Sektör (Ana/Alt):</span> {company.sektor_ana ?? '—'} {company.sektor_alt ? ` / ${company.sektor_alt}` : ''}</li>
                      <li><span className="opacity-70">Merkez Adresi:</span> {company.merkez_adresi ?? '—'}</li>
                      <li><span className="opacity-70">Fiili Dolaşım Oranı:</span> {fmtPct(company.fiili_dolasim_oran ?? null, 1)}</li>
                      <li><span className="opacity-70">Fiili Dolaşım Tutarı (TL):</span> {fmtNum(company.fiili_dolasim_tutar_tl ?? null, 0)}</li>
                      <li><span className="opacity-70">Piyasa Değeri:</span> {company.mcap ? new Intl.NumberFormat('tr-TR').format(Math.round(company.mcap)) + ' ₺' : '—'}</li>
                      <li><span className="opacity-70">Fiyat:</span> {company.last ? `${company.last.toFixed(2)} ₺` : '—'}</li>
                      <li><span className="opacity-70">Halka Açıklık (META):</span> {fmtPct(ffMetaRatio, 1)}</li>
                      <li><span className="opacity-70">Piyasa Değeri (META):</span> {fmtNum(meta.market_cap ?? null, 0)} ₺</li>
                    </ul>
                    {company.dahil_oldugu_endeksler?.length ? (
                      <div className="mt-3">
                        <div className="text-xs opacity-70 mb-1">Dahil Olduğu Endeksler:</div>
                        <div>{company.dahil_oldugu_endeksler.map((e, i) => <Tag key={i}>{e}</Tag>)}</div>
                      </div>
                    ) : null}
                  </Card>
                </div>
              </Section>

              <Section id="valuation" title="Değerleme">
                <div className="grid gap-4 md:grid-cols-5">
                  <Card title="F/K (TTM)">
                    <div className="text-2xl font-semibold">{fmtNum(ratios?.pe_ttm ?? null, 2)}</div>
                    <div className="text-xs opacity-60 mt-1">Son 4 çeyrek net kâr toplamı ile.</div>
                  </Card>
                  <Card title="PD/DD (P/B)">
                    <div className="text-2xl font-semibold">{fmtNum(ratios?.pb ?? null, 2)}</div>
                    <div className="text-xs opacity-60 mt-1">Piyasa değeri / son dönem özkaynak.</div>
                  </Card>
                  <Card title="Net Marj (TTM)">
                    <div className="text-2xl font-semibold">{fmtPct(ratios?.net_margin_ttm ?? null, 1)}</div>
                    <div className="text-xs opacity-60 mt-1">TTM Net Kâr / TTM Hasılat.</div>
                  </Card>
                  <Card title="ROE (TTM, basit)">
                    <div className="text-2xl font-semibold">{fmtPct(ratios?.roe_ttm_simple ?? null, 1)}</div>
                    <div className="text-xs opacity-60 mt-1">TTM Net Kâr / Son Özkaynak.</div>
                  </Card>
                  <Card title="TTM Hasılat">
                    <div className="text-2xl font-semibold">{fmtNum(ratios?.ttm_revenue ?? null, 0)} ₺</div>
                    <div className="text-xs opacity-60 mt-1">Son 4 çeyrek hasılat toplamı.</div>
                  </Card>
                </div>
              </Section>

              <Section id="performance" title="Geçmiş Performans">
                <div className="rounded-2xl bg-[#0F162C] border border-[#2A355B] p-5">
                  <div className="font-semibold mb-3">Fiyat (Son {prices.length} nokta)</div>
                  <MiniPriceChart data={prices} />
                  <div className="text-xs opacity-60 mt-2">Son fiyat: {company.last?.toFixed(2) ?? '—'} ₺</div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <Card title="Net Kâr (Çeyreklik)">
                    <MiniBar data={series.map(r => ({ y: r.net_income_q }))} yKey="y" />
                  </Card>
                  <Card title="Hasılat (Çeyreklik)">
                    <MiniBar data={series.map(r => ({ y: r.revenue_q }))} yKey="y" />
                  </Card>
                </div>

                <Card title="Özkaynak (Son 12 Çeyrek)">
                  <MiniLine data={series.map(r => ({ y: r.equity_value }))} yKey="y" />
                </Card>
              </Section>

              <Section id="kap" title="KAP Verileri">
                <div className="grid gap-4">
                  <Card title="Denetim Kuruluşu">
                    {kap.denetim_kurulusu ?? '—'}
                  </Card>

                  <Card title="≥ %5 Sermaye Payı (Özet)">
                    {sermaye5ustu.length ? (
                      <ul className="text-sm space-y-2">
                        {sermaye5ustu.map((o, i) => (
                          <li key={i} className="flex items-center justify-between">
                            <span>{o.holder}</span>
                            <span className="opacity-80">{fmtNum(o.pct ?? null, 2)}%</span>
                          </li>
                        ))}
                      </ul>
                    ) : '—'}
                  </Card>

                  <Card title="Yönetim Kurulu (board_members)">
                    <SimpleTable
                      cols={[
                        { key: 'name', title: 'Ad Soyad' },
                        { key: 'role', title: 'Görev' },
                        { key: 'is_executive', title: 'İcrada mı' },
                        { key: 'equity_pct', title: 'Pay (%)', align: 'right' },
                        { key: 'first_elected', title: 'İlk Seçilme' },
                      ]}
                      rows={(kap.board || []).map(b => ({
                        name: b.name,
                        role: b.role ?? '—',
                        is_executive: b.is_executive == null ? '—' : (b.is_executive ? 'Evet' : 'Hayır'),
                        equity_pct: b.equity_pct == null ? '—' : fmtNum(b.equity_pct, 2),
                        first_elected: b.first_elected ?? '—',
                      }))}
                    />
                  </Card>

                  <Card title="Ortaklık Yapısı (sermaye_5ustu)">
                    <SimpleTable
                      cols={[
                        { key: 'holder', title: 'Ortak' },
                        { key: 'pct', title: 'Sermaye Payı (%)', align: 'right' },
                        { key: 'voting_pct', title: 'Oy Hakkı (%)', align: 'right' },
                        { key: 'paid_in_tl', title: 'Tutar (TL)', align: 'right' },
                      ]}
                      rows={(kap.own || []).map(o => ({
                        holder: o.holder,
                        pct: o.pct == null ? '—' : fmtNum(o.pct, 2),
                        voting_pct: o.voting_pct == null ? '—' : fmtNum(o.voting_pct, 2),
                        paid_in_tl: o.paid_in_tl == null ? '—' : fmtNum(o.paid_in_tl, 0),
                      }))}
                    />
                  </Card>

                  <Card title="Bağlı Ortaklıklar (bagli_ortakliklar)">
                    <SimpleTable
                      cols={[
                        { key: 'company', title: 'Şirket' },
                        { key: 'activity', title: 'Faaliyet' },
                        { key: 'share_pct', title: 'Pay (%)', align: 'right' },
                        { key: 'share_amount', title: 'Pay Tutarı', align: 'right' },
                        { key: 'paid_in_capital', title: 'Ödenmiş Sermaye', align: 'right' },
                        { key: 'currency', title: 'PB' },
                        { key: 'relation', title: 'İlişki' },
                      ]}
                      rows={(kap.subs || []).map(s => ({
                        company: s.company,
                        activity: s.activity ?? '—',
                        share_pct: s.share_pct == null ? '—' : fmtNum(s.share_pct, 2),
                        share_amount: s.share_amount == null ? '—' : fmtNum(s.share_amount, 0),
                        paid_in_capital: s.paid_in_capital == null ? '—' : fmtNum(s.paid_in_capital, 0),
                        currency: s.currency ?? '—',
                        relation: s.relation ?? '—',
                      }))}
                    />
                  </Card>

                  <Card title="Oy Hakları (oy_haklari)">
                    <SimpleTable
                      cols={[
                        { key: 'field', title: 'Alan' },
                        { key: 'value', title: 'Değer' },
                      ]}
                      rows={(kap.votes || []).map(v => ({ field: v.field, value: v.value ?? '—' }))}
                    />
                  </Card>

                  <Card title="SPK Kurumsal Yönetim (4.7)">
                    <SimpleTable
                      cols={[
                        { key: 'm1', title: 'M1' },
                        { key: 'm2', title: 'M2' },
                        { key: 'm3', title: 'M3' },
                        { key: 'm4', title: 'M4' },
                        { key: 'm5', title: 'M5', align: 'right' },
                        { key: 'm6', title: 'M6', align: 'right' },
                        { key: 'm7', title: 'M7', align: 'right' },
                      ]}
                      rows={[kap.k47 ?? {}]}
                    />
                  </Card>

                  <Details summary="Ham KAP JSON (debug/şeffaflık)">
                    <pre className="text-xs overflow-x-auto whitespace-pre-wrap">{JSON.stringify(kap.raw?.kap ?? kap.raw ?? {}, null, 2)}</pre>
                  </Details>
                </div>
              </Section>

              <Section id="other" title="Diğer Bilgiler">
                <Card title="Notlar">KAP duyuruları ve temettü (CA) burada listelenecek.</Card>
              </Section>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
