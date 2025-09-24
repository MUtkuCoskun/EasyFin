// src/app/company/[ticker]/CompanyPageClient.tsx
"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import { motion, useInView, useMotionValue, useSpring, useMotionValueEvent } from "framer-motion";

import {
  FiInfo, FiBarChart2, FiPieChart, FiTrendingUp,
  FiBriefcase, FiUsers, FiCheckSquare, FiArrowRight, FiX
} from "react-icons/fi";
import { Treemap, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie } from "recharts";

// === 3D (WebGL) ===
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Environment, Html } from "@react-three/drei";
import { EffectComposer, Bloom, Vignette } from "@react-three/postprocessing";
import * as THREE from "three";

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
   Fütüristik 3D Değerleme Göstergeleri
   ================================ */

// Tamamen Türkçe başlıklar + Fiyat/Satış (ps)
const METRICS = [
  { key: "pe",            baslik: "F/K",             ipucu: "Son 12 ay",                      min: 0,  max: 40 },
  { key: "pb",            baslik: "PD/DD",           ipucu: "Piyasa/Defter",                  min: 0,  max: 8  },
  { key: "ps",            baslik: "Fiyat/Satış",     ipucu: "Satış çarpanı",                  min: 0,  max: 12 },
  { key: "evEbitda",      baslik: "FD/FAVÖK",        ipucu: "Firma Değeri/FAVÖK",             min: 0,  max: 25 },
  { key: "netDebtEbitda", baslik: "Net Borç/FAVÖK",  ipucu: "Kaldıraç",                       min: -2, max: 8  },
] as const;

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

function renkGradyanDegeri(k: string, v: number) {
  // Orana göre neon renk geçişleri
  const x = Math.max(0, Math.min(1, v));
  const c1 = new THREE.Color("#22d3ee"); // camgöbeği
  const c2 = new THREE.Color("#60a5fa"); // mavi
  const c3 = new THREE.Color("#a78bfa"); // mor
  const c4 = new THREE.Color("#f472b6"); // pembe
  const c5 = new THREE.Color("#10b981"); // yeşil
  const out = new THREE.Color();
  if (k === "netDebtEbitda") {
    // düşük kaldıraç = yeşil -> mavi -> pembe
    if (x < 0.33) out.lerpColors(c5, c2, x / 0.33);
    else if (x < 0.66) out.lerpColors(c2, c3, (x - 0.33) / 0.33);
    else out.lerpColors(c3, c4, (x - 0.66) / 0.34);
  } else {
    // diğerleri = camgöbeği -> mavi -> mor
    if (x < 0.5) out.lerpColors(c1, c2, x / 0.5);
    else out.lerpColors(c2, c3, (x - 0.5) / 0.5);
  }
  return out.getStyle();
}

// --- Donut3D: motion.mesh yerine normal mesh + spring -> state ---
function Donut3D({
  oran, min, max, baslik, ipucu, renkAnahtari
}: {
  oran: number | null;
  min: number;
  max: number;
  baslik: string;
  ipucu: string;
  renkAnahtari: string;
}) {
  const hedefYuzde = useMemo(() => {
    if (oran == null || !isFinite(oran)) return 0;
    return clamp((oran - min) / (max - min), 0, 1);
  }, [oran, min, max]);

  // framer spring
  const mv = useMotionValue(hedefYuzde);
  const p = useSpring(mv, { stiffness: 150, damping: 18, mass: 0.7 });
  useEffect(() => { mv.set(hedefYuzde); }, [hedefYuzde, mv]);

  // spring → local state (Canvas yeniden render alsın diye)
  const [prog, setProg] = useState<number>(hedefYuzde);
  useMotionValueEvent(p, "change", (v) => setProg(v));

  // sayı animasyonu (UI metni)
  const sayiMv = useMotionValue(oran ?? 0);
  const sayi = useSpring(sayiMv, { stiffness: 120, damping: 12 });
  useEffect(() => { sayiMv.set(oran ?? 0); }, [oran, sayiMv]);

  const kartRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState(false);
  const [pt, setPt] = useState({ x: 0.5, y: 0.5 });
  const onMove = (e: React.MouseEvent) => {
    const r = kartRef.current?.getBoundingClientRect();
    if (!r) return;
    setPt({ x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height });
  };

  const renk = useMemo(() => renkGradyanDegeri(renkAnahtari, prog), [prog, renkAnahtari]);
  const degerStr = oran == null || !isFinite(oran) ? "–" : oran >= 10 ? oran.toFixed(0) : oran.toFixed(1);

  return (
    <div
      ref={kartRef}
      className="relative rounded-2xl p-4 bg-gray-900/70 border border-cyan-900/30"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onMouseMove={onMove}
      style={{ transformStyle: "preserve-3d" }}
    >
      <motion.div
        animate={{
          rotateX: hover ? (0.5 - pt.y) * 8 : 0,
          rotateY: hover ? (pt.x - 0.5) * 10 : 0,
          boxShadow: hover ? "0 0 120px -30px rgba(34,211,238,.6)" : "0 0 40px -20px rgba(34,211,238,.35)",
        }}
        transition={{ type: "spring", stiffness: 120, damping: 14 }}
        className="rounded-xl"
      >
        <div className="h-[220px] w-full">
          <Canvas dpr={[1, 2]} camera={{ fov: 35, position: [0, 0, 4.5] }}>
            <ambientLight intensity={0.3} />
            <pointLight position={[2, 3, 2]} intensity={1.2} color={renk} />
            <pointLight position={[-3, -2, 1]} intensity={0.6} color="#0ea5e9" />

            {/* arka plan halka */}
            <mesh rotation={[-Math.PI / 2, 0, 0]}>
              <torusGeometry args={[1.2, 0.16, 64, 256, Math.PI * 2]} />
              <meshStandardMaterial color="#0b1220" metalness={0.2} roughness={0.9} />
            </mesh>

            {/* oran halesi */}
            <mesh rotation={[-Math.PI / 2, 0, 0]}>
              <torusGeometry args={[1.2, 0.16, 64, 256, Math.PI * 2 * prog]} />
              <meshStandardMaterial
                color={renk}
                emissive={new THREE.Color(renk)}
                emissiveIntensity={2.2}
                metalness={0.7}
                roughness={0.25}
              />
            </mesh>

            {/* iç parıltı */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -0.02]}>
              <torusGeometry args={[0.92, 0.06, 32, 128, Math.PI * 2]} />
              <meshStandardMaterial color="#0b1220" emissive={renk} emissiveIntensity={0.6} metalness={0.1} roughness={1} />
            </mesh>

            <Environment preset="city" />
            <EffectComposer>
              <Bloom intensity={1.2} luminanceThreshold={0.2} luminanceSmoothing={0.6} />
              <Vignette eskil={false} offset={0.25} darkness={0.5} />
            </EffectComposer>

            {/* merkez bilgi */}
            <Html center distanceFactor={8}>
              <div className="text-center select-none">
                <p className="text-gray-400 text-xs">{baslik}</p>
                <motion.p
                  className="text-white font-extrabold text-3xl"
                  animate={{ scale: hover ? 1.06 : 1 }}
                  transition={{ type: "spring", stiffness: 220, damping: 12 }}
                >
                  {degerStr}{oran != null && isFinite(oran) ? "x" : ""}
                </motion.p>
                <p className="text-cyan-400/70 text-[11px] mt-1">{ipucu}</p>
              </div>
            </Html>

            <OrbitControls enablePan={false} enableZoom={false} rotateSpeed={0.6} />
          </Canvas>
        </div>
      </motion.div>
    </div>
  );
}

function DegerlemePanel3D({ ratios }: { ratios: any }) {
  return (
    <div className="mt-6 grid grid-cols-1 xs:grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-5">
      {METRICS.map(m => (
        <Donut3D
          key={m.key}
          oran={ratios?.[m.key] ?? null}
          min={m.min}
          max={m.max}
          baslik={m.baslik}
          ipucu={m.ipucu}
          renkAnahtari={String(m.key)}
        />
      ))}
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

        {/* DEĞERLEME – 3D */}
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
