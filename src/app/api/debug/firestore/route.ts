// src/app/api/debug/firestore/route.ts
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";

// Next.js edge davranışlarını kapatalım; nodejs runtime + no cache
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type WhereOp = FirebaseFirestore.WhereFilterOp;

function parseBool(v: string | null, def = false) {
  if (v == null) return def;
  return v === "1" || v.toLowerCase() === "true";
}

function smartParse(val: string | undefined) {
  if (val == null) return val;
  const v = decodeURIComponent(val);
  if (v === "true") return true;
  if (v === "false") return false;
  if (!Number.isNaN(Number(v)) && v.trim() !== "") return Number(v);
  // JSON gibi görünen değerleri deneyelim (["a","b"], {"x":1} vb.)
  try {
    if ((v.startsWith("{") && v.endsWith("}")) || (v.startsWith("[") && v.endsWith("]"))) {
      return JSON.parse(v);
    }
  } catch {}
  return v;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    const rawPath = searchParams.get("path");
    if (!rawPath) {
      return NextResponse.json(
        { ok: false, error: "Missing ?path" },
        { status: 400 }
      );
    }

    // path URL-encoded gelebilir; baştaki /'ları temizle
    const path = decodeURIComponent(rawPath).replace(/^\/+/, "");
    const parts = path.split("/").filter(Boolean);

    // opsiyonlar
    const limitParam = searchParams.get("limit");
    const limit = limitParam ? Math.max(0, Number(limitParam)) : 0;
    const orderBy = searchParams.get("orderBy") || undefined;
    const desc = parseBool(searchParams.get("desc"), false);
    const whereParams = searchParams.getAll("where"); // field,op,value (birden fazla olabilir)

    // Çift segment -> document, tek segment -> collection
    const isDocumentPath = parts.length % 2 === 0;

    if (isDocumentPath) {
      const snap = await adminDb.doc(path).get();
      return NextResponse.json(
        {
          ok: true,
          type: "document",
          path,
          exists: snap.exists,
          data: snap.exists ? snap.data() : null,
        },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    // collection query
    let q: FirebaseFirestore.Query = adminDb.collection(path);

    // where=field,op,value — ör: &where=rowno,>=,0  (çoklu where destekli)
    if (whereParams.length) {
      for (const w of whereParams) {
        const [field, op, ...valueParts] = w.split(",");
        if (!field || !op || valueParts.length === 0) continue;
        const rawValue = valueParts.join(","); // değerin içinde virgül olabilir
        const value = smartParse(rawValue);
        q = q.where(field, op as WhereOp, value);
      }
    }

    if (orderBy) q = q.orderBy(orderBy, desc ? "desc" : "asc");
    if (limit > 0) q = q.limit(limit);

    const snap = await q.get();
    const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    return NextResponse.json(
      {
        ok: true,
        type: "collection",
        path,
        count: docs.length,
        docs,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: String(e?.message || e) },
      { status: 500 }
    );
  }
}
