import { NextRequest, NextResponse } from "next/server"
import { getServiceClient } from "@/lib/supabase"
import { ingestScan, type ScanCompetitor, type OwnScan } from "@/lib/opportunity-ingest"

export const maxDuration = 60

// Receives results of a competitor scan run in the dashboard tab (browser
// fallback when the daily server scan can't read a store).
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { competitors?: ScanCompetitor[]; own?: OwnScan[] } | null
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  try {
    const res = await ingestScan(getServiceClient(), body)
    return NextResponse.json({ ok: true, ...res })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: msg.startsWith("Too many") ? 413 : 500 })
  }
}
