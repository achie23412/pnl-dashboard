import { NextRequest, NextResponse } from "next/server"
import { snapshotCompetitorVisits } from "@/lib/competitor-visits"

export const maxDuration = 60
export const dynamic = "force-dynamic"

// Every morning, but it only works on competitors not refreshed since the 1st: so on the 1st of
// each month every competitor is re-checked in TrendTrack (last full month's visits, ads, MoM),
// and any it couldn't finish are done the next morning. Also copies traffic history (25 a day).
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
