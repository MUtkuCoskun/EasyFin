import { getBucket, readText, writeJson } from './cloud'

export type BistItem = { symbol: string; name: string; logoUrl: string }

// HMR'de kalıcı cache (server process içinde)
const g = globalThis as any
g.__BIST_CACHE ??= new Map<string, { at: number; data: any }>()
const CACHE: Map<string, { at: number; data: any }> = g.__BIST_CACHE
const TTL = +(process.env.BIST_INDEX_TTL ?? 3600_000) // 1 saat

function getC<T>(k: string): T | null {
  const c = CACHE.get(k)
  if (!c) return null
  if (Date.now() - c.at > TTL) { CACHE.delete(k); return null }
  return c.data as T
}
function putC<T>(k: string, v: T) { CACHE.set(k, { at: Date.now(), data: v }) }

export async function loadBistLogos(): Promise<BistItem[]> {
  const CK = 'bist:index'
  const hit = getC<BistItem[]>(CK)
  if (hit) return hit

  const bucket = getBucket()
  const indexFile = bucket.file('bist/index.json')

  // 1) Bucket'ta hazır index varsa: tek obje indir, bitti
  const [exists] = await indexFile.exists()
  if (exists) {
    const json = await readText(indexFile)
    const out = normalize(JSON.parse(json))
    putC(CK, out)
    return out
  }

  // 2) Yoksa logos/ klasöründen hızlıca kur, ardından index.json'u yaz
  const out = await buildFromLogosFolder(bucket)
  putC(CK, out)
  // Arka planda yaz (isteği bekletme)
  writeJson('bist/index.json', out).catch(() => {})
  return out
}

function normalize(data: Array<{ symbol: string; name?: string; logoUrl: string }>): BistItem[] {
  const m = new Map<string, BistItem>()
  for (const it of data) {
    const s = (it.symbol || '').toUpperCase().trim()
    if (!s) continue
    if (!m.has(s)) m.set(s, { symbol: s, name: it.name || '', logoUrl: it.logoUrl })
  }
  return Array.from(m.values()).sort((a, b) => a.symbol.localeCompare(b.symbol, 'tr'))
}

async function buildFromLogosFolder(bucket: any): Promise<BistItem[]> {
  const [files] = await bucket.getFiles({ prefix: 'logos/' })
  const pngs = files.filter((f: any) => f.name.toLowerCase().endsWith('.png'))

  const metas = await withLimit(pngs, 16, async (f: any) => {
    try {
      const [m] = await f.getMetadata()
      const tokRaw = (m.metadata?.firebaseStorageDownloadTokens ?? '') as string
      const tok = typeof tokRaw === 'string' ? tokRaw.split(',')[0] : ''
      if (!tok) return null
      return { name: f.name as string, tok }
    } catch { return null }
  })

  const items: BistItem[] = []
  for (const mm of metas) {
    if (!mm) continue
    const symbol = mm.name.split('/').pop()!.replace(/\.png$/i, '').toUpperCase()
    const enc = encodeURIComponent(mm.name)
    const url = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${enc}?alt=media&token=${mm.tok}`
    items.push({ symbol, name: '', logoUrl: url })
  }

  items.sort((a, b) => a.symbol.localeCompare(b.symbol, 'tr'))
  return items
}

async function withLimit<T, R>(
  list: T[],
  limit: number,
  fn: (x: T) => Promise<R>
): Promise<R[]> {
  let i = 0
  const res: R[] = new Array(list.length) as any
  const workers = Array(Math.min(limit, list.length))
    .fill(0)
    .map(async () => {
      while (true) {
        const idx = i++
        if (idx >= list.length) break
        res[idx] = await fn(list[idx])
      }
    })
  await Promise.all(workers)
  return res
}
