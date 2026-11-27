import { NextRequest, NextResponse } from "next/server"
import { buildCoachReport, messageText, slackConfigured } from "@/lib/coach-report"
import { sendCoachReport } from "@/lib/coach-report-send"
import { SESSION_COOKIE, verifySession } from "@/lib/session"

export const dynamic = "force-dynamic"
export const maxDuration = 60

// What today's coach post looks like (text per store + whether Slack is set up). Never returns the token.
export async function GET() {
  try {
    const r = await buildCoachReport()
    return NextResponse.json({
      reportDate: r.reportDate,
      lastDay: r.lastDay,
      slack: slackConfigured(),
      messages: r.stores.map((s) => ({ store: s.store, text: messageText(r, s) })),
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}

// "Send now" button: owner only (the coach login can view the dashboard but not post as you)
export async function POST(req: NextRequest) {
  const role = await verifySession(req.cookies.get(SESSION_COOKIE)?.value)
  if (role !== "owner") return NextResponse.json({ error: "Only the owner can send" }, { status: 403 })
  try {
    return NextResponse.json(await sendCoachReport())
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
