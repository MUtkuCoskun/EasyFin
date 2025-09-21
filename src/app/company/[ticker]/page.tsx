"use client";

import Navbar from "../../components/Navbar";
import Link from "next/link";
import CompanyHeader from "./CompanyHeader";
import SidebarNav from "./SidebarNav";
import Section from "./Section";

import { db } from "@/lib/firebase";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
} from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

/* ---------- Türler ---------- */

type PageParams = { ticker: string };

type TidyRow = {
  id: string;
  code: "3C" | "3Z" | "3CA" | "3D" | string;
  period: string; // ör: "2024/12" veya "2024Q4"
  value: number;
};

type CompanyDoc = {
  ticker?: string;
  name?: string;
  sector?: string;
  sektor_ana?: string;
  sektor_alt?: string;
  internet_adresi?: string;
  islem_gordugu_pazar?: string;
  dahil_oldugu_endeksler?: string[] | null;
  merkez_adresi?: string;
  fiili_dolasim_oran?: number | null;
  fiili_dolasim_tutar_tl?: number | null;
  last?: number | null; // varsa
  mcap?: number | null; // varsa
};

function fmtNum(n?: number | null, d = 0) {
  return (n ?? null) === null
    ? "—"
    : new Intl.NumberFormat("tr-TR", { maximumFractionDigits: d }).format(n!);
}
function fmtPct(n?: number | null, d = 1) {
  return (n ?? null) === null ? "—" : `${(n! * 100).toFixed(d)}%`;
}

/* ---------- Basit mini chart bileşenleri ---------- */

function MiniLine({
  data,
  yKey,
  w = 800,
  h = 220,
}: {
  data: any[];
  yKey: string;
  w?: number;
  h?: number;
}) {
  const vals = data
    .map((d) => Number(d?.[yKey] ?? NaN))
    .filter((v) => !Number.isNaN(v));
  if (!data?.length || !vals.length)
    return <div className="text-slate-400">Veri yok</div>;
  const pad = 12;
  const min = Math.min(...vals),
    max = Math.max(...vals);
  const sx = (i: number) =>
    pad + (i / Math.max(1, data.length - 1)) * (w - pad * 2);
  const sy = (v: number) =>
    pad + (1 - (v - min) / ((max - min) || 1)) * (h - pad * 2);
  const path = data
    .map((r, i) => {
      const v = Number(r?.[yKey]);
      if (Number.isNaN(v)) return null;
      return `${i ? "L" : "M"} ${sx(i)} ${sy(v)}`;
    })
    .filter(Boolean)
    .join(" ");
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`}>
      <path d={path} fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function MiniBar({
  data,
  yKey,
  w = 800,
  h = 220,
}: {
  data: any[];
  yKey: string;
  w?: number;
  h?: number;
}) {
  const vals = data
    .map((d) => Number(d?.[yKey] ?? NaN))
    .filter((v) => !Number.isNaN(v));
  if (!data?.length || !vals.length)
    return <div className="text-slate-400">Veri yok</div>;
  const pad = 12;
  const min = Math.min(0, ...vals),
    max = Math.max(0, ...vals);
  const bw = (((w - pad * 2) / data.length) * 0.8) | 0;
  const sx = (i: number) =>
    pad + (i + 0.5) * ((w - pad * 2) / data.length) - bw / 2;
  const sy = (v: number) =>
    pad + (1 - (v - min) / ((max - min) || 1)) * (h - pad * 2);
  const y0 = sy(0);
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`}>
      {data.map((r, i) => {
        const v = Number(r?.[yKey]);
        if (Number.isNaN(v)) return null;
        const y = sy(Math.max(v, 0)),
          yNeg = sy(Math.min(v, 0));
        const rectY = v >= 0 ? y : y0;
        const rectH = Math.abs(y0 - (v >= 0 ? y : yNeg));
        const fill = v >= 0 ? "#22c55e" : "#ef4444";
        return (
          <rect
            key={i}
            x={sx(i)}
            y={rectY}
            width={bw}
            height={rectH}
            fill={fill}
            rx="2"
          />
        );
      })}
      <line
        x1={pad}
        x2={w - pad}
        y1={y0}
        y2={y0}
        stroke="#334155"
        strokeDasharray="4 4"
      />
    </svg>
  );
}

function Card({
  title,
  children,
}: React.PropsWithChildren<{ title: string }>) {
  return (
    <div className="rounded-2xl bg-[#0F162C] border border-[#2A355B] p-5">
      <h3 className="font-semibold">{title}</h3>
      <div className="mt-3 text-slate-300/90">{children}</div>
    </div>
  );
}
function Tag({ children }: React.PropsWithChildren<{}>) {
  return (
    <span className="inline-block text-xs px-2 py-1 rounded-full bg-white/10 border border-white/10 mr-2 mb-2">
      {children}
    </span>
  );
}

/* ---------- SAYFA ---------- */

export default function Page() {
  const params = useParams<PageParams>();
  const t = (params.ticker || "").toUpperCase();

  const [company, setCompany] = useState<CompanyDoc | null>(null);
  const [rows, setRows] = useState<TidyRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!t) return;
    (async () => {
      // 1) Şirket üst bilgileri (varsa)
      const cDoc = await getDoc(doc(db, "tickers", t));
      const cData = (cDoc.exists() ? cDoc.data() : {}) as CompanyDoc;
      setCompany({ ticker: t, ...cData });

      // 2) FIN.tidy.rows
      const q = query(
        collection(db, "tickers", t, "sheets", "FIN.tidy", "rows"),
        orderBy("period", "asc")
      );
      const snap = await getDocs(q);
      const r: TidyRow[] = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as any),
      }));
      setRows(r);
      setLoading(false);
    })();
  }, [t]);

  const byCode = useMemo(() => {
    const g: Record<string, TidyRow[]> = {};
    for (const r of rows) (g[r.code] ||= []).push(r);
    for (const k of Object.keys(g)) {
      g[k].sort((a, b) => a.period.localeCompare(b.period));
    }
    return g;
  }, [rows]);

  const sections = [
    { id: "overview", title: "Genel Bakış" },
    { id: "fin", title: "Finansal Grafikler" },
  ];

  if (loading) return <div className="p-6">Yükleniyor…</div>;

  const sectorText =
    company?.sector || company?.sektor_ana || company?.sektor_alt;

  const codes = ["3C", "3Z", "3CA", "3D"] as const;

  return (
    <main className="min-h-screen relative">
      <div className="absolute inset-0 bg-gradient-to-b from-[#0B0D16] to-[#131B35]" />
      <Navbar />
      <div className="mx-auto max-w-7xl px-4 pt-[64px] md:pt-[72px] pb-24 relative z-20">
        <div className="flex items-center justify-between gap-4">
          <Link
            href="/companies"
            className="text-sm text-slate-300 hover:text-white"
          >
            ← Şirketler
          </Link>
          <div />
        </div>

        <div className="mt-4 grid grid-cols-12 gap-6">
          <aside className="hidden lg:block lg:col-span-3">
            <SidebarNav sections={sections} />
          </aside>

          <div className="col-span-12 lg:col-span-9">
            <div id="company-sticky" className="sticky top-[64px] md:top-[72px] z-30">
              <CompanyHeader
                company={{
                  ticker: t,
                  name: company?.name || t,
                  sector: sectorText,
                  website: company?.internet_adresi,
                  // quote alanlarını Firestore'da varsa göster
                  quote: {
                    last:
                      company?.last == null
                        ? undefined
                        : (company.last as number),
                    currency: "TRY",
                    mcap: (company?.mcap as number | null) ?? null,
                  },
                }}
              />
            </div>

            <div className="space-y-12 mt-6">
              {/* GENEL */}
              <Section id="overview" title="Genel Bakış">
                <div className="grid gap-4 md:grid-cols-2">
                  <Card title="Kısa Bilgiler">
                    <ul className="space-y-2 text-sm">
                      <li>
                        <span className="opacity-70">İnternet Adresi:</span>{" "}
                        {company?.internet_adresi ? (
                          <a
                            className="underline"
                            href={company.internet_adresi}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {company.internet_adresi}
                          </a>
                        ) : (
                          "—"
                        )}
                      </li>
                      <li>
                        <span className="opacity-70">İşlem Gördüğü Pazar:</span>{" "}
                        {company?.islem_gordugu_pazar ?? "—"}
                      </li>
                      <li>
                        <span className="opacity-70">Sektör (Ana/Alt):</span>{" "}
                        {company?.sektor_ana ?? "—"}{" "}
                        {company?.sektor_alt ? ` / ${company.sektor_alt}` : ""}
                      </li>
                      <li>
                        <span className="opacity-70">Merkez Adresi:</span>{" "}
                        {company?.merkez_adresi ?? "—"}
                      </li>
                      <li>
                        <span className="opacity-70">Fiili Dolaşım Oranı:</span>{" "}
                        {fmtPct(company?.fiili_dolasim_oran ?? null, 1)}
                      </li>
                      <li>
                        <span className="opacity-70">
                          Fiili Dolaşım Tutarı (TL):
                        </span>{" "}
                        {fmtNum(company?.fiili_dolasim_tutar_tl ?? null, 0)}
                      </li>
                      <li>
                        <span className="opacity-70">Piyasa Değeri:</span>{" "}
                        {company?.mcap
                          ? `${new Intl.NumberFormat("tr-TR").format(
                              Math.round(company.mcap)
                            )} ₺`
                          : "—"}
                      </li>
                      <li>
                        <span className="opacity-70">Fiyat:</span>{" "}
                        {company?.last != null
                          ? `${(company.last as number).toFixed(2)} ₺`
                          : "—"}
                      </li>
                    </ul>

                    {company?.dahil_oldugu_endeksler?.length ? (
                      <div className="mt-3">
                        <div className="text-xs opacity-70 mb-1">
                          Dahil Olduğu Endeksler:
                        </div>
                        <div>
                          {company.dahil_oldugu_endeksler.map((e, i) => (
                            <Tag key={i}>{e}</Tag>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </Card>
                </div>
              </Section>

              {/* FİNANSAL GRAFİKLER */}
              <Section id="fin" title="Finansal Grafikler">
                <div className="grid gap-8 md:grid-cols-2">
                  {(["3C", "3Z", "3CA", "3D"] as const).map((c) => {
                    const data = (byCode[c] || []).map((d) => ({
                      period: d.period,
                      y: d.value,
                    }));
                    const isBar = c === "3CA" || c === "3D";
                    return (
                      <div key={c} className="border rounded-2xl p-4 bg-[#0F162C] border-[#2A355B]">
                        <h2 className="font-medium mb-3">{c} grafiği</h2>
                        <div className="w-full h-72">
                          {isBar ? (
                            <MiniBar data={data} yKey="y" />
                          ) : (
                            <MiniLine data={data} yKey="y" />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Section>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
