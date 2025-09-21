import Navbar from '../../components/Navbar'
import Link from 'next/link'
import CompanyHeader from './CompanyHeader'
import SidebarNav from './SidebarNav'
import Section from './Section'
import { adminDb } from "../../lib/firebaseAdmin";

export const revalidate = 120
export const runtime = 'nodejs'

type PageParams = { ticker: string }
type PriceRow = { ts: string; close: number }

type RatiosRow = {
  ticker?: string
  mcap: number | null
  equity_value: number | null
  ttm_net_income: number | null
  ttm_revenue: number | null
  pb: number | null
  pe_ttm: number | null
  net_margin_ttm: number | null
  roe_ttm_simple: number | null
}

type SeriesRow = {
  period: string
  net_income_q: number | null
  revenue_q: number | null
  equity_value: number | null
}

type BoardRow = {
  name: string
  role: string | null
  is_executive: boolean | null
  gender: string | null
  profession: string | null
  first_elected: string | null
  equity_pct: number | null
  represented_share_group: string | null
}
type OwnRow = { holder: string; pct: number | null; voting_pct: number | null; paid_in_tl: number | null }
type SubRow = {
  company: string
  activity: string | null
  paid_in_capital: number | null
  share_amount: number | null
  currency: string | null
  share_pct: number | null
  relation: string | null
}
type VoteRow = { field: string; value: string | null }
type K47Row = { m1?: string | null; m2?: string | null; m3?: string | null; m4?: string | null; m5?: number | null; m6?: number | null; m7?: number | null }
type RawKapPayload = { kap?: any; bilanco?: any }

type CompanyInfo = {
  ticker: string
  name?: string
  sector?: string
  sektor_ana?: string
  sektor_alt?: string
  internet_adresi?: string
  islem_gordugu_pazar?: string
  dahil_oldugu_endeksler?: string[] | null
  merkez_adresi?: string
  fiili_dolasim_oran?: number | null
  fiili_dolasim_tutar_tl?: number | null
  last: number | null
  mcap: number | null
}

/* ---------- META ---------- */
type MetaRow = {
  full_name: string | null
  description: string | null
  free_float: number | null
  market_cap: number | null
}

/* ============= Firestore loader’ları (SSR) ============= */

async function loadMeta(ticker: string): Promise<MetaRow> {
  const base = adminDb.collection('tickers').doc(ticker)
  const [metaDocSnap, tickDocSnap] = await Promise.all([
    base.collection('meta').doc('default').get().catch(() => null as any),
    base.get().catch(() => null as any),
  ])
  const m: any = metaDocSnap?.exists ? metaDocSnap.data() : {}
  const c: any = tickDocSnap?.exists ? tickDocSnap.data() : {}
  return {
    full_name: (m?.full_name ?? c?.full_name) ?? null,
    description: (m?.description ?? c?.description) ?? null,
    free_float: (m?.free_float ?? c?.free_float) ?? null,
    market_cap: (m?.market_cap ?? c?.market_cap) ?? null,
  }
}

async function loadCompany(ticker: string): Promise<CompanyInfo> {
  const d = await adminDb.collection('tickers').doc(ticker).get().catch(()=>null as any)
  const c: any = d?.exists ? d.data() : {}

  // Son fiyat (varsa)
  const ps = await adminDb
    .collection('tickers').doc(ticker)
    .collection('prices')
    .orderBy('ts','desc').limit(1).get().catch(()=>null as any)

  const last = ps?.docs?.[0]?.get('close') ?? (c?.last ?? null)
  const shares = c?.shares_outstanding ? Number(c.shares_outstanding) : null
  const mcap = (last && shares) ? (last * shares) : (c?.mcap ?? null)

  return {
    ticker,
    name: c?.name ?? ticker,
    sector: c?.sector ?? undefined,
    sektor_ana: c?.sector_main ?? c?.sektor_ana ?? undefined,
    sektor_alt: c?.sector_sub ?? c?.sektor_alt ?? undefined,
    internet_adresi: c?.website ?? c?.internet_adresi ?? undefined,
    islem_gordugu_pazar: c?.market ?? c?.islem_gordugu_pazar ?? undefined,
    dahil_oldugu_endeksler: (c?.indices as string[] | null) ?? c?.dahil_oldugu_endeksler ?? null,
    merkez_adresi: c?.address ?? c?.merkez_adresi ?? undefined,
    fiili_dolasim_oran: (c?.free_float_ratio ?? c?.fiili_dolasim_oran ?? null),
    fiili_dolasim_tutar_tl: (c?.free_float_mcap ?? c?.fiili_dolasim_tutar_tl ?? null),
    last: last ?? null,
    mcap
  }
}

async function loadPrices(ticker: string, limit = 240): Promise<PriceRow[]> {
const snap = await adminDb
  .collection('tickers').doc(ticker)
  .collection('prices')
  .orderBy('ts','desc').limit(limit)
  .get()
  .catch(() => null as any)

