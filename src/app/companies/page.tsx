// src/app/companies/page.tsx
"use client";
import { useEffect, useMemo, useState } from "react";
import { db } from "@/lib/firebase";
import { collection, getDocs } from "firebase/firestore";
import Link from "next/link";

type Row = { id: string; name?: string };

export default function CompaniesPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [q, setQ] = useState("");

  useEffect(() => {
    (async () => {
      const snap = await getDocs(collection(db, "tickers"));
      setRows(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })));
    })();
  }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter(r =>
      r.id.toLowerCase().includes(s) ||
      (r.name || "").toLowerCase().includes(s)
    );
  }, [rows, q]);

  return (
    <main className="p-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-semibold mb-4">Şirketler</h1>

      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Ara (ör. AEFES veya Anadolu Efes)"
        className="border rounded px-3 py-2 mb-4 w-full"
      />

      <ul className="grid gap-2">
        {filtered.map((r) => (
          <li key={r.id} className="border rounded p-3 hover:bg-black/5">
            <Link href={`/${r.id}`}>
              <span className="font-medium">{r.id}</span>{" "}
              <span className="text-sm text-gray-500">{r.name}</span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
