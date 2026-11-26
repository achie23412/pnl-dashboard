import { NextResponse } from "next/server"
import { getServiceClient } from "@/lib/supabase"
import { getRole } from "@/lib/auth-role"

export const dynamic = "force-dynamic"

export async function GET() {
  const { data, error } = await getServiceClient().from("store_settings").select("*").order("store")
  if (error) return NextResponse.json({ rows: [], error: error.message }, { status: 200 })
  return NextResponse.json({ rows: data || [] })
}

// PUT { store, media_buyer_fee_pct, media_buyer_fee_from (YYYY-MM-DD | null) } — Owner only
export async function PUT(req: Request) {
  const role = await getRole()
  if (role !== "owner") return NextResponse.json({ error: "Only the Owner can change store settings." }, { status: 403 })
  const b = (await req.json().catch(() => null)) as { store?: string; media_buyer_fee_pct?: number; media_buyer_fee_from?: string | null } | null
  if (!b?.store) return NextResponse.json({ error: "store needed" }, { status: 400 })
  const pct = Number(b.media_buyer_fee_pct)
  if (!Number.isFinite(pct) || pct < 0 || pct > 100) return NextResponse.json({ error: "Fee must be 0–100%." }, { status: 400 })
  const from = b.media_buyer_fee_from || null
  if (from && !/^\d{4}-\d{2}-\d{2}$/.test(from)) return NextResponse.json({ error: "Start date must be YYYY-MM-DD." }, { status: 400 })
  const { data, error } = await getServiceClient()
    .from("store_settings")
    .upsert({ store: b.store, media_buyer_fee_pct: pct, media_buyer_fee_from: from, updated_at: new Date().toISOString(), updated_by: role }, { onConflict: "store" })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ row: data })
}
