"use client"
import { useEffect, useState, useCallback } from "react"
import { fetchLatestEurRates } from "@/lib/currency"
import { db } from "@/lib/db-client"
import { PillSelect, FilterBar } from "@/components/PillSelect"
import { PageShell } from "@/components/PageShell"
import { Panel, Button, Badge, Loading, EmptyState, TH, TD, ROW_BORDER } from "@/components/ui"
import { FilterSelect, EMPTY_FILTER, passes, passesAny, type FilterValue } from "@/components/FilterSelect"

const supabase = db

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
  tp_rating: number | null // Trustpilot TrustScore 1.0–5.0
  tp_checked: string | null
  status: "watching" | "scaling" | "dead" | "new"
  notes: string
  last_checked: string
  last_synced: string | null
  trendtrack_id: string | null
  last_full_month_visits: number | null
  prior_month_visits: number | null
  visits_month: string | null
}

interface CoverageSum { total: number; covered: number; partly: number }
interface CpProduct {
  id: number; competitor_domain: string; title: string; handle: string
  url: string; image: string | null; product_type: string | null
  price: number | null; currency: string | null; bestseller_rank: number | null
}
interface CoverageRow {
  id: number; competitor_product_id: number; own_product_id: number | null
  own_product_title: string | null; status: string; auto_matched: boolean
  verified: boolean; verified_at: string | null; notes: string | null
}

function fmt(n: number | null): string {
  if (n == null) return "—"
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toLocaleString()
}

function fmtRev(usd: number | null, usdPerEur: number): string {
  if (usd == null) return "—"
  const n = usd / usdPerEur
  if (n >= 1_000_000) return `€${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `€${(n / 1_000).toFixed(0)}K`
  return `€${n.toFixed(0)}`
}

function momPct(last: number | null, prior: number | null): number | null {
  if (last == null || prior == null || prior === 0) return null
  return ((last - prior) / prior) * 100
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
  const [coverageSums, setCoverageSums] = useState<Record<string, CoverageSum>>({})
  const [expanded, setExpanded] = useState<string | null>(null)
  const [covProducts, setCovProducts] = useState<CpProduct[]>([])
  const [covRows, setCovRows] = useState<CoverageRow[]>([])
  const [covLoading, setCovLoading] = useState(false)
  const [autoMatchLoading, setAutoMatchLoading] = useState<string | null>(null)

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
    loadCoverageSummary()
  }

  async function loadCoverageSummary() {
    try {
      const res = await fetch("/api/competitors/coverage")
      const json = await res.json()
      if (json.summary) setCoverageSums(json.summary)
    } catch { /* ignore */ }
  }

  const loadCoverageDetail = useCallback(async (domain: string) => {
    setCovLoading(true)
    setCovProducts([])
    setCovRows([])
    try {
      const res = await fetch(`/api/competitors/coverage?domain=${encodeURIComponent(domain)}`)
      const json = await res.json()
      setCovProducts(json.products || [])
      setCovRows(json.coverage || [])
    } catch { /* ignore */ }
    setCovLoading(false)
  }, [])

  function toggleExpand(domain: string) {
    if (expanded === domain) {
      setExpanded(null)
    } else {
      setExpanded(domain)
      loadCoverageDetail(domain)
    }
  }

  async function runAutoMatch(domain: string) {
    setAutoMatchLoading(domain)
    try {
      await fetch("/api/competitors/coverage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "auto_match", domain }),
      })
      await loadCoverageDetail(domain)
      await loadCoverageSummary()
    } catch { /* ignore */ }
    setAutoMatchLoading(null)
  }

  async function verifyCoverage(cpId: number, verified: boolean) {
    await fetch("/api/competitors/coverage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "verify", competitor_product_id: cpId, verified }),
    })
    setCovRows((prev) => prev.map((r) =>
      r.competitor_product_id === cpId
        ? { ...r, verified, verified_at: verified ? new Date().toISOString() : null }
        : r,
    ))
    loadCoverageSummary()
  }

  async function setCoverageStatus(cpId: number, status: string) {
    await fetch("/api/competitors/coverage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "set_status", competitor_product_id: cpId, status }),
    })
    setCovRows((prev) => prev.map((r) =>
      r.competitor_product_id === cpId ? { ...r, status, verified: false, verified_at: null } : r,
    ))
    loadCoverageSummary()
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
    let av: number, bv: number
    if (sortBy === "mom_pct") {
      av = momPct(a.last_full_month_visits, a.prior_month_visits) ?? -9999
      bv = momPct(b.last_full_month_visits, b.prior_month_visits) ?? -9999
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      av = (a as any)[sortBy] as number ?? -1
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      bv = (b as any)[sortBy] as number ?? -1
    }
    return sortDir === "desc" ? bv - av : av - bv
  })

  const scalingCount = competitors.filter((c) => c.status === "scaling").length
  const watchingCount = competitors.filter((c) => c.status === "watching").length
  const lastSynced = competitors.find((c) => c.last_synced)?.last_synced

  const inputStyle = { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", color: "var(--text)" }

  const covMapLocal = new Map(covRows.map((r) => [r.competitor_product_id, r]))

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
        <>
          <Button href="/keyword-maker">Find new competitors</Button>
          <Button variant="primary" onClick={() => setShowForm(!showForm)}>
            Add competitor
          </Button>
        </>
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
            { value: "last_full_month_visits:desc", label: "Last month: high → low" },
            { value: "last_full_month_visits:asc", label: "Last month: low → high" },
            { value: "mom_pct:desc", label: "MoM %: high → low" },
            { value: "mom_pct:asc", label: "MoM %: low → high" },
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
            { value: "tp_rating:desc", label: "TP rating: high → low" },
            { value: "tp_rating:asc", label: "TP rating: low → high" },
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
                <ThSort label="Visits" field="monthly_visits" sortBy={sortBy} setSortBy={setSortBy} sortDir={sortDir} setSortDir={setSortDir} />
                <ThSort label="Last month" field="last_full_month_visits" sortBy={sortBy} setSortBy={setSortBy} sortDir={sortDir} setSortDir={setSortDir} />
                <ThSort label="MoM %" field="mom_pct" sortBy={sortBy} setSortBy={setSortBy} sortDir={sortDir} setSortDir={setSortDir} />
                <ThSort label="30d growth" field="growth_30d" sortBy={sortBy} setSortBy={setSortBy} sortDir={sortDir} setSortDir={setSortDir} />
                <th className={`${TH} text-center`}>Markets</th>
                <ThSort label="Ads" field="active_ads" sortBy={sortBy} setSortBy={setSortBy} sortDir={sortDir} setSortDir={setSortDir} />
                <ThSort label="Products" field="products_count" sortBy={sortBy} setSortBy={setSortBy} sortDir={sortDir} setSortDir={setSortDir} />
                <ThSort label="TP" field="tp_reviews" sortBy={sortBy} setSortBy={setSortBy} sortDir={sortDir} setSortDir={setSortDir} />
                <th className={`${TH} text-right`}>Revenue</th>
                <th className={`${TH} text-center`}>Coverage</th>
                <th className={`${TH} text-center`}>Status</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((c) => {
                const mom = momPct(c.last_full_month_visits, c.prior_month_visits)
                const cov = coverageSums[c.domain]
                const isExpanded = expanded === c.domain
                return (
                  <CompetitorRow
                    key={c.id}
                    c={c}
                    mom={mom}
                    cov={cov}
                    isExpanded={isExpanded}
                    usdPerEur={usdPerEur}
                    onToggleExpand={() => toggleExpand(c.domain)}
                    onUpdateStatus={(status) => c.id && updateStatus(c.id, status)}
                    onRemove={() => c.id && window.confirm(`Remove ${c.domain} from the Competitor Tracker? This can't be undone.`) && remove(c.id!)}
                    covProducts={isExpanded ? covProducts : []}
                    covMap={isExpanded ? covMapLocal : new Map()}
                    covLoading={isExpanded && covLoading}
                    autoMatchLoading={autoMatchLoading === c.domain}
                    onAutoMatch={() => runAutoMatch(c.domain)}
                    onVerify={verifyCoverage}
                    onSetStatus={setCoverageStatus}
                  />
                )
              })}
            </tbody>
          </table>
          </div>
        </Panel>
      )}
    </PageShell>
  )
}

function CompetitorRow({
  c, mom, cov, isExpanded, usdPerEur, onToggleExpand, onUpdateStatus, onRemove,
  covProducts, covMap, covLoading, autoMatchLoading, onAutoMatch, onVerify, onSetStatus,
}: {
  c: Competitor; mom: number | null; cov: CoverageSum | undefined
  isExpanded: boolean; usdPerEur: number
  onToggleExpand: () => void; onUpdateStatus: (s: Competitor["status"]) => void; onRemove: () => void
  covProducts: CpProduct[]; covMap: Map<number, CoverageRow>; covLoading: boolean
  autoMatchLoading: boolean; onAutoMatch: () => void
  onVerify: (cpId: number, verified: boolean) => void
  onSetStatus: (cpId: number, status: string) => void
}) {
  return (
    <>
      <tr className="group" style={ROW_BORDER}>
        <td className={TD}>
          <a href={c.store_url || `https://${c.domain}`} target="_blank" rel="noopener noreferrer"
            className="hover:underline font-medium" style={{ color: "var(--accent)" }}>
            {c.domain || c.store_name}
          </a>
          {c.niche && <div className="text-[10px] mt-0.5" style={{ color: "var(--text-dim)" }}>{c.niche}</div>}
        </td>
        <td className={`${TD} text-right tabular-nums`}>{fmt(c.monthly_visits)}</td>
        <td className={`${TD} text-right tabular-nums`}>
          {c.last_full_month_visits != null ? (
            <span title={c.visits_month ? `Data from ${c.visits_month}` : undefined}>
              {fmt(c.last_full_month_visits)}
            </span>
          ) : <span style={{ color: "var(--text-muted)" }}>—</span>}
        </td>
        <td className={`${TD} text-right tabular-nums`}>
          {mom != null ? (
            <span style={{ color: mom > 0 ? "var(--green)" : mom < 0 ? "var(--red)" : "var(--text-muted)" }}>
              {mom > 0 ? "▲" : mom < 0 ? "▼" : ""} {mom > 0 ? "+" : ""}{mom.toFixed(1)}%
            </span>
          ) : <span style={{ color: "var(--text-muted)" }}>—</span>}
        </td>
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
          {c.tp_reviews != null || c.tp_rating != null ? (
            <a href={`https://www.trustpilot.com/review/${c.domain}`} target="_blank" rel="noopener noreferrer"
              className="hover:underline whitespace-nowrap" title={c.tp_checked ? `Trustpilot checked ${c.tp_checked}` : "Trustpilot"}>
              {c.tp_rating != null && (
                <span style={{ color: c.tp_rating >= 4 ? "var(--green)" : c.tp_rating >= 3 ? "var(--amber, #fbbf24)" : "var(--red)" }}>
                  {Number(c.tp_rating).toFixed(1)}★
                </span>
              )}
              {c.tp_rating != null && c.tp_reviews != null && <span style={{ color: "var(--text-dim)" }}> · </span>}
              {c.tp_reviews != null && <span style={{ color: "var(--text-muted)" }}>{fmt(c.tp_reviews)}</span>}
            </a>
          ) : "—"}
        </td>
        <td className={`${TD} text-right tabular-nums`}>{fmtRev(c.est_monthly_revenue, usdPerEur)}</td>
        <td className={`${TD} text-center`}>
          <button
            type="button"
            onClick={onToggleExpand}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] transition-colors hover:opacity-80"
            style={{
              background: cov && cov.total > 0
                ? cov.covered === cov.total ? "rgba(52,211,153,0.15)" : cov.covered > 0 ? "rgba(251,191,36,0.15)" : "rgba(255,255,255,0.05)"
                : "rgba(255,255,255,0.05)",
              color: cov && cov.total > 0
                ? cov.covered === cov.total ? "var(--green)" : cov.covered > 0 ? "var(--orange)" : "var(--text-muted)"
                : "var(--text-muted)",
            }}
          >
            {cov && cov.total > 0 ? `${cov.covered}/${cov.total}` : "—"}
            <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
              style={{ transform: isExpanded ? "rotate(180deg)" : undefined, transition: "transform 0.15s" }}>
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
        </td>
        <td className={`${TD} text-center`}>
          <div className="inline-flex items-center gap-1.5">
            <PillSelect
              value={c.status}
              onChange={(v) => onUpdateStatus(v as Competitor["status"])}
              options={["new", "watching", "scaling", "dead"]}
            />
            <button type="button" title={`Remove ${c.domain}`} aria-label={`Remove ${c.domain}`}
              className="opacity-0 group-hover:opacity-60 hover:!opacity-100 p-1 rounded transition-opacity"
              style={{ color: "var(--red)" }} onClick={onRemove}>
              <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6M14 11v6M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
              </svg>
            </button>
          </div>
        </td>
      </tr>
      {isExpanded && (
        <tr>
          <td colSpan={12} style={{ padding: 0, background: "rgba(255,255,255,0.02)" }}>
            <CoverageDetail
              domain={c.domain}
              products={covProducts}
              covMap={covMap}
              loading={covLoading}
              autoMatchLoading={autoMatchLoading}
              onAutoMatch={onAutoMatch}
              onVerify={onVerify}
              onSetStatus={onSetStatus}
            />
          </td>
        </tr>
      )}
    </>
  )
}

function CoverageDetail({
  domain, products, covMap, loading, autoMatchLoading, onAutoMatch, onVerify, onSetStatus,
}: {
  domain: string; products: CpProduct[]; covMap: Map<number, CoverageRow>; loading: boolean
  autoMatchLoading: boolean; onAutoMatch: () => void
  onVerify: (cpId: number, verified: boolean) => void
  onSetStatus: (cpId: number, status: string) => void
}) {
  if (loading) return <div className="p-4 text-[11px]" style={{ color: "var(--text-dim)" }}>Loading best-sellers…</div>

  if (products.length === 0) {
    return (
      <div className="p-4 text-[11px]" style={{ color: "var(--text-dim)" }}>
        No best-sellers scanned for {domain} yet. Run a competitor scan from Product Opportunities first.
      </div>
    )
  }

  return (
    <div className="p-3">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[11px] font-medium" style={{ color: "var(--text)" }}>
          Best-sellers — {domain}
        </span>
        <Button size="sm" onClick={onAutoMatch} disabled={autoMatchLoading}>
          {autoMatchLoading ? "Matching…" : "Auto-match with my products"}
        </Button>
      </div>
      <div className="grid gap-2">
        {products.map((p) => {
          const cov = covMap.get(p.id)
          return (
            <div key={p.id} className="flex items-center gap-3 px-3 py-2 rounded-lg" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
              {p.image && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.image} alt="" className="w-10 h-10 rounded object-cover shrink-0" style={{ background: "rgba(255,255,255,0.05)" }} />
              )}
              <div className="flex-1 min-w-0">
                <a href={p.url} target="_blank" rel="noopener noreferrer"
                  className="text-[11px] font-medium hover:underline truncate block" style={{ color: "var(--text)" }}>
                  {p.title}
                </a>
                <div className="flex items-center gap-2 mt-0.5">
                  {p.price != null && (
                    <span className="text-[10px] tabular-nums" style={{ color: "var(--text-dim)" }}>
                      {p.currency || ""}{p.price.toFixed(2)}
                    </span>
                  )}
                  {p.bestseller_rank != null && (
                    <span className="text-[10px]" style={{ color: "var(--text-dim)" }}>#{p.bestseller_rank}</span>
                  )}
                  {p.product_type && (
                    <span className="text-[10px]" style={{ color: "var(--text-dim)" }}>{p.product_type}</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {cov?.own_product_title && (
                  <span className="text-[10px] max-w-[200px] truncate" style={{ color: "var(--text-dim)" }} title={cov.own_product_title}>
                    ↔ {cov.own_product_title}
                  </span>
                )}
                <CoverageStatusPill status={cov?.status || "not_covered"} onSetStatus={(s) => onSetStatus(p.id, s)} />
                {cov && cov.status !== "not_covered" && (
                  <button
                    type="button"
                    onClick={() => onVerify(p.id, !cov.verified)}
                    className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] transition-colors"
                    style={{
                      background: cov.verified ? "rgba(52,211,153,0.15)" : "rgba(255,255,255,0.05)",
                      color: cov.verified ? "var(--green)" : "var(--text-muted)",
                    }}
                    title={cov.verified ? "Verified — click to unverify" : "Click to verify this match"}
                  >
                    <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    {cov.verified ? "Verified" : "Verify"}
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function CoverageStatusPill({ status, onSetStatus }: { status: string; onSetStatus: (s: string) => void }) {
  const tones: Record<string, "green" | "amber" | "grey"> = {
    covered: "green",
    partly_covered: "amber",
    not_covered: "grey",
  }
  const labels: Record<string, string> = {
    covered: "Covered",
    partly_covered: "Partly",
    not_covered: "Not covered",
  }
  const next: Record<string, string> = {
    not_covered: "partly_covered",
    partly_covered: "covered",
    covered: "not_covered",
  }
  return (
    <button type="button" onClick={() => onSetStatus(next[status] || "not_covered")}>
      <Badge tone={tones[status] || "grey"}>{labels[status] || status}</Badge>
    </button>
  )
}

function ThSort({ label, field, sortBy, setSortBy, sortDir, setSortDir }: {
  label: string; field: string
  sortBy: string; setSortBy: (f: string) => void
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
