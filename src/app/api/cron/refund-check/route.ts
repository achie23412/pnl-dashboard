import { NextRequest, NextResponse } from "next/server"
import { checkRefunds } from "@/lib/refund-control"

export const maxDuration = 60
export const dynamic = "force-dynamic"

// Daily: compare logged refunds with Shopify even if nobody opens the Refunds page.
export async function GET(req: NextRequest) {
  if (process.env.CRON_SECRET && req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  try {
    return NextResponse.json(await checkRefunds(200))
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
