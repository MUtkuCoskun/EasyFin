
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";

/**
 * GET /api/debug/firestore?path=tickers/AEFES/sheets/FIN.table
 * GET /api/debug/firestore?path=tickers/AEFES/kap/raw
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const path = searchParams.get("path");
  if (!path) {
    return NextResponse.json(
      { ok: false, error: "Missing ?path=collection/doc/collection/doc ..." },
      { status: 400 }
    );
  }

  try {
    const snap = await adminDb.doc(path).get();
    if (!snap.exists) {
      return NextResponse.json({ ok: false, exists: false, path });
    }
    const data = snap.data();
    return NextResponse.json({ ok: true, exists: true, path, data }, { headers: { "Cache-Control": "no-store" }});
  } catch (e:any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}
