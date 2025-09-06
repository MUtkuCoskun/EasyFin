// src/app/companies/page.tsx
import Link from 'next/link'
import { supabase } from '../../lib/supabase'

export const revalidate = 300

export default async function Page() {
  const { data, error } = await supabase
    .from('companies')
    .select('ticker,name')
    .order('ticker')

  if (error) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-8">
        <h1 className="text-2xl font-bold mb-4">Şirketler</h1>
        <div className="text-red-400">Hata: {error.message}</div>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="text-2xl font-bold mb-4">Şirketler</h1>
      <ul className="grid sm:grid-cols-2 md:grid-cols-3 gap-3">
        {(data ?? []).map((c: { ticker: string; name?: string | null }) => (
          <li key={c.ticker} className="rounded-xl border border-white/10 p-3 hover:bg-white/5">
            <Link href={`/company/${c.ticker}`}>{c.ticker} — {c.name ?? ''}</Link>
          </li>
        ))}
      </ul>
    </main>
  )
}
