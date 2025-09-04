// scripts/download-logos.ts
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import path from 'node:path'

const BASE = 'https://cdn.jsdelivr.net/gh/ahmeterenodaci/Istanbul-Stock-Exchange--BIST--including-symbols-and-logos/logos'

async function main() {
  const raw = await readFile('data/tickers.txt', 'utf8')
  const tickers = raw.split(/\r?\n/).map(s => s.trim()).filter(Boolean)
  const outDir = path.join(process.cwd(), 'public', 'logos')
  await mkdir(outDir, { recursive: true })

  let ok = 0, fail = 0

  for (const t of tickers) {
    const url = `${BASE}/${t}.png`
    try {
      const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0' } })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const buf = Buffer.from(await res.arrayBuffer())
      await writeFile(path.join(outDir, `${t}.png`), buf)
      ok++
      process.stdout.write(`.`)
    } catch (e: any) {
      fail++
      process.stdout.write(`x`)
    }
  }

  console.log(`\n✔ Bitti. OK=${ok}, FAIL=${fail}. Klasör: public/logos`)
}

main().catch(err => { console.error(err); process.exit(1) })
