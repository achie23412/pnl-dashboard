"use client"
import { useState } from "react"
import { createClient } from "@supabase/supabase-js"
import { PillSelect } from "@/components/PillSelect"
import { ProductTesting } from "@/components/ProductTesting"
import { PageShell } from "@/components/PageShell"
import { Panel, Badge, Button, Loading, EmptyState, SectionLabel, TH, TD, ROW_BORDER } from "@/components/ui"

const INPUT_STYLE = { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", color: "var(--text)" }

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)

interface ResearchEntry {
  id?: number
  created_at?: string
  product_name: string
  niche: string
  google_trends: "rising" | "stable" | "declining" | "unknown"
  top_sellers: string
  active_ads: number | null
  reach: number | null
  reach_age_days: number | null
  reach_pass: boolean | null
  new_ads_per_day: string
  momentum: string
  sold_by_multiple: boolean
  verdict: "test" | "skip" | "maybe"
  notes: string
}

const REACH_TABLE: Record<string, number> = {
  "3-7": 50000,
  "7-14": 100000,
  "14-21": 200000,
  "21+": 300000,
}

function checkReach(reach: number | null, ageDays: number | null, isCollection: boolean): { pass: boolean; required: number } | null {
  if (reach === null || ageDays === null) return null
  let bracket: string
  if (ageDays <= 7) bracket = "3-7"
  else if (ageDays <= 14) bracket = "7-14"
  else if (ageDays <= 21) bracket = "14-21"
  else bracket = "21+"
  let required = REACH_TABLE[bracket]
  if (isCollection) required *= 2
  return { pass: reach >= required, required }
}

const TABS = [
  { key: "testing", label: "Testing", icon: "M13 10V3L4 14h7v7l9-11h-7z" },
  { key: "research", label: "Research", icon: "M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" },
] as const

export default function ResearchPage() {
  const [tab, setTab] = useState<"testing" | "research">("testing")
  const [entries, setEntries] = useState<ResearchEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [isCollection, setIsCollection] = useState(false)
  const [form, setForm] = useState<ResearchEntry>({
    product_name: "", niche: "", google_trends: "unknown", top_sellers: "",
    active_ads: null, reach: null, reach_age_days: null, reach_pass: null,
    new_ads_per_day: "", momentum: "", sold_by_multiple: false,
    verdict: "maybe", notes: "",
  })

  async function loadEntries() {
    setLoading(true)
    const { data } = await supabase
      .from("research")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50)
    setEntries((data as ResearchEntry[]) || [])
    setLoading(false)
  }

  useState(() => { loadEntries() })

  const reachResult = checkReach(form.reach, form.reach_age_days, isCollection)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const entry = { ...form, reach_pass: reachResult?.pass ?? null }
    await supabase.from("research").insert(entry)
    setForm({
      product_name: "", niche: "", google_trends: "unknown", top_sellers: "",
      active_ads: null, reach: null, reach_age_days: null, reach_pass: null,
      new_ads_per_day: "", momentum: "", sold_by_multiple: false,
      verdict: "maybe", notes: "",
    })
    loadEntries()
  }

  const passCount = entries.filter((e) => e.verdict === "test").length
  const skipCount = entries.filter((e) => e.verdict === "skip").length

  return (
    <PageShell
      title="Product ROAS Sheet"
      breadcrumb="Front End → Product ROAS Sheet"
      description={tab === "testing"
        ? "Products in test and their numbers. Switch to Research to log the validation checks before a test."
        : "Log the validation checks before a test: Google Trends, top best-sellers, 25+ active ads and the TSA reach-for-age table."}
      stats={tab === "research" ? [
        { label: "Researched", value: String(entries.length) },
        { label: "Test", value: String(passCount), color: "var(--green)" },
        { label: "Skip", value: String(skipCount), color: "var(--red)" },
      ] : undefined}
      actions={
        <>
          <div className="glass rounded-lg p-0.5 inline-flex">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className="flex items-center gap-1.5 px-3 py-1 rounded-md text-[10px] font-semibold transition-all"
                style={{
                  background: tab === t.key ? "rgba(255,255,255,0.08)" : "transparent",
                  color: tab === t.key ? "var(--text)" : "var(--text-dim)",
                }}
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d={t.icon} />
                </svg>
                {t.label}
              </button>
            ))}
          </div>
          {tab === "research" && (
            <Button variant={showForm ? "secondary" : "primary"} onClick={() => setShowForm(!showForm)}>
              {showForm ? "Cancel" : "New research"}
            </Button>
          )}
        </>
      }
    >
      {/* Testing Tab */}
      {tab === "testing" && <ProductTesting />}

      {/* Research Tab */}
      {tab === "research" && (
        <>
          {showForm && (
            <form
              onSubmit={handleSubmit}
              className="glass rounded-xl p-4 mb-4 space-y-3"
            >
              <SectionLabel>Validation flow</SectionLabel>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-medium mb-1" style={{ color: "var(--text-dim)" }}>Product name</label>
                  <input type="text" required value={form.product_name} onChange={(e) => setForm({ ...form, product_name: e.target.value })}
                    className="w-full px-2.5 py-1.5 rounded-lg text-[11px] font-medium" style={INPUT_STYLE} />
                </div>
                <div>
                  <label className="block text-[10px] font-medium mb-1" style={{ color: "var(--text-dim)" }}>Niche / category</label>
                  <input type="text" value={form.niche} onChange={(e) => setForm({ ...form, niche: e.target.value })}
                    className="w-full px-2.5 py-1.5 rounded-lg text-[11px] font-medium" style={INPUT_STYLE} />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-medium mb-1" style={{ color: "var(--text-dim)" }}>1. Google Trends category check</label>
                <PillSelect
                  fullWidth
                  value={form.google_trends}
                  onChange={(v) => setForm({ ...form, google_trends: v as ResearchEntry["google_trends"] })}
                  options={[{ value: "unknown", label: "Not checked" }, { value: "rising", label: "Rising" }, { value: "stable", label: "Stable" }, { value: "declining", label: "Declining" }]}
                />
              </div>

              <div>
                <label className="block text-[10px] font-medium mb-1" style={{ color: "var(--text-dim)" }}>2. Top-3 best-sellers (TrendTrack + Claude)</label>
                <textarea value={form.top_sellers} onChange={(e) => setForm({ ...form, top_sellers: e.target.value })} rows={2}
                  placeholder="e.g. Brand A — product X, Brand B — product Y"
                  className="w-full px-2.5 py-1.5 rounded-lg text-[11px] font-medium" style={INPUT_STYLE} />
              </div>

              <div>
                <label className="block text-[10px] font-medium mb-1" style={{ color: "var(--text-dim)" }}>
                  3. Competitor active ads (need 25+)
                </label>
                <input type="number" value={form.active_ads ?? ""} onChange={(e) => setForm({ ...form, active_ads: e.target.value ? parseInt(e.target.value) : null })}
                  placeholder="Number of active ads"
                  className="w-full px-2.5 py-1.5 rounded-lg text-[11px] font-medium" style={INPUT_STYLE} />
                {form.active_ads !== null && (
                  <div className="text-[9px] mt-1" style={{ color: form.active_ads >= 25 ? "var(--green)" : "var(--red)" }}>
                    {form.active_ads >= 25 ? "Pass" : "Fail"}: {form.active_ads} active ads {form.active_ads >= 25 ? "(25+ required)" : "(need 25+)"}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[10px] font-medium mb-1" style={{ color: "var(--text-dim)" }}>4. Reach</label>
                  <input type="number" value={form.reach ?? ""} onChange={(e) => setForm({ ...form, reach: e.target.value ? parseInt(e.target.value) : null })}
                    placeholder="e.g. 150000"
                    className="w-full px-2.5 py-1.5 rounded-lg text-[11px] font-medium" style={INPUT_STYLE} />
                </div>
                <div>
                  <label className="block text-[10px] font-medium mb-1" style={{ color: "var(--text-dim)" }}>Ad age (days)</label>
                  <input type="number" value={form.reach_age_days ?? ""} onChange={(e) => setForm({ ...form, reach_age_days: e.target.value ? parseInt(e.target.value) : null })}
                    placeholder="e.g. 10"
                    className="w-full px-2.5 py-1.5 rounded-lg text-[11px] font-medium" style={INPUT_STYLE} />
                </div>
                <div>
                  <label className="flex items-center gap-2 text-[9px] mt-5" style={{ color: "var(--text-muted)" }}>
                    <input type="checkbox" checked={isCollection} onChange={(e) => setIsCollection(e.target.checked)} />
                    Collection ad (2x threshold)
                  </label>
                </div>
              </div>
              {reachResult && (
                <div className="text-[9px]" style={{ color: reachResult.pass ? "var(--green)" : "var(--red)" }}>
                  {reachResult.pass ? "Pass" : "Fail"}: reach {(form.reach ?? 0).toLocaleString()} vs required {reachResult.required.toLocaleString()}
                  {" "}(TSA table: {form.reach_age_days}d{isCollection ? ", collection 2x" : ""})
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[10px] font-medium mb-1" style={{ color: "var(--text-dim)" }}>5a. New ads/day</label>
                  <input type="text" value={form.new_ads_per_day} onChange={(e) => setForm({ ...form, new_ads_per_day: e.target.value })}
                    placeholder="e.g. 3-5/day"
                    className="w-full px-2.5 py-1.5 rounded-lg text-[11px] font-medium" style={INPUT_STYLE} />
                </div>
                <div>
                  <label className="block text-[10px] font-medium mb-1" style={{ color: "var(--text-dim)" }}>5b. Momentum</label>
                  <input type="text" value={form.momentum} onChange={(e) => setForm({ ...form, momentum: e.target.value })}
                    placeholder="e.g. increasing, peaking"
                    className="w-full px-2.5 py-1.5 rounded-lg text-[11px] font-medium" style={INPUT_STYLE} />
                </div>
                <div>
                  <label className="flex items-center gap-2 text-[9px] mt-5" style={{ color: "var(--text-muted)" }}>
                    <input type="checkbox" checked={form.sold_by_multiple} onChange={(e) => setForm({ ...form, sold_by_multiple: e.target.checked })} />
                    5c. Sold by multiple stores
                  </label>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-medium mb-1" style={{ color: "var(--text-dim)" }}>Verdict</label>
                  <PillSelect
                    fullWidth
                    value={form.verdict}
                    onChange={(v) => setForm({ ...form, verdict: v as ResearchEntry["verdict"] })}
                    options={[{ value: "test", label: "Test" }, { value: "skip", label: "Skip" }, { value: "maybe", label: "Maybe" }]}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-medium mb-1" style={{ color: "var(--text-dim)" }}>Notes</label>
                  <input type="text" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    className="w-full px-2.5 py-1.5 rounded-lg text-[11px] font-medium" style={INPUT_STYLE} />
                </div>
              </div>

              <Button type="submit" variant="primary" className="w-full">
                Save research
              </Button>
            </form>
          )}

          {loading && entries.length === 0 ? (
            <Loading>Loading research…</Loading>
          ) : entries.length === 0 ? (
            !showForm && (
              <EmptyState title="No research logged yet">Click New research to log the checks for a product.</EmptyState>
            )
          ) : (
            <Panel pad={false}>
              <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr style={{ color: "var(--text-dim)" }}>
                    <th className={`${TH} text-left`}>Product</th>
                    <th className={`${TH} text-left`}>Trends</th>
                    <th className={`${TH} text-right`}>Ads</th>
                    <th className={`${TH} text-right`}>Reach</th>
                    <th className={`${TH} text-left`}>Reach check</th>
                    <th className={`${TH} text-left`}>Verdict</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e, i) => (
                    <tr key={e.id || i} style={ROW_BORDER}>
                      <td className={TD}>
                        <div className="font-semibold" style={{ color: "var(--text)" }}>{e.product_name}</div>
                        <div className="text-[9px]" style={{ color: "var(--text-dim)" }}>{e.niche}</div>
                      </td>
                      <td className={TD}>
                        <Badge tone={e.google_trends === "rising" ? "green" : e.google_trends === "declining" ? "red" : "grey"}>
                          {e.google_trends === "unknown" ? "Not checked" : e.google_trends.charAt(0).toUpperCase() + e.google_trends.slice(1)}
                        </Badge>
                      </td>
                      <td className={`${TD} text-right tabular-nums`} style={{ color: "var(--text-muted)" }}>{e.active_ads ?? "—"}</td>
                      <td className={`${TD} text-right tabular-nums`} style={{ color: "var(--text-muted)" }}>{e.reach ? e.reach.toLocaleString() : "—"}</td>
                      <td className={TD}>
                        {e.reach_pass !== null && (
                          <Badge tone={e.reach_pass ? "green" : "red"}>{e.reach_pass ? "Pass" : "Fail"}</Badge>
                        )}
                      </td>
                      <td className={TD}>
                        <Badge tone={e.verdict === "test" ? "green" : e.verdict === "skip" ? "red" : "amber"}>
                          {e.verdict.charAt(0).toUpperCase() + e.verdict.slice(1)}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </Panel>
          )}
        </>
      )}
    </PageShell>
  )
}
