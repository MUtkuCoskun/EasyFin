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

async function loadCompany(ticker: string) {
  const { data: c } = await supabase
    .from('companies')
    .select('ticker,name,sector,website,shares_outstanding')
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
    sector: c?.sector ?? undefined,
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

function MiniPriceChart({ data, w = 800, h = 220 }: { data: PriceRow[]; w?: number; h?: number }) {
  if (!data?.length) return <div className="text-slate-400">Veri yok</div>
  const pad = 12, ys = data.map(d => Number(d.close)),
        min = Math.min(...ys), max = Math.max(...ys)
  const sx = (i: number) => pad + (i / (data.length - 1)) * (w - pad * 2)
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

export default async function Page({ params }: { params: PageParams }) {
  const t = (params.ticker || '').toUpperCase()
  const [company, prices] = await Promise.all([loadCompany(t), loadPrices(t, 240)])

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
                  <Card title="F/K (P/E)"><span className="opacity-70">Finansal veri eklenince.</span></Card>
                  <Card title="F/S (P/S)"><span className="opacity-70">Hasılat + PD ile.</span></Card>
                  <Card title="Fiyat vs Değer"><span className="opacity-70">Model sonra.</span></Card>
                </div>
              </Section>

              <Section id="performance" title="Geçmiş Performans">
                <div className="rounded-2xl bg-[#0F162C] border border-[#2A355B] p-5">
                  <div className="font-semibold mb-3">Mini Fiyat Grafiği</div>
                  <MiniPriceChart data={prices} />
                  <div className="text-xs opacity-60 mt-2">Nokta: {prices.length} — Son fiyat: {company.last?.toFixed(2) ?? '—'} ₺</div>
                </div>
              </Section>

              <Section id="health" title="Finansal Sağlık">
                <Card title="Özet">Finansal tablolar aktarılınca doldurulacak.</Card>
              </Section>

              <Section id="dividend" title="Temettü">
                <Card title="Temettü">KAP bağlayınca dolacak.</Card>
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
