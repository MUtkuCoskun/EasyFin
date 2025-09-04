'use client'
import Link from 'next/link'

const items = [
  { label: 'Piyasalar', href: '#' },
  { label: 'Şirketler', href: '/companies' },
  { label: 'Üyelik', href: '#' },
  { label: 'Akademi', href: '#' },
  { label: 'İletişim', href: '#' },
]

function Navbar() {
  return (
    <header className="fixed inset-x-0 top-0 z-50 bg-[#0B0D16] border-b border-white/5">
      <div className="mx-auto max-w-6xl px-4 h-[64px] md:h-[72px] flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-[#E8273E] flex items-center justify-center shadow">
            <span className="text-white font-black">F</span>
          </div>
          <span className="font-semibold tracking-tight text-white">Fin AI</span>
        </div>

        <nav className="hidden md:flex items-center gap-8">
          {items.map(i => (
            <Link key={i.label} href={i.href} className="text-sm text-slate-300 hover:text-white">
              {i.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <Link href="#" className="text-sm text-slate-300 hover:text-white">Giriş yap</Link>
          <Link
            href="#"
            className="rounded-md px-3 py-2 text-sm font-medium bg-[#246BFF] hover:bg-[#1A57E0] text-white shadow"
          >
            Üye ol
          </Link>
        </div>
      </div>
    </header>
  )
}

export default Navbar
export { Navbar }
