// scripts/build-logos.mjs
import fs from 'fs/promises'
import path from 'path'
import crypto from 'crypto'
import axios from 'axios'
import sharp from 'sharp'
import pLimit from 'p-limit'
import admin from 'firebase-admin'

const ROOT = process.cwd()
const TICKERS_PATH = path.join(ROOT, 'data', 'tickers.txt')
const SOURCE_MAIN  = path.join(ROOT, 'data', 'logos-source.json')
const SOURCE_ALT   = path.join(ROOT, 'data', 'bist-logo.json')
const OUT_INDEX    = path.join(ROOT, 'data', 'index.json')

async function fileExists(p){ try { await fs.access(p); return true } catch { return false } }

async function loadSources() {
  const maps = []
  const names = new Map()
  async function add(file) {
    if (!(await fileExists(file))) return
    const raw = JSON.parse(await fs.readFile(file, 'utf8'))
    const m = new Map()
    for (const it of raw) {
      const s = it?.symbol?.toUpperCase()
      if (!s) continue
      if (it?.logoUrl) m.set(s, it.logoUrl)
      if (it?.name) names.set(s, it.name)
    }
    maps.push(m)
  }
  await add(SOURCE_ALT)  // öncelik
  await add(SOURCE_MAIN)

  const merged = new Map()
  for (const m of maps) for (const [k,v] of m) if (!merged.has(k)) merged.set(k, v)
  return { logoMap: merged, nameMap: names }
}

async function readTickers(){
  const raw = await fs.readFile(TICKERS_PATH, 'utf8')
  return raw.split(/\r?\n/).map(s=>s.trim()).filter(Boolean)
}

function svgPlaceholder(sym){
  const h = crypto.createHash('md5').update(sym).digest()
  const bg = `rgb(${160+(h[0]%80)},${160+(h[1]%80)},${160+(h[2]%80)})`
  const txt = sym.replace(/[^A-Z]/gi,'').toUpperCase().slice(0,3) || sym.toUpperCase().slice(0,3)
  const fontSize = txt.length === 1 ? 280 : (txt.length === 2 ? 240 : 200)
  return Buffer.from(
`<svg width="512" height="512" xmlns="http://www.w3.org/2000/svg">
  <rect width="512" height="512" fill="${bg}"/>
  <text x="50%" y="50%" font-family="Inter, Arial, sans-serif" font-weight="700"
        font-size="${fontSize}" fill="#000" text-anchor="middle" dominant-baseline="central" opacity="0.2">${txt}</text>
  <text x="50%" y="50%" font-family="Inter, Arial, sans-serif" font-weight="700"
        font-size="${fontSize}" fill="#fff" text-anchor="middle" dominant-baseline="central">${txt}</text>
</svg>`)
}

async function downloadImage(url){
  const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 15000, validateStatus: s=>s>=200 && s<400 })
  return Buffer.from(res.data)
}

async function toPng512(buf){
  return sharp(buf).resize(512,512,{ fit:'contain', background:{r:0,g:0,b:0,alpha:0}})
    .png({ compressionLevel:9 }).toBuffer()
}

async function initFirebase(){
  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(ROOT, 'serviceAccountKey.json')
  const svc = JSON.parse(await fs.readFile(credPath, 'utf8'))
  const bucketName = process.env.FIREBASE_STORAGE_BUCKET || `${svc.project_id}.appspot.com`
  if (!admin.apps.length){
    admin.initializeApp({ credential: admin.credential.cert(svc), storageBucket: bucketName })
  }
  return admin.storage().bucket()
}

function publicUrl(bucketName, objectPath){
  return `https://storage.googleapis.com/${bucketName}/${objectPath}`
}

async function main(){
  const { logoMap, nameMap } = await loadSources()
  const tickers = await readTickers()
  const bucket = await initFirebase()

  const limit = pLimit(8)
  let ok=0, placeholders=0, failed=0
  const indexItems = []

  await Promise.all(tickers.map(sym => limit(async () => {
    const symbol = sym.toUpperCase()
    const objectPath = `logos/${symbol}.png`
    try{
      let png
      if(logoMap.has(symbol)){
        try{
          png = await toPng512(await downloadImage(logoMap.get(symbol)))
        } catch {
          png = await sharp(svgPlaceholder(symbol)).png().toBuffer()
          placeholders++
        }
      } else {
        png = await sharp(svgPlaceholder(symbol)).png().toBuffer()
        placeholders++
      }

      const file = bucket.file(objectPath)
      await file.save(png, {
        contentType:'image/png',
        resumable:false,
        metadata: { cacheControl: 'public, max-age=31536000, immutable' },
      })
      await file.makePublic()

      const url = publicUrl(bucket.name, objectPath)
      indexItems.push({ symbol, name: nameMap.get(symbol) || '', logoUrl: url })
      ok++
      process.stdout.write(`✔ ${symbol}\n`)
    }catch(e){
      failed++
      process.stdout.write(`✖ ${symbol} (${e?.message || e})\n`)
    }
  })))

  indexItems.sort((a,b)=> a.symbol.localeCompare(b.symbol))
  await fs.writeFile(OUT_INDEX, JSON.stringify(indexItems, null, 2), 'utf8')

  // index.json'ı da public & cache’li yükle
  const idx = bucket.file('bist/index.json')
  await idx.save(JSON.stringify(indexItems), {
    contentType: 'application/json; charset=utf-8',
    resumable: false,
    metadata: { cacheControl: 'public, max-age=3600, s-maxage=3600' },
  })
  await idx.makePublic()

  console.log('\n— Özet —')
  console.log('Toplam:', tickers.length, 'Yüklendi:', ok, 'Placeholder:', placeholders, 'Hata:', failed)
  console.log('Index upload: gs://%s/bist/index.json', bucket.name)
}

main().catch(e=>{ console.error(e); process.exit(1); })
