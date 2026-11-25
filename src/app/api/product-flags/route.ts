import { NextRequest, NextResponse } from "next/server"
import { getServiceClient } from "@/lib/supabase"

export const dynamic = "force-dynamic"

// Follow-up per product for Quality Checks (kind=quality), Risky Products (kind=risky)
// and Price Deductions (kind=price). Table: cs_product_flags.
const KINDS = ["quality", "risky", "price"]

export type ProductFlag = {
  id: number
  kind: "quality" | "risky" | "price"
  store: string
  product_title: string
  status: string
  note: string | null
  data: Record<string, unknown>
  created_at: string
  updated_at: string
}

export async function GET(req: NextRequest) {
  const kind = new URL(req.url).searchParams.get("kind")
  let q = getServiceClient().from("cs_product_flags").select("*").order("updated_at", { ascending: false }).limit(2000)
  if (kind) q = q.eq("kind", kind)
  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ rows: data || [] })
}

// PATCH { kind, store, product_title, status, note?, data? } → upsert
export async function PATCH(req: NextRequest) {
  const b = await req.json()
  if (!KINDS.includes(b.kind) || !b.store || !b.product_title || !b.status) {
    return NextResponse.json({ error: "kind, store, product_title and status required" }, { status: 400 })
  }
  const db = getServiceClient()
  const { data: prev } = await db.from("cs_product_flags").select("data").eq("kind", b.kind).eq("store", b.store).eq("product_title", b.product_title).maybeSingle()
  const { data, error } = await db.from("cs_product_flags").upsert({
    kind: b.kind,
    store: String(b.store),
    product_title: String(b.product_title).slice(0, 300),
    status: String(b.status).slice(0, 40),
    note: typeof b.note === "string" ? b.note.slice(0, 1000) : null,
    data: { ...((prev?.data as object) || {}), ...(b.data || {}), [`${b.status}_at`]: new Date().toISOString() },
    updated_at: new Date().toISOString(),
  }, { onConflict: "kind,store,product_title" }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
