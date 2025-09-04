import Navbar from './components/Navbar'
import Hero from './components/Hero'

export default function Home() {
  return (
    <main className="min-h-screen relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-[#0B0D16] to-[#131B35]" />
      <div className="pointer-events-none absolute -top-40 left-1/2 h-[500px] w-[800px] -translate-x-1/2 rounded-full blur-3xl opacity-40 bg-indigo-700/30" />
      <Navbar />
      <Hero />
    </main>
  )
}
