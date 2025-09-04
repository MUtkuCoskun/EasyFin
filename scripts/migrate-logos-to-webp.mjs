// logos/*.png -> logos/*.webp ve logos/s/*.webp üret + yükle (Firebase Storage / GCS)
// Bucket: finai-a381b.firebasestorage.app

import fs from 'fs/promises'
import path from 'path'
import admin from 'firebase-admin'
import sharp from 'sharp'
import pLimit from 'p-limit'

const ROOT = process.cwd()
// BUCKET ADI SENDE SABİT:
const BUCKET_NAME = 'finai-a381b.firebasestorage.app' // <— önemli: appspot.com DEĞİL

async function initFirebase() {
  // Servis hesabı: env varsa onu kullan; yoksa proje kökünde serviceAccountKey.json
  const credPath =
    process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    path.join(ROOT, 'serviceAccountKey.json')

  const svc = JSON.parse(await fs.readFile(credPath, 'utf8'))

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(svc),
      storageBucket: BUCKET_NAME, // <— burada da sabit
    })
  }
  // İSİMLE AÇ (emin olalım)
  return admin.storage().bucket(BUCKET_NAME)
}

function publicUrl(bucketName, objectPath) {
  // HTTP erişimi
  return `https://storage.googleapis.com/${bucketName}/${objectPath}`
}

async function toWebp(buf, size = 512) {
  return sharp(buf)
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .webp({ quality: 82, effort: 4 })
    .toBuffer()
}

async function main() {
  const bucket = await initFirebase()

  // Hızlı kontrol: doğru bucketa bağlı mıyız?
  if (bucket.name !== BUCKET_NAME) {
    throw new Error(`Yanlış bucket: '${bucket.name}'. Beklenen: '${BUCKET_NAME}'`)
  }
  console.log('Bucket OK →', bucket.name)

  // Eski index’ten isimleri taşıyalım (varsa)
  const namesMap = new Map()
  try {
    const idx = bucket.file('bist/index.json')
    const [exists] = await idx.exists()
    if (exists) {
      const [buf] = await idx.download()
      const arr = JSON.parse(buf.toString('utf8'))
      for (const it of arr) namesMap.set(String(it.symbol).toUpperCase(), it.name || '')
      console.log('Eski index.json okundu, isimler taşınacak.')
    }
  } catch { /* isim yoksa sorun değil */ }

  // 1) logos/ altında PNG’leri bul
  const [files] = await bucket.getFiles({ prefix: 'logos/' })
  const pngs = files
    .filter(f => f.name.toLowerCase().endsWith('.png'))
    .filter(f => !f.name.toLowerCase().startsWith('logos/s/'))

  console.log(`Bulunan PNG sayısı: ${pngs.length}`)
  if (!pngs.length) {
    console.log('PNG bulunamadı. Çıkıyorum.')
    return
  }

  const limit = pLimit(8)
  const indexItems = []
  let ok = 0, fail = 0

  await Promise.all(pngs.map(f => limit(async () => {
    const symbol = f.name.split('/').pop().replace(/\.png$/i, '').toUpperCase()
    try {
      const [buf] = await f.download()

      // 2) webp büyük + küçük üret
      const webp512 = await toWebp(buf, 512)
      const webp64  = await toWebp(buf, 64)

      // 3) kaydet + public + uzun cache
      const bigPath = `logos/${symbol}.webp`
      const smlPath = `logos/s/${symbol}.webp`

      await bucket.file(bigPath).save(webp512, {
        contentType: 'image/webp',
        resumable: false,
        metadata: { cacheControl: 'public, max-age=31536000, immutable' },
      })
      await bucket.file(smlPath).save(webp64, {
        contentType: 'image/webp',
        resumable: false,
        metadata: { cacheControl: 'public, max-age=31536000, immutable' },
      })
      await bucket.file(bigPath).makePublic()
      await bucket.file(smlPath).makePublic()

      indexItems.push({
        symbol,
        name: namesMap.get(symbol) || '',
        logoUrl:  publicUrl(bucket.name, bigPath),              // büyük webp
        logoSmall: publicUrl(bucket.name, smlPath),             // küçük webp
        logoPng: publicUrl(bucket.name, `logos/${symbol}.png`), // yedek png
      })

      ok++
      process.stdout.write(`✔ ${symbol}\n`)
    } catch (e) {
      fail++
      process.stdout.write(`✖ ${symbol} (${e?.message || e})\n`)
    }
  })))

  // 4) index.json’ı yaz (yerel + bucket)
  indexItems.sort((a,b)=> a.symbol.localeCompare(b.symbol, 'tr'))
  const json = JSON.stringify(indexItems, null, 2)
  await fs.writeFile(path.join(ROOT, 'data', 'index.json'), json, 'utf8')

  const idx = bucket.file('bist/index.json')
  await idx.save(Buffer.from(json, 'utf8'), {
    contentType: 'application/json; charset=utf-8',
    resumable: false,
    metadata: { cacheControl: 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400' },
  })
  await idx.makePublic()

  console.log('\n— Özet —')
  console.log('WEBP yazıldı:', ok, 'Hata:', fail)
  console.log('index.json güncellendi: gs://%s/bist/index.json', bucket.name)
}

main().catch(e => { console.error(e); process.exit(1) })
