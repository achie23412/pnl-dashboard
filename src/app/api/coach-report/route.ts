import { NextRequest, NextResponse } from "next/server"
import { amsDate, COACH_STORES, HUB_KEY, messageText, slackConfigured } from "@/lib/coach-report"
import { sendCoachReport } from "@/lib/coach-report-send"
import { SESSION_COOKIE, verifySession } from "@/lib/session"

export const dynamic = "force-dynamic"
export const maxDuration = 60

// What today's coach post looks like (title per image + whether Slack is set up). Never returns the token.
export async function GET() {
  const reportDate = amsDate(0)
  return NextResponse.json({
    reportDate,
    lastDay: amsDate(-1),
    slack: slackConfigured(),
    messages: [HUB_KEY, ...COACH_STORES].map((name) => ({ store: name, text: messageText(reportDate, name) })),
  })
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
