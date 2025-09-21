import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";

/**
 * GET /api/debug/firestore?path=<doc or collection path>
 *  - Doc ör.:  tickers/AEFES/sheets/FIN.table
 *  - Coll ör.: tickers/AEFES/kap/board_members/rows
 *    + opsiyonel: &orderBy=rowno&limit=200&dir=asc|desc
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const rawPath = searchParams.get("path") || "";
  if (!rawPath) {
    return NextResponse.json(
      { ok: false, error: "Missing ?path=..." },
      { status: 400 }
    );
  }

  // URL-encoded path’i decode et (gönderirken zaten encode etmiştik)
  const path = decodeURIComponent(rawPath).replace(/^\/+|\/+$/g, "");

  // orderBy / limit / direction
  const orderBy = searchParams.get("orderBy") || undefined;
  const dir = (searchParams.get("dir") || "asc").toLowerCase() === "desc" ? "desc" : "asc";
  const limitN = Math.max(0, Math.min(1000, Number(searchParams.get("limit") || 0)));

  try {
    // path’i component sayısına göre doc mu coll mu ayır
    const parts = path.split("/").filter(Boolean);
    if (parts.length === 0) {
      return NextResponse.json({ ok: false, error: "Invalid path" }, { status: 400 });
    }

    if (parts.length % 2 === 0) {
      // DOC
      const snap = await adminDb.doc(path).get();
      if (!snap.exists) {
        return NextResponse.json({ ok: true, type: "doc", exists: false, path });
      }
      return NextResponse.json(
        { ok: true, type: "doc", exists: true, path, data: snap.data() },
        { headers: { "Cache-Control": "no-store" } }
      );
    } else {
      // COLLECTION
      let q: FirebaseFirestore.Query = adminDb.collection(path);

      if (orderBy) q = q.orderBy(orderBy, dir as FirebaseFirestore.OrderByDirection);
      if (limitN > 0) q = q.limit(limitN);

      const qs = await q.get();
      const docs = qs.docs.map(d => ({ id: d.id, ...d.data() }));

      return NextResponse.json(
        {
          ok: true,
          type: "collection",
          path,
          count: docs.length,
          ordered: !!orderBy,
          docs
        },
        { headers: { "Cache-Control": "no-store" } }
      );
    }
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: String(e?.message || e) },
      { status: 500 }
    );
  }
}
