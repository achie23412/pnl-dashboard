import { NextRequest, NextResponse } from "next/server"
import { sendCoachReport } from "@/lib/coach-report-send"

export const dynamic = "force-dynamic"
export const maxDuration = 60

// Daily (09:00 Amsterdam, after the 07:00 data refresh): post the Day by day P&L image per
// Google store to the coach's Slack channel. Does nothing until the Slack env vars are set.
export async function GET(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  try {
    return NextResponse.json(await sendCoachReport())
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
