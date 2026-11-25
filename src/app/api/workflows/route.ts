import { NextResponse } from "next/server"
import { getServiceClient } from "@/lib/supabase"
import { commslayerTokens } from "@/lib/commslayer"
import { complaintEvents, riskyProducts } from "@/lib/product-complaints"

export const dynamic = "force-dynamic"

// Run history and live counts for the Workflows page.
export async function GET() {
  const db = getServiceClient()
  const since = new Date(Date.now() - 30 * 86400000).toISOString()
  const dayAgo = new Date(Date.now() - 86400000).toISOString()
  const [log, refunds, tickets, flags, scans] = await Promise.all([
    db.from("refresh_log").select("*").gte("started_at", since).order("id", { ascending: false }).limit(60),
    db.from("cs_refunds").select("store,refund_date,order_number,reason,reason_note,conversation_url,items").gte("refund_date", since.slice(0, 10)),
    db.from("cs_tickets").select("*").eq("complaint", true),
    db.from("cs_product_flags").select("kind,status,store,product_title,updated_at"),
    db.from("competitor_scan_state").select("last_scanned,last_ok").gte("last_scanned", dayAgo),
  ])
  const risky = riskyProducts(complaintEvents(refunds.data || [], tickets.data || []))
  const told = new Set((flags.data || []).filter((f) => f.kind === "risky" && ["supplier_told", "cleared"].includes(f.status)).map((f) => `${f.store}|${String(f.product_title).toLowerCase()}`))
  return NextResponse.json({
    refreshRuns: log.data || [],
    refreshError: log.error?.message || null,
    risky: { now: risky.length, notTold: risky.filter((r) => !told.has(r.key)).length },
    qualityOpen: (flags.data || []).filter((f) => f.kind === "quality" && ["open", "test_unit", "supplier"].includes(f.status)).length,
    priceAsked: (flags.data || []).filter((f) => f.kind === "price" && f.status === "asked").length,
    commslayer: commslayerTokens().length,
    // Opportunities cron: competitor stores scanned in the last 24h
    scans24h: { total: (scans.data || []).length, failed: (scans.data || []).filter((x) => x.last_ok === false).length, last: (scans.data || []).map((x) => x.last_scanned).sort().pop() || null },
  })
}
