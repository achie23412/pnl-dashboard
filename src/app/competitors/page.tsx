"use client"
import { useEffect, useState } from "react"
import { fetchLatestEurRates } from "@/lib/currency"
import { createClient } from "@supabase/supabase-js"
import { PillSelect, FilterBar } from "@/components/PillSelect"
import { PageShell } from "@/components/PageShell"
import { Panel, Button, Loading, EmptyState, TH, TD, ROW_BORDER } from "@/components/ui"
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

  const inputStyle = { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", color: "var(--text)" }

  return (
    <PageShell
      title="Competitor Tracker"
      breadcrumb="Front End → Competitor Tracker"
      description={`Google dropshipping competitors with visits, ads, products and Trustpilot reviews from TrendTrack. Revenue estimates are USD, shown in EUR at today's ECB rate.${lastSynced ? ` Last TrendTrack sync: ${new Date(lastSynced).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}.` : ""}`}
      stats={[
        { label: "Tracked", value: String(competitors.length) },
        { label: "Scaling", value: String(scalingCount), color: "var(--green)" },
        { label: "Watching", value: String(watchingCount), color: "var(--accent)" },
        { label: "Total ads", value: fmt(competitors.reduce((s, c) => s + (c.active_ads || 0), 0)), color: "var(--orange)" },
      ]}
      actions={
        <Button variant="primary" onClick={() => setShowForm(!showForm)}>
          Add competitor
        </Button>
      }
    >
      <FilterBar right={<span className="text-[10px] tabular-nums" style={{ color: "var(--text-dim)" }}>{filtered.length} of {competitors.length}</span>}>
        <input type="text" placeholder="Search domain, name, niche…" value={search} onChange={(e) => setSearch(e.target.value)}
          className="px-2.5 py-1 rounded-lg text-[10px] w-48 outline-none" style={inputStyle} />
        <FilterSelect label="Status" options={["new", "watching", "scaling", "dead"]} value={statusFilter} onChange={setStatusFilter} />
        <FilterSelect label="Country" options={allCountries} value={countryFilter} onChange={setCountryFilter} />
        <FilterSelect label="Niche" options={allNiches.map((n) => String(n))} value={nicheFilter} onChange={setNicheFilter} />
        <PillSelect
          label="Sort"
          value={`${sortBy}:${sortDir}`}
          onChange={(v) => { const [f, d] = v.split(":"); setSortBy(f); setSortDir(d as "asc" | "desc") }}
          options={[
            { value: "monthly_visits:desc", label: "Visits: high → low" },
            { value: "monthly_visits:asc", label: "Visits: low → high" },
            { value: "growth_30d:desc", label: "Growth: high → low" },
            { value: "growth_30d:asc", label: "Growth: low → high" },
            { value: "active_ads:desc", label: "Ads: most → least" },
            { value: "active_ads:asc", label: "Ads: least → most" },
            { value: "products_count:desc", label: "Products: most → least" },
            { value: "products_count:asc", label: "Products: least → most" },
            { value: "est_monthly_revenue:desc", label: "Revenue: high → low" },
            { value: "est_monthly_revenue:asc", label: "Revenue: low → high" },
            { value: "tp_reviews:desc", label: "TP reviews: most → least" },
            { value: "tp_reviews:asc", label: "TP reviews: least → most" },
          ]}
        />
        {(statusFilter.values.length > 0 || countryFilter.values.length > 0 || nicheFilter.values.length > 0 || search) && (
          <Button variant="ghost" size="sm" onClick={() => { setStatusFilter(EMPTY_FILTER); setCountryFilter(EMPTY_FILTER); setNicheFilter(EMPTY_FILTER); setSearch("") }}>
            Clear filters
          </Button>
        )}
      </FilterBar>

      {showForm && (
        <Panel title="Add competitor" className="mb-4">
          <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <input type="text" required placeholder="domain.com" value={form.domain} onChange={(e) => setForm({ ...form, domain: e.target.value })}
              className="px-3 py-1.5 rounded-lg text-[11px] outline-none" style={inputStyle} />
            <input type="text" placeholder="Store name (optional)" value={form.store_name} onChange={(e) => setForm({ ...form, store_name: e.target.value })}
              className="px-3 py-1.5 rounded-lg text-[11px] outline-none" style={inputStyle} />
            <input type="text" placeholder="Niche" value={form.niche} onChange={(e) => setForm({ ...form, niche: e.target.value })}
              className="px-3 py-1.5 rounded-lg text-[11px] outline-none" style={inputStyle} />
            <Button type="submit" variant="primary" disabled={saving}>
              {saving ? "Saving…" : "Add"}
            </Button>
          </form>
        </Panel>
      )}

      {loading ? (
        <Loading>Loading competitors…</Loading>
      ) : sorted.length === 0 ? (
        <EmptyState title={competitors.length === 0 ? "No competitors tracked yet" : "No competitors match these filters"}>
          {competitors.length === 0 ? "Click Add competitor, or ask Claude to sync from TrendTrack." : "Change or clear the filters to see more."}
        </EmptyState>
      ) : (
        <Panel pad={false}>
          <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr style={{ color: "var(--text-dim)" }}>
                <th className={`${TH} text-left`}>Competitor</th>
                <ThSort label="Monthly visits" field="monthly_visits" sortBy={sortBy} setSortBy={setSortBy} sortDir={sortDir} setSortDir={setSortDir} />
                <ThSort label="30d growth" field="growth_30d" sortBy={sortBy} setSortBy={setSortBy} sortDir={sortDir} setSortDir={setSortDir} />
                <th className={`${TH} text-center`}>Markets</th>
                <ThSort label="Active ads" field="active_ads" sortBy={sortBy} setSortBy={setSortBy} sortDir={sortDir} setSortDir={setSortDir} />
                <ThSort label="Products" field="products_count" sortBy={sortBy} setSortBy={setSortBy} sortDir={sortDir} setSortDir={setSortDir} />
                <ThSort label="TP reviews" field="tp_reviews" sortBy={sortBy} setSortBy={setSortBy} sortDir={sortDir} setSortDir={setSortDir} />
                <th className={`${TH} text-right`}>Est. revenue</th>
                <th className={`${TH} text-center`}>Status</th>
                <th className={TH} />
              </tr>
            </thead>
            <tbody>
              {sorted.map((c) => (
                <tr key={c.id} className="group" style={ROW_BORDER}>
                  <td className={TD}>
                    <a href={c.store_url || `https://${c.domain}`} target="_blank" rel="noopener noreferrer"
                      className="hover:underline font-medium" style={{ color: "var(--accent)" }}>
                      {c.domain || c.store_name}
                    </a>
                    {c.niche && <div className="text-[10px] mt-0.5" style={{ color: "var(--text-dim)" }}>{c.niche}</div>}
                  </td>
                  <td className={`${TD} text-right tabular-nums`}>{fmt(c.monthly_visits)}</td>
                  <td className={`${TD} text-right tabular-nums`}>
                    {c.growth_30d != null ? (
                      <span style={{ color: c.growth_30d > 0 ? "var(--green)" : c.growth_30d < 0 ? "var(--red)" : "var(--text-muted)" }}>
                        {c.growth_30d > 0 ? "▲" : c.growth_30d < 0 ? "▼" : ""} {c.growth_30d > 0 ? "+" : ""}{c.growth_30d.toFixed(1)}%
                      </span>
                    ) : "—"}
                  </td>
                  <td className={`${TD} text-center`} style={{ color: "var(--text-muted)" }}>
                    {Array.isArray(c.markets) && c.markets.length > 0
                      ? c.markets.slice(0, 4).map((m) => m.toUpperCase()).join(" ")
                      : "—"}
                  </td>
                  <td className={`${TD} text-right tabular-nums`}>{c.active_ads != null ? fmt(c.active_ads) : "—"}</td>
                  <td className={`${TD} text-right tabular-nums`}>{fmt(c.products_count)}</td>
                  <td className={`${TD} text-right tabular-nums`}>
                    {c.tp_reviews != null ? (
                      <a
                        href={`https://www.trustpilot.com/review/${c.domain}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:underline"
                        style={{ color: "var(--green)" }}
                      >
                        {fmt(c.tp_reviews)}
                      </a>
                    ) : "—"}
                  </td>
                  <td className={`${TD} text-right tabular-nums`}>{fmtRev(c.est_monthly_revenue, usdPerEur)}</td>
                  <td className={`${TD} text-center`}>
                    <PillSelect
                      value={c.status}
                      onChange={(v) => c.id && updateStatus(c.id, v as Competitor["status"])}
                      options={["new", "watching", "scaling", "dead"]}
                    />
                  </td>
                  <td className="px-2 py-2">
                    <Button variant="danger" size="sm" className="opacity-0 group-hover:opacity-100" onClick={() => c.id && remove(c.id)}>
                      Delete
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </Panel>
      )}
    </PageShell>
  )
}

function ThSort({ label, field, sortBy, setSortBy, sortDir, setSortDir }: {
  label: string; field: string;
  sortBy: string; setSortBy: (f: string) => void;
  sortDir: "desc" | "asc"; setSortDir: (d: "desc" | "asc") => void
}) {
  const active = sortBy === field
  return (
    <th className={`${TH} text-right cursor-pointer select-none`}
      style={{ color: active ? "var(--text)" : "var(--text-dim)" }}
      onClick={() => { if (active) { setSortDir(sortDir === "desc" ? "asc" : "desc") } else { setSortBy(field); setSortDir("desc") } }}>
      {label}{active ? (sortDir === "desc" ? " ▼" : " ▲") : ""}
    </th>
  )
}
