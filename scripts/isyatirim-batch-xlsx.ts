// scripts/isyatirim-batch-xlsx.ts
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { exec } from 'node:child_process'
import { promisify } from 'node:util'
const sh = promisify(exec)

const EXCHANGE  = 'TRY'
const START_Y   = 2008
const START_P   = 3
const SLEEP_MS  = 800

const OUT_ROOT = '/Users/utku/Downloads/Bilançolar'

// Küçük yardımcılar
function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

async function ensureDir(p: string) {
  await fs.mkdir(p, { recursive: true })
}

async function fileExists(p: string) {
  try { await fs.access(p); return true } catch { return false }
}

// Tekil script ne yazarsa yazsın, çıktıyı bulup Bilançolar/<T>.xlsx'e taşı
async function normalizeOutput(T: string, stdout: string) {
  const desired = path.join(OUT_ROOT, `${T}.xlsx`)
  await ensureDir(OUT_ROOT)

  // 1) Zaten doğru yerde mi?
  if (await fileExists(desired)) {
    console.log(`✔ Bulundu: ${desired}`)
    return
  }

  // 2) Tekil scriptin logundan kesin yol yakalamayı dene
  const m = (stdout || '').match(/✔ XLSX yazıldı:\s*(.+\.xlsx)/)
  if (m && m[1]) {
    const src = m[1].trim()
    if (src !== desired) {
      try {
        await ensureDir(path.dirname(desired))
        await fs.rename(src, desired)
        console.log(`↪ Taşındı: ${src} → ${desired}`)
        return
      } catch (e: any) {
        console.warn(`⚠ Taşıma hatası (${src} → ${desired}): ${e?.message || e}`)
      }
    } else {
      console.log(`✔ Doğrudan yazılmış: ${desired}`)
      return
    }
  }

  // 3) Logdan yakalayamadıysak — eski olası konumları tek tek dene
  const candidates = [
    path.join('/Users/utku/Downloads', 'isyatirim', T, 'mali-tablo.xlsx'),
    path.join('/Users/utku/Downloads', 'isyatirim', `${T}.xlsx`),
    path.join(process.cwd(), 'public', 'isyatirim', T, 'mali-tablo.xlsx'),
    path.join(process.cwd(), 'public', 'isyatirim', `${T}.xlsx`),
  ]
  for (const src of candidates) {
    if (await fileExists(src)) {
      try {
        await fs.rename(src, desired)
        console.log(`↪ Taşındı: ${src} → ${desired}`)
        return
      } catch (e: any) {
        console.warn(`⚠ Taşıma hatası (${src} → ${desired}): ${e?.message || e}`)
      }
    }
  }

  console.warn(`⚠ Çıktı bulunamadı. Tekil script farklı bir klasöre yazmış olabilir.`)
}

async function main() {
  // Ticker'ları public/tickers.txt'den oku (boş satırlar ve # yorum satırlarını atla)
  const raw = await fs.readFile('public/tickers.txt', 'utf8')
  const tickers = raw.split(/\r?\n/).map(s => s.trim()).filter(s => s && !s.startsWith('#'))

  console.log(`Toplam ${tickers.length} sembol bulundu.\n`)
  await ensureDir(OUT_ROOT)

  for (const t of tickers) {
    const T = t.toUpperCase()
    console.log(`\n=== ${T} ===`)

    const cmd = `npx tsx scripts/isyatirim-all-xlsx.ts ${T} AUTO ${EXCHANGE} ${START_Y} ${START_P}`
    console.log(`> ${cmd}`)

    try {
      const { stdout, stderr } = await sh(cmd, { maxBuffer: 1024 * 1024 * 80 })
      if (stdout) process.stdout.write(stdout)
      if (stderr) process.stderr.write(stderr)

      // Çıktıyı normalize et → Bilançolar/<TICKER>.xlsx
      await normalizeOutput(T, stdout)
      console.log(`Dosya hedefi: ${path.join(OUT_ROOT, `${T}.xlsx`)}`)
    } catch (e: any) {
      console.error(`Hata (${T}):`, e?.message || e)
    }

    await sleep(SLEEP_MS) // nazik bekleme
  }

  console.log('\nBitti. Excel dosyaları /Users/utku/Downloads/Bilançolar/<TICKER>.xlsx altında.')
}

main().catch(err => { console.error(err); process.exit(1) })
