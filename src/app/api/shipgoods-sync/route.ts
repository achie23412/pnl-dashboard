import { NextRequest, NextResponse } from "next/server"
import { syncShipgoods } from "@/lib/shipgoods-store"
import { getRole } from "@/lib/auth-role"

export const maxDuration = 60
export const dynamic = "force-dynamic"

const ISO = /^\d{4}-\d{2}-\d{2}$/

// POST {from, to} (Owner): copy ShipGoods order costs for up to 31 days into shipgoods_orders.
// Used to fill older months; the last 7 days sync on their own twice a day (/api/cron/warm).
// If `complete` is false, run it again: pages already saved are simply overwritten.
export async function POST(req: NextRequest) {
  if ((await getRole()) !== "owner") return NextResponse.json({ error: "Owner only" }, { status: 403 })
  const b = await req.json().catch(() => ({}))
  const from = String(b.from || ""), to = String(b.to || "")
  if (!ISO.test(from) || !ISO.test(to) || from > to) return NextResponse.json({ error: "from and to (YYYY-MM-DD) required" }, { status: 400 })
  if ((Date.parse(to) - Date.parse(from)) / 86400000 > 31) return NextResponse.json({ error: "At most 31 days per call" }, { status: 400 })
  try {
    return NextResponse.json(await syncShipgoods(from, to, 40000))
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
