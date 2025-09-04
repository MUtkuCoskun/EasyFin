import { promises as fs } from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

function normList(txt: string): string[] {
  return txt
    .split(/\r?\n/)
    .map(s => s.trim().toUpperCase())
    .filter(s => s && !s.startsWith('#'))
}

function uniq(a: string[]) {
  return Array.from(new Set(a))
}

function diff(newSet: Set<string>, oldSet: Set<string>) {
  const added: string[] = []
  const removed: string[] = []
  for (const t of newSet) if (!oldSet.has(t)) added.push(t)
  for (const t of oldSet) if (!newSet.has(t)) removed.push(t)
  return { added, removed }
}

async function rmrf(p: string) {
  try { await fs.rm(p, { recursive: true, force: true }) } catch {}
}

function run(cmd: string, args: string[]) {
  const r = spawnSync(cmd, args, { stdio: 'inherit' })
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} failed`)
}

async function main() {
  // Flags
  const argv = process.argv.slice(2)
  const newPath = (() => {
    const i = argv.indexOf('--new')
    return i >= 0 ? argv[i+1] : 'data/new-tickers.txt'
  })()
  const doUpload = argv.includes('--upload')         // rsync'e kadar götür
  const delRemote = argv.includes('--delete-remote') // GCS'ten de sil
  const GROUP = 'XI_29'
  const EXCH  = 'TRY'
  const BUCKET = 'gs://finai-a381b.firebasestorage.app/isyatirim'

  const oldPath = path.join(process.cwd(), 'data', 'tickers.txt')

  // Eski ve yeni listeleri oku
  let oldList: string[] = []
  try {
    const oldRaw = await fs.readFile(oldPath, 'utf8')
    oldList = normList(oldRaw)
  } catch {}
  const newRaw = await fs.readFile(newPath, 'utf8')
  const newList = normList(newRaw)

  const oldSet = new Set(uniq(oldList))
  const newSet = new Set(uniq(newList))
  const { added, removed } = diff(newSet, oldSet)

  console.log(`Eski: ${oldSet.size} · Yeni: ${newSet.size}`)
  console.log(`→ Eklenecek: ${added.length} · Silinecek: ${removed.length}`)

  // data/tickers.txt'yi yeni listeyle güncelle (alfabetik)
  const finalList = uniq(newList).sort()
  await fs.writeFile(oldPath, finalList.join('\n') + '\n', 'utf8')
  console.log(`✔ Güncellendi: data/tickers.txt`)

  // Yerelde silinecekleri temizle
  for (const t of removed) {
    const dir = path.join(process.cwd(), 'public', 'isyatirim', t)
    await rmrf(dir)
  }
  if (removed.length) console.log(`✔ Yerel silinen klasör sayısı: ${removed.length}`)

  // İsteğe bağlı: uzak (GCS) silme
  if (removed.length && delRemote) {
    console.log('• Uzak GCS siliniyor...')
    for (const t of removed) {
      run('gcloud', ['storage', 'rm', '-r', `${BUCKET}/${t}`])
    }
    console.log('✔ Uzak silme bitti.')
  }

  // Yalnızca eklenenler için inkremental indirme
  for (const t of added) {
    console.log(`\n=== ${t} (yeni) ===`)
    run('npx', ['tsx', 'scripts/isyatirim-incremental.ts', GROUP, EXCH, t])
  }
  if (!added.length) console.log('Yeni indirilecek sembol yok.')

  // İsteğe bağlı: rsync ile yükle
  if (doUpload) {
    console.log('\n• GCS rsync...')
    run('gcloud', ['storage', 'rsync', '--recursive', 'public/isyatirim', `${BUCKET}`])
    console.log('✔ Yükleme tamam.')
  }

  // Özet
  console.log('\nÖZET')
  console.log(`+ Eklendi (indirildi): ${added.length}`)
  console.log(`- Silindi (yerel):    ${removed.length}${delRemote ? ' (uzaktan da)' : ''}`)
  console.log('Bitti.')
}

main().catch(e => { console.error(e); process.exit(1) })
