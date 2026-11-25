import { NextResponse } from "next/server"
import { getServiceClient } from "@/lib/supabase"
import { SHOPIFY_STORES } from "@/lib/constants"
import { REFUND_REASONS } from "@/lib/cs-log"

export const dynamic = "force-dynamic"

// One route for both logs: ?kind=refund (cs_refunds) or ?kind=credit (cs_store_credits).
const TABLE = { refund: "cs_refunds", credit: "cs_store_credits" } as const
type Kind = keyof typeof TABLE

function kindOf(req: Request): Kind | null {
  const k = new URL(req.url).searchParams.get("kind")
  return k === "refund" || k === "credit" ? k : null
}
const setupHint = (msg: string) =>
  /relation .* does not exist|schema cache|permission denied/i.test(msg)
    ? `${msg}. Run supabase/cs-log.sql once in the Supabase SQL editor.`
    : msg
const num = (v: unknown) => (v === "" || v == null || isNaN(Number(v)) ? null : Number(v))
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null)

function clean(kind: Kind, b: Record<string, unknown>): { row?: Record<string, unknown>; error?: string } {
  const store = str(b.store)
  if (!store || !SHOPIFY_STORES[store]) return { error: "Pick a store." }
  const reason = str(b.reason)
  if (!reason || !REFUND_REASONS.some((r) => r.value === reason)) return { error: "Pick a reason." }
  const amount = num(b.amount)
  if (amount == null || amount < 0) return { error: "Enter the amount." }
  const common = {
    store,
    customer_email: str(b.customer_email),
    conversation_url: str(b.conversation_url),
    amount,
    currency: str(b.currency) || "EUR",
    percentage: num(b.percentage),
    reason,
    reason_note: str(b.reason_note),
    logged_by: str(b.logged_by),
  }
  if (kind === "refund") {
    const order = str(b.order_number)
    if (!order) return { error: "Enter the order number." }
    const type = b.refund_type === "full" || b.refund_type === "partial" ? b.refund_type : null
    if (!type) return { error: "Pick full or partial." }
    return {
      row: {
        ...common,
        refund_date: str(b.refund_date) || new Date().toISOString().slice(0, 10),
        order_number: order.startsWith("#") ? order : `#${order}`,
        shopify_order_id: str(b.shopify_order_id),
        refund_type: type,
        order_total: num(b.order_total),
        items: Array.isArray(b.items) ? b.items : [],
      },
    }
  }
  const status = b.status === "used" || b.status === "expired" ? b.status : "issued"
  const order = str(b.order_number)
  return {
    row: {
      ...common,
      issue_date: str(b.issue_date) || new Date().toISOString().slice(0, 10),
      order_number: order ? (order.startsWith("#") ? order : `#${order}`) : null,
      code: str(b.code),
      status,
    },
  }
}

export async function GET(req: Request) {
  const kind = kindOf(req)
  if (!kind) return NextResponse.json({ error: "kind must be refund or credit" }, { status: 400 })
  const dateCol = kind === "refund" ? "refund_date" : "issue_date"
  const { data, error } = await getServiceClient().from(TABLE[kind]).select("*").order(dateCol, { ascending: false }).order("id", { ascending: false }).limit(1000)
  if (error) return NextResponse.json({ error: setupHint(error.message) }, { status: 500 })
  return NextResponse.json({ rows: data || [] })
}

export async function POST(req: Request) {
  const kind = kindOf(req)
  if (!kind) return NextResponse.json({ error: "kind must be refund or credit" }, { status: 400 })
  const { row, error } = clean(kind, await req.json())
  if (error || !row) return NextResponse.json({ error: error || "Bad input." }, { status: 400 })
  const res = await getServiceClient().from(TABLE[kind]).insert(row).select("*").single()
  if (res.error) return NextResponse.json({ error: setupHint(res.error.message) }, { status: 500 })
  return NextResponse.json({ row: res.data })
}

// PATCH ?kind=credit&id=3 { status: "used" }  (only the status of a store credit can change)
export async function PATCH(req: Request) {
  const kind = kindOf(req)
  const id = Number(new URL(req.url).searchParams.get("id"))
  if (kind !== "credit" || !id) return NextResponse.json({ error: "Only a store credit's status can be changed." }, { status: 400 })
  const b = await req.json()
  if (!["issued", "used", "expired"].includes(b.status)) return NextResponse.json({ error: "Bad status." }, { status: 400 })
  const res = await getServiceClient().from(TABLE.credit).update({ status: b.status }).eq("id", id).select("*").single()
  if (res.error) return NextResponse.json({ error: setupHint(res.error.message) }, { status: 500 })
  return NextResponse.json({ row: res.data })
}

export async function DELETE(req: Request) {
  const kind = kindOf(req)
  const id = Number(new URL(req.url).searchParams.get("id"))
  if (!kind || !id) return NextResponse.json({ error: "kind and id required" }, { status: 400 })
  const res = await getServiceClient().from(TABLE[kind]).delete().eq("id", id)
  if (res.error) return NextResponse.json({ error: setupHint(res.error.message) }, { status: 500 })
  return NextResponse.json({ ok: true })
}
