"use client"
import { useEffect, useState } from "react"
import { fetchLatestEurRates } from "@/lib/currency"
import { createClient } from "@supabase/supabase-js"
import { PillSelect } from "@/components/PillSelect"
import { FilterSelect, EMPTY_FILTER, passes, passesAny, type FilterValue } from "@/components/FilterSelect"

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
  tp_reviews: number | null
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

// TrendTrack revenue estimates are USD; shown in EUR at today's ECB rate
function fmtRev(usd: number | null, usdPerEur: number): string {
  if (usd == null) return "—"
  const n = usd / usdPerEur
  if (n >= 1_000_000) return `€${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `€${(n / 1_000).toFixed(0)}K`
  return `€${n.toFixed(0)}`
}

export default function CompetitorsPage() {
  const [competitors, setCompetitors] = useState<Competitor[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ domain: "", store_name: "", niche: "", status: "watching" as Competitor["status"] })
  const [saving, setSaving] = useState(false)
  const [statusFilter, setStatusFilter] = useState<FilterValue>(EMPTY_FILTER)
  const [countryFilter, setCountryFilter] = useState<FilterValue>(EMPTY_FILTER)
  const [nicheFilter, setNicheFilter] = useState<FilterValue>(EMPTY_FILTER)
  const [search, setSearch] = useState("")
  const [sortBy, setSortBy] = useState<string>("monthly_visits")
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc")

  useEffect(() => { load() }, [])
  const [usdPerEur, setUsdPerEur] = useState(1.11)
  useEffect(() => { fetchLatestEurRates().then((r) => setUsdPerEur(r.USD)) }, [])

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

  const allCountries = Array.from(new Set(competitors.flatMap((c) => Array.isArray(c.markets) ? c.markets.map((m) => m.toUpperCase()) : []))).sort()
  const allNiches = Array.from(new Set(competitors.map((c) => c.niche).filter(Boolean))).sort()

  const filtered = competitors
    .filter((c) => passes(statusFilter, c.status))
    .filter((c) => passesAny(countryFilter, Array.isArray(c.markets) ? c.markets.map((m) => m.toUpperCase()) : []))
    .filter((c) => passes(nicheFilter, c.niche))
    .filter((c) => !search || c.domain.toLowerCase().includes(search.toLowerCase()) || (c.store_name || "").toLowerCase().includes(search.toLowerCase()) || (c.niche || "").toLowerCase().includes(search.toLowerCase()))

  const sorted = [...filtered].sort((a, b) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const av = (a as any)[sortBy] as number ?? -1
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bv = (b as any)[sortBy] as number ?? -1
    return sortDir === "desc" ? bv - av : av - bv
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
        <button onClick={() => setShowForm(!showForm)}
          className="px-4 py-1.5 rounded-lg text-xs font-medium shrink-0" style={{ background: "#4E6AA7", color: "#fff" }}>
          + Add competitor
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-6">
        <input type="text" placeholder="Search domain, name, niche..." value={search} onChange={(e) => setSearch(e.target.value)}
          className="px-3 py-1.5 rounded-lg border text-xs w-48" style={{ background: "var(--bg-card)", borderColor: "var(--border)", color: "var(--text)" }} />
        <FilterSelect label="Status" options={["new", "watching", "scaling", "dead"]} value={statusFilter} onChange={setStatusFilter} />
        <FilterSelect label="Country" options={allCountries.map((c) => ({ value: c, label: `${FLAG[c] || ""} ${c}`.trim() }))} value={countryFilter} onChange={setCountryFilter} />
        <FilterSelect label="Niche" options={allNiches.map((n) => String(n))} value={nicheFilter} onChange={setNicheFilter} />
        <PillSelect
          label="Sort"
          value={`${sortBy}:${sortDir}`}
          onChange={(v) => { const [f, d] = v.split(":"); setSortBy(f); setSortDir(d as "asc" | "desc") }}
          options={[
            { value: "monthly_visits:desc", label: "Visits: High → Low" },
            { value: "monthly_visits:asc", label: "Visits: Low → High" },
            { value: "growth_30d:desc", label: "Growth: High → Low" },
            { value: "growth_30d:asc", label: "Growth: Low → High" },
            { value: "active_ads:desc", label: "Ads: Most → Least" },
            { value: "active_ads:asc", label: "Ads: Least → Most" },
            { value: "products_count:desc", label: "Products: Most → Least" },
            { value: "products_count:asc", label: "Products: Least → Most" },
            { value: "est_monthly_revenue:desc", label: "Revenue: High → Low" },
            { value: "est_monthly_revenue:asc", label: "Revenue: Low → High" },
            { value: "tp_reviews:desc", label: "TP reviews: Most → Least" },
            { value: "tp_reviews:asc", label: "TP reviews: Least → Most" },
          ]}
        />
        {(statusFilter.values.length > 0 || countryFilter.values.length > 0 || nicheFilter.values.length > 0 || search) && (
          <button onClick={() => { setStatusFilter(EMPTY_FILTER); setCountryFilter(EMPTY_FILTER); setNicheFilter(EMPTY_FILTER); setSearch("") }}
            className="px-3 py-1.5 rounded-lg text-xs" style={{ color: "var(--text-muted)" }}>
            Clear filters
          </button>
        )}
        <span className="ml-auto text-xs" style={{ color: "var(--text-muted)" }}>{filtered.length} of {competitors.length}</span>
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
                <ThSort label="Monthly visits" field="monthly_visits" sortBy={sortBy} setSortBy={setSortBy} sortDir={sortDir} setSortDir={setSortDir} />
                <ThSort label="30D Growth" field="growth_30d" sortBy={sortBy} setSortBy={setSortBy} sortDir={sortDir} setSortDir={setSortDir} />
                <th className="text-center px-4 py-3 text-xs font-medium uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Markets</th>
                <ThSort label="Active Ads" field="active_ads" sortBy={sortBy} setSortBy={setSortBy} sortDir={sortDir} setSortDir={setSortDir} />
                <ThSort label="Products" field="products_count" sortBy={sortBy} setSortBy={setSortBy} sortDir={sortDir} setSortDir={setSortDir} />
                <ThSort label="TP Reviews" field="tp_reviews" sortBy={sortBy} setSortBy={setSortBy} sortDir={sortDir} setSortDir={setSortDir} />
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
                  <td className="px-4 py-3 text-right font-mono">
                    {c.tp_reviews != null ? (
                      <a
                        href={`https://www.trustpilot.com/review/${c.domain}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:underline"
                        style={{ color: "#00b67a" }}
                      >
                        {fmt(c.tp_reviews)}
                      </a>
                    ) : "—"}
                  </td>
                  <td className="px-4 py-3 text-right font-mono">{fmtRev(c.est_monthly_revenue, usdPerEur)}</td>
                  <td className="px-4 py-3 text-center">
                    <PillSelect
                      value={c.status}
                      onChange={(v) => c.id && updateStatus(c.id, v as Competitor["status"])}
                      options={["new", "watching", "scaling", "dead"]}
                    />
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

function ThSort({ label, field, sortBy, setSortBy, sortDir, setSortDir }: {
  label: string; field: string;
  sortBy: string; setSortBy: (f: string) => void;
  sortDir: "desc" | "asc"; setSortDir: (d: "desc" | "asc") => void
}) {
  const active = sortBy === field
  return (
    <th className="text-right px-4 py-3 text-xs font-medium uppercase tracking-wider cursor-pointer select-none"
      style={{ color: active ? "var(--text)" : "var(--text-muted)" }}
      onClick={() => { if (active) { setSortDir(sortDir === "desc" ? "asc" : "desc") } else { setSortBy(field); setSortDir("desc") } }}>
      {label}{active ? (sortDir === "desc" ? " ▼" : " ▲") : ""}
    </th>
  )
}
