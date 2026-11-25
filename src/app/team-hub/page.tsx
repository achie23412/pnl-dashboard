"use client"
import { useState, useEffect, useCallback } from "react"
import { PageShell } from "@/components/PageShell"
import { FilterSelect, EMPTY_FILTER, passes, type FilterValue } from "@/components/FilterSelect"
import { FilterBar } from "@/components/PillSelect"
import { Panel, Badge, Button, Notice, Loading, EmptyState, TH, TD, ROW_BORDER } from "@/components/ui"

interface Member {
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

interface Task {
  id: number
  summary: string
  status: string
  assignee_ids: number[]
  due_at: string | null
  project_id: number
}

interface Project {
  id: number
  name: string
  status: string
}

interface TeamData {
  connected: true
  org_name: string
  members: Member[]
  projects: Project[]
  tasks: Task[]
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

type ApiResponse = TeamData | { connected: false; reason: string }

function fmtTime(iso: string | null) {
  if (!iso) return "—"
  const d = new Date(iso)
  const now = new Date()
  const diffMin = Math.round((now.getTime() - d.getTime()) / 60000)
  if (diffMin < 1) return "just now"
  if (diffMin < 60) return `${diffMin}m ago`
  if (diffMin < 1440) return `${Math.floor(diffMin / 60)}h ago`
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" })
}

function activityColor(pct: number) {
  if (pct >= 70) return "var(--green, #4ade80)"
  if (pct >= 40) return "var(--amber, #fbbf24)"
  if (pct > 0) return "var(--red, #f87171)"
  return "var(--text-dim)"
}

function ActivityBar({ pct }: { pct: number }) {
  return (
    <div className="flex items-center gap-2">
      <div
        className="h-1.5 rounded-full"
        style={{
          width: "48px",
          background: "rgba(255,255,255,0.06)",
        }}
      >
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: `${Math.min(pct, 100)}%`,
            background: activityColor(pct),
          }}
        />
      </div>
      <span className="tabular-nums text-[10px]" style={{ color: activityColor(pct) }}>
        {pct}%
      </span>
    </div>
  )
}

export default function TeamHubPage() {
  const [data, setData] = useState<ApiResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [filterRole, setFilterRole] = useState<FilterValue>(EMPTY_FILTER)
  const [filterStatus, setFilterStatus] = useState<FilterValue>(EMPTY_FILTER)
  const [tab, setTab] = useState<"members" | "tasks">("members")

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const res = await fetch("/api/team-hub")
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Failed")
      setData(json)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const connected = data && "connected" in data && data.connected === true
  const teamData = connected ? (data as TeamData) : null

  const members = teamData?.members || []
  const tasks = teamData?.tasks || []
  const projects = teamData?.projects || []

  const roles = Array.from(new Set(members.map((m) => m.role)))
  const statuses = ["online", "offline"]

  const filteredMembers = members.filter((m) => {
    if (!passes(filterRole, m.role)) return false
    if (filterStatus !== EMPTY_FILTER) {
      const isOnline = m.online ? "online" : "offline"
      if (!passes(filterStatus, isOnline)) return false
    }
    return true
  })

  const projectMap = new Map(projects.map((p) => [p.id, p.name]))

  return (
    <PageShell
      title="Team Hub"
      breadcrumb="Team Hub"
      description={
        teamData
          ? `${teamData.org_name} — Team activity from Hubstaff.`
          : "Team members, time tracking and activity from Hubstaff."
      }
      stats={[
        {
          label: "Team members",
          value: teamData ? String(teamData.stats.total_members) : "—",
        },
        {
          label: "Online now",
          value: teamData ? String(teamData.stats.online_now) : "—",
        },
        {
          label: "Hours today",
          value: teamData ? teamData.stats.total_hours_today : "—",
        },
        {
          label: "Hours this week",
          value: teamData ? teamData.stats.total_hours_week : "—",
        },
      ]}
      actions={
        <Button onClick={fetchData} disabled={loading}>
          {loading ? "Loading…" : "Refresh"}
        </Button>
      }
    >
      {error && <Notice tone="error">Couldn&apos;t load team data: {error}</Notice>}
      {loading && !data && <Loading>Loading team data from Hubstaff…</Loading>}

      {/* Not connected state */}
      {!loading && data && !connected && (
        <EmptyState title="Hubstaff not connected">
          <div className="space-y-3">
            <p>
              Add your Hubstaff API token to see team activity here.
            </p>
            <div
              className="text-left text-[11px] p-3 rounded-lg space-y-2"
              style={{ background: "rgba(255,255,255,0.04)" }}
            >
              <div className="font-medium" style={{ color: "var(--text)" }}>
                Setup steps:
              </div>
              <ol className="list-decimal pl-4 space-y-1" style={{ color: "var(--text-muted)" }}>
                <li>Go to <strong>developer.hubstaff.com</strong> → Account → Personal Access Tokens</li>
                <li>Create a token with scopes: openid, hubstaff:read, tasks:read</li>
                <li>Add the refresh token to Vercel: <code className="px-1 py-0.5 rounded text-[10px]" style={{ background: "rgba(255,255,255,0.06)" }}>HUBSTAFF_REFRESH_TOKEN=your_token</code></li>
                <li>Optional: <code className="px-1 py-0.5 rounded text-[10px]" style={{ background: "rgba(255,255,255,0.06)" }}>HUBSTAFF_ORG_ID=your_org_id</code> (auto-detected if not set)</li>
                <li>Redeploy the dashboard</li>
              </ol>
            </div>
          </div>
        </EmptyState>
      )}

      {/* Connected — show tabs */}
      {connected && teamData && (
        <>
          {/* Tab switcher */}
          <div
            className="flex gap-0.5 p-0.5 rounded-lg w-fit"
            style={{ background: "rgba(255,255,255,0.04)" }}
          >
            {(["members", "tasks"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className="px-3 py-1 rounded-md text-[11px] font-medium transition-colors capitalize"
                style={{
                  background: tab === t ? "rgba(255,255,255,0.08)" : "transparent",
                  color: tab === t ? "var(--text)" : "var(--text-dim)",
                }}
              >
                {t === "members" ? `Members (${members.length})` : `Tasks (${tasks.length})`}
              </button>
            ))}
          </div>

          {/* Members tab */}
          {tab === "members" && (
            <>
              <FilterBar
                right={
                  <span className="text-[10px]" style={{ color: "var(--text-dim)" }}>
                    {filteredMembers.length} members
                  </span>
                }
              >
                <FilterSelect label="Role" options={roles} value={filterRole} onChange={setFilterRole} />
                <FilterSelect label="Status" options={statuses} value={filterStatus} onChange={setFilterStatus} />
              </FilterBar>

              {filteredMembers.length > 0 && (
                <Panel pad={false}>
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                        <th className={`${TH} text-left`} style={{ color: "var(--text-dim)" }}>Member</th>
                        <th className={`${TH} text-center`} style={{ color: "var(--text-dim)" }}>Status</th>
                        <th className={`${TH} text-left`} style={{ color: "var(--text-dim)" }}>Role</th>
                        <th className={`${TH} text-right`} style={{ color: "var(--text-dim)" }}>Today</th>
                        <th className={`${TH} text-center`} style={{ color: "var(--text-dim)" }}>Activity</th>
                        <th className={`${TH} text-right`} style={{ color: "var(--text-dim)" }}>This week</th>
                        <th className={`${TH} text-right`} style={{ color: "var(--text-dim)" }}>Tasks</th>
                        <th className={`${TH} text-right`} style={{ color: "var(--text-dim)" }}>Last active</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredMembers.map((m) => (
                        <tr key={m.user_id} style={ROW_BORDER} className="hover:bg-white/[0.02] transition-colors">
                          <td className={TD}>
                            <div>
                              <div className="font-medium" style={{ color: "var(--text)" }}>
                                {m.name}
                              </div>
                              <div className="text-[10px]" style={{ color: "var(--text-dim)" }}>
                                {m.timezone}
                              </div>
                            </div>
                          </td>
                          <td className={`${TD} text-center`}>
                            <span className="inline-flex items-center gap-1.5">
                              <span
                                className="w-2 h-2 rounded-full"
                                style={{
                                  background: m.online
                                    ? "var(--green, #4ade80)"
                                    : "rgba(255,255,255,0.15)",
                                }}
                              />
                              <span
                                className="text-[10px]"
                                style={{
                                  color: m.online ? "var(--green, #4ade80)" : "var(--text-dim)",
                                }}
                              >
                                {m.online ? "Online" : "Offline"}
                              </span>
                            </span>
                          </td>
                          <td className={TD}>
                            <Badge tone="grey">{m.role}</Badge>
                          </td>
                          <td className={`${TD} text-right tabular-nums font-medium`} style={{ color: "var(--text)" }}>
                            {m.today_tracked.display}
                          </td>
                          <td className={`${TD}`}>
                            <ActivityBar pct={m.today_activity_pct} />
                          </td>
                          <td className={`${TD} text-right tabular-nums`} style={{ color: "var(--text-muted)" }}>
                            {m.week_tracked.display}
                          </td>
                          <td className={`${TD} text-right tabular-nums`} style={{ color: "var(--text)" }}>
                            {m.active_tasks > 0 ? m.active_tasks : "—"}
                          </td>
                          <td className={`${TD} text-right text-[10px]`} style={{ color: "var(--text-dim)" }}>
                            {fmtTime(m.last_active)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Panel>
              )}

              {filteredMembers.length === 0 && members.length > 0 && (
                <EmptyState title="No members match these filters">Clear the filters to see all team members.</EmptyState>
              )}

              {/* Activity summary */}
              {members.length > 0 && (
                <Panel title="Activity overview">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div>
                      <div className="text-[10px] mb-1" style={{ color: "var(--text-dim)" }}>Avg activity today</div>
                      <div className="text-lg font-semibold tabular-nums" style={{ color: activityColor(teamData.stats.avg_activity_today) }}>
                        {teamData.stats.avg_activity_today}%
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] mb-1" style={{ color: "var(--text-dim)" }}>Online / Total</div>
                      <div className="text-lg font-semibold tabular-nums" style={{ color: "var(--text)" }}>
                        {teamData.stats.online_now} / {teamData.stats.total_members}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] mb-1" style={{ color: "var(--text-dim)" }}>Total hours today</div>
                      <div className="text-lg font-semibold tabular-nums" style={{ color: "var(--text)" }}>
                        {teamData.stats.total_hours_today}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] mb-1" style={{ color: "var(--text-dim)" }}>Active tasks</div>
                      <div className="text-lg font-semibold tabular-nums" style={{ color: "var(--text)" }}>
                        {teamData.stats.active_tasks}
                      </div>
                    </div>
                  </div>
                </Panel>
              )}
            </>
          )}

          {/* Tasks tab */}
          {tab === "tasks" && (
            <>
              {tasks.length > 0 ? (
                <Panel pad={false}>
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                        <th className={`${TH} text-left`} style={{ color: "var(--text-dim)" }}>Task</th>
                        <th className={`${TH} text-left`} style={{ color: "var(--text-dim)" }}>Project</th>
                        <th className={`${TH} text-left`} style={{ color: "var(--text-dim)" }}>Assigned to</th>
                        <th className={`${TH} text-center`} style={{ color: "var(--text-dim)" }}>Status</th>
                        <th className={`${TH} text-right`} style={{ color: "var(--text-dim)" }}>Due</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tasks.map((t) => {
                        const assignees = t.assignee_ids
                          .map((id) => members.find((m) => m.user_id === id)?.name || `#${id}`)
                          .join(", ")
                        return (
                          <tr key={t.id} style={ROW_BORDER} className="hover:bg-white/[0.02] transition-colors">
                            <td className={`${TD} font-medium`} style={{ color: "var(--text)" }}>
                              <div className="max-w-[300px] truncate">{t.summary}</div>
                            </td>
                            <td className={TD} style={{ color: "var(--text-muted)" }}>
                              {projectMap.get(t.project_id) || `#${t.project_id}`}
                            </td>
                            <td className={TD} style={{ color: "var(--text-muted)" }}>
                              {assignees || "—"}
                            </td>
                            <td className={`${TD} text-center`}>
                              <Badge tone={t.status === "active" ? "green" : "grey"}>{t.status}</Badge>
                            </td>
                            <td className={`${TD} text-right tabular-nums`} style={{ color: "var(--text-dim)" }}>
                              {t.due_at
                                ? new Date(t.due_at).toLocaleDateString("en-GB", {
                                    day: "numeric",
                                    month: "short",
                                  })
                                : "—"}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </Panel>
              ) : (
                <EmptyState title="No active tasks">No tasks found in Hubstaff. Create tasks in Hubstaff to see them here.</EmptyState>
              )}

              {/* Projects list */}
              {projects.length > 0 && (
                <Panel title="Projects" pad={false}>
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                        <th className={`${TH} text-left`} style={{ color: "var(--text-dim)" }}>Project</th>
                        <th className={`${TH} text-center`} style={{ color: "var(--text-dim)" }}>Status</th>
                        <th className={`${TH} text-right`} style={{ color: "var(--text-dim)" }}>Tasks</th>
                      </tr>
                    </thead>
                    <tbody>
                      {projects.map((p) => {
                        const taskCount = tasks.filter((t) => t.project_id === p.id).length
                        return (
                          <tr key={p.id} style={ROW_BORDER}>
                            <td className={`${TD} font-medium`} style={{ color: "var(--text)" }}>{p.name}</td>
                            <td className={`${TD} text-center`}>
                              <Badge tone={p.status === "active" ? "green" : "grey"}>{p.status}</Badge>
                            </td>
                            <td className={`${TD} text-right tabular-nums`} style={{ color: "var(--text-muted)" }}>
                              {taskCount}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </Panel>
              )}
            </>
          )}

          <div className="text-[9px]" style={{ color: "var(--text-dim)" }}>
            Data from Hubstaff API, cached 5 minutes. Activity % = active input time / tracked time.
          </div>
        </>
      )}
    </PageShell>
  )
}
