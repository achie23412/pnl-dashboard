import { NextRequest, NextResponse } from "next/server"
import { getServiceClient } from "@/lib/supabase"
import { fetchEurRates } from "@/lib/currency"
import { loadFeeSettings } from "@/lib/fee-settings-server"
import { buildAutoTodos, amsterdamToday } from "@/lib/todo-rules"
import { complaintEvents, riskyProducts, daysAgo } from "@/lib/product-complaints"
import { dropStopped } from "@/lib/constants"

export const dynamic = "force-dynamic"

// GET → { today, auto: AutoTodo & {done}, custom: Todo[] }
export async function GET() {
  const db = getServiceClient()
  const today = amsterdamToday()
  const from = new Date(Date.parse(today + "T00:00:00Z") - 11 * 86400000).toISOString().slice(0, 10)

  const [rev, sp, cg, ses, log, todos] = await Promise.all([
    db.from("daily_revenue").select("date,store,revenue,orders").gte("date", from),
    db.from("daily_spend").select("date,channel,account,store,spend").gte("date", from),
    db.from("daily_cogs").select("date,store,cogs").gte("date", from),
    db.from("daily_sessions").select("id").limit(1),
    db.from("refresh_log").select("status,error,completed_at").order("id", { ascending: false }).limit(1),
    db.from("todos").select("*").order("created_at", { ascending: true }),
  ])
  // Risky products (2+ complaints in 7 days) not told to the supplier yet
  const [rref, rtix, rflags] = await Promise.all([
    db.from("cs_refunds").select("store,refund_date,order_number,reason,reason_note,conversation_url,items").gte("refund_date", daysAgo(7)),
    db.from("cs_tickets").select("*").eq("complaint", true),
    db.from("cs_product_flags").select("store,product_title,status").eq("kind", "risky"),
  ])
  const handled = new Set((rflags.data || []).filter((f) => ["supplier_told", "cleared"].includes(f.status)).map((f) => `${f.store}|${String(f.product_title).trim().toLowerCase()}`))
  const risky = riskyProducts(complaintEvents(rref.data || [], rtix.data || []))
    .filter((r) => !handled.has(r.key))
    .map((r) => ({ store: r.store, product: r.product, complaints: r.events.length, reasons: Array.from(new Set(r.events.map((e) => e.reasonLabel))).join(", ") }))
  // Latest Season Board keyword upload per country (for the 3-monthly refresh reminder)
  const seasonUpdated: Record<string, string | null> = {}
  await Promise.all(["US", "UK", "IE"].map(async (c) => {
    const { data } = await db.from("season_keywords").select("uploaded_at").eq("country", c).order("uploaded_at", { ascending: false }).limit(1)
    seasonUpdated[c] = data?.[0]?.uploaded_at || null
  }))

  if (todos.error) {
    return NextResponse.json({ error: `todos table: ${todos.error.message}` }, { status: 500 })
  }

  const rates = await fetchEurRates(from, today)
  const auto = buildAutoTodos({
    today,
    // Stopped stores (Blinky) drop out from their stop date
    revenue: dropStopped(rev.data),
    spend: dropStopped(sp.data),
    cogs: dropStopped(cg.data),
    rates,
    hasSessions: (ses.data || []).length > 0,
    lastRefresh: log.data?.[0] || null,
    seasonUpdated,
    riskyProducts: risky,
    feeSettings: await loadFeeSettings(),
  })

  const rows = todos.data || []
  const doneKeys = new Set(rows.filter((t) => t.source === "auto" && t.done).map((t) => t.auto_key))
  return NextResponse.json({
    today,
    auto: auto.map((t) => ({ ...t, done: doneKeys.has(t.key) })),
    custom: rows.filter((t) => t.source === "custom"),
    doneKeys: Array.from(doneKeys), // also covers calendar must-dos ticked off on the client
  })
}

// POST { label, date?, store?, note? } → new custom task
export async function POST(req: NextRequest) {
  const { label, date, store, note } = await req.json()
  if (!label || typeof label !== "string") return NextResponse.json({ error: "label required" }, { status: 400 })
  const db = getServiceClient()
  const { data, error } = await db
    .from("todos")
    .insert({ label: label.slice(0, 300), date: date || null, store: store || null, note: note || null, source: "custom" })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// PATCH { id, done } for custom tasks, or { auto_key, label, done } for must-do tasks
export async function PATCH(req: NextRequest) {
  const body = await req.json()
  const done = !!body.done
  const db = getServiceClient()
  if (body.id) {
    const { error } = await db
      .from("todos")
      .update({ done, done_at: done ? new Date().toISOString() : null })
      .eq("id", body.id)
      .eq("source", "custom")
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }
  if (body.auto_key) {
    const { error } = await db.from("todos").upsert(
      {
        auto_key: String(body.auto_key).slice(0, 200),
        label: String(body.label || body.auto_key).slice(0, 300),
        source: "auto",
        date: amsterdamToday(),
        done,
        done_at: done ? new Date().toISOString() : null,
      },
      { onConflict: "auto_key" },
    )
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }
  return NextResponse.json({ error: "id or auto_key required" }, { status: 400 })
}

// DELETE ?id= (custom tasks only)
export async function DELETE(req: NextRequest) {
  const id = new URL(req.url).searchParams.get("id")
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 })
  const db = getServiceClient()
  const { error } = await db.from("todos").delete().eq("id", id).eq("source", "custom")
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
