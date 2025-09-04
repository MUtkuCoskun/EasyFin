'use client'

import { useMemo, useState } from 'react'

// ---------- Yardımcılar ----------

type BarItem = { year: string; value: number }
type Isy = any
type GroupNode = { name: string; children: { name: string; value: number }[] }

const last = <T,>(arr: T[]) => (arr && arr.length ? arr[arr.length - 1] : undefined)

const toNum = (n: number | string | null | undefined) => Number(n ?? 0)
const fmt = (n?: number) =>
  typeof n === 'number'
    ? n.toLocaleString('tr-TR', {
        maximumFractionDigits: Math.abs(n) < 10 ? 2 : Math.abs(n) < 100 ? 1 : 0,
      })
    : '-'

// normalize helper
const norm = (s?: string) =>
  String(s || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '') // ş,ğ,ö,ü vb. izlerini temizle
    .replace(/\s+/g, ' ')
    .trim()

// ---- period & item yardımcıları (boş dönemleri atlar) ----
function extractPeriodKeys(isy: Isy): string[] {
  if (!isy) return []
  const fromMeta =
    (isy.meta?.periodKeys as string[] | undefined) ||
    (isy.periodKeys as string[] | undefined)

  // Gerçekte verisi olan dönemlerin birleşimi
  const rawItems = (Array.isArray(isy?.items) ? isy.items : Object.values(isy?.items || {})) as any[]
  const hasData = new Set<string>()
  for (const it of rawItems) {
    const vals = it?.values || it?.data || {}
    for (const k of Object.keys(vals)) if (vals[k] != null) hasData.add(k)
  }

  const base = fromMeta?.length ? fromMeta : Array.from(hasData)
  // Sadece gerçekten veri olan dönemleri tut
  return base.filter(k => hasData.has(k))
}

function findItem(isy: Isy, needles: string[]) {
  const rawItems = (Array.isArray(isy.items) ? isy.items : Object.values(isy.items || {})) as any[]
  const ns = needles.map(norm)
  return rawItems.find((it: any) => {
    const tr = norm(it?.tr || it?.nameTR)
    const en = norm(it?.en || it?.nameEN)
    return ns.some(n => (tr && tr.includes(n)) || (en && en.includes(n)))
  })
}

function seriesFromIsy(isy: Isy, trNeedles: string[], takeLast = 8): BarItem[] {
  if (!isy) return []
  const target = findItem(isy, trNeedles)
  if (!target) return []
  const values = target.values || target.data || {}
  const keys = extractPeriodKeys(isy).filter(k => values[k] != null).slice(-takeLast)
  return keys.map(k => ({ year: k, value: toNum((values as any)[k]) }))
}

function pickLatestValue(isy: Isy, trNeedles: string[], key: string) {
  const target = findItem(isy, trNeedles)
  if (!target) return 0
  const values = target.values || target.data || {}
  if (values[key] != null) return toNum(values[key])
  // Seçili dönemde yoksa, en yakın geçmiş dolu döneme geri sar
  const keys = extractPeriodKeys(isy)
  for (let i = keys.lastIndexOf(key); i >= 0; i--) {
    const v = values[keys[i]]
    if (v != null) return toNum(v)
  }
  return 0
}

// --------- Bilanço ağaçları için etiketler ---------
const CURRENT_ASSET_LABELS = [
  'nakit ve nakit benzerleri',
  'finansal yatırımlar',
  'ticari alacaklar',
  'finans sektörü faaliyetlerinden alacaklar',
  'diğer alacaklar',
  'müşteri sözleşmelerinden doğan varlıklar',
  'stoklar',
  'canlı varlıklar',
  'diğer dönen varlıklar',
]
const NONCURRENT_ASSET_LABELS = [
  'ticari alacaklar',
  'finans sektörü faaliyetlerinden alacaklar',
  'diğer alacaklar',
  'müşteri sözleşmelerinden doğan varlıklar',
  'finansal yatırımlar',
  'özkaynak yöntemiyle değerlenen yatırımlar',
  'canlı varlıklar',
  'yatırım amaçlı gayrimenkuller',
  'stoklar',
  'kullanım hakkı varlıkları',
  'maddi duran varlıklar',
  'şerefiye',
  'maddi olmayan duran varlıklar',
  'ertelenmiş vergi varlığı',
  'diğer duran varlıklar',
]

const ST_LABELS = [
  // kısa vadeli yükümlülükler
  'finansal borçlar',
  'diğer finansal yükümlülükler',
  'ticari borçlar',
  'diğer borçlar',
  'müşteri söz. doğan yük.',
  'finans sektörü faaliyetlerinden borçlar',
  'devlet teşvik ve yardımları',
  'ertelenmiş gelirler (müşteri söz. doğan yük. dış.kal.)',
  'dönem karı vergi yükümlülüğü',
  'borç karşılıkları',
  'diğer kısa vadeli yükümlülükler',
]
const LT_LABELS = [
  // uzun vadeli yükümlülükler
  'finansal borçlar',
  'diğer finansal yükümlülükler',
  'ticari borçlar',
  'diğer borçlar',
  'müşteri söz.doğan yük.',
  'finans sektörü faaliyetlerinden borçlar',
  'devlet teşvik ve yardımları',
  'ertelenmiş gelirler (müşteri söz.doğan yük. dış.kal.)',
  'uzun vadeli karşılıklar',
  'çalışanlara sağlanan faydalara ilişkin karşılıklar',
  'ertelenmiş vergi yükümlülüğü',
  'diğer uzun vadeli yükümlülükler',
]
const EQUITY_LABELS = [
  'ödenmiş sermaye',
  'karşılıklı iştirak sermayesi düzeltmesi',
  'hisse senedi ihraç primleri',
  'değer artış fonları',
  'yabancı para çevrim farkları',
  'kardan ayrılan kısıtlanmış yedekler',
  'geçmiş yıllar kar/zararları',
  'dönem net kar/zararı',
  'diğer özsermaye kalemleri',
  'ana ortaklığa ait özkaynaklar',
  'azınlık payları',
]

// --------- Ağaç veri üretici ---------
function buildBalanceGroups(isy: Isy, key: string): { assets: GroupNode[]; liabilities: GroupNode[] } {
  // Treemap’te negatif gösteremeyiz; negatifleri filtrele
  const getMany = (labels: string[]) =>
    labels
      .map(lbl => ({ name: lbl, value: pickLatestValue(isy, [lbl], key) }))
      .filter(n => n.value > 0)

  const totalCurrent = pickLatestValue(isy, ['dönen varlıklar'], key)
  const totalNonCurrent = pickLatestValue(isy, ['duran varlıklar'], key)
  const heldForSale = pickLatestValue(isy, ['satış amacıyla elde tutulan duran varlıklar'], key)

  const currentChildren = getMany(CURRENT_ASSET_LABELS)
  const sumCurrent = currentChildren.reduce((a, b) => a + b.value, 0)
  const currentOther = Math.max(0, totalCurrent - sumCurrent)

  const nonCurrentChildren = getMany(NONCURRENT_ASSET_LABELS)
  const sumNonCurrent = nonCurrentChildren.reduce((a, b) => a + b.value, 0)
  const nonCurrentOther = Math.max(0, totalNonCurrent - sumNonCurrent)

  const assets: GroupNode[] = [
    { name: 'Dönen Varlıklar', children: [...currentChildren, ...(currentOther ? [{ name: 'Diğer Dönen', value: currentOther }] : [])] },
    { name: 'Duran Varlıklar', children: [...nonCurrentChildren, ...(nonCurrentOther ? [{ name: 'Diğer Duran', value: nonCurrentOther }] : [])] },
  ]
  if (heldForSale > 0) assets.push({ name: 'Satış Amaçlı Elde Tutulan', children: [{ name: 'Toplam', value: heldForSale }] })

  const totalST = pickLatestValue(isy, ['kısa vadeli yükümlülükler'], key)
  const totalLT = pickLatestValue(isy, ['uzun vadeli yükümlülükler'], key)
  const totalEQ = pickLatestValue(isy, ['özkaynaklar'], key)

  const stChildren = getMany(ST_LABELS)
  const ltChildren = getMany(LT_LABELS)
  const eqChildren = getMany(EQUITY_LABELS)

  const sumST = stChildren.reduce((a, b) => a + b.value, 0)
  const sumLT = ltChildren.reduce((a, b) => a + b.value, 0)
  const sumEQ = eqChildren.reduce((a, b) => a + b.value, 0)

  const stOther = Math.max(0, totalST - sumST)
  const ltOther = Math.max(0, totalLT - sumLT)
  const eqOther = Math.max(0, totalEQ - sumEQ)

  const liabilities: GroupNode[] = [
    { name: 'Kısa Vadeli Yükümlülükler', children: [...stChildren, ...(stOther ? [{ name: 'Diğer KVY', value: stOther }] : [])] },
    { name: 'Uzun Vadeli Yükümlülükler', children: [...ltChildren, ...(ltOther ? [{ name: 'Diğer UVY', value: ltOther }] : [])] },
    { name: 'Özkaynaklar', children: [...eqChildren, ...(eqOther ? [{ name: 'Diğer Özkaynak', value: eqOther }] : [])] },
  ]

  return { assets, liabilities }
}

// --------- Basit slice-and-dice treemap (SVG) ---------
function TreemapView({ groups, title }: { groups: GroupNode[]; title: string }) {
  const W = 1000,
    H = 420
  const total = groups.reduce((a, g) => a + g.children.reduce((s, c) => s + c.value, 0), 0)
  let x = 0
  const palette = ['#4F46E5', '#22C55E', '#06B6D4', '#F59E0B', '#EF4444', '#8B5CF6', '#10B981', '#3B82F6', '#E11D48', '#14B8A6']

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full rounded-xl">
      <defs>
        <linearGradient id="shade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.06" />
          <stop offset="100%" stopColor="#000000" stopOpacity="0.15" />
        </linearGradient>
      </defs>
      <rect x={0} y={0} width={W} height={H} rx={12} fill="#0B1327" />
      <text x={16} y={24} className="fill-slate-300 text-xs">
        {title}
      </text>
      {groups.map((g, gi) => {
        const gSum = g.children.reduce((s, c) => s + c.value, 0)
        const gW = total ? (gSum / total) * (W - 2) : 0
        const gx = x + 1
        const gy = 32
        const gh = H - 40
        x += gW
        let y = gy
        return (
          <g key={g.name}>
            <rect x={gx} y={gy - 20} width={gW - 2} height={16} fill="transparent" />
            <text x={gx + 4} y={gy - 8} className="fill-slate-400 text-[10px]">
              {g.name}
            </text>
            {g.children.map((c, ci) => {
              const ch = gSum ? (c.value / gSum) * gh : 0
              const cy = y
              y += ch
              const color = palette[(gi * 3 + ci) % palette.length]
              return (
                <g key={c.name}>
                  <rect x={gx} y={cy} width={Math.max(0, gW - 2)} height={Math.max(0, ch - 2)} fill={color} rx={8} style={{ transition: 'all 300ms ease' }} />
                  <rect x={gx} y={cy} width={Math.max(0, gW - 2)} height={Math.max(0, ch - 2)} fill="url(#shade)" rx={8} />
                  <title>{`${c.name}: ${fmt(c.value)} ₺`}</title>
                  {ch > 22 && gW > 120 && (
                    <text x={gx + 8} y={cy + 16} className="fill-white text-[10px] drop-shadow">
                      {c.name}
                    </text>
                  )}
                </g>
              )
            })}
          </g>
        )
      })}
    </svg>
  )
}

// --------- Sparkline (negatif destekli) ---------
function Sparkline({ data, color = '#246BFF', label }: { data: BarItem[]; color?: string; label: string }) {
  const W = 300,
    H = 80,
    pad = 8

  const vals = data.map(d => d.value)
  const minV = Math.min(0, ...vals)
  const maxV = Math.max(0, ...vals)
  const span = Math.max(1e-9, maxV - minV)

  const x = (i: number) => (i / Math.max(1, data.length - 1)) * (W - pad * 2) + pad
  const y = (v: number) => pad + ((maxV - v) / span) * (H - pad * 2)
  const y0 = y(0)

  const xs = data.map((_, i) => x(i))
  const ys = vals.map(v => y(v))
  const path = data.map((_, i) => `${i === 0 ? 'M' : 'L'} ${xs[i].toFixed(1)} ${ys[i].toFixed(1)}`).join(' ')
  const firstX = xs[0] ?? pad
  const lastX = xs[xs.length - 1] ?? W - pad

  return (
    <div className="rounded-2xl bg-[#0F162C] border border-[#2A355B] p-4">
      <div className="flex items-center justify-between text-slate-300 text-xs">
        <span className="opacity-80">{label}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-20 mt-2">
        <defs>
          <linearGradient id={`g-${label}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={color} stopOpacity={0.6} />
            <stop offset="95%" stopColor={color} stopOpacity={0.05} />
          </linearGradient>
        </defs>
        {/* 0 çizgisi */}
        <line x1={pad} x2={W - pad} y1={y0} y2={y0} stroke="#2A355B" strokeWidth={1} />
        {/* hat ve alan */}
        <path d={path} fill="none" stroke={color} strokeWidth={2} />
        <path d={`${path} L ${lastX} ${y0} L ${firstX} ${y0} Z`} fill={`url(#g-${label})`} opacity={0.35} />
      </svg>
    </div>
  )
}

// --------- Bar chart (negatif destekli, 0 çizgisiyle) ---------
function Bars({ data, label, color = '#F59E0B' }: { data: BarItem[]; label: string; color?: string }) {
  const vals = data.map(d => d.value)
  const minV = Math.min(0, ...vals)
  const maxV = Math.max(0, ...vals)
  const span = Math.max(1e-9, maxV - minV)
  const y0Pct = ((maxV - 0) / span) * 100 // top'tan yüzde

  return (
    <div className="rounded-2xl bg-[#0F162C] border border-[#2A355B] p-5">
      <h2 className="font-semibold">{label}</h2>
      <div className="mt-3 relative h-48">
        {/* 0 çizgisi */}
        <div className="absolute left-0 right-0" style={{ top: `${y0Pct}%`, height: 1, background: '#2A355B' }} />
        {/* barlar */}
        <div className="grid grid-cols-8 gap-2 items-stretch h-full">
          {data.map(d => {
            const hPct = (Math.abs(d.value) / span) * 100
            const topPct = d.value >= 0 ? y0Pct - hPct : y0Pct
            return (
              <div key={d.year} className="relative flex flex-col items-center gap-1">
                <div
                  className="absolute left-0 right-0 rounded-md"
                  style={{
                    top: `${Math.max(0, Math.min(100, topPct))}%`,
                    height: `${hPct}%`,
                    background: d.value >= 0 ? color : '#EF4444',
                    transition: 'top 400ms ease, height 400ms ease',
                  }}
                  title={`${fmt(d.value)}  ₺`}
                />
                <div className="absolute bottom-0 left-0 right-0 translate-y-4 text-[10px] text-slate-400 truncate text-center">{d.year}</div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export default function ClientCharts({ ticker, isy }: { ticker: string; isy: any }) {
  const periodKeys = useMemo(() => extractPeriodKeys(isy), [isy])
  const [periodIndex, setPeriodIndex] = useState(() => {
    // 'Toplam Varlıklar' dolu olan en son dönemi bul
    const lastIdxFromEnd = [...periodKeys].reverse().findIndex(k => pickLatestValue(isy, ['toplam varlıklar', 'total assets'], k) !== 0)
    const idx = lastIdxFromEnd >= 0 ? periodKeys.length - 1 - lastIdxFromEnd : periodKeys.length - 1
    return Math.max(0, idx)
  })
  const activeKey = periodKeys[periodIndex]

  // Seriler
  const sales = seriesFromIsy(isy, ['satış gelirleri', 'hasılat', 'satışlar'])
  const gross = seriesFromIsy(isy, ['brüt kar', 'brüt kâr'])
  const net = seriesFromIsy(isy, ['dönem net kar', 'dönem net kâr', 'dönem kar', 'net kar'])

  // Nakit akım
  const cfo = seriesFromIsy(isy, ['işletme faaliyetlerinden kaynaklanan net nakit'])
  const cfi = seriesFromIsy(isy, ['yatırım faaliyetlerinden kaynaklanan nakit'])
  const cff = seriesFromIsy(isy, ['finansman faaliyetlerden kaynaklanan nakit', 'finansman faaliyetlerinden kaynaklanan nakit'])

  const { assets, liabilities } = useMemo(() => buildBalanceGroups(isy, activeKey), [isy, activeKey])

  const topKPIs = [
    { label: 'Son Dönem Satış', value: last(sales)?.value, icon: '📈' },
    { label: 'Son Dönem Net Kâr', value: last(net)?.value, icon: '💰' },
    { label: 'Toplam Varlıklar', value: pickLatestValue(isy, ['toplam varlıklar', 'varlıklar toplamı', 'total assets'], activeKey), icon: '📦' },
    { label: 'Toplam Kaynaklar', value: pickLatestValue(isy, ['toplam kaynaklar', 'yükümlülükler ve özkaynaklar', 'total liabilities and equity'], activeKey), icon: '🏦' },
  ]

  // CFO/CFI/CFF grouped bar verisi (negatif destekli)
  const cashPeriods = cfo.map((s, i) => ({
    period: s.year,
    CFO: s.value,
    CFI: cfi[i]?.value ?? 0,
    CFF: cff[i]?.value ?? 0,
  }))
  const cashVals = cashPeriods.flatMap(p => [p.CFO, p.CFI, p.CFF])
  const cashMin = Math.min(0, ...cashVals)
  const cashMax = Math.max(0, ...cashVals)
  const cashSpan = Math.max(1e-9, cashMax - cashMin)
  const cashY0Pct = ((cashMax - 0) / cashSpan) * 100

  return (
    <div className="grid gap-5">
      {/* Üst KPI şerit */}
      <div className="grid gap-4 md:grid-cols-4">
        {topKPIs.map(k => (
          <div key={k.label} className="rounded-2xl bg-[#0F162C] border border-[#2A355B] p-4">
            <div className="flex items-center justify-between text-slate-300 text-xs">
              <span className="flex items-center gap-1 opacity-80">
                <span>{k.icon}</span>
                {k.label}
              </span>
            </div>
            <div className="mt-2 text-2xl font-semibold">
              {fmt(k.value)}
              <span className="text-sm opacity-60"> ₺</span>
            </div>
          </div>
        ))}
      </div>

      {/* Trendler: 3 sparkline */}
      <div className="grid gap-4 md:grid-cols-3">
        <Sparkline data={sales} color="#246BFF" label="Satış (₺)" />
        <Sparkline data={gross} color="#22C55E" label="Brüt Kâr (₺)" />
        <Sparkline data={net} color="#F59E0B" label="Net Kâr (₺)" />
      </div>

      {/* Nakit Akımı grouped bars (negatif/pozitif ayrı yön) */}
      <div className="rounded-2xl bg-[#0F162C] border border-[#2A355B] p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Nakit Akımı (₺)</h2>
        </div>
        <div className="mt-3 relative h-64">
          {/* 0 çizgisi */}
          <div className="absolute left-0 right-0" style={{ top: `${cashY0Pct}%`, height: 1, background: '#2A355B' }} />
          <div className="grid grid-cols-8 gap-2 h-full">
            {cashPeriods.map(p => {
              const mk = (v: number) => {
                const hPct = (Math.abs(v) / cashSpan) * 100
                const topPct = v >= 0 ? cashY0Pct - hPct : cashY0Pct
                return { hPct, topPct }
              }
              const a = mk(p.CFO)
              const b = mk(p.CFI)
              const c = mk(p.CFF)
              return (
                <div key={p.period} className="relative flex flex-col items-center">
                  {/* üç bar: CFO, CFI, CFF */}
                  <div
                    className="absolute rounded-md"
                    style={{ left: '4%', width: '28%', top: `${a.topPct}%`, height: `${a.hPct}%`, background: '#22C55E', transition: 'top 400ms ease, height 400ms ease' }}
                    title={`CFO: ${fmt(p.CFO)}  ₺`}
                  />
                  <div
                    className="absolute rounded-md"
                    style={{ left: '36%', width: '28%', top: `${b.topPct}%`, height: `${b.hPct}%`, background: '#EF4444', transition: 'top 400ms ease, height 400ms ease' }}
                    title={`CFI: ${fmt(p.CFI)} ₺`}
                  />
                  <div
                    className="absolute rounded-md"
                    style={{ left: '68%', width: '28%', top: `${c.topPct}%`, height: `${c.hPct}%`, background: '#06B6D4', transition: 'top 400ms ease, height 400ms ease' }}
                    title={`CFF: ${fmt(p.CFF)} ₺`}
                  />
                  <div className="absolute bottom-0 left-0 right-0 translate-y-4 text-[10px] text-slate-400 truncate text-center">{p.period}</div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Bilanço Treemap: dönem seçici + 2 sütun */}
      <div className="rounded-2xl bg-[#0F162C] border border-[#2A355B] p-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h2 className="font-semibold">Bilanço — Treemap (₺)</h2>
          <div className="flex items-center gap-2 text-xs">
            <span className="opacity-70">Dönem:</span>
            <select className="bg-transparent border border-[#2A355B] rounded-md px-2 py-1 text-slate-200" value={periodIndex} onChange={e => setPeriodIndex(Number(e.target.value))}>
              {periodKeys.map((k, idx) => (
                <option key={k} value={idx} className="bg-[#0B0D16]">
                  {k}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="mt-3 grid md:grid-cols-2 gap-4 h-[480px]">
          <TreemapView groups={assets} title="Varlıklar" />
          <TreemapView groups={liabilities} title="Kaynaklar" />
        </div>
        <div className="mt-2 text-xs opacity-70">Kutucuk alanı kalem büyüklüğünü gösterir. Dönemi değiştirerek dağılımları karşılaştırabilirsiniz.</div>
      </div>

      {/* Net Kâr barları */}
      <Bars data={net} label="Net Kâr (Son 8 Dönem)" color="#F59E0B" />
    </div>
  )
}
