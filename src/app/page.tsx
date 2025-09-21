// src/app/page.tsx  (SERVER)
import Link from "next/link";
import { adminDb } from "../lib/firebaseAdmin";

export default async function HomePage() {
  const snap = await adminDb
    .collection("tickers")
    .orderBy("updatedAt", "desc")
    .limit(12)
    .get();

  const items = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));

  return (
    <main className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-semibold mb-4">Son güncellenenler</h1>
      <ul className="grid gap-2">
        {items.map((t) => (
          <li key={t.id} className="border rounded p-3 hover:bg-black/5">
            <Link href={`/company/${t.id}`}>
              <span className="font-medium">{t.id}</span>{" "}
              <span className="text-sm text-gray-500">{t.name || ""}</span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
