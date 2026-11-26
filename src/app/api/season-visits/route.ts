import { NextResponse } from "next/server"
import { seasonVisits, snapshotCompetitorVisits } from "@/lib/competitor-visits"
import { getRole } from "@/lib/auth-role"

export const maxDuration = 60
export const dynamic = "force-dynamic"

// GET → competitor visitor lines per market + category and the "Peak starting" alerts
// (Season Board and Main Hub). Kept 10 minutes per server.
let cache: { at: number; data: unknown } | null = null

export async function GET() {
  if (cache && Date.now() - cache.at < 10 * 60 * 1000) return NextResponse.json(cache.data)
  try {
    const data = await seasonVisits()
    cache = { at: Date.now(), data }
    return NextResponse.json(data)
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e), lines: [], alerts: [] }, { status: 500 })
  }
}

// POST → read TrendTrack now (Owner): same as the daily job.
export async function POST() {
  if ((await getRole()) !== "owner") return NextResponse.json({ error: "Only the Owner can do this" }, { status: 403 })
  try {
    const r = await snapshotCompetitorVisits({ budgetMs: 45000 })
    cache = null
    return NextResponse.json(r)
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
