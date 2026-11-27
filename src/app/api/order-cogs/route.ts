import { NextResponse } from "next/server"
import { orderCogsForRange } from "@/lib/order-cogs"

export const dynamic = "force-dynamic"

export const maxDuration = 60

// GET ?date=YYYY-MM-DD, or ?from=&to= (max 31 days) → actual ShipGoods cost per store for the
// orders placed in those days (USD)
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams
  const from = sp.get("from") || sp.get("date") || ""
  const to = sp.get("to") || from
  const ok = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d)
  if (!ok(from) || !ok(to) || to < from) return NextResponse.json({ error: "date=YYYY-MM-DD or from=&to= needed" }, { status: 400 })
  if ((Date.parse(to) - Date.parse(from)) / 86400000 > 31) return NextResponse.json({ error: "max 31 days", rows: [] }, { status: 400 })
  try {
    return NextResponse.json({ rows: await orderCogsForRange(from, to) })
  } catch (e) {
    return NextResponse.json({ rows: [], error: e instanceof Error ? e.message : String(e) }, { status: 200 })
  }
}
