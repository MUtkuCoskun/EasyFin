// src/app/companies/page.tsx
import { loadBistLogos } from '../../lib/bist'
import CompaniesGrid from './ui/CompaniesGrid'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs' // fs kullanıyoruz

export const metadata = {
  title: 'BIST Şirketleri · Fin AI'
}

export default async function CompaniesPage() {
  const all = await loadBistLogos()
  return (
    <main className="min-h-screen relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-[#0B0D16] to-[#131B35]" />
      <div className="mx-auto max-w-7xl px-4 pt-28 pb-16 relative z-10">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold">BIST Şirketleri</h1>
            <p className="mt-2 text-slate-300 text-sm">
              Tüm semboller ve logolar. Ara, filtrele ve şirkete git.
            </p>
          </div>
        </div>

      {/* Client grid (arama + harf filtresi + kartlar) */}
        <div className="mt-6">
          <CompaniesGrid initialItems={all} />
        </div>
      </div>
    </main>
  )
}
