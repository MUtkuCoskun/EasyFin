import Navbar from '../../components/Navbar'
import Link from 'next/link'
import CompanyHeader from './CompanyHeader'
import SidebarNav from './SidebarNav'
import Section from './Section'
import { supabase } from '../../../lib/supabase'

export const revalidate = 120
export const runtime = 'nodejs'

type PageParams = { ticker: string }
type PriceRow = { ts: string; close: number }

type RatiosRow = {
  ticker: string
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

async function loadCompany(ticker: string) {
  const { data: c } = await supabase
    .from('companies')
    .select('ticker,name,sector,sector_main,sector_sub,website,shares_outstanding')
    .eq('ticker', ticker).maybeSingle()

  const { data: p } = await supabase
    .from('prices')
    .select('ts,close').eq('ticker', ticker)
    .order('ts', { ascending: false }).limit(1)

  const last = p?.[0]?.close ?? null
  const shares = c?.shares_outstanding ? Number(c.shares_outstanding) : null
  const mcap = last && shares ? last * shares : null

  return {
    ticker,
    name: c?.name ?? ticker,
    sector: c?.sector ?? c?.sector_main ?? c?.sector_sub ?? undefined,
    website: c?.website ?? undefined,
    last, mcap
  }
}

async function loadPrices(ticker: string, limit = 240): Promise<PriceRow[]> {
  const { data } = await supabase
    .from('prices')
    .select('ts,close').eq('ticker', ticker)
    .order('ts', { ascending: false }).limit(limit)
  return (data ?? []).reverse()
}

async function loadRatios(ticker: string): Promise<RatiosRow | null> {
  const { data } = await supabase
    .from('v_pe_pb')
    .select('*')
    .eq('ticker', ticker)
    .maybeSingle()
  return (data as RatiosRow) ?? null
}

async function loadSeriesLast12(ticker: string): Promise<SeriesRow[]> {
  const { data } = await supabase
    .from('v_series_last12')
    .select('period,net_income_q,revenue_q,equity_value')
    .eq('ticker', ticker)
  return (data ?? []).sort((a: any, b: any) => +new Date(a.period) - +new Date(b.period)) as SeriesRow[]
}

async function loadKAP(ticker: string) {
  const [{ data: board }, { data: own }, { data: subs }, { data: votes }, { data: k47 }, { data: raw }] = await Promise.all([
    supabase.from('kap_board_members').select('name,role,is_executive,gender,profession,first_elected,equity_pct,represented_share_group').eq('ticker', ticker).order('name'),
    supabase.from('kap_ownership').select('holder,pct,voting_pct,paid_in_tl').eq('ticker', ticker).order('pct', { ascending: false }),
    supabase.from('kap_subsidiaries').select('company,activity,paid_in_capital,share_amount,currency,share_pct,relation').eq('ticker', ticker).order('share_pct', { ascending: false }),
    supabase.from('kap_vote_rights').select('field,value').eq('ticker', ticker).order('field'),
    supabase.from('kap_katilim_4_7').select('m1,m2,m3,m4,m5,m6,m7').eq('ticker', ticker).maybeSingle(),
    supabase.from('raw_company_json').select('payload').eq('ticker', ticker).maybeSingle(),
  ])

  return {
    board: (board ?? []) as BoardRow[],
    own: (own ?? []) as OwnRow[],
    subs: (subs ?? []) as SubRow[],
    votes: (votes ?? []) as VoteRow[],
    k47: (k47 ?? {}) as K47Row,
    raw: (raw?.payload ?? null) as RawKapPayload | null,
  }
}

/* ================= Mini chart helpers ================= */

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

  const [company, prices, ratios, series, kap] = await Promise.all([
    loadCompany(t),
    loadPrices(t, 240),
    loadRatios(t),
    loadSeriesLast12(t),
    loadKAP(t),
  ])

  const sections = [
    { id: 'overview', title: 'Genel Bakış' },
    { id: 'valuation', title: 'Değerleme' },
    { id: 'performance', title: 'Geçmiş Performans' },
    { id: 'kap', title: 'KAP Verileri' },
    { id: 'other', title: 'Diğer Bilgiler' },
  ]

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
                sector: company.sector,
                website: company.website,
                quote: { last: company.last ?? undefined, currency: 'TRY', mcap: company.mcap ?? null }
              }} />
            </div>

            <div className="space-y-12 mt-6">
              {/* GENEL */}
              <Section id="overview" title="Genel Bakış">
                <div className="grid gap-4 md:grid-cols-2">
                  <Card title="Şirket Hakkında">
                    {company.name || '—'}
                  </Card>
                  <Card title="Kısa Bilgiler">
                    <ul className="space-y-2 text-sm">
                      <li><span className="opacity-70">Sektör:</span> {company.sector ?? '-'}</li>
                      <li><span className="opacity-70">Web:</span> {company.website ? <a className="underline" href={company.website} target="_blank" rel="noreferrer">{company.website}</a> : '-'}</li>
                      <li><span className="opacity-70">Fiyat:</span> {company.last ? `${company.last.toFixed(2)} ₺` : '—'}</li>
                      <li><span className="opacity-70">Piyasa Değeri:</span> {company.mcap ? new Intl.NumberFormat('tr-TR').format(Math.round(company.mcap)) + ' ₺' : '—'}</li>
                    </ul>
                  </Card>
                </div>
              </Section>

              {/* DEĞERLEME */}
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

              {/* PERFORMANS */}
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

              {/* KAP VERİLERİ — TAMAMINI YANSIT */}
              <Section id="kap" title="KAP Verileri">
                <div className="grid gap-4">
                  <Card title="Yönetim Kurulu">
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

                  <Card title="Ortaklık Yapısı (≥ %5)">
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

                  <Card title="Bağlı Ortaklıklar">
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

                  <Card title="Oy Hakları">
                    <SimpleTable
                      cols={[
                        { key: 'field', title: 'Alan' },
                        { key: 'value', title: 'Değer' },
                      ]}
                      rows={(kap.votes || []).map(v => ({ field: v.field, value: v.value ?? '—' }))}
                    />
                  </Card>

                  <Card title="SPK Kurumsal Yönetim (4.7 Özet)">
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

              {/* DİĞER */}
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
