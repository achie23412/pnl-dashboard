import { NextRequest, NextResponse } from "next/server"
import { buildEvidencePack, saveEvidence } from "@/lib/dispute-evidence"
import { getRole } from "@/lib/auth-role"

export const dynamic = "force-dynamic"
export const maxDuration = 60

// GET ?store=LUMEGLASSES&id=gid://shopify/ShopifyPaymentsDispute/123 → evidence pack (facts + draft texts)
export async function GET(req: NextRequest) {
  const sp = new URL(req.url).searchParams
  const store = sp.get("store") || "", id = sp.get("id") || ""
  if (!store || !id) return NextResponse.json({ error: "store and id required" }, { status: 400 })
  try {
    return NextResponse.json(await buildEvidencePack(store, id))
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}

// POST { store, id, fields } (Owner) → fills Shopify's evidence form. Submitting stays in Shopify admin.
export async function POST(req: NextRequest) {
  if ((await getRole()) !== "owner") return NextResponse.json({ error: "Only the Owner can save evidence to Shopify." }, { status: 403 })
  const b = await req.json().catch(() => ({}))
  if (!b.store || !b.id || !b.fields) return NextResponse.json({ error: "store, id and fields required" }, { status: 400 })
  try {
    const r = await saveEvidence(String(b.store), String(b.id), b.fields)
    return NextResponse.json(r, { status: r.ok ? 200 : 400 })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
