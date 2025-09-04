import fs from 'node:fs/promises'
import path from 'node:path'

type Period = { y: number; p: 3|6|9|12 }
type ApiRow = { itemCode?: string; itemDescTr?: string; itemDescEng?: string } & Record<string, any>

const GROUP = process.argv[2] || 'XI_29'   // finansal grup
const EXCH  = process.argv[3] || 'TRY'     // para birimi
const MODE_ALL = process.argv.includes('--all')
const BACKFILL = 4                         // revizyonlar için son 4 dönemi tekrar yaz

function nowEnd(): Period {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth()+1
  const p: 3|6|9|12 = m <= 3 ? 3 : m <= 6 ? 6 : m <= 9 ? 9 : 12
  return { y, p }
}
function periodsBetweenInclusive(a: Period, b: Period): Period[] {
  const out: Period[] = []
  const order: (3|6|9|12)[] = [3,6,9,12]
  for (let y = a.y; y <= b.y; y++) {
    for (const p of order) {
      if (y === a.y && p < a.p) continue
      if (y === b.y && p > b.p) break
      out.push({ y, p })
    }
  }
  return out
}
function prevPeriods(from: Period, n: number): Period[] {
  const seq: Period[] = []
  let { y, p } = from
  const order: (3|6|9|12)[] = [3,6,9,12]
  let idx = order.indexOf(p)
  for (let i=0;i<n;i++){
    idx--
    if (idx < 0){ idx = 3; y-- }
    seq.push({ y, p: order[idx] })
  }
  return seq.reverse()
}
function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

async function fetch4(ticker: string, group: string, exch: string, quad: Period[]) {
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
  return { value }
}

function keyOf(p: Period){ return `${p.y}/${p.p}` }

async function updateOne(ticker: string, group: string, exch: string) {
  const T = ticker.toUpperCase()
  const outDir = path.join(process.cwd(), 'public', 'isyatirim', T)
  const outFile = path.join(outDir, 'mali-tablo.json')

  // varsa eski dosyayı oku
  let existing: any | null = null
  try {
    const raw = await fs.readFile(outFile, 'utf8')
    existing = JSON.parse(raw)
  } catch {}

  // hiç yoksa: ilk kez — 2008/3’ten al
  if (!existing) {
    console.log(`• ${T}: yerel dosya yok → full fetch (ilk kurulum)`)
    const baseScript = path.join(process.cwd(), 'scripts', 'isyatirim-all.ts')
    // basitçe mevcut full scripti çağırmak istiyoruz; ama bu dosya Node’dan çağrılamıyor olabilir.
    // O yüzden burada küçük bir "full" rutini yazalım:
    const start: Period = { y: 2008, p: 3 }
    const end = nowEnd()
    const periods = periodsBetweenInclusive(start, end)
    const chunks = chunk(periods, 4)
    await fs.mkdir(outDir, { recursive: true })
    const items: Record<string, { code?: string; tr?: string; en?: string; values: Record<string, number|null> }> = {}
    for (let ci = 0; ci < chunks.length; ci++) {
      const quad = chunks[ci]
      process.stdout.write(`  → ${T} full ${ci+1}/${chunks.length} [${quad.map(keyOf).join(', ')}]… `)
      const { value } = await fetch4(T, group, exch, quad)
      for (const row of value) {
        const key = (row.itemCode || row.itemDescTr || row.itemDescEng || '').toString()
        if (!items[key]) items[key] = { code: row.itemCode, tr: row.itemDescTr, en: row.itemDescEng, values: {} }
        quad.forEach((q, i) => {
          const v = row[`value${i+1}`]
          items[key].values[keyOf(q)] = (v === null || v === undefined || v === '') ? null : Number(v)
        })
      }
      console.log('ok')
      await sleep(400)
    }
    const periodKeys = periods.map(keyOf)
    const output = {
      meta: { ticker: T, group, currency: exch, fetchedAt: new Date().toISOString(), periodKeys },
      items,
    }
    await fs.writeFile(outFile, JSON.stringify(output, null, 2), 'utf8')
    console.log(`✔ Yazıldı: ${outFile}`)
    return
  }

  // var → son dönemden itibaren sadece eksikleri al (revizyon için BACKFILL)
  const periodKeys: string[] = existing?.meta?.periodKeys || []
  if (!periodKeys.length) throw new Error(`${T}: mevcut dosyada periodKeys yok.`)

  const lastKey = periodKeys[periodKeys.length - 1]
  const [ly, lp] = lastKey.split('/').map(Number) as [number, 3|6|9|12]
  const last: Period = { y: ly, p: lp }

  const end = nowEnd()

  // zaten güncel mi?
  if (last.y === end.y && last.p === end.p) {
    console.log(`• ${T}: güncel (${lastKey})`)
    return
  }

  // BACKFILL kadar geçmişe gidip bugüne kadar getir
  const back = prevPeriods(last, Math.max(0, BACKFILL-1))
  const start = back.length ? back[0] : last
  const allNeeded = periodsBetweenInclusive(start, end)

  const chunks = chunk(allNeeded, 4)
  console.log(`• ${T}: güncelleme → ${keyOf(start)} → ${keyOf(end)} (çağrı sayısı=${chunks.length})`)

  const items: typeof existing.items = existing.items || {}
  for (let ci = 0; ci < chunks.length; ci++) {
    const quad = chunks[ci]
    process.stdout.write(`  → ${ci+1}/${chunks.length} [${quad.map(keyOf).join(', ')}]… `)
    try {
      const { value } = await fetch4(T, group, exch, quad)
      for (const row of value) {
        const key = (row.itemCode || row.itemDescTr || row.itemDescEng || '').toString()
        if (!items[key]) items[key] = { code: row.itemCode, tr: row.itemDescTr, en: row.itemDescEng, values: {} as any }
        quad.forEach((q, i) => {
          const v = row[`value${i+1}`]
          items[key].values[keyOf(q)] = (v === null || v === undefined || v === '') ? null : Number(v)
        })
      }
      console.log('ok')
    } catch (e: any) {
      console.log('hata:', e?.message || e)
    }
    await sleep(400)
  }

  // periodKeys’i birleştir + sırala
  const union = new Set<string>([...periodKeys, ...allNeeded.map(keyOf)])
  const sorted = Array.from(union).sort((a, b) => {
    const [ya, pa] = a.split('/').map(Number)
    const [yb, pb] = b.split('/').map(Number)
    return ya - yb || pa - pb
  })

  const output = {
    meta: { ticker: existing.meta?.ticker || T, group, currency: exch, fetchedAt: new Date().toISOString(), periodKeys: sorted },
    items,
  }

  await fs.mkdir(outDir, { recursive: true })
  await fs.writeFile(outFile, JSON.stringify(output, null, 2), 'utf8')
  console.log(`✔ Güncellendi: ${outFile}`)
}

async function main() {
  if (MODE_ALL) {
    const tfile = path.join(process.cwd(), 'data', 'tickers.txt')
    const raw = await fs.readFile(tfile, 'utf8')
    const list = raw.split(/\r?\n/).map(s => s.trim()).filter(Boolean)
    console.log(`Toplam ${list.length} sembol (inkremental)`)
    for (const t of list) {
      await updateOne(t, GROUP, EXCH)
    }
  } else {
    const T = (process.argv[4] || process.argv[2] || '').toUpperCase()
    if (!T || ['XI_29','CONSOL','TRY','USD','EUR'].includes(T)) {
      console.log('Kullanım:')
      console.log('  npx tsx scripts/isyatirim-incremental.ts XI_29 TRY SASA')
      console.log('  npx tsx scripts/isyatirim-incremental.ts --all            # data/tickers.txt için')
      process.exit(1)
    }
    await updateOne(T, GROUP, EXCH)
  }
}
main().catch(err => { console.error(err); process.exit(1) })
