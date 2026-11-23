"use client"
import { useEffect, useState } from "react"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)

interface Competitor {
  id?: number
  created_at?: string
  domain: string
  store_name: string
  store_url: string
  niche: string
  monthly_visits: number | null
  growth_30d: number | null
  markets: string[]
  active_ads: number | null
  products_count: number | null
  est_monthly_revenue: number | null
  est_units_sold: number | null
  status: "watching" | "scaling" | "dead" | "new"
  notes: string
  last_checked: string
  last_synced: string | null
  trendtrack_id: string | null
}

const FLAG: Record<string, string> = {
  US: "\u{1F1FA}\u{1F1F8}", GB: "\u{1F1EC}\u{1F1E7}", UK: "\u{1F1EC}\u{1F1E7}",
  FR: "\u{1F1EB}\u{1F1F7}", DE: "\u{1F1E9}\u{1F1EA}", IT: "\u{1F1EE}\u{1F1F9}",
  IE: "\u{1F1EE}\u{1F1EA}", NL: "\u{1F1F3}\u{1F1F1}", ES: "\u{1F1EA}\u{1F1F8}",
  BE: "\u{1F1E7}\u{1F1EA}", AU: "\u{1F1E6}\u{1F1FA}", CA: "\u{1F1E8}\u{1F1E6}",
  BR: "\u{1F1E7}\u{1F1F7}", PT: "\u{1F1F5}\u{1F1F9}", SE: "\u{1F1F8}\u{1F1EA}",
  NO: "\u{1F1F3}\u{1F1F4}", DK: "\u{1F1E9}\u{1F1F0}", AT: "\u{1F1E6}\u{1F1F9}",
  CH: "\u{1F1E8}\u{1F1ED}", PL: "\u{1F1F5}\u{1F1F1}",
}

function fmt(n: number | null): string {
  if (n == null) return "—"
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toLocaleString()
}

function fmtRev(n: number | null): string {
  if (n == null) return "—"
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`
  return `$${n.toFixed(0)}`
}

export default function CompetitorsPage() {
  const [competitors, setCompetitors] = useState<Competitor[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ domain: "", store_name: "", niche: "", status: "watching" as Competitor["status"] })
  const [saving, setSaving] = useState(false)
  const [statusFilter, setStatusFilter] = useState("all")
  const [sortBy, setSortBy] = useState<string>("monthly_visits")

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from("competitors")
      .select("*")
      .order("monthly_visits", { ascending: false, nullsFirst: false })
      .limit(200)
    setCompetitors((data as Competitor[]) || [])
    setLoading(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    await supabase.from("competitors").insert({
      domain: form.domain,
      store_name: form.store_name || form.domain,
      store_url: `https://${form.domain}`,
      niche: form.niche,
      status: form.status,
      last_checked: new Date().toISOString().split("T")[0],
    })
    setForm({ domain: "", store_name: "", niche: "", status: "watching" })
    setShowForm(false)
    setSaving(false)
    load()
  }

  async function updateStatus(id: number, status: Competitor["status"]) {
    await supabase.from("competitors").update({ status }).eq("id", id)
    setCompetitors((prev) => prev.map((c) => (c.id === id ? { ...c, status } : c)))
  }

  async function remove(id: number) {
    await supabase.from("competitors").delete().eq("id", id)
    setCompetitors((prev) => prev.filter((c) => c.id !== id))
  }

  const filtered = statusFilter === "all" ? competitors : competitors.filter((c) => c.status === statusFilter)
  const sorted = [...filtered].sort((a, b) => {
    const av = (a as Record<string, unknown>)[sortBy] as number ?? -1
    const bv = (b as Record<string, unknown>)[sortBy] as number ?? -1
    return bv - av
  })

  const scalingCount = competitors.filter((c) => c.status === "scaling").length
  const watchingCount = competitors.filter((c) => c.status === "watching").length
  const lastSynced = competitors.find((c) => c.last_synced)?.last_synced

  return (
    <main className="min-h-screen p-4 md:p-8 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-bold">Competitor Tracker</h1>
          {lastSynced && (
            <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
              TrendTrack sync: {new Date(lastSynced).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-1.5 rounded-lg border text-xs" style={{ background: "var(--bg-card)", borderColor: "var(--border)", color: "var(--text)" }}>
            <option value="all">All</option>
            <option value="new">New</option>
            <option value="watching">Watching</option>
            <option value="scaling">Scaling</option>
            <option value="dead">Dead</option>
          </select>
          <button onClick={() => setShowForm(!showForm)}
            className="px-4 py-1.5 rounded-lg text-xs font-medium" style={{ background: "#4E6AA7", color: "#fff" }}>
            + Add competitor
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <div className="rounded-xl p-4 border" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
          <div className="text-xs mb-1" style={{ color: "var(--text-muted)" }}>Tracked</div>
          <div className="text-lg font-bold">{competitors.length}</div>
        </div>
        <div className="rounded-xl p-4 border" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
          <div className="text-xs mb-1" style={{ color: "var(--text-muted)" }}>Scaling</div>
          <div className="text-lg font-bold" style={{ color: "var(--green)" }}>{scalingCount}</div>
        </div>
        <div className="rounded-xl p-4 border" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
          <div className="text-xs mb-1" style={{ color: "var(--text-muted)" }}>Watching</div>
          <div className="text-lg font-bold" style={{ color: "#4E6AA7" }}>{watchingCount}</div>
        </div>
        <div className="rounded-xl p-4 border" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
          <div className="text-xs mb-1" style={{ color: "var(--text-muted)" }}>Total Ads</div>
          <div className="text-lg font-bold" style={{ color: "var(--orange)" }}>
            {fmt(competitors.reduce((s, c) => s + (c.active_ads || 0), 0))}
          </div>
        </div>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit}
          className="rounded-xl p-4 border mb-6 grid grid-cols-1 sm:grid-cols-4 gap-3"
          style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
          <input type="text" required placeholder="domain.com" value={form.domain} onChange={(e) => setForm({ ...form, domain: e.target.value })}
            className="px-3 py-2 rounded-lg border text-sm" style={{ background: "var(--bg)", borderColor: "var(--border)", color: "var(--text)" }} />
          <input type="text" placeholder="Store name (optional)" value={form.store_name} onChange={(e) => setForm({ ...form, store_name: e.target.value })}
            className="px-3 py-2 rounded-lg border text-sm" style={{ background: "var(--bg)", borderColor: "var(--border)", color: "var(--text)" }} />
          <input type="text" placeholder="Niche" value={form.niche} onChange={(e) => setForm({ ...form, niche: e.target.value })}
            className="px-3 py-2 rounded-lg border text-sm" style={{ background: "var(--bg)", borderColor: "var(--border)", color: "var(--text)" }} />
          <button type="submit" disabled={saving}
            className="px-4 py-2 rounded-lg text-sm font-medium"
            style={{ background: saving ? "var(--border)" : "#4E6AA7", color: "#fff" }}>
            {saving ? "Saving..." : "Add"}
          </button>
        </form>
      )}

      {loading ? (
        <div className="text-center py-20" style={{ color: "var(--text-muted)" }}>Loading...</div>
      ) : sorted.length === 0 ? (
        <div className="text-center py-20" style={{ color: "var(--text-muted)" }}>
          No competitors tracked yet. Click &quot;+ Add competitor&quot; or ask Claude to sync from TrendTrack.
        </div>
      ) : (
        <div className="rounded-xl border overflow-x-auto" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Competitor</th>
                <ThSort label="Monthly visits" field="monthly_visits" sortBy={sortBy} setSortBy={setSortBy} />
                <ThSort label="30D Growth" field="growth_30d" sortBy={sortBy} setSortBy={setSortBy} />
                <th className="text-center px-4 py-3 text-xs font-medium uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Markets</th>
                <ThSort label="Active Ads" field="active_ads" sortBy={sortBy} setSortBy={setSortBy} />
                <ThSort label="Products" field="products_count" sortBy={sortBy} setSortBy={setSortBy} />
                <th className="text-right px-4 py-3 text-xs font-medium uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Est. Revenue</th>
                <th className="text-center px-4 py-3 text-xs font-medium uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Status</th>
                <th className="px-2 py-3" />
              </tr>
            </thead>
            <tbody>
              {sorted.map((c) => (
                <tr key={c.id} className="group" style={{ borderBottom: "1px solid var(--border)" }}>
                  <td className="px-4 py-3">
                    <a href={c.store_url || `https://${c.domain}`} target="_blank" rel="noopener noreferrer"
                      className="hover:underline font-medium" style={{ color: "#4E6AA7" }}>
                      {c.domain || c.store_name}
                    </a>
                    {c.niche && <div className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>{c.niche}</div>}
                  </td>
                  <td className="px-4 py-3 text-right font-mono">{fmt(c.monthly_visits)}</td>
                  <td className="px-4 py-3 text-right font-mono">
                    {c.growth_30d != null ? (
                      <span style={{ color: c.growth_30d > 0 ? "var(--green)" : c.growth_30d < 0 ? "var(--red)" : "var(--text-muted)" }}>
                        {c.growth_30d > 0 ? "▲" : c.growth_30d < 0 ? "▼" : ""} {c.growth_30d > 0 ? "+" : ""}{c.growth_30d.toFixed(1)}%
                      </span>
                    ) : "—"}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {Array.isArray(c.markets) && c.markets.length > 0
                      ? c.markets.slice(0, 4).map((m) => FLAG[m.toUpperCase()] || m).join(" ")
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-right font-mono">{c.active_ads != null ? fmt(c.active_ads) : "—"}</td>
                  <td className="px-4 py-3 text-right font-mono">{fmt(c.products_count)}</td>
                  <td className="px-4 py-3 text-right font-mono">{fmtRev(c.est_monthly_revenue)}</td>
                  <td className="px-4 py-3 text-center">
                    <select value={c.status} onChange={(e) => c.id && updateStatus(c.id, e.target.value as Competitor["status"])}
                      className="px-2 py-0.5 rounded text-xs border-0 cursor-pointer"
                      style={{
                        background: c.status === "scaling" ? "#34d39922" : c.status === "watching" ? "#4E6AA722" : c.status === "dead" ? "#f8717122" : "#D4903A22",
                        color: c.status === "scaling" ? "var(--green)" : c.status === "watching" ? "#4E6AA7" : c.status === "dead" ? "var(--red)" : "var(--orange)",
                      }}>
                      <option value="new">new</option>
                      <option value="watching">watching</option>
                      <option value="scaling">scaling</option>
                      <option value="dead">dead</option>
                    </select>
                  </td>
                  <td className="px-2 py-3">
                    <button onClick={() => c.id && remove(c.id)}
                      className="opacity-0 group-hover:opacity-60 hover:!opacity-100 text-xs"
                      style={{ color: "var(--red)" }}>
                      x
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  )
}

function ThSort({ label, field, sortBy, setSortBy }: {
  label: string; field: string;
  sortBy: string; setSortBy: (f: string) => void
}) {
  const active = sortBy === field
  return (
    <th className="text-right px-4 py-3 text-xs font-medium uppercase tracking-wider cursor-pointer select-none"
      style={{ color: active ? "var(--text)" : "var(--text-muted)" }}
      onClick={() => setSortBy(field)}>
      {label}{active ? " ▼" : ""}
    </th>
  )
}
