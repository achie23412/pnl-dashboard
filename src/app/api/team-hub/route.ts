import { NextResponse } from "next/server"
import { unstable_cache } from "next/cache"
import {
  fetchOrganizations,
  fetchMembers,
  fetchDailyActivities,
  fetchLastActivities,
  fetchTasks,
  fetchProjects,
} from "@/lib/hubstaff"

function day(offset: number) {
  return new Date(Date.now() - offset * 86400000).toISOString().slice(0, 10)
}

function fmtSeconds(s: number) {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return { hours: h, minutes: m, display: `${h}h ${m}m` }
}

interface MemberRow {
  user_id: number
  name: string
  email: string
  role: string
  timezone: string
  online: boolean
  last_active: string | null
  today_tracked: { hours: number; minutes: number; display: string }
  today_activity_pct: number
  week_tracked: { hours: number; minutes: number; display: string }
  week_activity_pct: number
  active_tasks: number
}

interface TeamHubData {
  connected: true
  org_name: string
  members: MemberRow[]
  projects: { id: number; name: string; status: string }[]
  tasks: {
    id: number
    summary: string
    status: string
    assignee_ids: number[]
    due_at: string | null
    project_id: number
  }[]
  stats: {
    total_members: number
    online_now: number
    total_hours_today: string
    total_hours_week: string
    active_tasks: number
    avg_activity_today: number
  }
  generated_at: string
}

async function buildTeamHub(): Promise<TeamHubData | { connected: false; reason: string }> {
  if (!process.env.HUBSTAFF_TOKEN) {
    return { connected: false, reason: "HUBSTAFF_TOKEN not set" }
  }

  const orgs = await fetchOrganizations()
  if (orgs.length === 0) {
    return { connected: false, reason: "No Hubstaff organizations found" }
  }

  const orgId = process.env.HUBSTAFF_ORG_ID
    ? Number(process.env.HUBSTAFF_ORG_ID)
    : orgs[0].id
  const orgName = orgs.find((o) => o.id === orgId)?.name || `Org #${orgId}`

  const today = day(0)
  const weekStart = day(6)

  const [members, lastActivities, dailyToday, dailyWeek, tasks, projects] =
    await Promise.all([
      fetchMembers(orgId),
      fetchLastActivities(orgId).catch(() => []),
      fetchDailyActivities(orgId, today, today).catch(() => []),
      fetchDailyActivities(orgId, weekStart, today).catch(() => []),
      fetchTasks(orgId).catch(() => []),
      fetchProjects(orgId).catch(() => []),
    ])

  const lastMap = new Map(lastActivities.map((a) => [a.user_id, a]))

  const todayByUser = new Map<number, { tracked: number; overall: number }>()
  for (const a of dailyToday) {
    todayByUser.set(a.user_id, { tracked: a.tracked, overall: a.overall })
  }

  const weekByUser = new Map<number, { tracked: number; overall: number }>()
  for (const a of dailyWeek) {
    const prev = weekByUser.get(a.user_id) || { tracked: 0, overall: 0 }
    weekByUser.set(a.user_id, {
      tracked: prev.tracked + a.tracked,
      overall: prev.overall + a.overall,
    })
  }

  const tasksByUser = new Map<number, number>()
  for (const t of tasks) {
    for (const uid of t.assignee_ids) {
      tasksByUser.set(uid, (tasksByUser.get(uid) || 0) + 1)
    }
  }

  const rows: MemberRow[] = members
    .filter((m) => m.membership_status === "active")
    .map((m) => {
      const last = lastMap.get(m.user_id)
      const todayData = todayByUser.get(m.user_id) || { tracked: 0, overall: 0 }
      const weekData = weekByUser.get(m.user_id) || { tracked: 0, overall: 0 }
      const activityPctToday =
        todayData.tracked > 0
          ? Math.round((todayData.overall / todayData.tracked) * 100)
          : 0
      const activityPctWeek =
        weekData.tracked > 0
          ? Math.round((weekData.overall / weekData.tracked) * 100)
          : 0

      return {
        user_id: m.user_id,
        name: m.user?.name || `User #${m.user_id}`,
        email: m.user?.email || "",
        role: m.membership_role,
        timezone: m.user?.time_zone || "",
        online: last?.online ?? false,
        last_active: last?.last_activity_at || m.last_client_activity || null,
        today_tracked: fmtSeconds(todayData.tracked),
        today_activity_pct: activityPctToday,
        week_tracked: fmtSeconds(weekData.tracked),
        week_activity_pct: activityPctWeek,
        active_tasks: tasksByUser.get(m.user_id) || 0,
      }
    })
    .sort((a, b) => (a.online === b.online ? 0 : a.online ? -1 : 1))

  const totalTrackedToday = rows.reduce(
    (a, m) => a + m.today_tracked.hours * 3600 + m.today_tracked.minutes * 60,
    0
  )
  const totalTrackedWeek = rows.reduce(
    (a, m) => a + m.week_tracked.hours * 3600 + m.week_tracked.minutes * 60,
    0
  )
  const avgActivity =
    rows.length > 0
      ? Math.round(rows.reduce((a, m) => a + m.today_activity_pct, 0) / rows.length)
      : 0

  return {
    connected: true,
    org_name: orgName,
    members: rows,
    projects: projects.map((p) => ({ id: p.id, name: p.name, status: p.status })),
    tasks: tasks.slice(0, 50).map((t) => ({
      id: t.id,
      summary: t.summary,
      status: t.status,
      assignee_ids: t.assignee_ids,
      due_at: t.due_at,
      project_id: t.project_id,
    })),
    stats: {
      total_members: rows.length,
      online_now: rows.filter((m) => m.online).length,
      total_hours_today: fmtSeconds(totalTrackedToday).display,
      total_hours_week: fmtSeconds(totalTrackedWeek).display,
      active_tasks: tasks.length,
      avg_activity_today: avgActivity,
    },
    generated_at: new Date().toISOString(),
  }
}

const cached = unstable_cache(buildTeamHub, ["team-hub"], { revalidate: 300 })

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const data = url.searchParams.has("fresh") ? await buildTeamHub() : await cached()
    return NextResponse.json(data)
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    )
  }
}
