import { NextRequest, NextResponse } from "next/server"
import { getServiceClient } from "@/lib/supabase"
import { getRole } from "@/lib/auth-role"
import { parseTimeproof } from "@/lib/timeproof"
import { fetchOrganizations, fetchMembers, fetchDailyActivities } from "@/lib/hubstaff"

export const dynamic = "force-dynamic"

const MONTH = /^\d{4}-\d{2}$/
const amsterdamToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam" }).format(new Date())

// GET ?month=YYYY-MM: the saved Timeproof hours per worker per day, plus Hubstaff's tracked
// minutes per member per day for the same month, so Team Hub can put them side by side.
export async function GET(req: NextRequest) {
  const today = amsterdamToday()
  const month = req.nextUrl.searchParams.get("month") || today.slice(0, 7)
  if (!MONTH.test(month)) return NextResponse.json({ error: "month must be YYYY-MM" }, { status: 400 })
  const [y, m] = month.split("-").map(Number)
  const from = `${month}-01`
  const lastDate = `${month}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`
  const to = lastDate < today ? lastDate : today

  const db = getServiceClient()
  const { data, error } = await db.from("timeproof_hours").select("worker,work_date,minutes,imported_at")
    .gte("work_date", from).lte("work_date", lastDate).order("work_date")
  if (error) {
    const missing = /timeproof_hours/.test(error.message) && /not find|does not exist|schema cache/i.test(error.message)
    return NextResponse.json({ error: missing ? "The timeproof_hours table doesn't exist yet. Run supabase/timeproof-hours.sql in Supabase." : error.message }, { status: 500 })
  }
  const workers: Record<string, { days: Record<string, number>; imported_at: string }> = {}
  for (const r of data || []) {
    const w = (workers[r.worker] ||= { days: {}, imported_at: r.imported_at })
    w.days[r.work_date] = r.minutes
    if (r.imported_at > w.imported_at) w.imported_at = r.imported_at
  }

  // Hubstaff (optional: the page still works without it)
  let hubstaff: { user_id: number; name: string; days: Record<string, number> }[] = []
  let hubstaffError: string | null = null
  if (process.env.HUBSTAFF_REFRESH_TOKEN && from <= to) {
    try {
      const orgs = await fetchOrganizations()
      const orgId = process.env.HUBSTAFF_ORG_ID ? Number(process.env.HUBSTAFF_ORG_ID) : orgs[0]?.id
      if (orgId) {
        const [members, daily] = await Promise.all([fetchMembers(orgId), fetchDailyActivities(orgId, from, to)])
        const byUser = new Map<number, Record<string, number>>()
        for (const a of daily) {
          const d = byUser.get(a.user_id) || {}
          d[a.date] = (d[a.date] || 0) + Math.round(a.tracked / 60)
          byUser.set(a.user_id, d)
        }
        hubstaff = members.filter((x) => x.membership_status === "active" || byUser.has(x.user_id))
          .map((x) => ({ user_id: x.user_id, name: x.user?.name || `User #${x.user_id}`, days: byUser.get(x.user_id) || {} }))
      }
    } catch (e) {
      hubstaffError = e instanceof Error ? e.message : String(e)
    }
  }
  return NextResponse.json({ month, from, to, workers, hubstaff, hubstaffError })
}

// POST {text, month?, worker?, save?}: read pasted Timeproof text. Without save it only returns
// what it read (to check first); with save (Owner) it stores the days, replacing earlier values.
export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({}))
  const text = String(b.text || "")
  if (!text.trim()) return NextResponse.json({ error: "Paste the Timeproof calendar first" }, { status: 400 })
  if (text.length > 200000) return NextResponse.json({ error: "That paste is too long" }, { status: 400 })
  const parsed = parseTimeproof(text, { month: MONTH.test(String(b.month || "")) ? String(b.month) : undefined, today: amsterdamToday() })
  const worker = String(b.worker || parsed.worker || "").trim().slice(0, 80)
  if (!b.save) return NextResponse.json({ ...parsed, worker: worker || null })

  if ((await getRole()) !== "owner") return NextResponse.json({ error: "Only the Owner can save hours" }, { status: 403 })
  if (!worker) return NextResponse.json({ error: "Fill in the worker's name" }, { status: 400 })
  if (!parsed.days.length) return NextResponse.json({ error: parsed.warnings[0] || "No days found in the paste" }, { status: 400 })
  const now = new Date().toISOString()
  const { error } = await getServiceClient().from("timeproof_hours")
    .upsert(parsed.days.map((d) => ({ worker, work_date: d.date, minutes: d.minutes, imported_at: now })), { onConflict: "worker,work_date" })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, saved: parsed.days.length, worker, month: parsed.month, parsedTotal: parsed.parsedTotal, warnings: parsed.warnings })
}
