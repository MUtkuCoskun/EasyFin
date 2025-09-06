// src/app/api/logo/[symbol]/route.ts
import { NextResponse } from 'next/server'

// Bu dosya Next.js 15 uyumlu imzayla yazıldı.
// İmza: (req: Request, { params }: { params: { symbol: string } })

export const dynamic = 'force-dynamic'

export async function GET(_req: Request, { params }: { params: { symbol: string } }) {
  const symbol = (params?.symbol || '').toUpperCase()
  // MVP: şimdilik placeholder bir logoya yönlendiriyoruz.
  const url = `https://placehold.co/64x64?text=${encodeURIComponent(symbol || 'LOGO')}`
  return NextResponse.redirect(url)
}
