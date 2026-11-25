const BASE = "https://api.hubstaff.com/v2"

function headers() {
  const token = process.env.HUBSTAFF_TOKEN
  if (!token) throw new Error("HUBSTAFF_TOKEN not set")
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  }
}

export interface HubstaffMember {
  user_id: number
  membership_role: string
  membership_status: string
  last_client_activity: string | null
  user?: {
    id: number
    name: string
    email: string
    time_zone: string
    status: string
  }
}

export interface HubstaffDailyActivity {
  user_id: number
  date: string
  tracked: number
  keyboard: number
  mouse: number
  overall: number
  manual: number
  idle: number
  billable: number
}

export interface HubstaffLastActivity {
  user_id: number
  last_activity_at: string
  last_project_id: number | null
  last_task_id: number | null
  online: boolean
}

export interface HubstaffTask {
  id: number
  status: string
  project_id: number
  summary: string
  details: string | null
  assignee_ids: number[]
  due_at: string | null
  completed_at: string | null
  created_at: string
  updated_at: string
}

export interface HubstaffProject {
  id: number
  name: string
  status: string
}

export async function fetchOrganizations(): Promise<{ id: number; name: string }[]> {
  const res = await fetch(`${BASE}/organizations`, { headers: headers() })
  if (!res.ok) throw new Error(`Hubstaff orgs: ${res.status}`)
  const json = await res.json()
  return json.organizations || []
}

export async function fetchMembers(orgId: number): Promise<HubstaffMember[]> {
  const params = new URLSearchParams({ include: "users", page_limit: "100" })
  const res = await fetch(`${BASE}/organizations/${orgId}/members?${params}`, {
    headers: headers(),
  })
  if (!res.ok) throw new Error(`Hubstaff members: ${res.status}`)
  const json = await res.json()
  const members: HubstaffMember[] = json.members || []
  const users: Record<number, HubstaffMember["user"]> = {}
  for (const u of json.users || []) {
    users[u.id] = u
  }
  return members.map((m) => ({ ...m, user: users[m.user_id] || m.user }))
}

export async function fetchDailyActivities(
  orgId: number,
  dateStart: string,
  dateStop: string,
  userIds?: number[]
): Promise<HubstaffDailyActivity[]> {
  const params = new URLSearchParams({
    "date[start]": dateStart,
    "date[stop]": dateStop,
  })
  if (userIds?.length) params.set("user_ids", userIds.join(","))
  const res = await fetch(
    `${BASE}/organizations/${orgId}/activities/daily?${params}`,
    { headers: headers() }
  )
  if (!res.ok) throw new Error(`Hubstaff daily: ${res.status}`)
  const json = await res.json()
  return json.daily_activities || []
}

export async function fetchLastActivities(
  orgId: number
): Promise<HubstaffLastActivity[]> {
  const res = await fetch(
    `${BASE}/organizations/${orgId}/activities/last_activities`,
    { headers: headers() }
  )
  if (!res.ok) throw new Error(`Hubstaff last activities: ${res.status}`)
  const json = await res.json()
  return json.last_activities || []
}

export async function fetchTasks(orgId: number): Promise<HubstaffTask[]> {
  const params = new URLSearchParams({ "status[]": "active", page_limit: "100" })
  const res = await fetch(`${BASE}/organizations/${orgId}/tasks?${params}`, {
    headers: headers(),
  })
  if (!res.ok) throw new Error(`Hubstaff tasks: ${res.status}`)
  const json = await res.json()
  return json.tasks || []
}

export async function fetchProjects(orgId: number): Promise<HubstaffProject[]> {
  const params = new URLSearchParams({ status: "active" })
  const res = await fetch(`${BASE}/organizations/${orgId}/projects?${params}`, {
    headers: headers(),
  })
  if (!res.ok) throw new Error(`Hubstaff projects: ${res.status}`)
  const json = await res.json()
  return json.projects || []
}
