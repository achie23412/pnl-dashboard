import { NextResponse } from "next/server"
import { getServiceClient } from "@/lib/supabase"
import { getRole } from "@/lib/auth-role"

export const dynamic = "force-dynamic"

// Hand-entered balances for processors without an API (PayPal, Whale Checkout, Other)
export async function GET() {
  const { data, error } = await getServiceClient().from("processor_balances").select("processor,balance_eur,as_of,updated_at")
  if (error) return NextResponse.json({ rows: [], error: error.message })
  return NextResponse.json({ rows: data || [] })
}

// PUT { processor, balance_eur } — saved for everyone, dated today
export async function PUT(req: Request) {
  const b = (await req.json().catch(() => null)) as { processor?: string; balance_eur?: number | string } | null
  const amount = Number(String(b?.balance_eur ?? "").replace(",", "."))
  if (!b?.processor || !Number.isFinite(amount)) return NextResponse.json({ error: "processor and balance_eur needed" }, { status: 400 })
  const { data, error } = await getServiceClient()
    .from("processor_balances")
    .upsert({ processor: b.processor, balance_eur: amount, as_of: new Date().toISOString().slice(0, 10), updated_at: new Date().toISOString(), updated_by: await getRole() }, { onConflict: "processor" })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ row: data })
}
