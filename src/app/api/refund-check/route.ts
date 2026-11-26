import { NextResponse } from "next/server"
import { checkRefunds } from "@/lib/refund-control"
import { syncRefundSheets } from "@/lib/refund-sheets"

export const maxDuration = 60
export const dynamic = "force-dynamic"

// POST → read the refund sheets CS fills in, then compare logged refunds with Shopify
// (called when the Refunds page opens, max once an hour).
export async function POST() {
  try {
    const sheets = await syncRefundSheets().catch((e) => ({ enriched: 0, added: 0, credits: 0, notes: [e instanceof Error ? e.message : String(e)] }))
    return NextResponse.json({ sheets, ...(await checkRefunds(40)) })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
