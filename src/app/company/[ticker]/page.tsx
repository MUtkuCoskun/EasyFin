import Navbar from '../../components/Navbar'
import Link from 'next/link'
import CompanyHeader from './CompanyHeader'
import SidebarNav from './SidebarNav'
import Section from './Section'
import { supabase } from '../../../lib/supabase'

export const revalidate = 300
export const runtime = 'nodejs'

type PageParams = { ticker: string }

type Company = {
  ticker: string
  name?: string
  sector?: string
  website?: string
  logoUrl?: string | null
  description?: string | null
  ownership?: Array<{ holder: string; percent: number }> | null
  managers?: Array<{ name: string; title?: string }> | null
  quote?: {
    last?: number
    currency?: string
    mcap?: number | null
  } | null
}

type FinSnap = {
  revenue?: number | null
  net_income?: number | null
  equity?: number | null
  total_liabilities?: number | null
}

type PriceRow = { ts: string; close: number }

/* ---------------------- SUPABASE'DEN VERİ ---------------------- */

async function loadCompanyFromDB(ticker: string): Promise<Company> {
  const { data: c } = await supabase
    .from('companies')
    .select('ticker,name,sector,shares_outstanding,website')
    .eq('ticker', ticker)
    .maybeSingle()

  // son fiyat
  const { data: p } = await supabase
    .from('prices')
    .select('ts, close')
    .eq('ticker', ticker)
    .order('ts', { ascending: false })
    .limit(1)

  const last = p?.[0]?.close ?? null
  const shares = c?.shares_outstanding ? Number(c.shares_outstanding) : null
  const mcap = last && shares ? last * shares : null

  return {
    ticker,
    name: c?.name ?? ticker,
    sector: c?.sector ?? undefined,
    website: c?.website ?? undefined,
    logoUrl: null,
    description: c?.name ? `Şirket: ${c.name}` : null,
    ownership: null,
    managers: null,
    quote: { last: last ?? undefined, currency: 'TRY', mcap },
  }
}

async function loadPrices(ticker: string, limit = 240): Promise<PriceRow[]> {
  const { data } = await supabase
    .from('prices')
    .select('ts, close')
    .eq('ticker', ticker)
    .order('ts', { ascending: false })
    .limit(limit)
  return (data ?? []).reverse()
}

async function loadFinSnapshot(ticker: string): Promise<FinSnap | null> {
  const { data } = await supabase
    .from('financials')
    .select('revenue, net_income, equity, total_liabilities, period, freq')
    .eq('ticker', ticker)
    .order('period', { ascending: false })
    .limit(1)
  if (!data || !data.length) return null
  const f = data[0]
  return {
    revenue: f.revenue ?? null,
    net_income: f.net_income ?? null,
    equity: f.equity ?? null,
    total_liabilities: f.total_liabilities ?? null,
  }
}

/* basit mini çizgi (SVG) — kütüphane yok, sunucu tarafı render */
function MiniPriceChart({ data, width = 800, height = 220 }: { data: PriceRow[]; width?: number; height?: number }) {
  if (!data?.length) return <div className="text-slate-400">Veri yok</div>
  const pad = 12
  const ys = data.map(d => Number(d.close))
  const min = Math.min(...ys)
  const max = Math.max(...ys)
  const sx = (i: number) => pad + (i / (data.length - 1)) * (width - pad * 2)
  const sy = (v: number) => pad + (1 - (v - min) / ((max - min) || 1)) * (height - pad * 2)
  const d = data.map((r, i) => `${i ? 'L' : 'M'} ${sx(i)} ${sy(ys[i])}`).join(' ')
  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
      <path d={d} fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  )
}

/* ---------------------- SAYFA ---------------------- */

export default async function CompanyPage({ params }: { params: PageParams }) {
  const t = (params.ticker || '').toUpperCase()

  const [company, prices, fin] = await Promise.all([
    loadCompanyFromDB(t),
    loadPrices(t, 240),
    loadFinSnapshot(t),
  ])

  const sections = [
    { id: 'overview',    title: 'Genel Bakış' },
    { id: 'valuation',   title: 'Değerleme' },
    { id: 'performance', title: 'Geçmiş Performans' },
    { id: 'health',      title: 'Finansal Sağlık' },
    { id: 'dividend',    title: 'Temettü' },
    { id: 'other',       title: 'Diğer Bilgiler' },
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
              <CompanyHeader company={company} />
            </div>

            <div className="space-y-12 mt-6">
              <Section id="overview" title="Genel Bakış">
                <OverviewContent company={company} />
              </Section>

              <Section id="valuation" title="Değerleme">
                <ValuationContent company={company} fin={fin} />
              </Section>

              <Section id="performance" title="Geçmiş Performans">
                <div className="rounded-2xl bg-[#0F162C] border border-[#2A355B] p-5">
                  <div className="font-semibold mb-3">Mini Fiyat Grafiği</div>
                  <MiniPriceChart data={prices} />
                  <div className="text-xs opacity-60 mt-2">
                    Noktalar: {prices.length} — Son fiyat: {company.quote?.last?.toFixed(2) ?? '—'} ₺
                  </div>
                </div>
              </Section>

              <Section id="health" title="Finansal Sağlık">
                <FinancialHealthContent fin={fin} />
              </Section>

              <Section id="dividend" title="Temettü">
                <DividendContent />
              </Section>

              <Section id="other" title="Diğer Bilgiler">
                <OtherInfoContent />
              </Section>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}

/* -------- Kart ve içerikler -------- */
function Card({ title, children }: React.PropsWithChildren<{ title: string }>) {
  return (
    <div className="rounded-2xl bg-[#0F162C] border border-[#2A355B] p-5">
      <h3 className="font-semibold">{title}</h3>
      <div className="mt-3 text-slate-300/90">{children}</div>
    </div>
  )
}

function OverviewContent({ company }: { company: Company }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card title="Şirket Hakkında">
        {company.description ?? <span className="opacity-70">Açıklama eklenecek.</span>}
      </Card>
      <Card title="Kısa Bilgiler">
        <ul className="space-y-2 text-sm">
          <li><span className="opacity-70">Sektör:</span> {company.sector ?? '-'}</li>
          <li><span className="opacity-70">Web Sitesi:</span> {company.website ? <a className="underline" href={company.website} target="_blank" rel="noreferrer">{company.website}</a> : '-'}</li>
          <li><span className="opacity-70">Ticker:</span> {company.ticker}</li>
          <li><span className="opacity-70">Fiyat:</span> {company.quote?.last ? `${company.quote.last.toFixed(2)} ₺` : '—'}</li>
          <li><span className="opacity-70">Piyasa Değeri:</span> {company.quote?.mcap ? new Intl.NumberFormat('tr-TR').format(Math.round(company.quote.mcap)) + ' ₺' : '—'}</li>
        </ul>
      </Card>
    </div>
  )
}

function ValuationContent({ company, fin }: { company: Company; fin: FinSnap | null }) {
  // kaba PE: mcap / net_income (yıllık). net_income yoksa gösterme.
  const pe = company.quote?.mcap && fin?.net_income ? (company.quote.mcap / Number(fin.net_income)) : null
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Card title="F/K (P/E)">{pe ? pe.toFixed(1) : <span className="opacity-70">Veri gelince hesaplanacak.</span>}</Card>
      <Card title="F/S (P/S)"><span className="opacity-70">Hasılat + piyasa değeri eklenecek.</span></Card>
      <Card title="Fiyat vs. Değer"><span className="opacity-70">Model daha sonra.</span></Card>
    </div>
  )
}

function FinancialHealthContent({ fin }: { fin: FinSnap | null }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card title="Bilanço Kalitesi">
        {fin ? (
          <ul className="text-sm space-y-1">
            <li><span className="opacity-70">Özsermaye:</span> {fin.equity ?? '—'}</li>
            <li><span className="opacity-70">Toplam Yükümlülük:</span> {fin.total_liabilities ?? '—'}</li>
            <li><span className="opacity-70">Net Kâr:</span> {fin.net_income ?? '—'}</li>
            <li><span className="opacity-70">Gelir:</span> {fin.revenue ?? '—'}</li>
          </ul>
        ) : <span className="opacity-70">Finansal satır henüz içe aktarılmadı.</span>}
      </Card>
      <Card title="Kârlılık Oranları">
        <span className="opacity-70">ROE / ROA / Marjlar — veri gelince.</span>
      </Card>
    </div>
  )
}

function DividendContent() {
  return (
    <Card title="Temettü">
      <span className="opacity-70">KAP bağlayınca otomatik dolacak.</span>
    </Card>
  )
}

function OtherInfoContent() {
  return (
    <Card title="Notlar">
      <span className="opacity-70">Duyurular/Notlar burada listelenecek.</span>
    </Card>
  )
}
