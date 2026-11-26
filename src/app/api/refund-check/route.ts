import { NextResponse } from "next/server"
import { checkRefunds, lastRefundSync } from "@/lib/refund-control"
import { syncRefundSheets } from "@/lib/refund-sheets"
import { refreshRecentRefunds } from "@/lib/refund-pnl"

export const maxDuration = 60
export const dynamic = "force-dynamic"

// GET → when the Shopify check last ran.
export async function GET() {
  return NextResponse.json({ last: await lastRefundSync().catch(() => null) })
}

// POST → read the refund sheets CS fills in, compare logged refunds with Shopify, and copy
// yesterday's + today's Shopify refunds into the P&L (called when the Refunds page opens,
// max once an hour, and by the "Check Shopify now" button).
export async function POST() {
  try {
    const [sheets, pnl] = await Promise.all([
      syncRefundSheets().catch((e) => ({ enriched: 0, added: 0, credits: 0, notes: [e instanceof Error ? e.message : String(e)] })),
      refreshRecentRefunds().catch((e) => ({ rows: 0, stores: [] as string[], error: e instanceof Error ? e.message : String(e) })),
    ])
    const check = await checkRefunds(80)
    return NextResponse.json({ sheets, pnl, ...check, last: await lastRefundSync().catch(() => null) })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
