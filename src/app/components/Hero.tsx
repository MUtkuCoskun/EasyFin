'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'

type Item = { symbol: string; name?: string }

const BUCKET_HTTP = 'https://storage.googleapis.com/finai-a381b.firebasestorage.app'

function logoUrls(symbol: string) {
  const S = (symbol || '').toUpperCase().trim()
  return [
    `${BUCKET_HTTP}/logos/s/${S}.webp`,
    `${BUCKET_HTTP}/logos/${S}.webp`,
    `${BUCKET_HTTP}/logos/${S}.png`,
  ]
}

function LogoImg({ symbol, size = 24, eager = false }: { symbol: string; size?: number; eager?: boolean }) {
  const urls = logoUrls(symbol)
  const [idx, setIdx] = useState(0)
  return (
    <img
      src={urls[idx]}
      onError={() => setIdx(i => Math.min(i + 1, urls.length - 1))}
      alt=""
      className="object-contain rounded"
      width={size}
      height={size}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      referrerPolicy="no-referrer"
    />
  )
}

function sample<T>(arr: T[], n: number) {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a.slice(0, n)
}

export default function Hero() {
  const router = useRouter()
  const [all, setAll] = useState<Item[]>([])
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let mounted = true
    fetch('/api/bist')
      .then(r => r.json())
      .then((data: Item[]) => { if (mounted) setAll(data) })
      .catch(() => {})
    return () => { mounted = false }
  }, [])

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!boxRef.current) return
      if (!boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('click', onClick)
    return () => window.removeEventListener('click', onClick)
  }, [])

  const suggestions = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return []
    const filtered = all.filter(x =>
      x.symbol.toLowerCase().includes(needle) ||
      (x.name || '').toLowerCase().includes(needle)
    )
    return filtered.slice(0, 8)
  }, [all, q])

  const randomFive = useMemo(() => sample(all, 5), [all])

  function go(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const v = q.trim().toUpperCase()
    if (!v) return
    const exact = all.find(x => x.symbol.toUpperCase() === v)
    const first = suggestions[0]
    const target = exact?.symbol || first?.symbol || v
    router.push(`/company/${target}`)
  }

  return (
    <section className="relative z-10 pt-32 pb-28">
      <div className="mx-auto max-w-3xl px-4 text-center">
        <h1 className="text-4xl md:text-6xl font-extrabold">
          Doğru yatırım kararları alın
        </h1>

        <p className="mt-4 text-base md:text-lg text-slate-300">
          Fin AI ile hisse senedi analizinde vakit kazanarak borsadaki varlığınızı güçlendirin.
        </p>

        <form className="mt-8" onSubmit={go}>
          <div className="mx-auto max-w-2xl" ref={boxRef}>
            <div className="relative text-left">
              <input
                name="q"
                value={q}
                onChange={e => { setQ(e.target.value); setOpen(true) }}
                onFocus={() => setOpen(true)}
                type="text"
                placeholder="SASA, THYAO, BIMAS…"
                className="w-full h-14 rounded-lg bg-[#0F162C] border border-[#303B5C] px-5 pr-20 text-slate-100 placeholder:text-slate-500 outline-none focus:border-[#246BFF]"
                autoComplete="off"
              />
              <button
                type="submit"
                className="absolute right-1 top-1 bottom-1 rounded-md px-4 text-sm font-medium bg-[#246BFF] hover:bg-[#1A57E0] text-white"
              >
                Ara
              </button>

              {open && suggestions.length > 0 && (
                <div className="absolute z-20 mt-2 w-full rounded-lg bg-[#0F162C] border border-[#2A355B] shadow-xl overflow-hidden">
                  <ul className="max-h-80 overflow-auto divide-y divide-[#1f294a]">
                    {suggestions.map(s => (
                      <li key={s.symbol}>
                        <button
                          type="button"
                          onClick={() => router.push(`/company/${s.symbol}`)}
                          className="w-full text-left px-3 py-2 hover:bg-[#101b37] flex items-center gap-3"
                        >
                          <LogoImg symbol={s.symbol} size={24} eager />
                          <div className="flex-1 min-w-0">
                            <div className="font-medium">{s.symbol}</div>
                            <div className="text-xs text-slate-400 truncate">{s.name}</div>
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              {randomFive.map(it => (
                <Link
                  key={it.symbol}
                  href={`/company/${it.symbol}`}
                  className="rounded-md bg-[#1A213F] text-slate-200 text-sm px-3 py-1.5 hover:bg-[#283255] transition inline-flex items-center gap-2"
                >
                  <LogoImg symbol={it.symbol} size={16} />
                  {it.symbol}
                </Link>
              ))}
            </div>
          </div>
        </form>
      </div>

      <div className="mx-auto max-w-6xl mt-20 px-4 hidden md:block">
        <div className="rounded-xl bg-[#0F162C] border border-[#2A355B] shadow-[0_12px_40px_rgba(0,0,0,0.45)] p-6">
          <div className="h-56 opacity-60 grid place-items-center text-slate-400">
            <span>Özet Rapor önizlemesi (placeholder)</span>
          </div>
        </div>
      </div>
    </section>
  )
}

export { Hero }
