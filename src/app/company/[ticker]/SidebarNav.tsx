'use client'

import { useEffect, useMemo, useState } from 'react'

type SectionLink = { id: string; title: string }

const NAV_H_MOBILE = 64
const NAV_H_DESKTOP = 72

export default function SidebarNav({ sections }: { sections: SectionLink[] }) {
  const [active, setActive] = useState<string>(sections[0]?.id)
  const [headerH, setHeaderH] = useState(180)
  const ids = useMemo(() => sections.map(s => s.id), [sections])

  useEffect(() => {
    const header = document.getElementById('company-sticky')
    if (header) setHeaderH(header.offsetHeight || 180)
  }, [])

  useEffect(() => {
    const navH = window.matchMedia('(min-width: 768px)').matches ? NAV_H_DESKTOP : NAV_H_MOBILE
    const observer = new IntersectionObserver(
      entries => {
        const visible = entries
          .filter(e => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]
        if (visible?.target?.id) setActive(visible.target.id)
      },
      { rootMargin: `-${navH + headerH + 16}px 0px -60% 0px`, threshold: [0, 0.2, 0.6, 1] }
    )
    ids.forEach(id => {
      const el = document.getElementById(id)
      if (el) observer.observe(el)
    })
    return () => observer.disconnect()
  }, [ids, headerH])

  const scrollToId = (id: string) => {
    const el = document.getElementById(id)
    if (!el) return
    const navH = window.matchMedia('(min-width: 768px)').matches ? NAV_H_DESKTOP : NAV_H_MOBILE
    const y = el.getBoundingClientRect().top + window.scrollY - (navH + headerH) - 16
    window.scrollTo({ top: y, behavior: 'smooth' })
  }

  return (
    <nav className="sticky top-[64px] md:top-[72px] z-30">
      <ul className="space-y-1">
        {sections.map(s => {
          const isActive = active === s.id
          return (
            <li key={s.id}>
              <button
                onClick={() => scrollToId(s.id)}
                className={`w-full text-left px-3 py-2 rounded-md transition
                ${isActive ? 'bg-[#1A2346] text-white' : 'text-slate-300 hover:bg-white/5'}`}
              >
                {s.title}
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
