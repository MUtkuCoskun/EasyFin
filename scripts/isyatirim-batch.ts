// scripts/isyatirim-batch.ts
import { promises as fs } from 'node:fs'
import { exec } from 'node:child_process'
import { promisify } from 'node:util'
const sh = promisify(exec)

const FIN_GROUP = 'XI_29'
const EXCHANGE  = 'TRY'
const START_Y   = 2008
const START_P   = 3   // 3/6/9/12

async function main() {
  const raw = await fs.readFile('data/tickers.txt', 'utf8')
  const tickers = raw.split(/\r?\n/).map(s => s.trim()).filter(Boolean)

  console.log(`Toplam ${tickers.length} sembol bulundu.\n`)

  for (const t of tickers) {
    console.log(`\n=== ${t} ===`)
    try {
      const cmd = `npx tsx scripts/isyatirim-all.ts ${t} ${FIN_GROUP} ${EXCHANGE} ${START_Y} ${START_P}`
      console.log(`> ${cmd}`)
      const { stdout, stderr } = await sh(cmd, { maxBuffer: 1024 * 1024 * 20 })
      if (stdout) process.stdout.write(stdout)
      if (stderr) process.stderr.write(stderr)
    } catch (e: any) {
      console.error(`Hata (${t}):`, e?.message || e)
    }
  }

  console.log('\nBitti. JSON’lar public/isyatirim/<TICKER>/mali-tablo.json altında.')
}

main().catch(err => { console.error(err); process.exit(1) })
