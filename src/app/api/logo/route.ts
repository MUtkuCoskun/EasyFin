import type { NextRequest } from 'next/server'
import { getBucket } from '../../../lib/firebase'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const symbol = (searchParams.get('symbol') || '').toUpperCase().trim()
  if (!symbol) return new Response('Missing symbol', { status: 400 })

  const bucket = await getBucket()
  const file = bucket.file(`logos/${symbol}.png`)
  const [exists] = await file.exists()
  if (!exists) return new Response('Not found', { status: 404 })

  const [buf] = await file.download()

  // 💡 Buffer -> BodyInit: Uint8Array veya Blob ver
  return new Response(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=86400, immutable',
    },
  })
}
