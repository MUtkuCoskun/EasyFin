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
    shadowColor: "rgba(14, 165, 233, 0.4)",
    dataLabel: "HBK - Net Kar"
  },
  { 
    key: "pb", 
    baslik: "PD/DD", 
    ipucu: "Piyasa/Defter", 
    min: 0, 
    max: 8,
    gradient: "from-emerald-400 via-teal-500 to-cyan-600",
    shadowColor: "rgba(16, 185, 129, 0.4)",
    dataLabel: "Piyasa Değeri - Defter Değeri"
  },
  { 
    key: "ps", 
    baslik: "Fiyat/Satış", 
    ipucu: "Satış çarpanı", 
    min: 0, 
    max: 12,
    gradient: "from-purple-400 via-pink-500 to-rose-600",
    shadowColor: "rgba(168, 85, 247, 0.4)",
    dataLabel: "Piyasa Değeri - Satışlar"
  },
  { 
    key: "evEbitda", 
    baslik: "FD/FAVÖK", 
    ipucu: "Firma Değeri/FAVÖK", 
    min: 0, 
    max: 25,
    gradient: "from-orange-400 via-red-500 to-pink-600",
    shadowColor: "rgba(249, 115, 22, 0.4)",
    dataLabel: "Firma Değeri - FAVÖK"
  },
  { 
    key: "netDebtEbitda", 
    baslik: "Net Borç/FAVÖK", 
    ipucu: "Kaldıraç", 
    min: -2, 
    max: 8,
    gradient: "from-indigo-400 via-purple-500 to-fuchsia-600",
    shadowColor: "rgba(99, 102, 241, 0.4)",
    dataLabel: "Net Borç - FAVÖK"
  },
] as const;

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

function ModernRatioCard({
  oran, min, max, baslik, ipucu, gradient, shadowColor, dataLabel
}: {
  oran: number | null;
  min: number;
  max: number;
  baslik: string;
  ipucu: string;
  gradient: string;
  shadowColor: string;
  dataLabel: string;
}) {
  const [isHovered, setIsHovered] = useState(false);
  const [mousePos, setMousePos] = useState({ x: 0.5, y: 0.5 });
  const cardRef = useRef<HTMLDivElement>(null);

  const percentage = useMemo(() => {
    if (oran == null || !isFinite(oran)) return 0;
    return Math.min(100, clamp((oran - min) / (max - min), 0, 1) * 100);
  }, [oran, min, max]);

  const animatedPercentage = useMotionValue(0);
  const animatedValue = useMotionValue(0);
  
  const springConfig = { stiffness: 80, damping: 25, mass: 1.0 };
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
            ? `linear-gradient(135deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0.06) 100%)`
            : `linear-gradient(135deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.03) 100%)`,
        }}
        animate={{
          rotateX: isHovered ? (0.5 - mousePos.y) * 8 : 0,
          rotateY: isHovered ? (mousePos.x - 0.5) * 8 : 0,
          boxShadow: isHovered 
            ? `0 20px 60px -12px ${shadowColor}, 0 0 0 1px rgba(255,255,255,0.15)`
            : `0 8px 32px -8px ${shadowColor.replace('0.4', '0.25')}, 0 0 0 1px rgba(255,255,255,0.08)`,
        }}
        transition={{ type: "spring", stiffness: 200, damping: 25 }}
      >
        {/* Smooth Multi-Stop Gradient Background */}
        <motion.div
          className={`absolute inset-0 bg-gradient-to-br ${gradient}`}
          style={{
            background: `linear-gradient(135deg, 
              rgba(6, 182, 212, 0.1) 0%,
              rgba(34, 211, 238, 0.08) 20%,
              rgba(59, 130, 246, 0.06) 40%,
              rgba(99, 102, 241, 0.08) 60%,
              rgba(139, 92, 246, 0.1) 80%,
              rgba(168, 85, 247, 0.12) 100%
            )`
          }}
          animate={{ 
            opacity: isHovered ? 0.2 : 0.1,
            scale: isHovered ? 1.02 : 1
          }}
          transition={{ duration: 1.2, ease: [0.25, 0.46, 0.45, 0.94] }}
        />

        {/* Floating Orbs */}
        <div className="absolute inset-0 overflow-hidden">
          <motion.div
            className={`absolute top-4 right-4 w-16 h-16 bg-gradient-to-br ${gradient} rounded-full blur-xl opacity-25`}
            animate={{
              x: isHovered ? mousePos.x * 12 : 0,
              y: isHovered ? mousePos.y * 12 : 0,
              scale: isHovered ? 1.3 : 1,
              opacity: isHovered ? 0.35 : 0.25,
            }}
            transition={{ type: "spring", stiffness: 120, damping: 20 }}
          />
          <motion.div
            className={`absolute bottom-6 left-6 w-12 h-12 bg-gradient-to-br ${gradient} rounded-full blur-lg opacity-15`}
            animate={{
              x: isHovered ? -mousePos.x * 10 : 0,
              y: isHovered ? -mousePos.y * 10 : 0,
              scale: isHovered ? 1.4 : 1,
              opacity: isHovered ? 0.25 : 0.15,
            }}
            transition={{ type: "spring", stiffness: 150, damping: 25 }}
          />
        </div>

        {/* Content */}
        <div className="relative z-10 h-full flex flex-col justify-between p-6">
          {/* Header */}
          <div className="text-center">
            <motion.h3 
              className="text-sm font-black text-white mb-1"
              animate={{ 
                y: isHovered ? -2 : 0,
                textShadow: isHovered ? "0 0 15px rgba(255,255,255,0.3)" : "0 0 8px rgba(255,255,255,0.1)"
              }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
            >
              {baslik}
            </motion.h3>
            <motion.p 
              className="text-xs font-semibold text-white/85"
              animate={{ 
                opacity: isHovered ? 0.95 : 0.85,
                textShadow: isHovered ? "0 0 10px rgba(255,255,255,0.2)" : "none"
              }}
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
                  stroke="rgba(255,255,255,0.2)"
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
                    filter: isHovered 
                      ? "drop-shadow(0 0 15px rgba(255,255,255,0.8))" 
                      : "drop-shadow(0 0 6px rgba(255,255,255,0.4))"
                  }}
                  transition={{ duration: 2.0, ease: [0.25, 0.46, 0.45, 0.94] }}
                />
                
                {/* Enhanced Gradient Definition */}
                <defs>
                  <linearGradient id={`gradient-${baslik}`} x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="rgba(255,255,255,1.0)" />
                    <stop offset="30%" stopColor="rgba(255,255,255,0.9)" />
                    <stop offset="60%" stopColor="rgba(255,255,255,0.8)" />
                    <stop offset="100%" stopColor="rgba(255,255,255,0.7)" />
                  </linearGradient>
                </defs>
              </svg>

              {/* Center Value */}
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <motion.div
                  className="text-3xl font-black text-white"
                  style={{
                    textShadow: isHovered 
                      ? "0 0 25px rgba(255,255,255,0.6), 0 0 10px rgba(255,255,255,0.4)" 
                      : "0 0 12px rgba(255,255,255,0.3)"
                  }}
                  animate={{ 
                    scale: isHovered ? 1.12 : 1,
                  }}
                  transition={{ type: "spring", stiffness: 300, damping: 30 }}
                >
                  {displayValue}
                  {oran != null && isFinite(oran) && (
                    <span className="text-lg font-black text-white">x</span>
                  )}
                </motion.div>
              </div>
            </div>
          </div>

          {/* Data Labels - Empty Space */}
          <div className="flex items-center justify-center h-8">
            {/* Empty space where labels used to be */}
          </div>
        </div>

        {/* Hover Overlay */}
        <motion.div
          className="absolute inset-0 bg-gradient-to-br from-white/[0.1] to-transparent pointer-events-none"
          animate={{ opacity: isHovered ? 1 : 0 }}
          transition={{ duration: 0.4 }}
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
            dataLabel={m.dataLabel}
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
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);

  return (
    <motion.div 
      className="bg-gradient-to-br from-gray-800/60 to-gray-900/80 backdrop-blur-sm p-6 rounded-3xl border border-white/10 w-full h-full flex flex-col relative overflow-hidden"
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.6, delay: 0.2 }}
    >
      {/* Animated Background Orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div
          className="absolute -top-10 -right-10 w-32 h-32 bg-gradient-to-br from-cyan-400/20 to-blue-600/20 rounded-full blur-2xl"
          animate={{
            scale: hoveredItem ? 1.2 : 1,
            opacity: hoveredItem ? 0.3 : 0.2,
          }}
          transition={{ duration: 0.8 }}
        />
        <motion.div
          className="absolute -bottom-8 -left-8 w-24 h-24 bg-gradient-to-br from-purple-400/15 to-pink-600/15 rounded-full blur-xl"
          animate={{
            scale: hoveredItem ? 1.1 : 1,
            opacity: hoveredItem ? 0.25 : 0.15,
          }}
          transition={{ duration: 0.6 }}
        />
      </div>

      <motion.h3 
        className="text-xl font-black text-white mb-6 relative z-10"
        animate={{
          textShadow: hoveredItem 
            ? "0 0 20px rgba(255,255,255,0.4)" 
            : "0 0 10px rgba(255,255,255,0.2)"
        }}
        transition={{ duration: 0.3 }}
      >
        {title}
      </motion.h3>
      
      <div className="flex-1 relative z-10">
        <ResponsiveContainer width="100%" height="100%">
          <Treemap 
            data={data} 
            dataKey="value" 
            stroke="#111827" 
            fill="#1f2937" 
            content={<EnhancedTreemapContent onHover={setHoveredItem} />} 
            aspectRatio={4 / 3} 
          />
        </ResponsiveContainer>
      </div>

      {/* Hover Overlay Effect */}
      <motion.div
        className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent pointer-events-none rounded-3xl"
        animate={{ opacity: hoveredItem ? 1 : 0 }}
        transition={{ duration: 0.3 }}
      />
    </motion.div>
  );
}

function EnhancedTreemapContent({ onHover, ...props }: any & { onHover: (item: string | null) => void }) {
  const { depth, x, y, width, height, name, value, color } = props;
  const [isHovered, setIsHovered] = useState(false);

  const handleMouseEnter = () => {
    setIsHovered(true);
    onHover(name);
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    onHover(null);
  };

  // Dynamic color based on hover state and item type
  const getFillColor = () => {
    if (isHovered) {
      return color === '#1f2937' ? '#0ea5e9' : '#06b6d4'; // Bright cyan on hover
    }
    return color || (depth === 1 ? '#374151' : '#06b6d4');
  };

  return (
    <g>
      <motion.rect 
        x={x} 
        y={y} 
        width={width} 
        height={height}
        fill={getFillColor()}
        stroke="#0f172a"
        strokeWidth={isHovered ? 4 : 2}
        rx={8} // Rounded corners
        ry={8}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        style={{ 
          cursor: 'pointer',
          filter: isHovered 
            ? 'drop-shadow(0 0 20px rgba(6, 182, 212, 0.4)) brightness(1.1)' 
            : 'drop-shadow(0 4px 8px rgba(0, 0, 0, 0.3))',
          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
        }}
        whileHover={{ 
          scale: 1.02,
          transition: { type: "spring", stiffness: 400, damping: 25 }
        }}
      />
      
      {/* Glow effect on hover */}
      {isHovered && (
        <motion.rect
          x={x - 2}
          y={y - 2}
          width={width + 4}
          height={height + 4}
          fill="none"
          stroke="rgba(6, 182, 212, 0.6)"
          strokeWidth={2}
          rx={10}
          ry={10}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
          style={{
            filter: 'blur(4px)'
          }}
        />
      )}

      {/* Text with enhanced styling */}
      {width > 80 && height > 40 && (
        <motion.g
          initial={{ opacity: 0.8 }}
          animate={{ 
            opacity: isHovered ? 1 : 0.9,
            scale: isHovered ? 1.05 : 1
          }}
          transition={{ type: "spring", stiffness: 300, damping: 20 }}
        >
          <text 
            x={x + width / 2} 
            y={y + height / 2} 
            textAnchor="middle" 
            dominantBaseline="central"
            fill="#fff" 
            fontSize={width > 120 ? 16 : 14}
            fontWeight="bold"
            style={{
              textShadow: isHovered 
                ? '0 0 15px rgba(255,255,255,0.8), 0 2px 4px rgba(0,0,0,0.5)' 
                : '0 2px 4px rgba(0,0,0,0.7)',
              filter: isHovered ? 'brightness(1.2)' : 'none'
            }}
          >
            <tspan x={x + width / 2} dy="-0.3em">
              {name}
            </tspan>
            <tspan 
              x={x + width / 2} 
              dy="1.2em" 
              fontSize={width > 120 ? 14 : 12}
              fillOpacity={isHovered ? 0.9 : 0.8}
              fontWeight="600"
            >
              {value.toFixed(1)}b ₺
            </tspan>
          </text>
        </motion.g>
      )}

      {/* Subtle particle effect on hover */}
      {isHovered && (
        <motion.circle
          cx={x + width / 2}
          cy={y + height / 2}
          r={Math.min(width, height) / 6}
          fill="rgba(255, 255, 255, 0.1)"
          initial={{ scale: 0, opacity: 0 }}
          animate={{ 
            scale: [1, 1.5, 1], 
            opacity: [0.3, 0.1, 0] 
          }}
          transition={{ 
            duration: 1.2, 
            repeat: Infinity, 
            ease: "easeOut" 
          }}
        />
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