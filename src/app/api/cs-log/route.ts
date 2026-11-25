import { NextResponse } from "next/server"
import { getServiceClient } from "@/lib/supabase"
import { SHOPIFY_STORES } from "@/lib/constants"
import { REFUND_REASONS } from "@/lib/cs-log"
import { fetchLatestEurRates } from "@/lib/currency"
import { approvalFor, openDisputes } from "@/lib/refund-control"
import { getRole } from "@/lib/auth-role"

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
    ? `${msg}. Run supabase/cs-log.sql and supabase/refund-control.sql once in the Supabase SQL editor.`
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
    const type = b.refund_type === "full" || b.refund_type === "partial" || b.refund_type === "full_after_return" ? b.refund_type : null
    if (!type) return { error: "Pick the refund type." }
    return {
      row: {
        ...common,
        refund_date: str(b.refund_date) || new Date().toISOString().slice(0, 10),
        order_number: order.startsWith("#") ? order : `#${order}`,
        shopify_order_id: str(b.shopify_order_id),
        refund_type: type,
        order_total: num(b.order_total),
        items: Array.isArray(b.items) ? b.items : [],
        threat: b.threat === true,
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
  const sp = new URL(req.url).searchParams
  if (kind === "refund" && sp.get("history")) {
    const { data, error } = await getServiceClient().from("cs_refund_history").select("*").eq("refund_id", Number(sp.get("history"))).order("changed_at", { ascending: false })
    if (error) return NextResponse.json({ error: setupHint(error.message) }, { status: 500 })
    return NextResponse.json({ history: data || [] })
  }
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
  const db = getServiceClient()
  if (kind === "refund") {
    // Never refund an order with an open bank dispute: the customer would be paid twice.
    if (row.shopify_order_id) {
      const open = await openDisputes(String(row.store), String(row.shopify_order_id))
      if (open.length) {
        return NextResponse.json({ error: `This order has an open bank dispute (${open.map((d) => d.status.toLowerCase().replace(/_/g, " ")).join(", ")}). Never refund it: handle it on Disputes / Chargebacks.` }, { status: 409 })
      }
    }
    if (row.threat) row.refund_type = row.refund_type === "full_after_return" ? "full_after_return" : "full" // threat = refund in full at once
    row.amount_eur = await toEurNow(Number(row.amount), String(row.currency))
    row.approval_status = approvalFor(row.amount_eur as number, !!row.threat)
    row.shopify_status = row.shopify_order_id ? "checking" : "no_order"
  }
  const res = await db.from(TABLE[kind]).insert(row).select("*").single()
  if (res.error) return NextResponse.json({ error: setupHint(res.error.message) }, { status: 500 })
  if (kind === "refund") await history(res.data.id, String(row.logged_by || "") || null, "created", { amount: row.amount, approval: row.approval_status, threat: row.threat })
  return NextResponse.json({ row: res.data })
}

// PATCH ?kind=credit&id=3 { status: "used" }  (a store credit's status)
// PATCH ?kind=refund&id=3 { action: "approve" | "reject", by }  (Owner only)
// PATCH ?kind=refund&id=3 { action: "edit", by, ...fields }  (every change is kept in cs_refund_history)
export async function PATCH(req: Request) {
  const kind = kindOf(req)
  const id = Number(new URL(req.url).searchParams.get("id"))
  if (!kind || !id) return NextResponse.json({ error: "kind and id required" }, { status: 400 })
  const b = await req.json()
  const db = getServiceClient()
  if (kind === "credit") {
    if (!["issued", "used", "expired"].includes(b.status)) return NextResponse.json({ error: "Bad status." }, { status: 400 })
    const res = await db.from(TABLE.credit).update({ status: b.status }).eq("id", id).select("*").single()
    if (res.error) return NextResponse.json({ error: setupHint(res.error.message) }, { status: 500 })
    return NextResponse.json({ row: res.data })
  }

  const cur = await db.from("cs_refunds").select("*").eq("id", id).single()
  if (cur.error || !cur.data) return NextResponse.json({ error: setupHint(cur.error?.message || "Refund not found") }, { status: 404 })
  const by = str(b.by)

  if (b.action === "approve" || b.action === "reject") {
    const role = await getRole()
    if (role !== "owner") return NextResponse.json({ error: role ? "Only the Owner can approve or reject refunds." : "Log out and log in again as Owner to approve (your login is from before roles existed)." }, { status: 403 })
    const status = b.action === "approve" ? "approved" : "rejected"
    const res = await db.from("cs_refunds").update({ approval_status: status, approved_by: by || "Owner", approved_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", id).select("*").single()
    if (res.error) return NextResponse.json({ error: setupHint(res.error.message) }, { status: 500 })
    await history(id, by || "Owner", status, { note: str(b.note) })
    return NextResponse.json({ row: res.data })
  }

  if (b.action === "edit") {
    const EDITABLE = ["refund_date", "refund_type", "reason", "reason_note", "percentage", "amount", "conversation_url", "threat"] as const
    const upd: Record<string, unknown> = {}
    const diff: Record<string, { from: unknown; to: unknown }> = {}
    for (const k of EDITABLE) {
      if (!(k in b)) continue
      let v: unknown = b[k]
      if (k === "amount" || k === "percentage") v = num(v)
      else if (k === "threat") v = v === true
      else v = str(v)
      if (k === "refund_type" && !["full", "partial", "full_after_return"].includes(String(v))) continue
      if (k === "reason" && !REFUND_REASONS.some((r) => r.value === v)) continue
      if (k === "amount" && (v == null || (v as number) < 0)) return NextResponse.json({ error: "Enter the amount." }, { status: 400 })
      const before = cur.data[k]
      if (String(before ?? "") !== String(v ?? "")) {
        upd[k] = v
        diff[k] = { from: before, to: v }
      }
    }
    if (!Object.keys(upd).length) return NextResponse.json({ row: cur.data })
    if ("amount" in upd) upd.amount_eur = await toEurNow(Number(upd.amount), String(cur.data.currency))
    const amountEur = (upd.amount_eur ?? cur.data.amount_eur) as number | null
    const threat = (upd.threat ?? cur.data.threat) as boolean
    // A bigger amount after approval needs a new approval.
    const keep = cur.data.approval_status === "approved" && !("amount" in upd && Number(upd.amount) > Number(cur.data.amount)) ? "approved" : cur.data.approval_status === "rejected" ? "rejected" : null
    upd.approval_status = approvalFor(amountEur, threat, keep)
    if (upd.approval_status !== cur.data.approval_status) diff.approval_status = { from: cur.data.approval_status, to: upd.approval_status }
    upd.updated_at = new Date().toISOString()
    if ("amount" in upd) upd.shopify_status = "checking"
    const res = await db.from("cs_refunds").update(upd).eq("id", id).select("*").single()
    if (res.error) return NextResponse.json({ error: setupHint(res.error.message) }, { status: 500 })
    await history(id, by, "edited", diff)
    return NextResponse.json({ row: res.data })
  }
  return NextResponse.json({ error: "Unknown action." }, { status: 400 })
}

async function toEurNow(amount: number, currency: string): Promise<number> {
  if (currency === "EUR") return Math.round(amount * 100) / 100
  const fx = await fetchLatestEurRates().catch(() => ({ USD: 1.11, GBP: 0.835 }))
  const rate = currency === "USD" ? fx.USD : currency === "GBP" ? fx.GBP : 1
  return Math.round((amount / rate) * 100) / 100
}

async function history(refundId: number, by: string | null, action: string, changes: Record<string, unknown>) {
  await getServiceClient().from("cs_refund_history").insert({ refund_id: refundId, changed_by: by, action, changes })
}

export async function DELETE(req: Request) {
  const kind = kindOf(req)
  const id = Number(new URL(req.url).searchParams.get("id"))
  if (!kind || !id) return NextResponse.json({ error: "kind and id required" }, { status: 400 })
  const res = await getServiceClient().from(TABLE[kind]).delete().eq("id", id)
  if (res.error) return NextResponse.json({ error: setupHint(res.error.message) }, { status: 500 })
  return NextResponse.json({ ok: true })
}
