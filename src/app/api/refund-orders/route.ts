import { NextRequest, NextResponse } from "next/server"
import { refundLosses } from "@/lib/refund-loss"

export const dynamic = "force-dynamic"

// GET ?days=120 → { byId: { [refundId]: RefundLoss } }: each refund's ShipGoods order, COGS,
// shipping and net loss in EUR (see src/lib/refund-loss.ts).
export async function GET(req: NextRequest) {
  const days = Math.min(400, Math.max(1, Number(new URL(req.url).searchParams.get("days")) || 120))
  try {
    return NextResponse.json({ byId: await refundLosses(days) })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e), byId: {} }, { status: 500 })
  }
}
