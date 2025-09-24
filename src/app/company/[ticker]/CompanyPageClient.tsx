// src/app/company/[ticker]/CompanyPageClient.tsx
"use client";

import { useState, useEffect, useRef, useId, useMemo } from "react";
import { motion, useInView, useMotionValue, useSpring } from "framer-motion";
import {
  FiInfo,
  FiBarChart2,
  FiPieChart,
  FiTrendingUp,
  FiBriefcase,
  FiUsers,
  FiCheckSquare,
  FiArrowRight,
  FiX,
} from "react-icons/fi";
import {
  Treemap,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie,
} from "recharts";

type PageData = {
  ticker: string;
  generalInfo: any;
  valuationRatios: any;
  balanceSheet: { assets: any[]; liabilities: any[] };
  incomeStatement: any;
  cashFlow: any[];
  ownership: any;
  management: { name: string; position: string }[];
};

function fmtMoney(n: number | null | undefined) {
  if (n == null || !isFinite(n)) return "–";
  return new Intl.NumberFormat("tr-TR", {
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(n);
}

// ===============================
// FUTURISTIC VALUATION WIDGETS
// ===============================

type Metric = {
  key: "pe" | "pb" | "evSales" | "evEbitda" | "netDebtEbitda";
  title: string;
  hint: string;
  min: number;
  max: number;
  stops?: Array<{ upTo: number; from: string; to: string }>;
};

const METRICS: Metric[] = [
  {
    key: "pe",
    title: "F/K",
    hint: "Price/Earnings (TTM)",
    min: 0,
    max: 40,
    stops: [
      { upTo: 10, from: "#22d3ee", to: "#67e8f9" },
      { upTo: 20, from: "#38bdf8", to: "#60a5fa" },
      { upTo: 40, from: "#818cf8", to: "#a78bfa" },
    ],
  },
  {
    key: "pb",
    title: "PD/DD",
    hint: "Price/Book",
    min: 0,
    max: 8,
    stops: [
      { upTo: 1.5, from: "#10b981", to: "#34d399" },
      { upTo: 3, from: "#22d3ee", to: "#60a5fa" },
      { upTo: 8, from: "#ef4444", to: "#f43f5e" },
    ],
  },
  {
    key: "evSales",
    title: "EV/Satış",
    hint: "Enterprise Value/Sales",
    min: 0,
    max: 12,
    stops: [
      { upTo: 3, from: "#22d3ee", to: "#67e8f9" },
      { upTo: 6, from: "#60a5fa", to: "#818cf8" },
      { upTo: 12, from: "#a78bfa", to: "#f472b6" },
    ],
  },
  {
    key: "evEbitda",
    title: "FD/FAVÖK",
    hint: "EV/EBITDA",
    min: 0,
    max: 25,
    stops: [
      { upTo: 6, from: "#10b981", to: "#34d399" },
      { upTo: 12, from: "#22d3ee", to: "#60a5fa" },
      { upTo: 25, from: "#f59e0b", to: "#f97316" },
    ],
  },
  {
    key: "netDebtEbitda",
    title: "Net Borç/FAVÖK",
    hint: "Leverage",
    min: -2,
    max: 8,
    stops: [
      { upTo: 1, from: "#10b981", to: "#34d399" },
      { upTo: 3, from: "#22d3ee", to: "#60a5fa" },
      { upTo: 8, from: "#ef4444", to: "#f43f5e" },
    ],
  },
];

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}
function ratioStop(metric: Metric, v: number | null | undefined) {
  const val = typeof v === "number" ? v : NaN;
  const s = metric.stops || [];
  for (const stop of s) {
    if (!isNaN(val) && val <= stop.upTo) return stop;
  }
  return { from: "#22d3ee", to: "#60a5fa" };
}

function NeonDonut({
  title,
  hint,
  value,
  min,
  max,
}: {
  title: string;
  hint: string;
  value: number | null;
  min: number;
  max: number;
}) {
  const size = 170;
  const stroke = 14;
  const r = (size - stroke) / 2;
  const C = 2 * Math.PI * r;

  const pctTarget = useMemo(() => {
    if (value == null || !isFinite(value)) return 0;
    const cl = clamp(value, min, max);
    return (cl - min) / (max - min);
  }, [value, min, max]);

  // animate progress
  const mv = useMotionValue(pctTarget);
  const prog = useSpring(mv, { stiffness: 160, damping: 20, mass: 0.6 });
  useEffect(() => {
    mv.set(pctTarget);
  }, [pctTarget, mv]);

  // turn progress into visible segment count
  const segments = 28;
  const [segCount, setSegCount] = useState(Math.round(pctTarget * segments));
  useEffect(() => {
    const unsub = (prog as any).on("change", (p: number) => {
      setSegCount(Math.round(clamp(p, 0, 1) * segments));
    });
    return () => unsub?.();
  }, [prog]);

  // hover 3D tilt
  const cardRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState(false);
  const [pt, setPt] = useState({ x: 0.5, y: 0.5 });
  const onMove = (e: React.MouseEvent) => {
    const rect = cardRef.current?.getBoundingClientRect();
    if (!rect) return;
    setPt({
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top) / rect.height,
    });
  };

  // color
  const gradId = useId();
  const stop = ratioStop(
    { key: "pe", title, hint, min, max } as Metric,
    value ?? NaN
  );

  const gap = 0.004 * C;
  const segLen = C / segments - gap;

  const valStr =
    value == null || !isFinite(value)
      ? "–"
      : value >= 10
      ? value.toFixed(0)
      : value.toFixed(1);

  return (
    <div
      ref={cardRef}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onMouseMove={onMove}
      tabIndex={0}
      className="relative select-none"
      aria-label={`${title} ${valStr}x`}
    >
      <motion.div
        className="rounded-2xl p-4 bg-gray-900/70 border border-cyan-900/30 shadow-[0_0_36px_-12px_rgba(34,211,238,.35)]"
        style={{ perspective: 800, transformStyle: "preserve-3d" }}
        animate={{
          rotateX: hover ? (0.5 - pt.y) * 10 : 0,
          rotateY: hover ? (pt.x - 0.5) * 12 : 0,
          boxShadow: hover
            ? "0 0 100px -20px rgba(34,211,238,.55)"
            : "0 0 36px -12px rgba(34,211,238,.35)",
        }}
        transition={{ type: "spring", stiffness: 120, damping: 12 }}
      >
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="block mx-auto">
          <defs>
            <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor={stop.from} />
              <stop offset="100%" stopColor={stop.to} />
            </linearGradient>
            <filter id={`${gradId}-glow`} x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* back ring */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke="rgba(148,163,184,0.15)"
            strokeWidth={stroke}
            fill="none"
            strokeLinecap="round"
          />

          {/* segmented progress */}
          {Array.from({ length: segments }).map((_, i) => {
            const offset = (segLen + gap) * i;
            const active = i < segCount;
            return (
              <motion.circle
                key={i}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={`url(#${gradId})`}
                strokeWidth={stroke}
                strokeLinecap="round"
                filter={`url(#${gradId}-glow)`}
                strokeDasharray={`${segLen} ${C}`}
                strokeDashoffset={C - offset}
                initial={{ opacity: 0.18 }}
                animate={{ opacity: active ? 1 : 0.18 }}
                transition={{ duration: 0.15 }}
              />
            );
          })}

          {/* sparkle */}
          <motion.circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={stop.to}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${stroke * 0.45} ${C}`}
            animate={{ strokeDashoffset: C - (segLen + gap) * segCount }}
            transition={{ type: "spring", stiffness: 200, damping: 18 }}
          />
        </svg>

        <div className="text-center mt-3">
          <p className="text-sm text-gray-400">{title}</p>
          <motion.p
            className="text-3xl font-extrabold text-white tracking-tight"
            animate={{ scale: hover ? 1.06 : 1 }}
            transition={{ type: "spring", stiffness: 220, damping: 12 }}
          >
            {valStr}
            {value != null && isFinite(value) ? "x" : ""}
          </motion.p>
          <p className="text-xs text-cyan-400/70 mt-1">{hint}</p>
        </div>
      </motion.div>
    </div>
  );
}

function ValuationPanel({ ratios }: { ratios: any }) {
  const cards = METRICS.map((m) => ({
    ...m,
    value: ratios?.[m.key] ?? null,
  }));

  return (
    <div className="mt-6 grid grid-cols-1 xs:grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-5">
      {cards.map((c) => (
        <NeonDonut
          key={c.key}
          title={c.title}
          hint={c.hint}
          value={c.value}
          min={c.min}
          max={c.max}
        />
      ))}
    </div>
  );
}

// ===============================
// ANA İSTEMCİ BİLEŞENİ
// ===============================
export default function CompanyPageClient({ data }: { data: PageData }) {
  const {
    ticker,
    generalInfo,
    valuationRatios,
    balanceSheet,
    incomeStatement,
    cashFlow,
    ownership,
    management,
  } = data;

  const sections = {
    "genel-bakis": { title: "Genel Bakış", icon: <FiInfo /> },
    degerleme: { title: "Değerleme", icon: <FiBarChart2 /> },
    bilanco: { title: "Bilanço", icon: <FiBriefcase /> },
    "gelir-tablosu": { title: "Gelir Tablosu", icon: <FiTrendingUp /> },
    "nakit-akis": { title: "Nakit Akışı", icon: <FiTrendingUp /> },
    "ortaklik-yapisi": { title: "Ortaklık Yapısı", icon: <FiPieChart /> },
    yonetim: { title: "Yönetim", icon: <FiUsers /> },
    "katilim-finans": { title: "Katılım Finans", icon: <FiCheckSquare /> },
  };

  const [activeSection, setActiveSection] = useState("genel-bakis");
  const [showAllManagers, setShowAllManagers] = useState(false);

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
          <SectionHeader
            title="Genel Bakış"
            subtitle={generalInfo.companyName}
          />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-6">
            <InfoCard
              title="Piyasa Değeri"
              value={fmtMoney(generalInfo.marketCap)}
            />
            <InfoCard
              title="Son Fiyat"
              value={`${
                generalInfo.lastPrice != null
                  ? generalInfo.lastPrice.toFixed(2)
                  : "–"
              } ₺`}
            />
            <InfoCard title="Ana Sektör" value={generalInfo.sector} />
            <InfoCard title="Alt Sektör" value={generalInfo.subSector} />
            <InfoCard title="Adres" value={generalInfo.address} isSmall />
            <InfoCard
              title="Web Sitesi"
              value={generalInfo.website}
              isLink
            />
          </div>
        </AnimatedSection>

        <AnimatedSection id="degerleme" setActive={setActiveSection}>
          <SectionHeader
            title="Finansal Değerleme"
            subtitle="Şirket çarpanları ve rasyolar"
          />
          {/* Yeni fütüristik panel */}
          <ValuationPanel ratios={valuationRatios} />
        </AnimatedSection>

        <AnimatedSection id="bilanco" setActive={setActiveSection}>
          <SectionHeader
            title="Bilanço Yapısı"
            subtitle="Varlık ve yükümlülüklerin dağılımı"
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-6 h-[500px]">
            <BalanceSheetTreemap title="Varlıklar" data={balanceSheet.assets} />
            <BalanceSheetTreemap
              title="Yükümlülükler + Özkaynaklar"
              data={balanceSheet.liabilities}
            />
          </div>
        </AnimatedSection>

        <AnimatedSection id="gelir-tablosu" setActive={setActiveSection}>
          <SectionHeader
            title="Gelir ve Kârlılık Akışı"
            subtitle="Satışlardan net kâra yolculuk"
          />
          <IncomeSankeyChart data={incomeStatement} />
        </AnimatedSection>

        <AnimatedSection id="nakit-akis" setActive={setActiveSection}>
          <SectionHeader
            title="Serbest Nakit Akışı Analizi"
            subtitle="Kârdan serbest nakit akışına"
          />
          <CashFlowWaterfallChart
            data={cashFlow.filter((item) => item.value != null)}
          />
        </AnimatedSection>

        <AnimatedSection id="ortaklik-yapisi" setActive={setActiveSection}>
          <SectionHeader
            title="Ortaklık ve İştirakler"
            subtitle="Sermayedeki pay dağılımı"
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-6">
            <div className="bg-gray-800/50 p-6 rounded-2xl border border-gray-700/50">
              <h3 className="text-lg font-bold text-white mb-4">
                Sermaye Dağılımı
              </h3>
              <OwnershipPieChart data={ownership.shareholders} />
            </div>
            <div className="bg-gray-800/50 p-6 rounded-2xl border border-gray-700/50">
              <h3 className="text-lg font-bold text-white mb-4">
                Bağlı Ortaklıklar
              </h3>
              <ul className="space-y-3 mt-4">
                {ownership.subsidiaries.map((sub: string) => (
                  <li key={sub} className="flex items-center text-gray-300">
                    <FiArrowRight className="text-cyan-400 mr-3" /> {sub}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </AnimatedSection>

        <AnimatedSection id="yonetim" setActive={setActiveSection}>
          <SectionHeader
            title="Yönetim Kurulu"
            subtitle="Şirketin kilit yöneticileri"
          />
          <div className="space-y-2 mt-6">
            {management.slice(0, 5).map((m, i) => (
              <div key={i} className="bg-gray-800/50 p-4 rounded-lg">
                <p className="font-semibold text-white">{m.name}</p>
                <p className="text-gray-400 mt-1">{m.position}</p>
              </div>
            ))}
            {management.length > 5 && (
              <button
                onClick={() => setShowAllManagers(true)}
                className="mt-2 px-4 py-2 rounded-lg bg-cyan-600 text-white hover:bg-cyan-500"
              >
                {`Diğer ${management.length - 5} Üyeyi Gör`}
              </button>
            )}
          </div>

          {showAllManagers && (
            <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
              <div className="bg-gray-900 w-full max-w-2xl rounded-2xl border border-gray-700 p-6 relative">
                <button
                  onClick={() => setShowAllManagers(false)}
                  className="absolute top-3 right-3 p-2 rounded-lg hover:bg-gray-800 text-gray-300"
                  aria-label="Kapat"
                >
                  <FiX />
                </button>
                <h3 className="text-xl font-bold text-white mb-4">
                  Yönetim Kurulu (Tam Liste)
                </h3>
                <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
                  {management.map((m, i) => (
                    <div
                      key={i}
                      className="bg-gray-800/40 p-4 rounded-lg border border-gray-700/40"
                    >
                      <p className="font-semibold text-white">{m.name}</p>
                      <p className="text-gray-400 mt-1">{m.position}</p>
                    </div>
                  ))}
                </div>
                <div className="text-right mt-4">
                  <button
                    onClick={() => setShowAllManagers(false)}
                    className="px-4 py-2 rounded-lg bg-gray-700 text-white hover:bg-gray-600"
                  >
                    Kapat
                  </button>
                </div>
              </div>
            </div>
          )}
        </AnimatedSection>

        <AnimatedSection id="katilim-finans" setActive={setActiveSection}>
          <SectionHeader
            title="Katılım Finans Uygunluğu"
            subtitle="İslami finans prensiplerine göre analiz"
          />
          <p className="mt-4 text-gray-400">
            Bu bölüme katılım finans verileriniz gelecek.
          </p>
        </AnimatedSection>
      </main>
    </div>
  );
}

// --- YARDIMCI / GRAFİK ---
function AnimatedSection({
  id,
  setActive,
  children,
}: {
  id: string;
  setActive: (id: string) => void;
  children: React.ReactNode;
}) {
  const ref = useRef(null);
  const isInView = useInView(ref, { amount: 0.3, once: false });
  useEffect(() => {
    if (isInView) {
      setActive(id);
    }
  }, [isInView, id, setActive]);

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

function SectionHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <>
      <h2 className="text-4xl md:text-5xl font-bold text-white tracking-tighter">
        {title}
      </h2>
      <p className="text-lg text-cyan-400 mt-1">{subtitle}</p>
      <div className="w-24 h-1 bg-cyan-500 rounded-full mt-4"></div>
    </>
  );
}

function InfoCard({
  title,
  value,
  isSmall = false,
  isLink = false,
}: {
  title: string;
  value: string;
  isSmall?: boolean;
  isLink?: boolean;
}) {
  return (
    <div className="bg-gray-800/50 p-4 rounded-xl border border-gray-700/50">
      <p className="text-sm text-gray-400">{title}</p>
      {isLink && value && value !== "N/A" ? (
        <a
          href={`https://${value}`}
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold text-cyan-400 mt-1 block truncate"
        >
          {value}
        </a>
      ) : (
        <p
          className={`font-semibold text-white mt-1 ${
            isSmall ? "text-base" : "text-2xl"
          }`}
        >
          {value}
        </p>
      )}
    </div>
  );
}

function BalanceSheetTreemap({ title, data }: { title: string; data: any[] }) {
  return (
    <div className="bg-gray-800/50 p-4 rounded-2xl border border-gray-700/50 w-full h-full flex flex-col">
      <h3 className="text-lg font-bold text-white mb-4">{title}</h3>
      <ResponsiveContainer width="100%" height="100%">
        <Treemap
          data={data}
          dataKey="value"
          stroke="#fff"
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
        style={{
          fill: color || (depth === 1 ? "#1f2937" : "#06b6d4"),
          stroke: "#111827",
          strokeWidth: 2,
        }}
        whileHover={{ fill: "#0e7490" }}
        transition={{ duration: 0.2 }}
      />
      {width > 80 && height > 30 && (
        <text
          x={x + width / 2}
          y={y + height / 2 + 7}
          textAnchor="middle"
          fill="#fff"
          fontSize={14}
        >
          <tspan x={x + width / 2} dy="-0.5em">
            {name}
          </tspan>
          <tspan x={x + width / 2} dy="1.2em" fillOpacity={0.7}>
            {value.toFixed(1)}b ₺
          </tspan>
        </text>
      )}
    </g>
  );
}

function IncomeSankeyChart({ data }: { data: any }) {
  const sankeyData = {
    revenue: { value: data.revenue, label: "Hasılat" },
    cost: { value: data.cost, label: "Satışların Maliyeti" },
    grossProfit: { value: data.grossProfit, label: "Brüt Kâr" },
    expenses: { value: data.opex ?? data.expenses, label: "Faaliyet Giderleri" },
    earnings: { value: data.earnings, label: "Esas Faaliyet Kârı" },
  };
  return (
    <div className="mt-8 p-6 bg-gray-800/50 rounded-2xl border border-gray-700/50">
      <div className="flex items-center justify-between space-x-4 text-center">
        <div className="w-1/5">
          <SankeyNode {...sankeyData.revenue} color="bg-cyan-500" />
        </div>
        <div className="w-1/5 flex flex-col items-center">
          <SankeyNode {...sankeyData.cost} color="bg-orange-500" />
        </div>
        <div className="w-1/5">
          <SankeyNode {...sankeyData.grossProfit} color="bg-emerald-500" />
        </div>
        <div className="w-1/5 flex items-center justify-center">
          <SankeyNode {...sankeyData.expenses} color="bg-red-500" />
        </div>
        <div className="w-1/5">
          <SankeyNode {...sankeyData.earnings} color="bg-purple-500" />
        </div>
      </div>
    </div>
  );
}

function SankeyNode({
  value,
  label,
  color,
}: {
  value: number;
  label: string;
  color: string;
}) {
  return (
    <div className="flex flex-col items-center">
      <p className="text-sm text-gray-400 mb-1">{label}</p>
      <div className={`p-4 rounded-lg text-white font-bold w-full ${color}`}>
        {fmtMoney(value)}
      </div>
    </div>
  );
}

function CashFlowWaterfallChart({ data }: { data: any[] }) {
  let cumulative = 0;
  const processedData = data.map((item) => {
    if (item.isResult) {
      return { ...item, start: 0, end: item.value };
    }
    const start = cumulative;
    cumulative += item.value;
    return { ...item, start, end: cumulative, value: item.value };
  });
  return (
    <div className="h-[400px] bg-gray-800/50 p-6 rounded-2xl border border-gray-700/50 mt-6">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={processedData}
          margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
        >
          <XAxis dataKey="name" stroke="#9ca3af" />
          <YAxis
            stroke="#9ca3af"
            tickFormatter={(tick) => fmtMoney(tick) as string}
          />
          <Tooltip
            cursor={{ fill: "rgba(255,255,255,0.1)" }}
            contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151" }}
            formatter={(value: any) => fmtMoney(value)}
          />
          <Bar dataKey="start" stackId="a" fill="transparent" />
          <Bar dataKey="value" stackId="a">
            {processedData.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={
                  entry.isResult ? "#8b5cf6" : entry.value > 0 ? "#10b981" : "#ef4444"
                }
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

const COLORS = ["#06b6d4", "#6366f1", "#a855f7", "#ec4899"];
function OwnershipPieChart({ data }: { data: any[] }) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          labelLine={false}
          outerRadius={120}
          fill="#8884d8"
          dataKey="value"
          nameKey="name"
          label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
        >
          {data.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151" }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
