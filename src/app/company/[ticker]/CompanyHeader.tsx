'use client'

import { useState } from 'react'

type CompanyHeaderProps = {
  company: {
    ticker: string
    name?: string
    sector?: string
    quote?: {
      last?: number
      changePct1Y?: number
      changePct7D?: number
      fairValue?: number | null
      currency?: string
    } | null
  }
}

// Grid ile AYNI sabit + fallback sırası
const BUCKET_HTTP = 'https://storage.googleapis.com/finai-a381b.firebasestorage.app'
function logoUrls(symbol: string) {
  const S = (symbol || '').toUpperCase().trim()
  return [
    `${BUCKET_HTTP}/logos/s/${S}.webp`,
    `${BUCKET_HTTP}/logos/${S}.webp`,
    `${BUCKET_HTTP}/logos/${S}.png`,
  ]
}

function LogoImg({ symbol }: { symbol: string }) {
  const urls = logoUrls(symbol)
  const [idx, setIdx] = useState(0)
  return (
    <img
      src={urls[idx]}
      onError={() => setIdx(i => Math.min(i + 1, urls.length - 1))}
      alt={`${symbol} logo`}
      className="w-10 h-10 md:w-12 md:h-12 rounded-lg object-contain bg-black/20 border border-white/10"
      width={48}
      height={48}
      loading="eager"
      decoding="async"
      referrerPolicy="no-referrer"
    />
  )
}

export default function CompanyHeader({ company }: CompanyHeaderProps) {
  const q = company?.quote
  const currency = q?.currency ?? '₺'
  const title = company?.name ?? company?.ticker

  return (
    <div className="rounded-2xl border border-[#2A355B] bg-gradient-to-br from-[#0F162C] to-[#0A1130] p-5 shadow-[0_10px_30px_rgba(0,0,0,0.25)]">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div className="flex items-center gap-3">
          <LogoImg symbol={company.ticker} />
          <div>
            <div className="text-2xl font-semibold">{title}</div>
            {/* sektör boşsa hiç render etme -> “—” görünmez */}
            {company?.sector ? <div className="text-sm text-slate-400">{company.sector}</div> : null}
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <Kpi label="Son Fiyat" value={q?.last} suffix={` ${currency}`} />
          <Kpi label="1Y Getiri" value={q?.changePct1Y} suffix="%" fmt="pct" />
          <Kpi label="7G Getiri" value={q?.changePct7D} suffix="%" fmt="pct" />
          <Kpi label="Gerçeğe Uygun Değer" value={q?.fairValue} suffix={` ${currency}`} />
        </div>
      </div>
    </div>
  )
}

function Kpi({ label, value, suffix = '', fmt }: { label: string; value?: number | null; suffix?: string; fmt?: 'pct' }) {
  const text =
    typeof value === 'number'
      ? fmt === 'pct'
        ? `${value.toFixed(1)}${suffix}`
        : `${value.toLocaleString('tr-TR')}${suffix}`
      : '-'
  const trendClass =
    fmt === 'pct' && typeof value === 'number'
      ? value >= 0 ? 'text-emerald-400' : 'text-rose-400'
      : 'text-white'

  return (
    <div className="rounded-xl bg-black/20 border border-white/5 p-3">
      <div className="text-slate-400 text-xs">{label}</div>
      <div className={`mt-1 font-semibold ${trendClass}`}>{text}</div>
    </div>
  )
}
