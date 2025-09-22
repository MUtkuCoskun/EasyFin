// ==========================
// src/app/company/[ticker]/CompanyPageClient.tsx
// ==========================
"use client";

import { useState, useEffect, useRef } from "react";
import { motion, useInView } from "framer-motion";
import {
  FiInfo, FiBarChart2, FiPieChart, FiTrendingUp,
  FiBriefcase, FiUsers, FiCheckSquare, FiArrowRight
} from "react-icons/fi";
import {
  Treemap, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Cell, PieChart, Pie
} from "recharts";

type Ratio = number | null;

type PageData = {
  ticker: string;
  generalInfo: {
    companyName: string;
    marketCap: number | null;
    lastPrice: number | null;
    sector: string;
    subSector: string;
    address: string;
    website: string;
  };
  valuationRatios: {
    pe: Ratio;
    pb: Ratio;
    ps: Ratio;
    evEbitda: Ratio;
    netDebtEbitda: Ratio;
  };
  balanceSheet: {
    assets: Array<{ name: string; value: number; color?: string }>;       // değerler milyar ₺
    liabilities: Array<{ name: string; value: number; color?: string }>;  // değerler milyar ₺
  };
  incomeStatement: {
    revenue: number | null;
    cost: number | null;
    grossProfit: number | null;
    opex: number | null;
    earnings: number | null;
  };
  cashFlow: Array<{ name: string; value: number | null; isResult?: boolean }>;
  ownership: {
    shareholders: Array<{ name: string; value: number }>;
    subsidiaries: string[];
  };
  management: Array<{ name: string; position: string }>;
};

function fmtMoney(n: number | null | undefined) {
  if (n == null || !isFinite(n)) return "–";
  return new Intl.NumberFormat("tr-TR", {
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(n);
}

export default function CompanyPageClient({ data }: { data: PageData }) {
  const { ticker, generalInfo, valuationRatios, balanceSheet, incomeStatement, cashFlow, ownership, management } = data;

  const sections = {
    "genel-bakis": { title: "Genel Bakış", icon: <FiInfo /> },
    degerleme: { title: "Değerleme", icon: <FiBarChart2 /> },
    bilanco: { title: "Bilanço", icon: <FiBriefcase /> },
    "gelir-tablosu": { title: "Gelir Tablosu", icon: <FiTrendingUp /> },
    "nakit-akis": { title: "Nakit Akışı", icon: <FiTrendingUp /> },
    "ortaklik-yapisi": { title: "Ortaklık Yapısı", icon: <FiPieChart /> },
    yonetim: { title: "Yönetim", icon: <FiUsers /> },
    "katilim-finans": { title: "Katılım Finans", icon: <FiCheckSquare /> },
  } as const;

  const [activeSection, setActiveSection] = useState<keyof typeof sections>("genel-bakis");

  return (
    <div className="bg-gray-900 text-gray-200 min-h-screen font-sans flex">
      <aside className="w-64 hidden lg:block sticky top-0 h-screen bg-gray-900/70 backdrop-blur-sm border-r border-gray-800 p-6">
        <h2 className="text-2xl font-bold text-white mb-2">{ticker}</h2>
        <nav className="mt-8 space-y-2">
          {Object.entries(sections).map(([id, { title, icon }]) => (
            <a
              key={id}
              href={`#${id}`}
              className={`flex items-center px-4 py-2 rounded-lg transition-all duration-200 ${
                activeSection === id
                  ? "bg-cyan-500 text-white font-bold shadow-lg"
                  : "text-gray-400 hover:bg-gray-800 hover:text-white"
              }`}
            >
              {icon}
              <span className="ml-3">{title}</span>
            </a>
          ))}
        </nav>
      </aside>

      <main className="flex-1 p-4 sm:p-6 lg:p-12 overflow-y-auto">
        <AnimatedSection id="genel-bakis" setActive={setActiveSection}>
          <SectionHeader title="Genel Bakış" subtitle={generalInfo.companyName} />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-6">
            <InfoCard title="Piyasa Değeri" value={`${fmtMoney(generalInfo.marketCap)} ₺`} />
            <InfoCard title="Son Fiyat" value={generalInfo.lastPrice == null ? "–" : `${generalInfo.lastPrice.toFixed(2)} ₺`} />
            <InfoCard title="Ana Sektör" value={generalInfo.sector || "—"} />
            <InfoCard title="Alt Sektör" value={generalInfo.subSector || "—"} />
            <InfoCard title="Adres" value={generalInfo.address || "—"} isSmall />
            <InfoCard title="Web Sitesi" value={generalInfo.website || "—"} isLink />
          </div>
        </AnimatedSection>

        <AnimatedSection id="degerleme" setActive={setActiveSection}>
          <SectionHeader title="Finansal Değerleme" subtitle="Şirket çarpanları ve rasyolar" />
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mt-6">
            <RatioCircle title="F/K" value={valuationRatios.pe} />
            <RatioCircle title="PD/DD" value={valuationRatios.pb} />
            <RatioCircle title="F/S" value={valuationRatios.ps} />
            <RatioCircle title="FD/FAVÖK" value={valuationRatios.evEbitda} />
            <RatioCircle title="Net Borç/FAVÖK" value={valuationRatios.netDebtEbitda} />
          </div>
        </AnimatedSection>

        <AnimatedSection id="bilanco" setActive={setActiveSection}>
          <SectionHeader title="Bilanço Yapısı" subtitle="Varlıklar, yükümlülükler ve özkaynak" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-6 h-[500px]">
            <BalanceSheetTreemap title="Varlıklar" data={balanceSheet.assets} />
            <BalanceSheetTreemap title="Yükümlülükler + Özkaynak" data={balanceSheet.liabilities} />
          </div>
        </AnimatedSection>

        <AnimatedSection id="gelir-tablosu" setActive={setActiveSection}>
          <SectionHeader title="Gelir ve Kârlılık Akışı" subtitle="Satışlardan kâra akış" />
          <IncomeSankey data={incomeStatement} />
        </AnimatedSection>

        <AnimatedSection id="nakit-akis" setActive={setActiveSection}>
          <SectionHeader title="Serbest Nakit Akışı" subtitle="Kârdan FCF’e dönüşüm" />
          <CashFlowWaterfall data={cashFlow.filter(i => i.value != null)} />
        </AnimatedSection>

        <AnimatedSection id="ortaklik-yapisi" setActive={setActiveSection}>
          <SectionHeader title="Ortaklık ve İştirakler" subtitle="Sermaye yapısı" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-6">
            <div className="bg-gray-800/50 p-6 rounded-2xl border border-gray-700/50">
              <h3 className="text-lg font-bold text-white mb-4">Sermaye Dağılımı</h3>
              <OwnershipPieChart data={ownership.shareholders} />
            </div>
            <div className="bg-gray-800/50 p-6 rounded-2xl border border-gray-700/50">
              <h3 className="text-lg font-bold text-white mb-4">Bağlı Ortaklıklar</h3>
              <ul className="space-y-3 mt-4">
                {ownership.subsidiaries.map((sub) => (
                  <li key={sub} className="flex items-center text-gray-300">
                    <FiArrowRight className="text-cyan-400 mr-3" /> {sub}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </AnimatedSection>

        <AnimatedSection id="yonetim" setActive={setActiveSection}>
          <SectionHeader title="Yönetim Kurulu" subtitle="Kilit isimler" />
          <div className="space-y-2 mt-6">
            {management.map((m, i) => (
              <details key={i} className="bg-gray-800/50 p-4 rounded-lg cursor-pointer">
                <summary className="font-semibold text-white">{m.name}</summary>
                <p className="text-gray-400 mt-2">{m.position}</p>
              </details>
            ))}
          </div>
        </AnimatedSection>

        <AnimatedSection id="katilim-finans" setActive={setActiveSection}>
          <SectionHeader title="Katılım Finans Uygunluğu" subtitle="İslami finans prensipleri" />
          <p className="mt-4 text-gray-400">Bu bölüme katılım finans kuralları ve oranları eklenecek.</p>
        </AnimatedSection>
      </main>
    </div>
  );
}

// ----- helpers (client) -----
function AnimatedSection({
  id, setActive, children,
}: {
  id: string; setActive: (id: any) => void; children: React.ReactNode;
}) {
  const ref = useRef(null);
  const isInView = useInView(ref, { amount: 0.3, once: false });
  useEffect(() => { if (isInView) setActive(id as any); }, [isInView, id, setActive]);
  return (
    <motion.section
      id={id}
      ref={ref}
      className="min-h-[60vh] py-16"
      initial={{ opacity: 0, y: 50 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.6 }}
    >
      {children}
    </motion.section>
  );
}

function SectionHeader({ title, subtitle }: { title: string; subtitle: string; }) {
  return (
    <>
      <h2 className="text-4xl md:text-5xl font-bold text-white tracking-tighter">{title}</h2>
      <p className="text-lg text-cyan-400 mt-1">{subtitle}</p>
      <div className="w-24 h-1 bg-cyan-500 rounded-full mt-4" />
    </>
  );
}

function InfoCard({ title, value, isSmall = false, isLink = false }: { title: string; value: string; isSmall?: boolean; isLink?: boolean; }) {
  const safeUrl = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  return (
    <div className="bg-gray-800/50 p-4 rounded-xl border border-gray-700/50">
      <p className="text-sm text-gray-400">{title}</p>
      {isLink && value && value !== "—" ? (
        <a href={safeUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-cyan-400 mt-1 block truncate">
          {value}
        </a>
      ) : (
        <p className={`font-semibold text-white mt-1 ${isSmall ? "text-base" : "text-2xl"}`}>
          {value}
        </p>
      )}
    </div>
  );
}

function RatioCircle({ title, value }: { title: string; value: number | null; }) {
  return (
    <div className="flex flex-col items-center justify-center bg-gray-900/70 p-4 rounded-full w-36 h-36 mx-auto border-2 border-cyan-800/50 transition-all duration-300 hover:border-cyan-500 hover:scale-105 cursor-pointer text-center">
      <p className="text-sm text-gray-400">{title}</p>
      <p className="text-4xl font-bold mt-1 text-white">
        {value != null && isFinite(value) ? value.toFixed(1) : "–"}
      </p>
    </div>
  );
}

function BalanceSheetTreemap({ title, data }: { title: string; data: any[]; }) {
  return (
    <div className="bg-gray-800/50 p-4 rounded-2xl border border-gray-700/50 w-full h-full flex flex-col">
      <h3 className="text-lg font-bold text-white mb-4">{title}</h3>
      <ResponsiveContainer width="100%" height="100%">
        <Treemap
          data={data}
          dataKey="value"
          stroke="#0b0f19"
          fill="#1f2937"
          content={<CustomTreemapContent />}
          aspectRatio={4 / 3}
        />
      </ResponsiveContainer>
    </div>
  );
}

function CustomTreemapContent(props: any) {
  const { depth, x, y, width, height, name, value, color } = props;
  return (
    <g>
      <motion.rect
        x={x}
        y={y}
        width={width}
        height={height}
        style={{ fill: color || (depth === 1 ? "#1f2937" : "#06b6d4"), stroke: "#111827", strokeWidth: 2 }}
        whileHover={{ fill: "#0e7490" }}
        transition={{ duration: 0.2 }}
      />
      {width > 80 && height > 30 && (
        <text x={x + width / 2} y={y + height / 2 + 7} textAnchor="middle" fill="#fff" fontSize={13}>
          <tspan x={x + width / 2} dy="-0.6em">{name}</tspan>
          <tspan x={x + width / 2} dy="1.2em" fillOpacity={0.7}>{value.toFixed(1)}b ₺</tspan>
        </text>
      )}
    </g>
  );
}

function IncomeSankey({ data }: { data: { revenue: number|null; cost: number|null; grossProfit: number|null; opex: number|null; earnings: number|null } }) {
  const blocks = [
    { label: "Hasılat", value: data.revenue, color: "bg-cyan-500" },
    { label: "Satışların Maliyeti", value: data.cost, color: "bg-orange-500" },
    { label: "Brüt Kâr", value: data.grossProfit, color: "bg-emerald-500" },
    { label: "Faaliyet Giderleri", value: data.opex, color: "bg-red-500" },
    { label: "Esas Faaliyet Kârı", value: data.earnings, color: "bg-purple-500" },
  ];
  return (
    <div className="mt-8 p-6 bg-gray-800/50 rounded-2xl border border-gray-700/50">
      <div className="grid grid-cols-1 sm:grid-cols-5 gap-4 text-center">
        {blocks.map((b) => (
          <div key={b.label} className="flex flex-col items-center">
            <p className="text-sm text-gray-400 mb-1">{b.label}</p>
            <div className={`p-4 rounded-lg text-white font-bold w-full ${b.color}`}>
              {fmtMoney(b.value)} {b.value != null ? "₺" : ""}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CashFlowWaterfall({ data }: { data: Array<{ name: string; value: number | null; isResult?: boolean }> }) {
  // simple visual waterfall using stacked bars
  let cumulative = 0;
  const processed = data.map((item) => {
    const val = item.value ?? 0;
    const start = cumulative;
    cumulative += val;
    return { ...item, start, value: val };
  });

  return (
    <div className="h-[400px] bg-gray-800/50 p-6 rounded-2xl border border-gray-700/50 mt-6">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={processed} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
          <XAxis dataKey="name" stroke="#9ca3af" />
          <YAxis stroke="#9ca3af" tickFormatter={(t) => String(fmtMoney(t))} />
          <Tooltip
            cursor={{ fill: "rgba(255,255,255,0.08)" }}
            contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151" }}
            formatter={(v: any) => `${fmtMoney(Number(v))} ₺`}
          />
          <Bar dataKey="start" stackId="a" fill="transparent" />
          <Bar dataKey="value" stackId="a">
            {processed.map((entry, idx) => (
              <Cell
                key={idx}
                fill={entry.isResult ? "#8b5cf6" : entry.value >= 0 ? "#10b981" : "#ef4444"}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

const COLORS = ["#06b6d4", "#6366f1", "#a855f7", "#ec4899"];
function OwnershipPieChart({ data }: { data: Array<{ name: string; value: number }> }) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          labelLine={false}
          outerRadius={120}
          dataKey="value"
          nameKey="name"
          label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
        >
          {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
        </Pie>
        <Tooltip contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151" }} />
      </PieChart>
    </ResponsiveContainer>
  );
}
