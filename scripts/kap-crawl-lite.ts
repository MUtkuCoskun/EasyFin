// scripts/kap-crawl-lite.ts
import { chromium } from 'playwright'
import fs from 'node:fs/promises'
import path from 'node:path'

const BASE = 'https://www.kap.org.tr'
const TICKER = (process.argv[2] || 'SASA').toUpperCase()
const OUT_DIR = path.join(process.cwd(), 'public', 'kap', TICKER)

function opTitle(t = '') {
  t = t.toLowerCase()
  return t.includes('faaliyet raporu') || t.includes('yıllık faaliyet') || t.includes('operating review') || t.includes('annual report')
}
function finTitle(t = '') {
  t = t.toLowerCase()
  return t.includes('finansal') || t.includes('mali tablo') || t.includes('konsolide') || t.includes('financial statement') || t.includes('bağımsız denetim')
}
async function ensureDir(p: string) { await fs.mkdir(p, { recursive: true }) }
async function save(file: string, buf: ArrayBuffer) { await fs.writeFile(file, Buffer.from(buf)) }
const wait = (ms: number) => new Promise(r => setTimeout(r, ms))

async function run() {
  await ensureDir(OUT_DIR)
  const browser = await chromium.launch({ headless: process.env.HEADFUL === '1' ? false : true })
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36',
    locale: 'tr-TR',
  })
  const page = await ctx.newPage()
  console.log('1) Ana sayfa açılıyor…')
  await page.goto(`${BASE}/tr`, { waitUntil: 'domcontentloaded' })

  console.log('2) Liste çekiliyor (sayfa içinden fetch)…')
  const rows = (await page.evaluate(async (ticker: string) => {
    const body = {
      disclosureClass: 'FR',
      term: ticker,
      subjectList: [],
      fromSrc: 'Y',
      srcCategory: '4',
      bdkMemberOidList: [],
      inactiveMkkMemberOidList: [],
      mkkMemberOidList: [],
      discIndex: [],
      fromDate: '', toDate: '', year: '', prd: '', index: '',
    }
    const r = await fetch('/tr/api/memberDisclosureQuery', {
      method: 'POST',
      headers: { 'content-type': 'application/json;charset=UTF-8' },
      body: JSON.stringify(body),
    })
    if (!r.ok) throw new Error('Liste alınamadı')
    const list = (await r.json()) as any[]
    const uniq = new Map(list.map((x: any) => [String(x.disclosureIndex), x]))
    return Array.from(uniq.values()).sort((a: any, b: any) => Number(b.disclosureIndex) - Number(a.disclosureIndex))
  }, TICKER)) as any[]

  console.log(`Toplam bildirim: ${rows.length}`)
  const financial: any[] = []
  const operating: any[] = []

  for (const item of rows) {
    const id = String(item.disclosureIndex)
    const url = `${BASE}/tr/Bildirim/${id}`
    console.log(`→ #${id} açılıyor…`)
    await page.goto(url, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('.detail-title h1', { timeout: 20000 }).catch(() => {})

    const meta = await page.evaluate(() => {
      const subj = document.querySelector('.detail-title h1')?.textContent?.trim() || ''
      const time = document.querySelector('.detail-info .time')?.textContent?.trim() || ''
      const pdfLinks = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href*="/api/file/download/"]')).map(a => a.href)
      return { subj, time, pdfLinks }
    })

    const saved = { disclosureIndex: id, kapTitle: meta.subj, publishDate: meta.time, pdfs: [] as string[] }

    // A) Public uç
    const primary = `${BASE}/tr/api/BildirimPdf/${id}`
    try {
      const buf = await page.evaluate(async (u) => {
        const rr = await fetch(u)
        if (!rr.ok) return null
        return await rr.arrayBuffer()
      }, primary)
      if (buf) {
        const file = path.join(OUT_DIR, `${id}-1.pdf`)
        await save(file, buf as ArrayBuffer)
        saved.pdfs.push(`kap/${TICKER}/${id}-1.pdf`)
        console.log('   ✓ PDF (public)')
      }
    } catch {}

    // B) Sayfa içi indir linki (oturumlu)
    if (saved.pdfs.length === 0 && meta.pdfLinks.length > 0) {
      try {
        const [dl] = await Promise.all([
          page.waitForEvent('download', { timeout: 20000 }),
          page.click('a[href*="/api/file/download/"]', { timeout: 5000 }),
        ])
        const file = path.join(OUT_DIR, `${id}-1.pdf`)
        await dl.saveAs(file)
        saved.pdfs.push(`kap/${TICKER}/${id}-1.pdf`)
        console.log('   ✓ PDF (sayfa içi)')
      } catch {
        console.log('   ⚠ PDF indirilemedi')
      }
    }

    const title = (saved.kapTitle || item.title || '').toString()
    if (opTitle(title)) operating.push(saved)
    else if (finTitle(title)) financial.push(saved)
    else financial.push(saved)

    await wait(350 + Math.random() * 300)
  }

  const summary = {
    ticker: TICKER,
    latest: { financial: financial[0] ?? null, operating: operating[0] ?? null },
    all: { financial, operating },
    generatedAt: new Date().toISOString(),
  }
  await fs.writeFile(path.join(OUT_DIR, 'summary.json'), JSON.stringify(summary, null, 2), 'utf8')
  console.log(`✔ ${TICKER}: fin=${financial.length} opr=${operating.length} -> public/kap/${TICKER}/summary.json`)
  await browser.close()
}

run().catch(e => { console.error(e); process.exit(1) })
