import Navbar from '../../components/Navbar'
import Link from 'next/link'
import CompanyHeader from './CompanyHeader'
import SidebarNav from './SidebarNav'
import Section from './Section'
import ClientCharts from './ClientCharts'
import { Suspense } from 'react'
import { loadIsy } from '../../../lib/cloud'

// 🔌 KAP mini-SDK (senin oluşturduğun kap.ts'ten)
import {
  getCompanyIdByTicker,
  kapLastDisclosureIndex,
  kapDisclosures,
  kapDisclosureDetail,
} from '../../../lib/kap'

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
    changePct1Y?: number
    changePct7D?: number
    fairValue?: number | null
    currency?: string
  } | null
}

type DividendInfo = {
  lastEventId?: number
  subject?: string
  time?: string
  link?: string
} | null

type KapDisclosureListItem = {
  disclosureIndex: string
  disclosureType: string
  disclosureClass: string
  title: string
  companyId: string
  acceptedDataFileTypes?: string[]
}

type SimpleNews = {
  id: number
  subject: string
  time?: string
  link?: string
  type?: string
  class?: string
}

/* ---------------------- KAP ENTEGRASYONU ---------------------- */

// KAP /members üzerinden ticker→companyId eşleş, temel company meta’yı doldur
async function loadCompanyMeta(ticker: string): Promise<Company> {
  const base: Company = {
    ticker,
    name: ticker,
    sector: undefined,
    website: undefined,
    logoUrl: null,
    description: null,
    ownership: null,
    managers: null,
    quote: null,
  }

  const hit = await getCompanyIdByTicker(ticker)
  if (!hit) return base

  return {
    ...base,
    name: hit.title, // KAP ünvanı
    description: `KAP Üye ID: ${hit.id}.`, // Basit placeholder — ileride daha zenginleştireceğiz
  }
}

// Son temettü/hak kullanım bildirimi (CA) — varsa çek
async function loadDividendInfo(ticker: string): Promise<DividendInfo> {
  const hit = await getCompanyIdByTicker(ticker)
  if (!hit) return null

  const lastIdx = await kapLastDisclosureIndex()
  const list: KapDisclosureListItem[] = await kapDisclosures({
    disclosureIndex: lastIdx,
    disclosureType: 'CA',
    companyId: hit.id,
  })

  // Bu listede şirketine ait öğeyi bul (yoksa null döner)
  const item = Array.isArray(list) ? list.find(x => x.companyId === hit.id) : null
  if (!item) return null

  const detail = await kapDisclosureDetail(Number(item.disclosureIndex), 'data')
  return {
    lastEventId: Number(item.disclosureIndex),
    subject: detail?.subject?.tr || detail?.summary?.tr || 'Hak kullanım',
    time: detail?.time,
    link: detail?.link,
  }
}

// “Diğer Bilgiler” altında göstermek için son ~5 bildirimi toparla (ODA/DG/FR/CA karışık)
async function loadLatestDisclosures(ticker: string, take = 5): Promise<SimpleNews[]> {
  const hit = await getCompanyIdByTicker(ticker)
  if (!hit) return []

  const lastIdx = await kapLastDisclosureIndex()
  // Not: Bu uç “global” son 50’den döner; düşük aktif şirketlerde liste boş gelebilir.
  const list: KapDisclosureListItem[] = await kapDisclosures({
    disclosureIndex: lastIdx,
    companyId: hit.id,
  })

  const mine = (Array.isArray(list) ? list : [])
    .filter(x => x.companyId === hit.id)
    .slice(0, take)

  const out: SimpleNews[] = []
  for (const it of mine) {
    const d = await kapDisclosureDetail(Number(it.disclosureIndex), 'data')
    out.push({
      id: Number(it.disclosureIndex),
      subject: d?.subject?.tr || d?.summary?.tr || it.title || `${it.disclosureType}/${it.disclosureClass}`,
      time: d?.time,
      link: d?.link,
      type: it.disclosureType,
      class: it.disclosureClass,
    })
  }
  return out
}

/* ---------------------- SAYFA ---------------------- */

export default async function CompanyPage({ params }: { params: PageParams }) {
  const t = (params.ticker || '').toUpperCase()
  const [isy, company, dividend, news] = await Promise.all([
    loadIsy(t),
    loadCompanyMeta(t),
    loadDividendInfo(t),
    loadLatestDisclosures(t, 5),
  ])

  const sections = [
    { id: 'overview',    title: 'Genel Bakış' },
    { id: 'valuation',   title: 'Değerleme' },
    { id: 'growth',      title: 'Büyüme Görünümü' },
    { id: 'performance', title: 'Geçmiş Performans' },
    { id: 'health',      title: 'Finansal Sağlık' },
    { id: 'dividend',    title: 'Temettü' },
    { id: 'management',  title: 'Yönetim' },
    { id: 'ownership',   title: 'Sahiplik' },
    { id: 'other',       title: 'Diğer Bilgiler' },
  ]

  return (
    <main className="min-h-screen relative">
      {/* Arka plan */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#0B0D16] to-[#131B35]" />

      {/* Navbar (site-wide fixed varsayımı) */}
      <Navbar />

      {/* NAV boşluğu: mobile 64px, md+ 72px */}
      <div className="mx-auto max-w-7xl px-4 pt-[64px] md:pt-[72px] pb-24 relative z-20">
        {/* üst sıra: sola geri link, sağda boş */}
        <div className="flex items-center justify-between gap-4">
          <Link href="/companies" className="text-sm text-slate-300 hover:text-white">← Şirketler</Link>
          <div />
        </div>

        {/* GRID: sol sticky menü + sağ içerik */}
        <div className="mt-4 grid grid-cols-12 gap-6">
          <aside className="hidden lg:block lg:col-span-3">
            <SidebarNav sections={sections} />
          </aside>

          <div className="col-span-12 lg:col-span-9">
            {/* Şirket başlığı */}
            <div id="company-sticky" className="sticky top-[64px] md:top-[72px] z-30">
              <CompanyHeader company={company} />
            </div>

            {/* İçerik */}
            <div className="space-y-12 mt-6">
              <Section id="overview" title="Genel Bakış">
                <OverviewContent company={company} />
              </Section>

              <Section id="valuation" title="Değerleme">
                <ValuationContent />
              </Section>

              <Section id="growth" title="Büyüme Görünümü">
                <FutureGrowthContent />
              </Section>

              <Section id="performance" title="Geçmiş Performans">
                <Suspense fallback={<div className="text-slate-300">Grafikler yükleniyor…</div>}>
                  <ClientCharts ticker={t} isy={isy} />
                </Suspense>
              </Section>

              <Section id="health" title="Finansal Sağlık">
                <FinancialHealthContent />
              </Section>

              <Section id="dividend" title="Temettü">
                <DividendContent dividend={dividend} />
              </Section>

              <Section id="management" title="Yönetim">
                <ManagementContent managers={company.managers} />
              </Section>

              <Section id="ownership" title="Sahiplik">
                <OwnershipContent ownership={company.ownership} />
              </Section>

              <Section id="other" title="Diğer Bilgiler">
                <OtherInfoContent company={company} news={news} />
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
        {company.description ?? (
          <span className="opacity-70">
            Açıklama verisi bulunamadı. <em>Kaynak bağlanınca otomatik dolduracağız.</em>
          </span>
        )}
      </Card>
      <Card title="Kısa Bilgiler">
        <ul className="space-y-2 text-sm">
          <li><span className="opacity-70">Sektör:</span> {company.sector ?? '-'}</li>
          <li><span className="opacity-70">Web Sitesi:</span> {company.website ? <a className="underline" href={company.website} target="_blank" rel="noreferrer">{company.website}</a> : '-'}</li>
          <li><span className="opacity-70">Ticker:</span> {company.ticker}</li>
          <li><span className="opacity-70">Ünvan (KAP):</span> {company.name ?? '-'}</li>
        </ul>
      </Card>
    </div>
  )
}

function ValuationContent() {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Card title="F/K (P/E)"><span className="opacity-70">Fiyat ve EPS bağlanınca hesaplanacak.</span></Card>
      <Card title="F/S (P/S)"><span className="opacity-70">Hasılat + piyasa değeri verisi gerekli.</span></Card>
      <Card title="Fiyat vs Gerçeğe Uygun Değer"><span className="opacity-70">Değerleme modeli eklenecek.</span></Card>
    </div>
  )
}

function FutureGrowthContent() {
  return <Card title="Kazanç & Gelir Tahmini"><span className="opacity-70">Analist/model verisi gelince grafiklenecek.</span></Card>
}

function FinancialHealthContent() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card title="Bilanço Kalitesi">Borç/Özsermaye, Nakit/Borç, Faiz Karşılama — KAP FR raporlarından türetilecek.</Card>
      <Card title="Kârlılık Oranları">ROE / ROA / ROCE — finansal tablolardan hesaplanacak.</Card>
    </div>
  )
}

function DividendContent({ dividend }: { dividend: DividendInfo }) {
  return (
    <Card title="Temettü Verimi ve Tarihler">
      {dividend ? (
        <div className="space-y-1 text-sm">
          <div><span className="opacity-70">Son Hak Kullanım:</span> {dividend.subject}</div>
          <div><span className="opacity-70">Tarih:</span> {dividend.time || '-'}</div>
          <div>
            <span className="opacity-70">KAP Linki:</span>{' '}
            {dividend.link ? <a className="underline" href={dividend.link} target="_blank" rel="noreferrer">Görüntüle</a> : '-'}
          </div>
          <div className="text-xs opacity-60">Kaynak: KAP (CA bildirimleri)</div>
        </div>
      ) : (
        <span className="opacity-70">Henüz CA (temettü) bildirimi bulunamadı.</span>
      )}
    </Card>
  )
}

function ManagementContent({ managers }: { managers: Company['managers'] }) {
  return (
    <Card title="Önemli İsimler">
      {managers?.length ? (
        <ul className="grid gap-2">
          {managers.map(m => <li key={m.name}>{m.name} <span className="opacity-70 text-sm">— {m.title ?? '—'}</span></li>)}
        </ul>
      ) : <span className="opacity-70">Yönetim verisi yok.</span>}
    </Card>
  )
}

function OwnershipContent({ ownership }: { ownership: Company['ownership'] }) {
  return (
    <Card title="En Büyük Pay Sahipleri">
      {ownership?.length ? (
        <table className="w-full text-sm">
          <tbody>
            {ownership.map(o => (
              <tr key={o.holder} className="border-b border-white/5">
                <td className="py-2">{o.holder}</td>
                <td className="py-2 text-right">{o.percent.toFixed(2)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <span className="opacity-70">Sahiplik verisi yok (KAP/MKK bağlanınca).</span>}
    </Card>
  )
}

function OtherInfoContent({ company, news }: { company: Company; news?: SimpleNews[] }) {
  return (
    <Card title="Notlar / Son KAP Bildirimleri">
      <div className="space-y-4">
        <div className="text-sm">
          Eksik veriler bağlandıkça bölümler otomatik dolacaktır.
        </div>
        <div>
          <div className="font-medium mb-2">Son Bildirimler</div>
          {news && news.length > 0 ? (
            <ul className="space-y-2 text-sm">
              {news.map(n => (
                <li key={n.id} className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="opacity-70">{n.type}/{n.class}</div>
                    <div>{n.subject}</div>
                    {n.link && (
                      <a className="underline opacity-80" href={n.link} target="_blank" rel="noreferrer">KAP</a>
                    )}
                  </div>
                  <div className="text-right opacity-70 shrink-0">{n.time || ''}</div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-sm opacity-70">Gösterilecek bildirim bulunamadı.</div>
          )}
        </div>
      </div>
    </Card>
  )
}
