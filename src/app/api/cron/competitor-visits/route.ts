import { NextRequest, NextResponse } from "next/server"
import { snapshotCompetitorVisits } from "@/lib/competitor-visits"

export const maxDuration = 60
export const dynamic = "force-dynamic"

// Daily: save every competitor's monthly visitors from TrendTrack (free lookups) for the current
// month, and copy the traffic history of stores that don't have it yet (25 a day).
export async function GET(req: NextRequest) {
  if (process.env.CRON_SECRET && req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  try {
    return NextResponse.json(await snapshotCompetitorVisits({ budgetMs: 50000 }))
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
