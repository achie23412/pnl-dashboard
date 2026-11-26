import { NextResponse } from "next/server"
import { orderCogsForDay } from "@/lib/order-cogs"

export const dynamic = "force-dynamic"

// GET ?date=YYYY-MM-DD → actual ShipGoods cost per store for the orders placed that day (USD)
export async function GET(req: Request) {
  const date = new URL(req.url).searchParams.get("date") || ""
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: "date=YYYY-MM-DD needed" }, { status: 400 })
  try {
    return NextResponse.json({ rows: await orderCogsForDay(date) })
  } catch (e) {
    return NextResponse.json({ rows: [], error: e instanceof Error ? e.message : String(e) }, { status: 200 })
  }
}
