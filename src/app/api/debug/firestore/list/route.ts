import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";

/**
 * GET /api/debug/firestore/list?path=<document path>
 * Ör: /api/debug/firestore/list?path=tickers/AEFES/kap
 *      /api/debug/firestore/list?path=tickers/AEFES
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const rawPath = searchParams.get("path") || "";
  if (!rawPath) {
    return NextResponse.json({ ok: false, error: "Missing ?path=" }, { status: 400 });
  }

  const path = decodeURIComponent(rawPath).replace(/^\/+|\/+$/g, "");
  const parts = path.split("/").filter(Boolean);

  if (parts.length % 2 !== 0) {
    return NextResponse.json(
      { ok: false, error: "Path must point to a DOCUMENT (even number of segments)." },
      { status: 400 }
    );
  }

  try {
    const docRef = adminDb.doc(path);
    const subcols = await docRef.listCollections();

    // Her alt koleksiyon için hızlıca count
    const results = await Promise.all(
      subcols.map(async (c) => {
        const qs = await c.limit(1).get();
        // count() aggregate yerine hızlı tahmin: 0 veya 1+ (quota dostu)
        let count = 0;
        if (!qs.empty) {
          // İstersen gerçek sayım (aggregate) kullan:
          try {
            // @ts-ignore
            const agg = await c.count().get();
            // @ts-ignore
            count = agg.data().count || 0;
          } catch {
            count = -1; // aggregate kapalıysa -1 ile işaretle
          }
        }
        return { id: c.id, fullPath: c.path, count };
      })
    );

    return NextResponse.json({ ok: true, path, subcollections: results });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}
