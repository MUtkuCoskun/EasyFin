// src/app/company/[ticker]/CompanyPageClient.tsx
"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import { motion, useInView, useMotionValue, useSpring, useMotionValueEvent } from "framer-motion";

import {
  FiInfo, FiBarChart2, FiPieChart, FiTrendingUp,
  FiBriefcase, FiUsers, FiCheckSquare, FiArrowRight, FiX
} from "react-icons/fi";
import { Treemap, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie } from "recharts";

type PageData = {
  ticker: string;
  generalInfo: any;
  valuationRatios: any; // { pe, pb, ps, evEbitda, netDebtEbitda }
  balanceSheet: { assets: any[]; liabilities: any[] };
  incomeStatement: any;
  cashFlow: any[];
  ownership: any;
  management: { name: string; position: string }[];
};

function fmtMoney(n: number | null | undefined) {
  if (n == null || !isFinite(n)) return "–";
  return new Intl.NumberFormat("tr-TR", { notation: "compact", maximumFractionDigits: 2 }).format(n);
}

/* ================================
   Ultra Modern Valuation Indicators
   ================================ */

const METRICS = [
  { 
    key: "pe", 
    baslik: "F/K", 
    ipucu: "Son 12 ay", 
    min: 0, 
    max: 40,
    gradient: "from-cyan-400 via-blue-500 to-purple-600",
    shadowColor: "rgba(14, 165, 233, 0.4)"
  },
  { 
    key: "pb", 
    baslik: "PD/DD", 
    ipucu: "Piyasa/Defter", 
    min: 0, 
    max: 8,
    gradient: "from-emerald-400 via-teal-500 to-cyan-600",
    shadowColor: "rgba(16, 185, 129, 0.4)"
  },
  { 
    key: "ps", 
    baslik: "Fiyat/Satış", 
    ipucu: "Satış çarpanı", 
    min: 0, 
    max: 12,
    gradient: "from-purple-400 via-pink-500 to-rose-600",
    shadowColor: "rgba(168, 85, 247, 0.4)"
  },
  { 
    key: "evEbitda", 
    baslik: "FD/FAVÖK", 
    ipucu: "Firma Değeri/FAVÖK", 
    min: 0, 
    max: 25,
    gradient: "from-orange-400 via-red-500 to-pink-600",
    shadowColor: "rgba(249, 115, 22, 0.4)"
  },
  { 
    key: "netDebtEbitda", 
    baslik: "Net Borç/FAVÖK", 
    ipucu: "Kaldıraç", 
    min: -2, 
    max: 8,
    gradient: "from-indigo-400 via-purple-500 to-fuchsia-600",
    shadowColor: "rgba(99, 102, 241, 0.4)"
  },
] as const;

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

function ModernRatioCard({
  oran, min, max, baslik, ipucu, gradient, shadowColor
}: {
  oran: number | null;
  min: number;
  max: number;
  baslik: string;
  ipucu: string;
  gradient: string;
  shadowColor: string;
}) {
  const [isHovered, setIsHovered] = useState(false);
  const [mousePos, setMousePos] = useState({ x: 0.5, y: 0.5 });
  const cardRef = useRef<HTMLDivElement>(null);

  const percentage = useMemo(() => {
    if (oran == null || !isFinite(oran)) return 0;
    return clamp((oran - min) / (max - min), 0, 1) * 100;
  }, [oran, min, max]);

  const animatedPercentage = useMotionValue(0);
  const animatedValue = useMotionValue(0);
  
  const springConfig = { stiffness: 100, damping: 20, mass: 1.2 };
  const animPercentage = useSpring(animatedPercentage, springConfig);
  const animValue = useSpring(animatedValue, springConfig);

  useEffect(() => {
    animatedPercentage.set(percentage);
    animatedValue.set(oran ?? 0);
  }, [percentage, oran, animatedPercentage, animatedValue]);

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    setMousePos({
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top) / rect.height,
    });
  };

  const displayValue = oran == null || !isFinite(oran) 
    ? "–" 
    : oran >= 10 
      ? oran.toFixed(0) 
      : oran.toFixed(1);

  return (
    <motion.div
      ref={cardRef}
      className="group relative overflow-hidden"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onMouseMove={handleMouseMove}
      whileHover={{ scale: 1.02 }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
    >
      {/* Glassmorphism Container */}
      <motion.div
        className="relative h-[280px] backdrop-blur-xl bg-white/[0.08] border border-white/[0.12] rounded-3xl overflow-hidden"
        style={{
          background: isHovered 
            ? `linear-gradient(135deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.05) 100%)`
            : `linear-gradient(135deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 100%)`,
        }}
        animate={{
          rotateX: isHovered ? (0.5 - mousePos.y) * 8 : 0,
          rotateY: isHovered ? (mousePos.x - 0.5) * 8 : 0,
          boxShadow: isHovered 
            ? `0 20px 60px -12px ${shadowColor}, 0 0 0 1px rgba(255,255,255,0.1)`
            : `0 8px 32px -8px ${shadowColor.replace('0.4', '0.2')}, 0 0 0 1px rgba(255,255,255,0.05)`,
        }}
        transition={{ type: "spring", stiffness: 200, damping: 25 }}
      >
        {/* Animated Gradient Background */}
        <motion.div
          className={`absolute inset-0 bg-gradient-to-br ${gradient} opacity-0`}
          animate={{ opacity: isHovered ? 0.1 : 0.05 }}
          transition={{ duration: 0.6 }}
        />

        {/* Floating Orbs */}
        <div className="absolute inset-0 overflow-hidden">
          <motion.div
            className={`absolute top-4 right-4 w-16 h-16 bg-gradient-to-br ${gradient} rounded-full blur-xl opacity-30`}
            animate={{
              x: isHovered ? mousePos.x * 10 : 0,
              y: isHovered ? mousePos.y * 10 : 0,
              scale: isHovered ? 1.2 : 1,
            }}
            transition={{ type: "spring", stiffness: 150, damping: 20 }}
          />
          <motion.div
            className={`absolute bottom-6 left-6 w-12 h-12 bg-gradient-to-br ${gradient} rounded-full blur-lg opacity-20`}
            animate={{
              x: isHovered ? -mousePos.x * 8 : 0,
              y: isHovered ? -mousePos.y * 8 : 0,
              scale: isHovered ? 1.3 : 1,
            }}
            transition={{ type: "spring", stiffness: 180, damping: 25 }}
          />
        </div>

        {/* Content */}
        <div className="relative z-10 h-full flex flex-col justify-between p-6">
          {/* Header */}
          <div className="text-center">
            <motion.h3 
              className="text-sm font-medium text-white/60 mb-1"
              animate={{ y: isHovered ? -2 : 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
            >
              {baslik}
            </motion.h3>
            <motion.p 
              className="text-xs text-white/40"
              animate={{ opacity: isHovered ? 0.8 : 0.6 }}
              transition={{ duration: 0.3 }}
            >
              {ipucu}
            </motion.p>
          </div>

          {/* Circular Progress */}
          <div className="flex-1 flex items-center justify-center">
            <div className="relative">
              {/* Background Ring */}
              <svg width="140" height="140" className="transform -rotate-90">
                <circle
                  cx="70"
                  cy="70"
                  r="60"
                  stroke="rgba(255,255,255,0.1)"
                  strokeWidth="8"
                  fill="none"
                  strokeLinecap="round"
                />
                {/* Progress Ring */}
                <motion.circle
                  cx="70"
                  cy="70"
                  r="60"
                  stroke={`url(#gradient-${baslik})`}
                  strokeWidth="8"
                  fill="none"
                  strokeLinecap="round"
                  strokeDasharray={`${2 * Math.PI * 60}`}
                  initial={{ strokeDashoffset: `${2 * Math.PI * 60}` }}
                  animate={{ 
                    strokeDashoffset: `${2 * Math.PI * 60 * (1 - percentage / 100)}`,
                    filter: isHovered ? "drop-shadow(0 0 8px rgba(255,255,255,0.4))" : "none"
                  }}
                  transition={{ duration: 1.5, ease: "easeOut" }}
                />
                
                {/* Gradient Definition */}
                <defs>
                  <linearGradient id={`gradient-${baslik}`} x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="rgba(255,255,255,0.9)" />
                    <stop offset="50%" stopColor="rgba(255,255,255,0.6)" />
                    <stop offset="100%" stopColor="rgba(255,255,255,0.3)" />
                  </linearGradient>
                </defs>
              </svg>

              {/* Center Value */}
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <motion.div
                  className="text-3xl font-black text-white"
                  animate={{ 
                    scale: isHovered ? 1.1 : 1,
                    textShadow: isHovered ? "0 0 20px rgba(255,255,255,0.5)" : "none"
                  }}
                  transition={{ type: "spring", stiffness: 300, damping: 30 }}
                >
                  {displayValue}
                  {oran != null && isFinite(oran) && (
                    <span className="text-lg font-normal text-white/70">x</span>
                  )}
                </motion.div>
                <motion.div
                  className="text-xs text-white/50 mt-1"
                  animate={{ opacity: isHovered ? 0.8 : 0.5 }}
                  transition={{ duration: 0.3 }}
                >
                  {Math.round(percentage)}%
                </motion.div>
              </div>
            </div>
          </div>

          {/* Status Indicator */}
          <div className="flex items-center justify-center">
            <motion.div
              className={`w-2 h-2 rounded-full bg-gradient-to-r ${gradient}`}
              animate={{
                scale: isHovered ? [1, 1.3, 1] : 1,
                boxShadow: isHovered ? `0 0 12px 2px ${shadowColor}` : `0 0 6px 1px ${shadowColor}`
              }}
              transition={{ 
                scale: { repeat: isHovered ? Infinity : 0, duration: 1.5 },
                boxShadow: { duration: 0.3 }
              }}
            />
          </div>
        </div>

        {/* Hover Overlay */}
        <motion.div
          className="absolute inset-0 bg-gradient-to-br from-white/[0.08] to-transparent pointer-events-none"
          animate={{ opacity: isHovered ? 1 : 0 }}
          transition={{ duration: 0.3 }}
        />
      </motion.div>
    </motion.div>
  );
}

function DegerlemePanel3D({ ratios }: { ratios: any }) {
  return (
    <div className="mt-8">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6">
        {METRICS.map(m => (
          <ModernRatioCard
            key={m.key}
            oran={ratios?.[m.key] ?? null}
            min={m.min}
            max={m.max}
            baslik={m.baslik}
            ipucu={m.ipucu}
            gradient={m.gradient}
            shadowColor={m.shadowColor}
          />
        ))}
      </div>
    </div>
  );
}

/* ================================
   Sayfanın geri kalanı
   ================================ */

export default function CompanyPageClient({ data }: { data: PageData }) {
  const { ticker, generalInfo, valuationRatios, balanceSheet, incomeStatement, cashFlow, ownership, management } = data;

  const sections = {
    'genel-bakis':    { title: 'Genel Bakış',      icon: <FiInfo /> },
    'degerleme':      { title: 'Değerleme',        icon: <FiBarChart2 /> },
    'bilanco':        { title: 'Bilanço',          icon: <FiBriefcase /> },
    'gelir-tablosu':  { title: 'Gelir Tablosu',    icon: <FiTrendingUp /> },
    'nakit-akis':     { title: 'Nakit Akışı',      icon: <FiTrendingUp /> },
    'ortaklik-yapisi':{ title: 'Ortaklık Yapısı',  icon: <FiPieChart /> },
    'yonetim':        { title: 'Yönetim',          icon: <FiUsers /> },
    'katilim-finans': { title: 'Katılım Finans',   icon: <FiCheckSquare /> },
  } as const;

  const [activeSection, setActiveSection] = useState('genel-bakis');
  const [showAllManagers, setShowAllManagers] = useState(false);

  return (
    <div className="bg-gray-900 text-gray-200 min-h-screen font-sans flex">
      <aside className="w-64 hidden lg:block sticky top-0 h-screen bg-gray-900/70 backdrop-blur-sm border-r border-gray-800 p-6">
        <h2 className="text-2xl font-bold text-white mb-2">{ticker}</h2>
        <nav className="mt-8 space-y-2">
          {Object.entries(sections).map(([id, { title, icon }]) => (
            <a key={id} href={`#${id}`}
              className={`flex items-center px-4 py-2 rounded-lg transition-all duration-200 ${activeSection === id ? 'bg-cyan-500 text-white font-bold shadow-lg' : 'text-gray-400 hover:bg-gray-800 hover:text-white'}`}>
              {icon}
              <span className="ml-3">{title}</span>
            </a>
          ))}
        </nav>
      </aside>

      <main className="flex-1 p-4 sm:p-6 lg:p-12 overflow-y-auto">
        {/* GENEL */}
        <AnimatedSection id="genel-bakis" setActive={setActiveSection}>
          <SectionHeader title="Genel Bakış" subtitle={generalInfo.companyName} />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-6">
            <InfoCard title="Piyasa Değeri" value={fmtMoney(generalInfo.marketCap)} />
            <InfoCard title="Son Fiyat" value={`${generalInfo.lastPrice != null ? generalInfo.lastPrice.toFixed(2) : '–'} ₺`} />
            <InfoCard title="Ana Sektör" value={generalInfo.sector} />
            <InfoCard title="Alt Sektör" value={generalInfo.subSector} />
            <InfoCard title="Adres" value={generalInfo.address} isSmall />
            <InfoCard title="Web Sitesi" value={generalInfo.website} isLink />
          </div>
        </AnimatedSection>

        {/* DEĞERLEME – MODERN */}
        <AnimatedSection id="degerleme" setActive={setActiveSection}>
          <SectionHeader title="Finansal Değerleme" subtitle="Şirket çarpanları ve rasyolar" />
          <DegerlemePanel3D ratios={valuationRatios} />
        </AnimatedSection>

        {/* BİLANÇO */}
        <AnimatedSection id="bilanco" setActive={setActiveSection}>
          <SectionHeader title="Bilanço Yapısı" subtitle="Varlık ve yükümlülüklerin dağılımı" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-6 h-[500px]">
            <BalanceSheetTreemap title="Varlıklar" data={balanceSheet.assets} />
            <BalanceSheetTreemap title="Yükümlülükler + Özkaynaklar" data={balanceSheet.liabilities} />
          </div>
        </AnimatedSection>

        {/* GELİR TABLOSU */}
        <AnimatedSection id="gelir-tablosu" setActive={setActiveSection}>
          <SectionHeader title="Gelir ve Kârlılık Akışı" subtitle="Satışlardan net kâra yolculuk" />
          <IncomeSankeyChart data={incomeStatement} />
        </AnimatedSection>

        {/* NAKİT AKIŞI */}
        <AnimatedSection id="nakit-akis" setActive={setActiveSection}>
          <SectionHeader title="Serbest Nakit Akışı Analizi" subtitle="Kârdan serbest nakit akışına" />
          <CashFlowWaterfallChart data={cashFlow.filter(item => item.value != null)} />
        </AnimatedSection>

        {/* ORTAKLIK */}
        <AnimatedSection id="ortaklik-yapisi" setActive={setActiveSection}>
          <SectionHeader title="Ortaklık ve İştirakler" subtitle="Sermayedeki pay dağılımı" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-6">
            <div className="bg-gray-800/50 p-6 rounded-2xl border border-gray-700/50">
              <h3 className="text-lg font-bold text-white mb-4">Sermaye Dağılımı</h3>
              <OwnershipPieChart data={ownership.shareholders} />
            </div>
            <div className="bg-gray-800/50 p-6 rounded-2xl border border-gray-700/50">
              <h3 className="text-lg font-bold text-white mb-4">Bağlı Ortaklıklar</h3>
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

        {/* YÖNETİM */}
        <AnimatedSection id="yonetim" setActive={setActiveSection}>
          <SectionHeader title="Yönetim Kurulu" subtitle="Şirketin kilit yöneticileri" />
          <YonetimList management={management} showAllManagers={showAllManagers} setShowAllManagers={setShowAllManagers} />
        </AnimatedSection>

        {/* KATILIM */}
        <AnimatedSection id="katilim-finans" setActive={setActiveSection}>
          <SectionHeader title="Katılım Finans Uygunluğu" subtitle="İslami finans prensiplerine göre analiz" />
          <p className="mt-4 text-gray-400"> Bu bölüme katılım finans verileriniz gelecek. </p>
        </AnimatedSection>
      </main>
    </div>
  );
}

/* === Yardımcı parçalar === */

function AnimatedSection({ id, setActive, children }: { id: string; setActive: (id: string) => void; children: React.ReactNode; }) {
  const ref = useRef(null);
  const isInView = useInView(ref, { amount: 0.3, once: false });
  useEffect(() => { if (isInView) setActive(id); }, [isInView, id, setActive]);

  return (
    <motion.section id={id} ref={ref} className="min-h-[60vh] py-16"
      initial={{ opacity: 0, y: 50 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.6 }}>
      {children}
    </motion.section>
  );
}

function SectionHeader({ title, subtitle }: { title: string; subtitle: string; }) {
  return (
    <>
      <h2 className="text-4xl md:text-5xl font-bold text-white tracking-tighter">{title}</h2>
      <p className="text-lg text-cyan-400 mt-1">{subtitle}</p>
      <div className="w-24 h-1 bg-cyan-500 rounded-full mt-4"></div>
    </>
  );
}

function InfoCard({ title, value, isSmall = false, isLink = false }: { title: string; value: string; isSmall?: boolean; isLink?: boolean; }) {
  return (
    <div className="bg-gray-800/50 p-4 rounded-xl border border-gray-700/50">
      <p className="text-sm text-gray-400">{title}</p>
      {isLink && value && value !== 'N/A' ? (
        <a href={`https://${value}`} target="_blank" rel="noopener noreferrer" className="font-semibold text-cyan-400 mt-1 block truncate">
          {value}
        </a>
      ) : (
        <p className={`font-semibold text-white mt-1 ${isSmall ? 'text-base' : 'text-2xl'}`}>
          {value}
        </p>
      )}
    </div>
  );
}

function BalanceSheetTreemap({ title, data }: { title: string; data: any[]; }) {
  return (
    <div className="bg-gray-800/50 p-4 rounded-2xl border border-gray-700/50 w-full h-full flex flex-col">
      <h3 className="text-lg font-bold text-white mb-4">{title}</h3>
      <ResponsiveContainer width="100%" height="100%">
        <Treemap data={data} dataKey="value" stroke="#fff" fill="#1f2937" content={<CustomTreemapContent />} aspectRatio={4 / 3} />
      </ResponsiveContainer>
    </div>
  );
}

function CustomTreemapContent(props: any) {
  const { depth, x, y, width, height, name, value, color } = props;
  return (
    <g>
      <motion.rect x={x} y={y} width={width} height={height}
        style={{ fill: color || (depth === 1 ? '#1f2937' : '#06b6d4'), stroke: '#111827', strokeWidth: 2 }}
        whileHover={{ fill: '#0e7490' }} transition={{ duration: 0.2 }} />
      {width > 80 && height > 30 && (
        <text x={x + width / 2} y={y + height / 2 + 7} textAnchor="middle" fill="#fff" fontSize={14}>
          <tspan x={x + width / 2} dy="-0.5em">{name}</tspan>
          <tspan x={x + width / 2} dy="1.2em" fillOpacity={0.7}>{value.toFixed(1)}b ₺</tspan>
        </text>
      )}
    </g>
  );
}

function IncomeSankeyChart({ data }: { data: any; }) {
  const sankeyData = {
    revenue: { value: data.revenue, label: "Hasılat" },
    cost: { value: data.cost, label: "Satışların Maliyeti" },
    grossProfit: { value: data.grossProfit, label: "Brüt Kâr" },
    expenses: { value: data.opex ?? data.expenses, label: "Faaliyet Giderleri" },
    earnings: { value: data.earnings, label: "Esas Faaliyet Kârı" }
  };
  return (
    <div className="mt-8 p-6 bg-gray-800/50 rounded-2xl border border-gray-700/50">
      <div className="flex items-center justify-between space-x-4 text-center">
        <div className="w-1/5"><SankeyNode {...sankeyData.revenue} color="bg-cyan-500" /></div>
        <div className="w-1/5 flex flex-col items-center"><SankeyNode {...sankeyData.cost} color="bg-orange-500" /></div>
        <div className="w-1/5"><SankeyNode {...sankeyData.grossProfit} color="bg-emerald-500" /></div>
        <div className="w-1/5 flex items-center justify-center"><SankeyNode {...sankeyData.expenses} color="bg-red-500" /></div>
        <div className="w-1/5"><SankeyNode {...sankeyData.earnings} color="bg-purple-500" /></div>
      </div>
    </div>
  );
}

function SankeyNode({ value, label, color }: { value: number; label: string; color: string; }) {
  return (
    <div className="flex flex-col items-center">
      <p className="text-sm text-gray-400 mb-1">{label}</p>
      <div className={`p-4 rounded-lg text-white font-bold w-full ${color}`}>{fmtMoney(value)}</div>
    </div>
  );
}

function CashFlowWaterfallChart({ data }: { data: any[]; }) {
  let cumulative = 0;
  const processedData = data.map(item => {
    if (item.isResult) { return { ...item, start: 0, end: item.value }; }
    const start = cumulative;
    cumulative += item.value;
    return { ...item, start, end: cumulative, value: item.value };
  });
  return (
    <div className="h-[400px] bg-gray-800/50 p-6 rounded-2xl border border-gray-700/50 mt-6">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={processedData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
          <XAxis dataKey="name" stroke="#9ca3af" />
          <YAxis stroke="#9ca3af" tickFormatter={(tick) => fmtMoney(tick) as string} />
          <Tooltip
            cursor={{ fill: 'rgba(255,255,255,0.1)' }}
            contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151' }}
            formatter={(value: any) => fmtMoney(value)}
          />
          <Bar dataKey="start" stackId="a" fill="transparent" />
          <Bar dataKey="value" stackId="a">
            {processedData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.isResult ? "#8b5cf6" : entry.value > 0 ? "#10b981" : "#ef4444"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

const COLORS = ['#06b6d4', '#6366f1', '#a855f7', '#ec4899'];
function OwnershipPieChart({ data }: { data: any[]; }) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <PieChart>
        <Pie data={data} cx="50%" cy="50%" labelLine={false} outerRadius={120} fill="#8884d8" dataKey="value" nameKey="name" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
          {data.map((entry, index) => (<Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />))}
        </Pie>
        <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151' }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

function YonetimList({ management, showAllManagers, setShowAllManagers }: any) {
  return (
    <>
      <div className="space-y-2 mt-6">
        {management.slice(0, 5).map((m: any, i: number) => (
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
            <h3 className="text-xl font-bold text-white mb-4">Yönetim Kurulu (Tam Liste)</h3>
            <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
              {management.map((m: any, i: number) => (
                <div key={i} className="bg-gray-800/40 p-4 rounded-lg border border-gray-700/40">
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
    </>
  );
}