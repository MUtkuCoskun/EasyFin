'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'

type Item = { symbol: string; name?: string }

const letters = ['Tümü','A','B','C','Ç','D','E','F','G','H','I','İ','J','K','L','M','N','O','Ö','P','R','S','Ş','T','U','Ü','V','Y','Z']

// Bucket'ın HTTP adresi
const BUCKET_HTTP = 'https://storage.googleapis.com/finai-a381b.firebasestorage.app'

// Sembolden 3 aday URL üret (küçük webp -> büyük webp -> png)
function logoUrls(symbol: string) {
  const S = (symbol || '').toUpperCase().trim()
  return [
    `${BUCKET_HTTP}/logos/s/${S}.webp`,
    `${BUCKET_HTTP}/logos/${S}.webp`,
    `${BUCKET_HTTP}/logos/${S}.png`,
  ]
}

function LogoImg({ symbol, eager = false }: { symbol: string; eager?: boolean }) {
  const urls = logoUrls(symbol)
  const [idx, setIdx] = useState(0)
  return (
    <img
      src={urls[idx]}
      onError={() => setIdx(i => Math.min(i + 1, urls.length - 1))}
      alt={`${symbol} logo`}
      className="h-8 w-8 object-contain"
      width={32}
      height={32}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      referrerPolicy="no-referrer"
    />
  )
}

export default function CompaniesGrid({ initialItems }: { initialItems: Item[] }) {
  const [q, setQ] = useState('')
  const [L, setL] = useState('Tümü')

  const items = useMemo(() => {
    const needle = q.trim().toLowerCase()
    let filtered = initialItems
    if (L !== 'Tümü') filtered = filtered.filter(x => x.symbol.startsWith(L.toUpperCase()))
    if (needle) filtered = filtered.filter(x =>
      x.symbol.toLowerCase().includes(needle) ||
      (x.name || '').toLowerCase().includes(needle)
    )
    return filtered
  }, [initialItems, q, L])

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Sembol veya şirket adı ara… (örn. SASA)"
          className="w-full md:max-w-md h-11 rounded-lg bg-[#0F162C] border border-[#2A355B] px-4 text-slate-100 placeholder:text-slate-500 outline-none focus:border-[#246BFF]"
        />
        <div className="flex flex-wrap gap-1.5">
          {letters.map(ch => (
            <button
              key={ch}
              onClick={() => setL(ch)}
              className={`px-2.5 py-1.5 text-xs rounded-md border transition
                ${L === ch ? 'bg-[#246BFF] border-[#246BFF] text-white' : 'bg-[#0F162C] border-[#2A355B] text-slate-300 hover:bg-[#162048]'}
              `}
            >
              {ch}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {items.map((it, idx) => (
          <Link
            key={it.symbol}
            href={`/company/${it.symbol}`}
            className="group rounded-xl bg-[#0F162C] border border-[#2A355B] p-4 hover:border-[#3A4A7A] hover:bg-[#101b37] transition shadow-[0_2px_20px_rgba(0,0,0,0.25)]"
            style={{ contentVisibility: 'auto' }}
          >
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-white/5 grid place-items-center overflow-hidden">
                <LogoImg symbol={it.symbol} eager={idx < 12} />
              </div>
              <div className="min-w-0">
                <div className="font-semibold tracking-tight group-hover:text-white">{it.symbol}</div>
                <div className="text-xs text-slate-400 line-clamp-1">{it.name || '—'}</div>
              </div>
            </div>
          </Link>
        ))}
      </div>

      <div className="text-xs text-slate-400">Gösterilen: {items.length.toLocaleString('tr-TR')}</div>
    </div>
  )
}
