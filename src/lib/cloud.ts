// src/lib/cloud.ts
import admin from 'firebase-admin'
import fs from 'fs'
import path from 'path'

/* ------------ Firebase Bucket ------------ */
function ensureApp() {
  if (admin.apps.length) return
  const credPath =
    process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    path.join(process.cwd(), 'serviceAccountKey.json')
  const svc = JSON.parse(fs.readFileSync(credPath, 'utf8'))

  const bucketName =
    process.env.FIREBASE_STORAGE_BUCKET || 'finai-a381b.firebasestorage.app'

  admin.initializeApp({
    credential: admin.credential.cert(svc),
    storageBucket: bucketName,
  })
}

export function getBucket(): any {
  ensureApp()
  const bucketName =
    process.env.FIREBASE_STORAGE_BUCKET || 'finai-a381b.firebasestorage.app'
  return admin.storage().bucket(bucketName)
}

export async function readText(file: any) {
  const [buf] = await file.download()
  return buf.toString('utf8')
}

export async function writeJson(objectPath: string, data: unknown) {
  const b = getBucket()
  const f = b.file(objectPath)
  const json = JSON.stringify(data, null, 2)
  await f.save(Buffer.from(json, 'utf8'), {
    contentType: 'application/json; charset=utf-8',
    resumable: false,
    // kısa cache: 5 dk (edge ve tarayıcı); gerekirse artır
    metadata: { cacheControl: 'public, max-age=300, s-maxage=300, stale-while-revalidate=86400' },
  })
}

/* ------------ Basit hafıza cache (5 dk) ------------ */
const g: any = globalThis as any
g.__CLOUD_CACHE ??= new Map<string, { at: number; data: any }>()
const CLOUD_CACHE: Map<string, { at: number; data: any }> = g.__CLOUD_CACHE
const TTL_MS = 300_000 // 5 dakika

function getCache<T>(key: string): T | null {
  const hit = CLOUD_CACHE.get(key)
  if (!hit) return null
  if (Date.now() - hit.at > TTL_MS) { CLOUD_CACHE.delete(key); return null }
  return hit.data as T
}
function putCache<T>(key: string, data: T) {
  CLOUD_CACHE.set(key, { at: Date.now(), data })
}

/* ------------ Yardımcı: JSON oku ------------ */
async function tryJson(pathOrFile: string | any): Promise<any | null> {
  const f = typeof pathOrFile === 'string' ? getBucket().file(pathOrFile) : pathOrFile
  const [exists] = await f.exists()
  if (!exists) return null
  try { return JSON.parse(await readText(f)) } catch { return null }
}

/* ------------ SADECE İş Yatırım ------------ */
export async function loadIsy(ticker: string) {
  const t = (ticker || '').toUpperCase()
  const CK = `isy:${t}`
  const cached = getCache<any>(CK)
  if (cached) return cached

  // En hızlı bilinen yol (script’lerin yazdığı standart dosya)
  let data =
    (await tryJson(`isyatirim/${t}/mali-tablo.json`)) ||
    (await tryJson(`isyatirim/${t}.json`)) ||
    (await tryJson(`isyatirim/${t}`))

  // Son çare: klasördeki ilk .json (yavaş olabilir)
  if (!data) {
    const b = getBucket()
    const [files] = await b.getFiles({ prefix: `isyatirim/${t}/` })
    const jf = files.find((x: any) => x.name.toLowerCase().endsWith('.json'))
    data = jf ? await tryJson(jf) : null
  }

  if (data) putCache(CK, data)
  return data
}

// KAP tamamen kaldırıldı
