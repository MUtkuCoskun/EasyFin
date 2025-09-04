import { loadBistLogos } from '../../../lib/bist'

export const dynamic = 'force-dynamic'
export async function GET() {
  const data = await loadBistLogos()
  return Response.json(data, { headers: { 'Cache-Control': 's-maxage=300, stale-while-revalidate=86400' } })
}
