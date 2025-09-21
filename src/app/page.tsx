// src/app/page.tsx
"use client";
import { useEffect, useState } from "react";
import { db } from "@/lib/firebase";
import {
  collection, getDocs, orderBy, limit, query,
  Timestamp
} from "firebase/firestore";
import Link from "next/link";

type Ticker = {
  id: string;
  updatedAt?: Timestamp;
  name?: string;
};

export default function HomePage() {
  const [items, setItems] = useState<Ticker[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const q = query(
        collection(db, "tickers"),
        orderBy("updatedAt", "desc"),
        limit(12)
      );
      const snap = await getDocs(q);
      const rows: Ticker[] = snap.docs.map(d => ({
        id: d.id,
        ...(d.data() as any),
      }));
      setItems(rows);
      setLoading(false);
    })();
  }, []);

  if (loading) return <div className="p-6">Yükleniyor…</div>;

  return (
    <main className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-semibold mb-4">Son güncellenenler</h1>
      <ul className="grid gap-2">
        {items.map((t) => (
          <li key={t.id} className="border rounded p-3 hover:bg-black/5">
            <Link href={`/${t.id}`}>
              <span className="font-medium">{t.id}</span>{" "}
              <span className="text-sm text-gray-500">
                {t.name ? `· ${t.name}` : ""}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
