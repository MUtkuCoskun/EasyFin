// scripts/fetch-bist-logos.ts
// Çıktılar:
//  - data/tickers.txt         (SASA, ... satır satır)
//  - data/bist-logos.json     ([{ symbol, name, logoUrl }])

import { writeFile } from 'node:fs/promises'

const SRC = 'https://cdn.jsdelivr.net/gh/ahmeterenodaci/Istanbul-Stock-Exchange--BIST--including-symbols-and-logos/bist.json'

async function main() {
  const res = await fetch(SRC, { headers: { 'user-agent': 'Mozilla/5.0' } })
  if (!res.ok) throw new Error(`HTTP ${res.status} while fetching ${SRC}`)
  const arr = (await res.json()) as Array<{ symbol?: string; name?: string; logoUrl?: string }>

  // symbol, name, logoUrl alanlarını normalize et
  const cleaned = arr
    .map(o => ({
      symbol: String(o.symbol || '').trim().toUpperCase(),
      name: String(o.name || '').trim(),
      logoUrl: String(o.logoUrl || '').trim()
    }))
    .filter(o => o.symbol)

  // tickers.txt
  const symbols = Array.from(new Set(cleaned.map(o => o.symbol))).sort()
  await writeFile('data/tickers.txt', symbols.join('\n') + '\n', 'utf8')

  // bist-logos.json
  await writeFile('data/bist-logos.json', JSON.stringify(cleaned, null, 2), 'utf8')

  console.log(`✔ ${symbols.length} sembol yazıldı → data/tickers.txt`)
  console.log(`✔ Logo verisi kaydedildi → data/bist-logos.json`)
}

main().catch(err => { console.error(err); process.exit(1) })
