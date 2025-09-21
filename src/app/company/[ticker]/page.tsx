// pages/company/[ticker].tsx
// TEK DOSYA — Üretimde çalışır UI + Data Fetch
// ─ Veriyi şu sırayla dener: 1) /api/doc?path=...  2) Firestore (Firebase v9)
// ─ tableDoc kaynakları: PRICES.table, DASH.table, FIN.tidy (tercihli) / FIN.table, KAP.table
// ─ TR format (%, parantezli negatif, ondalık virgül) parse eder
// ─ Şık kartlar + tablo (Tailwind) — “eski” modern görünüme yakın

'use client';
import * as React from 'react';

/** =============== Types =============== */
type TableDoc = { header: string[]; rows: any[] };

type PriceSnapshot = { symbol: string; last: number | null; mcap: number | null; lastDate: string | null };
type DashMetric   = { key: string; byPeriod: Record<string, number | null> };
type FinPoint     = { code?: string; ad_tr?: string; ad_en?: string; grp?: string; period: string; value: number | null };
type FinIndex     = { byPeriod: Record<string, FinPoint[]>; byCode: Record<string, FinPoint[]>; byNameTR: Record<string, FinPoint[]> };
type BoardMember  = { name: string; title?: string; gender?: string; start?: string; executive?: boolean | null; affiliated?: string | null };
type KapSummary   = { fields: Record<string, any>; board: BoardMember[]; freeFloatPct?: number | null; mainSharePct?: number | null; sector?: string | null };

type PageState = {
  ticker: string;
  company: { last: number | null; mcap: number | null; lastDate: string | null };
  ratios: { dash: DashMetric[] };
  fin: FinIndex;
  kap: KapSummary;
  meta: { hasName: boolean };
};

/** =============== Utils (TR parse) =============== */
const parseNumberTR = (raw: any): number | null => {
  if (raw == null) return null;
  let s = String(raw).trim();
  if (!s) return null;
  let sign = 1;
  if (s.startsWith('(') && s.endsWith(')')) { sign = -1; s = s.slice(1, -1); }
  s = s.replace(/\s+/g, '').replace(/\./g, '').replace(',', '.').replace(/%/g, '');
  const v = Number(s);
  return Number.isFinite(v) ? sign * v : null;
};

const parsePercentTR = (raw: any): number | null => {
  if (raw == null) return null;
  const n = parseNumberTR(String(raw).replace('%',''));
  return n == null ? null : n / 100;
};

const normalizeTableRows = (t: TableDoc) => (t.rows ?? []).map((r: any) => ({ ...r }));
const mapFromFieldValue = (t: TableDoc) => {
  const out: Record<string, any> = {};
  for (const r of t.rows ?? []) {
    const f = r.field ?? r.Field ?? r.KEY ?? r.key;
    const v = r.value ?? r.Value ?? r.VAL ?? r.val;
    if (f != null) out[f] = v;
  }
  return out;
};
const pick = <T extends object>(obj: T, key: any, def?: any) => (obj as any)?.[key] ?? def;

/** =============== Data adapters =============== */
const parsePrices = (tbl: TableDoc): PriceSnapshot | null => {
  const header = tbl.header ?? [];
  const rows = tbl.rows ?? [];
  if (!rows.length) return null;

  const lastDateCol = [...header].reverse().find(h => /\d{2}\.\d{2}\.\d{4}/.test(h)) ?? null;
  const r0 = rows[0];
  const symbol = (pick(r0, 'sembol') ?? pick(r0, 'symbol') ?? '').toString();
  const last   = parseNumberTR(pick(r0, 'fiyat') ?? pick(r0, 'last'));
  const mcap   = parseNumberTR(pick(r0, 'piyasa_değeri') ?? pick(r0, 'mcap'));
  return { symbol, last, mcap, lastDate: lastDateCol };
};

const parseDash = (tbl: TableDoc): DashMetric[] => {
  const rows = normalizeTableRows(tbl);
  const periods = (tbl.header ?? []).filter(h => /^\d{4}\/\d+$/.test(h));
  const out: DashMetric[] = [];
  for (const r of rows) {
    const key = r['Kalem'] ?? r['kalem'] ?? r['item'] ?? r['Key'] ?? r['key'];
    if (!key) continue;
    const by: Record<string, number | null> = {};
    for (const p of periods) by[p] = parseNumberTR(r[p] ?? null);
    out.push({ key: String(key), byPeriod: by });
  }
  return out;
};

const parseFinTidy = (tidy: any[]): FinPoint[] => {
  const pts: FinPoint[] = [];
  for (const r of tidy ?? []) {
    const period = r.period ?? r['Period'] ?? r['PERIOD'];
    if (!period) continue;
    const value = parseNumberTR(r.value ?? r['Value']);
    pts.push({
      code: r.code ?? r['Code'],
      ad_tr: r.ad_tr ?? r['ad_tr'],
      ad_en: r.ad_en ?? r['ad_en'],
      grp: r.grp ?? r['grp'],
      period, value
    });
  }
  return pts;
};

const indexFin = (pts: FinPoint[]): FinIndex => {
  const byPeriod: Record<string, FinPoint[]> = {};
  const byCode:   Record<string, FinPoint[]> = {};
  const byNameTR: Record<string, FinPoint[]> = {};
  for (const p of pts) {
    (byPeriod[p.period] ||= []).push(p);
    if (p.code)  (byCode[p.code] ||= []).push(p);
    if (p.ad_tr) (byNameTR[p.ad_tr] ||= []).push(p);
  }
  return { byPeriod, byCode, byNameTR };
};

const parseKAP = (tbl: TableDoc): KapSummary => {
  const m = mapFromFieldValue(tbl);
  const board: BoardMember[] = [];
  for (let i=0;i<50;i++){
    const px = `board_members[${i}].`;
    const name = m[`${px}ad_soyad`];
    if (!name) continue;
    board.push({
      name: String(name),
      title: m[`${px}unvan`] ?? m[`${px}gorev`],
      gender: m[`${px}cinsiyet`] ?? undefined,
      start: m[`${px}ilk_atanma_tarihi`] ?? m[`${px}atanma_tarihi`],
      executive: (m[`${px}icrada_gorevli_mi`]?.toString()?.toLowerCase() ?? '').startsWith('e') ? true
                : (m[`${px}icrada_gorevli_mi`]?.toString()?.toLowerCase() ?? '').startsWith('h') ? false : null,
      affiliated: m[`${px}bagli_oldugu_grup_sirketi`] ?? null,
    });
  }
  const freeFloat = parsePercentTR(m['ownership.fiili_dolasim_orani'] ?? m['ownership.fiili_dolaşim_orani'] ?? m['fiili_dolasim_orani']);
  const mainPct   = parsePercentTR(m['ownership.sermaye_payi_orani'] ?? m['oy_haklari.pairs[0].pay_orani']);
  const sector    = m['summary.sektor_alan'] ?? m['sektor'] ?? null;
  return { fields: m, board, freeFloatPct: freeFloat ?? undefined, mainSharePct: mainPct ?? undefined, sector };
};

/** =============== Data access =============== */
// 1) API yolu (varsa)
async function getJsonViaApi(path: string): Promise<any | null> {
  try {
    const res = await fetch(`/api/doc?path=${encodeURIComponent(path)}`, { cache: 'no-store' });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

// 2) Firestore (opsiyonel). Pencere içinde bir firebase app init ettiysen bunu kullanır.
// window.__FIREBASE_DB__ gibi global bir db de kabul eder.
async function getJsonViaFirestore(path: string): Promise<any | null> {
  try {
    // Dinamik import: app bundle'da varsa kullanır, yoksa skip
    const mod = await import('firebase/firestore').catch(() => null as any);
    // @ts-ignore
    const db = (globalThis as any).__FIREBASE_DB__ ?? null;
    if (!mod || !db) return null;
    const { doc, getDoc } = mod as any;
    const ref = doc(db, ...path.split('/'));
    const snap = await getDoc(ref);
    return snap.exists() ? snap.data() : null;
  } catch { return null; }
}

const candidatePaths = (ticker: string, id: string) => ([
  `companies/${ticker}/${id}`,
  `companies/${ticker}/tables/${id}`,
  `tables/${ticker}/${id}`,
  `company/${ticker}/${id}`,
  `data/${ticker}/${id}`,
  `${ticker}/${id}`,
]);

async function fetchTableDoc(ticker: string, id: string): Promise<TableDoc | null> {
  for (const p of candidatePaths(ticker, id)) {
    const doc1 = await getJsonViaApi(p);
    const doc  = doc1 ?? await getJsonViaFirestore(p);
    if (doc && doc.header && doc.rows) return { header: doc.header, rows: doc.rows };
  }
  return null;
}
async function fetchArrayDoc(ticker: string, id: string): Promise<any[] | null> {
  for (const p of candidatePaths(ticker, id)) {
    const doc1 = await getJsonViaApi(p);
    const doc  = doc1 ?? await getJsonViaFirestore(p);
    if (Array.isArray(doc)) return doc;
    if (doc?.rows && Array.isArray(doc.rows)) return doc.rows;
  }
  return null;
}

/** =============== buildState =============== */
async function buildState(ticker: string): Promise<PageState> {
  const pricesTbl = await fetchTableDoc(ticker, 'PRICES.table');
  const priceSnap = pricesTbl ? parsePrices(pricesTbl)! : { symbol: ticker, last: null, mcap: null, lastDate: null };

  const dashTbl = await fetchTableDoc(ticker, 'DASH.table');
  const dash    = dashTbl ? parseDash(dashTbl) : [];

  const finTidy = await fetchArrayDoc(ticker, 'FIN.tidy');
  let finPts: FinPoint[] = [];
  if (finTidy?.length) finPts = parseFinTidy(finTidy);
  else {
    const finTbl = await fetchTableDoc(ticker, 'FIN.table');
    finPts = finTbl ? parseFinTidy(normalizeTableRows(finTbl) as any) : [];
  }
  const finIdx  = indexFin(finPts);

  const kapTbl = await fetchTableDoc(ticker, 'KAP.table');
  const kap    = kapTbl ? parseKAP(kapTbl) : { fields: {}, board: [] };

  const hasName = Boolean(
    (kap as any).fields?.['general.ticaret_unvani'] ||
    (kap as any).fields?.['summary.unvan'] ||
    (kap as any).fields?.['ad']
  );

  return {
    ticker,
    company: { last: priceSnap.last, mcap: priceSnap.mcap, lastDate: priceSnap.lastDate },
    ratios: { dash },
    fin: finIdx,
    kap,
    meta: { hasName },
  };
}

/** =============== UI Pieces =============== */
const Card = ({ children, className = '' }: any) => (
  <div className={`rounded-2xl border border-zinc-200/20 bg-white/5 dark:bg-zinc-900/40 shadow-sm p-4 ${className}`}>{children}</div>
);
function NumberCell({ v, suf }: { v: number | null | undefined; suf?: string }) {
  if (v == null) return <span>—</span>;
  return <span>{v.toLocaleString('tr-TR')}{suf ?? ''}</span>;
}
function CompanyHeader({ state }: { state: PageState }) {
  const name =
    ((state.kap as any).fields?.['general.ticaret_unvani'] ??
     (state.kap as any).fields?.['summary.unvan'] ??
     state.ticker) as string;

  return (
    <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{name} <span className="opacity-60">({state.ticker})</span></h1>
        <p className="text-sm opacity-70">Sektör: {state.kap.sector ?? '—'}</p>
      </div>
      <div className="text-right">
        <div className="text-2xl font-semibold"><NumberCell v={state.company.last} suf=" ₺" /></div>
        <div className="text-xs opacity-70">
          PD: <NumberCell v={state.company.mcap} suf=" ₺" />{state.company.lastDate ? ` • ${state.company.lastDate}` : ''}
        </div>
      </div>
    </div>
  );
}

function FinQuick({ fin }: { fin: FinIndex }) {
  const lastPeriod = Object.keys(fin.byPeriod).sort().slice(-1)[0];
  if (!lastPeriod) return null;
  const row = fin.byPeriod[lastPeriod] ?? [];
  const findVal = (code: string) => (row.find(p => p.code === code)?.value) ?? null;

  const tiles = [
    { label: 'Toplam Varlıklar', val: findVal('1BL') },
    { label: 'Kısa Yükümlülükler', val: findVal('2A') },
    { label: 'Uzun Yükümlülükler', val: findVal('2B') },
    { label: 'Özkaynaklar', val: findVal('2N') },
    { label: 'Satış Gelirleri', val: findVal('3C') },
    { label: 'Net Kar (Dönem)', val: findVal('3L') },
  ];

  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-6">
      {tiles.map((t, i) => (
        <Card key={i}>
          <div className="text-xs opacity-70">{t.label}</div>
          <div className="text-xl mt-1"><NumberCell v={t.val} suf=" ₺" /></div>
          <div className="text-xs opacity-50 mt-1">{lastPeriod}</div>
        </Card>
      ))}
    </div>
  );
}

function DashTable({ dash }: { dash: DashMetric[] }) {
  if (!dash?.length) return null;
  const allPeriods = Array.from(new Set(dash.flatMap(m => Object.keys(m.byPeriod ?? {})))).sort();
  const latest = allPeriods.slice(-4);

  return (
    <Card className="mt-6 overflow-x-auto">
      <h2 className="text-lg font-semibold mb-3">Özet Oranlar</h2>
      <table className="min-w-full text-sm">
        <thead className="bg-zinc-50/50 dark:bg-zinc-800/40">
          <tr>
            <th className="p-2 text-left">Kalem</th>
            {latest.map(p => <th key={p} className="p-2 text-right">{p}</th>)}
          </tr>
        </thead>
        <tbody>
          {dash.map((m,i)=>(
            <tr key={i} className="border-t border-zinc-200/20">
              <td className="p-2">{m.key}</td>
              {latest.map(p=>(
                <td key={p} className="p-2 text-right"><NumberCell v={m.byPeriod[p]} /></td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function BoardTable({ kap }: { kap: KapSummary }) {
  if (!kap.board?.length) return null;
  return (
    <Card className="mt-6 overflow-x-auto">
      <h2 className="text-lg font-semibold mb-3">Yönetim Kurulu</h2>
      <table className="min-w-full text-sm">
        <thead className="bg-zinc-50/50 dark:bg-zinc-800/40">
          <tr>
            <th className="p-2 text-left">Ad Soyad</th>
            <th className="p-2 text-left">Ünvan</th>
            <th className="p-2 text-left">İcrada?</th>
            <th className="p-2 text-left">Başlangıç</th>
            <th className="p-2 text-left">Grup</th>
          </tr>
        </thead>
        <tbody>
          {kap.board.map((b,i)=>(
            <tr key={i} className="border-t border-zinc-200/20">
              <td className="p-2">{b.name}</td>
              <td className="p-2">{b.title ?? '—'}</td>
              <td className="p-2">{b.executive == null ? '—' : b.executive ? 'Evet' : 'Hayır'}</td>
              <td className="p-2">{b.start ?? '—'}</td>
              <td className="p-2">{b.affiliated ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="text-xs opacity-70 mt-2">
        Fiili dolaşım: {kap.freeFloatPct == null ? '—' : `${(kap.freeFloatPct * 100).toFixed(2)}%`}
      </div>
    </Card>
  );
}

/** =============== Page (CSR) =============== */
export default function CompanyPage() {
  const [state, setState] = React.useState<PageState | null>(null);
  const [err, setErr]     = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    const url = new URL(window.location.href);
    const parts = url.pathname.split('/').filter(Boolean);
    const ticker = (parts[1] ?? '').toUpperCase() || 'AEFES';

    (async () => {
      try {
        const s = await buildState(ticker);
        setState(s);
      } catch (e: any) {
        setErr(e?.message ?? 'Beklenmeyen hata');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="p-6 max-w-6xl mx-auto text-zinc-900 dark:text-zinc-100">
      {loading && (
        <div className="animate-pulse text-sm opacity-70">Yükleniyor…</div>
      )}

      {err && (
        <Card className="border-red-200/40 bg-red-50/50 dark:bg-red-900/20">
          <div className="text-red-700 dark:text-red-200 font-medium mb-1">Hata</div>
          <div className="text-xs opacity-80">{err}</div>
          <div className="text-xs opacity-60 mt-2">
            Lütfen /api/doc veya Firestore erişiminden en az biri açık olsun.
          </div>
        </Card>
      )}

      {state && !err && (
        <>
          <CompanyHeader state={state} />
          <FinQuick fin={state.fin} />
          <DashTable dash={state.ratios.dash} />
          <BoardTable kap={state.kap} />
          <div className="mt-10 text-xs opacity-60">
            Kaynaklar: PRICES.table, DASH.table, FIN.tidy/FIN.table, KAP.table — yalnızca mevcut veriler gösterildi.
          </div>
        </>
      )}
    </div>
  );
}

/**
 * 🔧 Firestore’u hazır kullanmak istiyorsan:
 * 1) Projende bir yerde Firebase init et (client):
 *    import { initializeApp } from 'firebase/app';
 *    import { getFirestore } from 'firebase/firestore';
 *    const app = initializeApp({...}); // env'den
 *    const db  = getFirestore(app);
 *    (globalThis as any).__FIREBASE_DB__ = db; // global'e bağla
 *
 * 2) /api/doc endpoint’in yoksa yukarıdaki global ile otomatik Firestore’a düşer.
 *
 * 3) /api/doc kullanacaksan bir örnek (Edge/Node):
 *    // pages/api/doc.ts
 *    import type { NextApiRequest, NextApiResponse } from 'next';
 *    import { getFirestore, doc, getDoc } from 'firebase-admin/firestore';
 *    import { cert, initializeApp, getApps } from 'firebase-admin/app';
 *    if (!getApps().length) initializeApp({ credential: cert({ /* service account env */ }) });
 *    const db = getFirestore();
 *    export default async function handler(req: NextApiRequest, res: NextApiResponse) {
 *      try {
 *        const path = String(req.query.path || '');
 *        const ref = doc(db, ...path.split('/'));
 *        const snap = await getDoc(ref as any);
 *        if (!snap.exists) return res.status(404).json(null);
 *        res.json(snap.data());
 *      } catch (e) { res.status(500).json({ error: 'fetch-failed' }); }
 *    }
 */
