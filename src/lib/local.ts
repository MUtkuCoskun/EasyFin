import { getBucket } from './firebase'

async function readJsonFromBucket<T = any>(
  objectPath: string
): Promise<T | null> {
  try {
    const bucket = await getBucket()
    const file = bucket.file(objectPath)
    const [exists] = await file.exists()
    if (!exists) return null
    const [buf] = await file.download()
    return JSON.parse(buf.toString('utf8')) as T
  } catch {
    return null
  }
}

// İş Yatırım (sadece Firebase)
export async function loadLocalIsy(symbol: string) {
  const s = symbol.toUpperCase()
  return await readJsonFromBucket(`isyatirim/${s}.json`)
}

// KAP (sadece Firebase)
export async function loadLocalKap(symbol: string) {
  const s = symbol.toUpperCase()
  return (
    (await readJsonFromBucket(`kap/${s}.json`)) ||
    (await readJsonFromBucket(`kap/${s}/latest.json`))
  )
}
