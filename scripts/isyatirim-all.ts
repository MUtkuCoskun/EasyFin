// scripts/isyatirim-all.ts
// Kullanım:
//   npx tsx scripts/isyatirim-all.ts SASA XI_29 TRY 2008 3
//   (ticker, grup, kur, başlangıç yıl/period (3/6/9/12))
// Not: group için yaygın değer: XI_29 (solo), CONSOL (konsolide) vs. Şirkete göre değişebilir.

import fs from 'node:fs/promises'
import path from 'node:path'

const TICKER = (process.argv[2] || 'SASA').toUpperCase()
const GROUP = process.argv[3] || 'XI_29'    // finansal grup
const EXCH  = process.argv[4] || 'TRY'      // para birimi
const START_YEAR   = Number(process.argv[5] || 2008)
const START_PERIOD = Number(process.argv[6] || 3) // 3,6,9,12
const OUT_DIR = path.join(process.cwd(), 'public', 'isyatirim', TICKER)

type Period = { y: number; p: 3|6|9|12 }
type ApiRow = { itemCode?: string; itemDescTr?: string; itemDescEng?: string } & Record<string, any>

function periodsAsc(startY: number, startP: 3|6|9|12): Period[] {
  const ps: Period[] = []
  const periods = [3,6,9,12] as const
  const now = new Date()
  const endY = now.getFullYear()
  const endP = ((): 3|6|9|12 => {
    const m = now.getMonth()+1
    if (m <= 3) return 3
    if (m <= 6) return 6
    if (m <= 9) return 9
    return 12
  })()
  for (let y = startY; y <= endY; y++) {
    for (const p of periods) {
      if (y === startY && p < startP) continue
      if (y === endY && p > endP) break
      ps.push({ y, p })
    }
  }
  return ps
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

async function ensureDir(p: string) { await fs.mkdir(p, { recursive: true }) }
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

async function fetch4(ticker: string, group: string, exch: string, quad: Period[]) {
  // quad uzunluğu 1-4 arası olabilir
  const qp: string[] = []
  quad.forEach((q, i) => {
    const n = i+1
    qp.push(`year${n}=${q.y}`, `period${n}=${q.p}`)
  })
  const url = `https://www.isyatirim.com.tr/_layouts/15/IsYatirim.Website/Common/Data.aspx/MaliTablo?companyCode=${encodeURIComponent(ticker)}&exchange=${encodeURIComponent(exch)}&financialGroup=${encodeURIComponent(group)}&${qp.join('&')}`

  const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0' } })
  if (!res.ok) throw new Error(`HTTP ${res.status} on ${url}`)
  const json = await res.json() as any
  const value = (json?.value ?? []) as ApiRow[]
  return { value, url }
}

async function run() {
  await ensureDir(OUT_DIR)
  const periods = periodsAsc(START_YEAR, START_PERIOD as 3|6|9|12)
  const chunks = chunk(periods, 4)

  console.log(`İş Yatırım: ${TICKER} | grup=${GROUP} | ${EXCH} | dönem sayısı=${periods.length} (4'lü çağrılar=${chunks.length})`)

  // Sonuçları şu formda toplayacağız:
  // items[key] = { code, tr, en, values: { 'YYYY/P': number } }
  const items: Record<string, { code?: string; tr?: string; en?: string; values: Record<string, number|null> }> = {}

  for (let ci = 0; ci < chunks.length; ci++) {
    const quad = chunks[ci]
    const label = quad.map(q => `${q.y}/${q.p}`).join(', ')
    process.stdout.write(`→ Çağrı ${ci+1}/${chunks.length} [${label}]… `)
    try {
      const { value } = await fetch4(TICKER, GROUP, EXCH, quad)
      // Her satır: value1..value4 ile geliyor. Bunları quad ile eşle.
      for (const row of value) {
        const key = (row.itemCode || row.itemDescTr || row.itemDescEng || '').toString()
        if (!items[key]) items[key] = { code: row.itemCode, tr: row.itemDescTr, en: row.itemDescEng, values: {} }
        quad.forEach((q, i) => {
          const v = row[`value${i+1}`]
          const k = `${q.y}/${q.p}`
          items[key].values[k] = (v === null || v === undefined || v === '') ? null : Number(v)
        })
      }
      console.log('ok')
    } catch (e: any) {
      console.log('hata:', e?.message || e)
    }
    await sleep(400) // nazik yavaşlatma
  }

  // Period anahtarlarını sıralı listele
  const periodKeys = periods.map(p => `${p.y}/${p.p}`)

  const output = {
    meta: {
      ticker: TICKER,
      group: GROUP,
      currency: EXCH,
      fetchedAt: new Date().toISOString(),
      periodKeys,
    },
    items,
  }

  const outFile = path.join(OUT_DIR, 'mali-tablo.json')
  await fs.writeFile(outFile, JSON.stringify(output, null, 2), 'utf8')
  console.log(`✔ Yazıldı: ${outFile}`)
}

run().catch(err => { console.error(err); process.exit(1) })
