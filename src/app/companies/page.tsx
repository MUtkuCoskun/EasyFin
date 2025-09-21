import Link from 'next/link'
import { adminDb } from '../../lib/firebaseAdmin'

export const revalidate = 300

export default async function Page() {
  let rows: { id: string; name?: string | null }[] = []
  try {
    const snap = await adminDb.collection('tickers').get()
    rows = snap.docs.map(d => {
      const data = d.data() as any
      return { id: d.id, name: data?.name ?? null }
    }).sort((a,b)=> a.id.localeCompare(b.id))
  } catch {}

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="text-2xl font-bold mb-4">Şirketler</h1>
      <ul className="grid sm:grid-cols-2 md:grid-cols-3 gap-3">
        {rows.map(c => (
          <li key={c.id} className="rounded-xl border border-white/10 p-3 hover:bg-white/5">
            <Link href={`/company/${c.id}`}>{c.id} — {c.name ?? ''}</Link>
          </li>
        ))}
      </ul>
    </main>
  )
}
