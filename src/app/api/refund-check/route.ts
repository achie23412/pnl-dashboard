import { NextResponse } from "next/server"
import { checkRefunds } from "@/lib/refund-control"

export const maxDuration = 60
export const dynamic = "force-dynamic"

// POST → compare logged refunds with Shopify (called when the Refunds page opens, max once an hour).
export async function POST() {
  try {
    return NextResponse.json(await checkRefunds(40))
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
