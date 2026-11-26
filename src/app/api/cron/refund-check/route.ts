import { NextRequest, NextResponse } from "next/server"
import { checkRefunds } from "@/lib/refund-control"
import { importShopifyRefunds } from "@/lib/refund-import"

export const maxDuration = 60
export const dynamic = "force-dynamic"

// Daily: copy Shopify refunds CS didn't log into the refund log, then compare logged refunds
// with Shopify even if nobody opens the Refunds page.
export async function GET(req: NextRequest) {
  if (process.env.CRON_SECRET && req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  try {
    const imported = await importShopifyRefunds().catch((e) => ({ error: e instanceof Error ? e.message : String(e) }))
    return NextResponse.json({ imported, ...(await checkRefunds(200)) })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
