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
  mcap: number | null
  equity_value: number | null
  ttm_net_income: number | null
  pb: number | null
  pe_ttm: number | null
}

type EquityRow = { period: string; equity_value: number | null }
type NiRow = { period: string; net_income_value: number | null }

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

async function loadRatios(ticker: string): Promise<RatiosRow | null> {
  const { data } = await supabase
    .from('v_pe_pb')
    .select('mcap,equity_value,ttm_net_income,pb,pe_ttm')
    .eq('ticker', ticker).maybeSingle()
  return (data as RatiosRow) ?? null
}

async function loadEquitySeries(ticker: string, limit = 12): Promise<EquityRow[]> {
  const { data } = await supabase
    .from('v_equity')
    .select('period,equity_value')
    .eq('ticker', ticker)
    .order('period', { ascending: false })
    .limit(limit)
  return (data ?? []).reverse() as EquityRow[]
}

async function loadNetIncomeSeries(ticker: string, limit = 12): Promise<NiRow[]> {
  const { data } = await supabase
    .from('v_net_income')
    .select('period,net_income_value')
    .eq('ticker', ticker)
    .order('period', { ascending: false })
    .limit(limit)
  return (data ?? []).reverse() as NiRow[]
}

async function loadPrices(ticker: string, limit = 240): Promise<PriceRow[]> {
  const { data } = await supabase
    .from('prices')
    .select('ts,close').eq('ticker', ticker)
    .order('ts', { ascending: false }).limit(limit)
  return (data ?? []).reverse()
}

// --- Mini SVG chart helpers (frameworksız, hafif) ---
function MiniLineChart({
  data, yKey, w = 800, h = 220
}: { data: any[]; yKey: string; w?: number; h?: number }) {
  const vals = data.map(d => Number(d?.[yKey] ?? NaN)).filter(v => !Number.isNaN(v))
  if (!data?.length || !vals.length) return <div className="text-slate-400">Veri yok</div>
  const pad = 12
  const min = Math.min(...vals), max = Math.max(...vals)
  const sx = (i: number) => pad + (i / Math.max(1, data.length - 1)) * (w - pad * 2)
  const sy = (v: number) => pad + (1 - ((v - min) / ((max - min) || 1))) * (h - pad * 2)
  const path = data
    .map((r, i) => {
      const v = Number(r?.[yKey])
      if (Number.isNaN(v)) return null
      return `${i ? 'L' : 'M'} ${sx(i)} ${sy(v)}`
    })
    .filter(Boolean)
    .join(' ')
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`}>
      <path d={path} fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  )
}

function MiniBarChart({
  data, yKey, w = 800, h = 220
}: { data: any[]; yKey: string; w?: number; h?: number }) {
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
        const v = Number(r?.[yKey])
        if (Number.isNaN(v)) return null
        const y = sy(Math.max(v, 0))
        const yNeg = sy(Math.min(v, 0))
        const rectY = v >= 0 ? y : y0
        const rectH = Math.abs(y0 - (v >= 0 ? y : yNeg))
        const fill = v >= 0 ? '#22c55e' : '#ef4444' // yeşil/kırmızı
        return <rect key={i} x={sx(i)} y={rectY} width={bw} height={rectH} fill={fill} rx="2" />
      })}
      {/* sıfır ekseni */}
      <line x1={pad} x2={w - pad} y1={y0} y2={y0} stroke="#334155" strokeDasharray="4 4" />
    </svg>
  )
}

function Card({ title, children }: React.PropsWithChildren<{ title: string }>) {
  return <div className="rounded-2xl bg-[#0F162C] border border-[#2A355B] p-5">
    <h3 className="font-semibold">{title}</h3>
    <div className="mt-3 text-slate-300/90">{children}</div>
  </div>
}

export default async function Page({ params }: { params: PageParams }) {
  const t = (params.ticker || '').toUpperCase()

  const [company, prices, ratios, equitySeries, niSeries] = await Promise.all([
    loadCompany(t),
    loadPrices(t, 240),
    loadRatios(t),
    loadEquitySeries(t, 12),
    loadNetIncomeSeries(t, 12),
  ])

  // equity & net income serilerini period bazında birleştir (label için)
  const map = new Map<string, { period: string; equity: number | null; net_income: number | null }>()
  for (const r of equitySeries) map.set(r.period, { period: r.period, equity: r.equity_value, net_income: null })
  for (const r of niSeries) {
    const row = map.get(r.period) || { period: r.period, equity: null, net_income: null }
    row.net_income = r.net_income_value
    map.set(r.period, row)
  }
  const finSeries = Array.from(map.values()).sort((a, b) => +new Date(a.period) - +new Date(b.period))
  const fmt = (n?: number | null, d = 0) =>
    (n ?? null) === null ? '—' : new Intl.NumberFormat('tr-TR', { maximumFractionDigits: d }).format(n!)

  const sections = [
    { id: 'overview', title: 'Genel Bakış' },
    { id: 'valuation', title: 'Değerleme' },
    { id: 'performance', title: 'Geçmiş Performans' },
    { id: 'health', title: 'Finansal Sağlık' },
    { id: 'dividend', title: 'Temettü' },
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

              <Section id="valuation" title="Değerleme">
                <div className="grid gap-4 md:grid-cols-3">
                  <Card title="F/K (P/E) — TTM">
                    <div className="text-2xl font-semibold">{fmt(ratios?.pe_ttm ?? null, 2)}</div>
                    <div className="text-xs opacity-60 mt-1">Son 4 çeyrek net kâr toplamı ile.</div>
                  </Card>
                  <Card title="PD/DD (P/B)">
                    <div className="text-2xl font-semibold">{fmt(ratios?.pb ?? null, 2)}</div>
                    <div className="text-xs opacity-60 mt-1">Piyasa değeri / son dönem özkaynak.</div>
                  </Card>
                  <Card title="TTM Net Kâr">
                    <div className="text-2xl font-semibold">{fmt(ratios?.ttm_net_income ?? null, 0)} ₺</div>
                    <div className="text-xs opacity-60 mt-1">Hızlı referans için.</div>
                  </Card>
                </div>
              </Section>

              <Section id="performance" title="Geçmiş Performans">
                <div className="rounded-2xl bg-[#0F162C] border border-[#2A355B] p-5">
                  <div className="font-semibold mb-3">Mini Fiyat Grafiği</div>
                  <MiniPriceChart data={prices} />
                  <div className="text-xs opacity-60 mt-2">Nokta: {prices.length} — Son fiyat: {company.last?.toFixed(2) ?? '—'} ₺</div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <Card title="Net Kâr (Çeyreklik)">
                    <MiniBarChart data={finSeries.map(r => ({ y: r.net_income }))} yKey="y" />
                  </Card>
                  <Card title="Özkaynak (Son 12 Çeyrek)">
                    <MiniLineChart data={finSeries.map(r => ({ y: r.equity }))} yKey="y" />
                  </Card>
                </div>
              </Section>

              <Section id="health" title="Finansal Sağlık">
                <Card title="Özet">Daha fazla oran (Borç/Özsermaye, Net Marj, ROE) için birkaç view daha ekleyeceğiz.</Card>
              </Section>

              <Section id="dividend" title="Temettü">
                <Card title="Temettü">KAP entegrasyonu ile yakın zamanda.</Card>
              </Section>

              <Section id="other" title="Diğer Bilgiler">
                <Card title="Notlar">Duyurular burada listelenecek.</Card>
              </Section>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
