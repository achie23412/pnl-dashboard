import { NextResponse } from "next/server"
import { productRefundRisk, RISK_RATE, RISK_MIN_ORDERS, RISK_MIN_REFUNDS } from "@/lib/refund-loss"

export const dynamic = "force-dynamic"
export const maxDuration = 60

// GET → refund rate, reasons and net refund loss per product, and which are risky.
// Kept 10 minutes per server: the badge on other pages asks for it too.
let cache: { at: number; data: unknown } | null = null

export async function GET() {
  if (cache && Date.now() - cache.at < 10 * 60 * 1000) return NextResponse.json(cache.data)
  try {
    const r = await productRefundRisk()
    const data = { ...r, rule: { rate: RISK_RATE, minOrders: RISK_MIN_ORDERS, minRefunds: RISK_MIN_REFUNDS } }
    cache = { at: Date.now(), data }
    return NextResponse.json(data)
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e), products: [] }, { status: 500 })
  }
}
