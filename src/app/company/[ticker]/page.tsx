// pages/company/[ticker].tsx
// Tamamen güncellenmiş TEK DOSYA
// - Sadece senin tableDoc verilerini okur: PRICES.table, DASH.table, FIN.tidy (tercihli), yoksa FIN.table, KAP.table
// - Subcollection beklemez; birden fazla olası path'i dener, bulduğunu kullanır
// - TR sayı/%, parantezli negatif, ondalık virgül parse eder
// - "Olmayan" placeholder ve tahminleri SİLER; sayfa sadece senin verinle dolar

import * as React from "react";

/** =============================
 *  0) Türler
 *  ============================= */
type TableDoc = { header: string[]; rows: any[] };

type PriceSnapshot = {
  symbol: string;
  last: number | null;
  mcap: number | null;
  lastDate: string | null;
};

type DashMetric = {
  key: string;
  byPeriod: Record<string, number | null>;
};

type FinPoint = {
  code?: string;
  ad_tr?: string;
  ad_en?: string;
  grp?: string;
  period: string;
  value: number | null;
};

type FinIndex = {
  byPeriod: Record<string, FinPoint[]>;
  byCode: Record<string, FinPoint[]>;
  byNameTR: Record<string, FinPoint[]>;
};

type BoardMember = {
  name: string;
  title?: string;
  gender?: string;
  start?: string;
  executive?: boolean | null;
  affiliated?: string | null;
};

type KapSummary = {
  fields: Record<string, any>;
  board: BoardMember[];
  freeFloatPct?: number | null;
  mainSharePct?: number | null;
  sector?: string | null;
};

type PageState = {
  ticker: string;
  company: {
    last: number | null;
    mcap: number | null;
    lastDate: string | null;
  };
  ratios: { dash: DashMetric[] };
  fin: FinIndex;
  kap: KapSummary;
  meta: { hasName: boolean };
};

/** =============================
 *  1) Yardımcılar (TR parse)
 *  ============================= */
const parseNumberTR = (raw: any): number | null => {
  if (raw == null) return null;
  let s = String(raw).trim();
  if (!s) return null;
  let sign = 1;
  if (s.startsWith("(") && s.endsWith(")")) {
    sign = -1;
    s = s.slice(1, -1);
  }
  s = s.replace(/\s+/g, "").replace(/\./g, "").replace(",", ".");
  s = s.replace(/%/g, "");
  const v = Number(s);
  return Number.isFinite(v) ? sign * v : null;
};

const parsePercentTR = (raw: any): number | null => {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  const n = parseNumberTR(s.replace("%", ""));
  return n == null ? null : n / 100;
};

const normalizeTableRows = (table: TableDoc): Record<string, any>[] => {
  const { rows } = table;
  return (rows ?? []).map((r: any) => ({ ...r }));
};

const mapFromFieldValue = (table: TableDoc): Record<string, any> => {
  const out: Record<string, any> = {};
  for (const r of table.rows ?? []) {
    const f = r.field ?? r.Field ?? r.KEY ?? r.key;
    const v = r.value ?? r.Value ?? r.VAL ?? r.val;
    if (f) out[f] = v;
  }
  return out;
};

const pick = <T extends object, K extends keyof any>(obj: T, key: K, def?: any) =>
  (obj as any)?.[key] ?? def;

/** =============================
 *  2) Adaptörler
 *  ============================= */
const parsePrices = (pricesTable: TableDoc): PriceSnapshot | null => {
  const header = pricesTable.header ?? [];
  const rows = pricesTable.rows ?? [];
  if (!rows.length) return null;

  const lastDateCol =
    [...header].reverse().find((h) => /\d{2}\.\d{2}\.\d{4}/.test(h)) ?? null;

  const r0 = rows[0];
  const symbol = pick(r0, "sembol", "") as string;
  const fiyat = parseNumberTR(pick(r0, "fiyat"));
  const mcap = parseNumberTR(pick(r0, "piyasa_değeri"));
  return { symbol, last: fiyat, mcap, lastDate: lastDateCol };
};

const parseDash = (dashTable: TableDoc): DashMetric[] => {
  const rows = normalizeTableRows(dashTable);
  const periods = (dashTable.header ?? []).filter((h) => /^\d{4}\/\d+$/.test(h));
  const out: DashMetric[] = [];

  for (const r of rows) {
    const key = r["Kalem"] ?? r["kalem"] ?? r["item"] ?? null;
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
    const period = r.period ?? r["Period"] ?? r["PERIOD"];
    if (!period) continue;
    const value = parseNumberTR(r.value ?? r["Value"]);
    pts.push({
      code: r.code ?? r["Code"],
      ad_tr: r.ad_tr ?? r["ad_tr"],
      ad_en: r.ad_en ?? r["ad_en"],
      grp: r.grp ?? r["grp"],
      period,
      value,
    });
  }
  return pts;
};

const indexFin = (pts: FinPoint[]): FinIndex => {
  const byPeriod: Record<string, FinPoint[]> = {};
  const byCode: Record<string, FinPoint[]> = {};
  const byNameTR: Record:string, FinPoint[]> = {} as any;
  for (const p of pts) {
    (byPeriod[p.period] ||= []).push(p);
    if (p.code) (byCode[p.code] ||= []).push(p);
    if (p.ad_tr) (byNameTR[p.ad_tr] ||= []).push(p);
  }
  return { byPeriod, byCode, byNameTR };
};

const parseKAP = (kapTable: TableDoc): KapSummary => {
  const m = mapFromFieldValue(kapTable);
  const board: BoardMember[] = [];
  for (let i = 0; i < 40; i++) {
    const prefix = `board_members[${i}].`;
    const name = m[`${prefix}ad_soyad`];
    if (!name) continue;
    board.push({
      name: String(name),
      title: m[`${prefix}unvan`] ?? m[`${prefix}gorev`],
      gender: m[`${prefix}cinsiyet`] ?? undefined,
      start: m[`${prefix}ilk_atanma_tarihi`] ?? m[`${prefix}atanma_tarihi`],
      executive:
        m[`${prefix}icrada_gorevli_mi`]
          ?.toString()
          .toLowerCase()
          .startsWith("e") ?? null,
      affiliated: m[`${prefix}bagli_oldugu_grup_sirketi`] ?? null,
    });
  }

  const freeFloat =
    parsePercentTR(
      m["ownership.fiili_dolasim_orani"] ??
        m["ownership.fiili_dolaşim_orani"]
    ) ?? undefined;
  const mainPct =
    parsePercentTR(
      m["ownership.sermaye_payi_orani"] ?? m["oy_haklari.pairs[0].pay_orani"]
    ) ?? undefined;

  const sector =
    m["summary.sektor_alan"] ??
    m["GIDA, İÇECEK VE T..."] ??
    m["İMALATGIDA, İÇECE..."] ??
    null;

  return { fields: m, board, freeFloatPct: freeFloat, mainSharePct: mainPct, sector };
};

/** =============================
 *  3) DB okuyucu (yalın; çoklu path dener)
 *  ============================= */
// Bu bölümde kendi DB istemcine bağlan.
// Aşağıdaki "adapter" sadece örnek: getJson(path) isimli bir fonksiyonu
// projenin veri katmanına işaret edecek şekilde uyarlaman yeterli.
//
// Varsayım: getJson(path) => Promise<any | null>
// Sen Firestore/Firebase, Supabase, kendi API’n, vs. ne kullanıyorsan oraya bağla.
// ÖNEMLİ: Kod, "yok" derse gerçekten yoktur — ama önce tüm olası path’leri dener.

async function getJson(_path: string): Promise<any | null> {
  // TODO: Burayı kendi fetch/DB okuyucunla değiştir.
  // Örn: return (await fetch(`/api/doc?path=${encodeURIComponent(_path)}`)).json();
  return null;
}

const candidatePaths = (ticker: string, id: string): string[] => [
  // en sık kullanılanlar
  `companies/${ticker}/${id}`,
  `companies/${ticker}/tables/${id}`,
  `tables/${ticker}/${id}`,
  // fallback’ler
  `company/${ticker}/${id}`,
  `data/${ticker}/${id}`,
  `${ticker}/${id}`,
];

async function fetchTableDoc(ticker: string, id: string): Promise<TableDoc | null> {
  for (const p of candidatePaths(ticker, id)) {
    const doc = await getJson(p);
    if (doc && doc.header && doc.rows) {
      return { header: doc.header, rows: doc.rows };
    }
  }
  return null;
}

async function fetchArrayDoc(ticker: string, id: string): Promise<any[] | null> {
  for (const p of candidatePaths(ticker, id)) {
    const doc = await getJson(p);
    if (Array.isArray(doc)) return doc;
    // Bazı kaynaklar {rows:[...]} döndürebilir
    if (doc?.rows && Array.isArray(doc.rows)) return doc.rows;
  }
  return null;
}

/** =============================
 *  4) buildState — TEK NOKTA yükleyici
 *  ============================= */
async function buildState(ticker: string): Promise<PageState> {
  // PRICES (zorunlu değil ama varsa gösteriyoruz)
  const pricesTbl = await fetchTableDoc(ticker, "PRICES.table");
  const priceSnap =
    (pricesTbl && parsePrices(pricesTbl)) || {
      symbol: ticker,
      last: null,
      mcap: null,
      lastDate: null,
    };

  // DASH (oranlar)
  const dashTbl = await fetchTableDoc(ticker, "DASH.table");
  const dash = dashTbl ? parseDash(dashTbl) : [];

  // FIN (FIN.tidy öncelikli)
  const finTidy = await fetchArrayDoc(ticker, "FIN.tidy");
  let finPts: FinPoint[] = [];
  if (finTidy && finTidy.length) {
    finPts = parseFinTidy(finTidy);
  } else {
    const finTbl = await fetchTableDoc(ticker, "FIN.table");
    finPts = finTbl ? parseFinTidy(normalizeTableRows(finTbl) as any) : [];
  }
  const finIdx = indexFin(finPts);

  // KAP
  const kapTbl = await fetchTableDoc(ticker, "KAP.table");
  const kap = kapTbl ? parseKAP(kapTbl) : { fields: {}, board: [] };

  // META
  const hasName = Boolean(
    kap.fields?.["general.ticaret_unvani"] ||
      kap.fields?.["summary.unvan"] ||
      kap.fields?.["ad"]
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

/** =============================
 *  5) UI — yalın, sadece senin verilerini gösterir
 *  ============================= */
function NumberCell({ v, suf }: { v: number | null | undefined; suf?: string }) {
  if (v == null) return <span>—</span>;
  return <span>{v.toLocaleString("tr-TR")}{suf ?? ""}</span>;
}

function CompanyHeader({ state }: { state: PageState }) {
  const name =
    (state.kap.fields["general.ticaret_unvani"] ??
      state.kap.fields["summary.unvan"] ??
      state.ticker) as string;

  return (
    <div className="flex items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold">
          {name} ({state.ticker})
        </h1>
        <p className="text-sm opacity-70">
          {state.kap.sector ? `Sektör: ${state.kap.sector}` : "Sektör: —"}
        </p>
      </div>
      <div className="text-right">
        <div className="text-xl">
          <NumberCell v={state.company.last} suf=" ₺" />
        </div>
        <div className="text-xs opacity-70">
          PD: <NumberCell v={state.company.mcap} suf=" ₺" />
          {state.company.lastDate ? ` • ${state.company.lastDate}` : ""}
        </div>
      </div>
    </div>
  );
}

function BoardTable({ kap }: { kap: KapSummary }) {
  if (!kap.board?.length) return null;
  return (
    <div className="mt-6">
      <h2 className="text-lg font-semibold mb-2">Yönetim Kurulu</h2>
      <div className="overflow-x-auto rounded-lg border">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="p-2 text-left">Ad Soyad</th>
              <th className="p-2 text-left">Ünvan</th>
              <th className="p-2 text-left">İcrada?</th>
              <th className="p-2 text-left">Başlangıç</th>
              <th className="p-2 text-left">Bağlı Olduğu Grup</th>
            </tr>
          </thead>
          <tbody>
            {kap.board.map((b, i) => (
              <tr key={i} className="border-t">
                <td className="p-2">{b.name}</td>
                <td className="p-2">{b.title ?? "—"}</td>
                <td className="p-2">{b.executive == null ? "—" : b.executive ? "Evet" : "Hayır"}</td>
                <td className="p-2">{b.start ?? "—"}</td>
                <td className="p-2">{b.affiliated ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs opacity-70 mt-1">
        Fiili dolaşım: {kap.freeFloatPct == null ? "—" : `${(kap.freeFloatPct * 100).toFixed(2)}%`}
      </p>
    </div>
  );
}

function DashTable({ dash }: { dash: DashMetric[] }) {
  if (!dash?.length) return null;
  // Sonda yer alan en yeni 4 dönemi gösterelim
  const allPeriods = Array.from(
    new Set(
      dash.flatMap((m) => Object.keys(m.byPeriod ?? {}))
    )
  ).sort(); // "YYYY/Q" sözde kronolojik; yeterli
  const latest = allPeriods.slice(-4);

  return (
    <div className="mt-6">
      <h2 className="text-lg font-semibold mb-2">Özet Oranlar</h2>
      <div className="overflow-x-auto rounded-lg border">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="p-2 text-left">Kalem</th>
              {latest.map((p) => (
                <th key={p} className="p-2 text-right">{p}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {dash.map((m, i) => (
              <tr key={i} className="border-t">
                <td className="p-2">{m.key}</td>
                {latest.map((p) => (
                  <td key={p} className="p-2 text-right">
                    <NumberCell v={m.byPeriod[p]} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FinQuick({ fin }: { fin: FinIndex }) {
  // Hızlı bir özet: Son dönem Toplam Varlıklar (1BL), Kısa/Uzun Yükümlülükler (2A/2B), Özkaynaklar (2N), Satış Gelirleri (3C), Net Kar (3L)
  const lastPeriod = Object.keys(fin.byPeriod).sort().slice(-1)[0];
  if (!lastPeriod) return null;
  const row = fin.byPeriod[lastPeriod] ?? [];

  const findVal = (code: string) =>
    (row.find((p) => p.code === code)?.value) ?? null;

  return (
    <div className="mt-6 grid md:grid-cols-3 gap-4">
      <div className="p-4 rounded-lg border">
        <div className="text-xs opacity-70">Toplam Varlıklar</div>
        <div className="text-xl"><NumberCell v={findVal("1BL")} suf=" ₺" /></div>
        <div className="text-xs opacity-70">{lastPeriod}</div>
      </div>
      <div className="p-4 rounded-lg border">
        <div className="text-xs opacity-70">Kısa / Uzun Yükümlülükler</div>
        <div className="text-xl">
          <NumberCell v={findVal("2A")} suf=" ₺" /> / <NumberCell v={findVal("2B")} suf=" ₺" />
        </div>
        <div className="text-xs opacity-70">{lastPeriod}</div>
      </div>
      <div className="p-4 rounded-lg border">
        <div className="text-xs opacity-70">Özkaynaklar</div>
        <div className="text-xl"><NumberCell v={findVal("2N")} suf=" ₺" /></div>
        <div className="text-xs opacity-70">{lastPeriod}</div>
      </div>
      <div className="p-4 rounded-lg border">
        <div className="text-xs opacity-70">Satış Gelirleri</div>
        <div className="text-xl"><NumberCell v={findVal("3C")} suf=" ₺" /></div>
        <div className="text-xs opacity-70">{lastPeriod}</div>
      </div>
      <div className="p-4 rounded-lg border">
        <div className="text-xs opacity-70">Net Kar (Dönem)</div>
        <div className="text-xl"><NumberCell v={findVal("3L")} suf=" ₺" /></div>
        <div className="text-xs opacity-70">{lastPeriod}</div>
      </div>
    </div>
  );
}

/** =============================
 *  6) Sayfa (SSR/CSR fark etmez; burada CSR basitliği)
 *  ============================= */
export default function CompanyPage() {
  const [state, setState] = React.useState<PageState | null>(null);
  const [err, setErr] = React.useState<string | null>(null);

  // URL’den /company/[ticker] yakala
  React.useEffect(() => {
    const url = new URL(window.location.href);
    const parts = url.pathname.split("/").filter(Boolean);
    const ticker = (parts[1] ?? "").toUpperCase() || "AEFES";

    (async () => {
      try {
        const s = await buildState(ticker);
        setState(s);
      } catch (e: any) {
        setErr(e?.message ?? "Beklenmeyen hata");
      }
    })();
  }, []);

  if (err) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold mb-4">Hata</h1>
        <pre className="text-sm p-3 bg-red-50 border border-red-200 rounded">{err}</pre>
      </div>
    );
  }

  if (!state) {
    return (
      <div className="p-6">
        <div className="animate-pulse">Yükleniyor…</div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <CompanyHeader state={state} />
      <FinQuick fin={state.fin} />
      <DashTable dash={state.ratios.dash} />
      <BoardTable kap={state.kap} />
      <div className="mt-10 text-xs opacity-60">
        Yalnızca tableDoc verilerin kullanıldı: PRICES.table, DASH.table, FIN.tidy/FIN.table, KAP.table. Gereksiz/boş tahmin alanlar kaldırıldı.
      </div>
    </div>
  );
}

// Firestore örneği (Firebase v9)
// getJson'i böyle değiştir:
import { getFirestore, doc, getDoc } from "firebase/firestore";
const db = getFirestore(app);

async function getJson(path: string): Promise<any | null> {
  // path "companies/AEFES/PRICES.table" gibi geliyor
  const ref = doc(db, ...path.split("/"));
  const snap = await getDoc(ref);
  return snap.exists() ? (snap.data() as any) : null;
}


