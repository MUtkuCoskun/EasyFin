import React from 'react'

export default function Section({ id, title, children }: React.PropsWithChildren<{ id: string; title: string }>) {
  return (
    <section id={id} className="scroll-mt-[260px] md:scroll-mt-[280px]">
      <header className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">{title}</h2>
      </header>
      {children}
    </section>
  )
}
