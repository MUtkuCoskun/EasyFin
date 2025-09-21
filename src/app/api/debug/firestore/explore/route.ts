import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";

/**
 * GET /api/debug/firestore/explore?mode=roots
 * GET /api/debug/firestore/explore?mode=tree&path=<DOCUMENT>&depth=3
 * GET /api/debug/firestore/explore?mode=cg&name=<collectionName>&field=<field>&eq=<value>&limit=200
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode = (searchParams.get("mode") || "roots").toLowerCase();

  try {
    if (mode === "roots") {
      const roots = await adminDb.listCollections();
      const items = roots.map(c => ({ id: c.id, path: c.path }));
      return NextResponse.json({ ok: true, mode, roots: items });
    }

    if (mode === "tree") {
      const rawPath = searchParams.get("path") || "";
      const depth = Math.max(0, Math.min(5, Number(searchParams.get("depth") || 2)));
      if (!rawPath) return NextResponse.json({ ok: false, error: "Missing ?path" }, { status: 400 });
      const path = decodeURIComponent(rawPath).replace(/^\/+|\/+$/g, "");
      const parts = path.split("/").filter(Boolean);
      if (parts.length % 2 !== 0) return NextResponse.json({ ok: false, error: "Path must be a DOCUMENT" }, { status: 400 });

      async function walk(docPath: string, d: number): Promise<any> {
        const node: any = { path: docPath, subs: [] };
        if (d <= 0) return node;
        const cols = await adminDb.doc(docPath).listCollections();
        for (const c of cols) {
          const item: any = { id: c.id, path: c.path, docs: [] };
          const qs = await c.limit(10).get(); // önizleme için ilk 10
          for (const doc of qs.docs) {
            const childPath = `${c.path}/${doc.id}`;
            item.docs.push({ id: doc.id, path: childPath });
            if (d - 1 > 0) {
              const sub = await walk(childPath, d - 1);
              item.docs[item.docs.length - 1].subs = sub.subs;
            }
          }
          node.subs.push(item);
        }
        return node;
      }

      const tree = await walk(path, depth);
      return NextResponse.json({ ok: true, mode, tree });
    }

    if (mode === "cg") {
      const name = searchParams.get("name");
      const field = searchParams.get("field") || undefined;
      const eq = searchParams.get("eq") || undefined;
      const limitN = Math.max(1, Math.min(1000, Number(searchParams.get("limit") || 200)));
      if (!name) return NextResponse.json({ ok: false, error: "Missing ?name=<collectionGroupName>" }, { status: 400 });

      let q: FirebaseFirestore.Query = adminDb.collectionGroup(name);
      if (field && typeof eq !== "undefined") q = q.where(field, "==", eq);
      q = q.limit(limitN);

      const snap = await q.get();
      const docs = snap.docs.map(d => ({ id: d.id, path: d.ref.path, data: d.data() }));
      return NextResponse.json({ ok: true, mode, name, count: docs.length, docs });
    }

    return NextResponse.json({ ok: false, error: "Unknown mode" }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}
