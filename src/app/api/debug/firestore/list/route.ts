import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";

/**
 * GET /api/debug/firestore/list?path=<DOCUMENT path>
 * Örn: /api/debug/firestore/list?path=tickers/AEFES
 *      /api/debug/firestore/list?path=tickers/AEFES/kap
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const rawPath = searchParams.get("path") || "";
  if (!rawPath) return NextResponse.json({ ok: false, error: "Missing ?path" }, { status: 400 });

  const path = decodeURIComponent(rawPath).replace(/^\/+|\/+$/g, "");
  const parts = path.split("/").filter(Boolean);
  if (parts.length % 2 !== 0) {
    return NextResponse.json({ ok: false, error: "Path must be a DOCUMENT (even number of segments)" }, { status: 400 });
  }

  try {
    const docRef = adminDb.doc(path);
    const subcols = await docRef.listCollections();

    const subcollections = await Promise.all(
      subcols.map(async (c) => {
        let count = 0;
        try {
          // Firestore aggregate count (varsa)
          // @ts-ignore
          const agg = await c.count().get();
          // @ts-ignore
          count = agg.data().count || 0;
        } catch {
          const snap = await c.limit(1).get();
          count = snap.empty ? 0 : -1; // -1: aggregate yok ama koleksiyon dolu
        }
        return { id: c.id, fullPath: c.path, count };
      })
    );

    return NextResponse.json({ ok: true, path, subcollections });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}
