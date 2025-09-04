import { getBucket } from '../../../../lib/cloud'

export const dynamic = 'force-dynamic'

type Ctx = { params: { symbol: string } }

export async function GET(_req: Request, { params }: Ctx) {
  const symbol = (params.symbol || '').toUpperCase()
  if (!symbol) return new Response('Bad Request', { status: 400 })

  const f = getBucket().file(`logos/${symbol}.png`)
  const [exists] = await f.exists()
  if (!exists) return new Response('Not Found', { status: 404 })

  const [buf] = await f.download()
  return new Response(buf, {
    headers: {
      'Content-Type': 'image/png',
      // tarayıcı ve edge cache: 1 gün; CDN: 7 gün
      'Cache-Control': 'public, max-age=86400, s-maxage=604800',
    },
  })
}
