"use client"
import { useState } from "react"
import { createClient } from "@supabase/supabase-js"
import { ProductTesting } from "@/components/ProductTesting"

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
    <main className="min-h-screen p-4 md:p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <h1 className="text-[18px] font-bold" style={{ color: "var(--text)" }}>Product ROAS Sheet</h1>

        {/* Tab Toggle */}
        <div className="glass rounded-lg p-0.5 inline-flex">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className="flex items-center gap-1.5 px-3 py-1 rounded-md text-[10px] font-semibold transition-all"
              style={{
                background: tab === t.key ? "rgba(255,255,255,0.08)" : "transparent",
                color: tab === t.key ? "#fff" : "var(--text-dim)",
              }}
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d={t.icon} />
              </svg>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Testing Tab */}
      {tab === "testing" && <ProductTesting />}

      {/* Research Tab */}
      {tab === "research" && (
        <>
          <div className="flex items-center justify-between mb-4">
            <div className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-dim)" }}>
              PRODUCT RESEARCH
            </div>
            <button
              onClick={() => setShowForm(!showForm)}
              className="glass px-3 py-1 rounded-lg text-[10px] font-semibold transition-colors hover:bg-[rgba(255,255,255,0.06)]"
              style={{ color: showForm ? "var(--red)" : "var(--accent)" }}
            >
              {showForm ? "Cancel" : "+ New Research"}
            </button>
          </div>

          {/* KPI Cards */}
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="glass rounded-xl px-3 py-2.5">
              <div className="text-[9px] font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--text-dim)" }}>RESEARCHED</div>
              <div className="text-[18px] font-bold">{entries.length}</div>
            </div>
            <div className="glass rounded-xl px-3 py-2.5">
              <div className="text-[9px] font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--text-dim)" }}>TEST</div>
              <div className="text-[18px] font-bold" style={{ color: "var(--green)" }}>{passCount}</div>
            </div>
            <div className="glass rounded-xl px-3 py-2.5">
              <div className="text-[9px] font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--text-dim)" }}>SKIP</div>
              <div className="text-[18px] font-bold" style={{ color: "var(--red)" }}>{skipCount}</div>
            </div>
          </div>

          {showForm && (
            <form
              onSubmit={handleSubmit}
              className="glass rounded-xl p-4 mb-4 space-y-3"
            >
              <div className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-dim)" }}>
                VALIDATION FLOW
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[9px] uppercase tracking-wider font-medium mb-1" style={{ color: "var(--text-dim)" }}>Product name</label>
                  <input type="text" required value={form.product_name} onChange={(e) => setForm({ ...form, product_name: e.target.value })}
                    className="w-full px-2.5 py-1.5 rounded-lg text-[11px] font-medium" style={{ background: "var(--bg)", border: "1px solid var(--border)", color: "var(--text)" }} />
                </div>
                <div>
                  <label className="block text-[9px] uppercase tracking-wider font-medium mb-1" style={{ color: "var(--text-dim)" }}>Niche / category</label>
                  <input type="text" value={form.niche} onChange={(e) => setForm({ ...form, niche: e.target.value })}
                    className="w-full px-2.5 py-1.5 rounded-lg text-[11px] font-medium" style={{ background: "var(--bg)", border: "1px solid var(--border)", color: "var(--text)" }} />
                </div>
              </div>

              <div>
                <label className="block text-[9px] uppercase tracking-wider font-medium mb-1" style={{ color: "var(--text-dim)" }}>1. Google Trends category check</label>
                <select value={form.google_trends} onChange={(e) => setForm({ ...form, google_trends: e.target.value as ResearchEntry["google_trends"] })}
                  className="w-full px-2.5 py-1.5 rounded-lg text-[11px] font-medium" style={{ background: "var(--bg)", border: "1px solid var(--border)", color: "var(--text)" }}>
                  <option value="unknown">Not checked</option>
                  <option value="rising">Rising</option>
                  <option value="stable">Stable</option>
                  <option value="declining">Declining</option>
                </select>
              </div>

              <div>
                <label className="block text-[9px] uppercase tracking-wider font-medium mb-1" style={{ color: "var(--text-dim)" }}>2. Top-3 best-sellers (TrendTrack + Claude)</label>
                <textarea value={form.top_sellers} onChange={(e) => setForm({ ...form, top_sellers: e.target.value })} rows={2}
                  placeholder="e.g. Brand A — product X, Brand B — product Y"
                  className="w-full px-2.5 py-1.5 rounded-lg text-[11px] font-medium" style={{ background: "var(--bg)", border: "1px solid var(--border)", color: "var(--text)" }} />
              </div>

              <div>
                <label className="block text-[9px] uppercase tracking-wider font-medium mb-1" style={{ color: "var(--text-dim)" }}>
                  3. Competitor active ads (need 25+)
                </label>
                <input type="number" value={form.active_ads ?? ""} onChange={(e) => setForm({ ...form, active_ads: e.target.value ? parseInt(e.target.value) : null })}
                  placeholder="Number of active ads"
                  className="w-full px-2.5 py-1.5 rounded-lg text-[11px] font-medium" style={{ background: "var(--bg)", border: "1px solid var(--border)", color: "var(--text)" }} />
                {form.active_ads !== null && (
                  <div className="text-[9px] mt-1" style={{ color: form.active_ads >= 25 ? "var(--green)" : "var(--red)" }}>
                    {form.active_ads >= 25 ? "PASS" : "FAIL"} — {form.active_ads} active ads {form.active_ads >= 25 ? "(25+ required)" : "(need 25+)"}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[9px] uppercase tracking-wider font-medium mb-1" style={{ color: "var(--text-dim)" }}>4. Reach</label>
                  <input type="number" value={form.reach ?? ""} onChange={(e) => setForm({ ...form, reach: e.target.value ? parseInt(e.target.value) : null })}
                    placeholder="e.g. 150000"
                    className="w-full px-2.5 py-1.5 rounded-lg text-[11px] font-medium" style={{ background: "var(--bg)", border: "1px solid var(--border)", color: "var(--text)" }} />
                </div>
                <div>
                  <label className="block text-[9px] uppercase tracking-wider font-medium mb-1" style={{ color: "var(--text-dim)" }}>Ad age (days)</label>
                  <input type="number" value={form.reach_age_days ?? ""} onChange={(e) => setForm({ ...form, reach_age_days: e.target.value ? parseInt(e.target.value) : null })}
                    placeholder="e.g. 10"
                    className="w-full px-2.5 py-1.5 rounded-lg text-[11px] font-medium" style={{ background: "var(--bg)", border: "1px solid var(--border)", color: "var(--text)" }} />
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
                  {reachResult.pass ? "PASS" : "FAIL"} — Reach {(form.reach ?? 0).toLocaleString()} vs required {reachResult.required.toLocaleString()}
                  {" "}(TSA table: {form.reach_age_days}d{isCollection ? ", collection 2x" : ""})
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[9px] uppercase tracking-wider font-medium mb-1" style={{ color: "var(--text-dim)" }}>5a. New ads/day</label>
                  <input type="text" value={form.new_ads_per_day} onChange={(e) => setForm({ ...form, new_ads_per_day: e.target.value })}
                    placeholder="e.g. 3-5/day"
                    className="w-full px-2.5 py-1.5 rounded-lg text-[11px] font-medium" style={{ background: "var(--bg)", border: "1px solid var(--border)", color: "var(--text)" }} />
                </div>
                <div>
                  <label className="block text-[9px] uppercase tracking-wider font-medium mb-1" style={{ color: "var(--text-dim)" }}>5b. Momentum</label>
                  <input type="text" value={form.momentum} onChange={(e) => setForm({ ...form, momentum: e.target.value })}
                    placeholder="e.g. increasing, peaking"
                    className="w-full px-2.5 py-1.5 rounded-lg text-[11px] font-medium" style={{ background: "var(--bg)", border: "1px solid var(--border)", color: "var(--text)" }} />
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
                  <label className="block text-[9px] uppercase tracking-wider font-medium mb-1" style={{ color: "var(--text-dim)" }}>Verdict</label>
                  <select value={form.verdict} onChange={(e) => setForm({ ...form, verdict: e.target.value as ResearchEntry["verdict"] })}
                    className="w-full px-2.5 py-1.5 rounded-lg text-[11px] font-medium" style={{ background: "var(--bg)", border: "1px solid var(--border)", color: "var(--text)" }}>
                    <option value="test">TEST</option>
                    <option value="skip">SKIP</option>
                    <option value="maybe">MAYBE</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[9px] uppercase tracking-wider font-medium mb-1" style={{ color: "var(--text-dim)" }}>Notes</label>
                  <input type="text" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    className="w-full px-2.5 py-1.5 rounded-lg text-[11px] font-medium" style={{ background: "var(--bg)", border: "1px solid var(--border)", color: "var(--text)" }} />
                </div>
              </div>

              <button type="submit" className="w-full px-4 py-2 rounded-lg text-[11px] font-semibold"
                style={{ background: "var(--accent)", color: "#fff" }}>
                Save Research
              </button>
            </form>
          )}

          {entries.length > 0 && (
            <div className="glass rounded-xl overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border)" }}>
                    <th className="text-left px-3 py-2.5 text-[9px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-dim)" }}>Product</th>
                    <th className="text-left px-3 py-2.5 text-[9px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-dim)" }}>Trends</th>
                    <th className="text-right px-3 py-2.5 text-[9px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-dim)" }}>Ads</th>
                    <th className="text-right px-3 py-2.5 text-[9px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-dim)" }}>Reach</th>
                    <th className="text-left px-3 py-2.5 text-[9px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-dim)" }}>Pass</th>
                    <th className="text-left px-3 py-2.5 text-[9px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-dim)" }}>Verdict</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e, i) => (
                    <tr key={e.id || i} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td className="px-3 py-2.5">
                        <div className="text-[11px] font-semibold">{e.product_name}</div>
                        <div className="text-[9px]" style={{ color: "var(--text-dim)" }}>{e.niche}</div>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="px-2 py-0.5 rounded text-[9px] font-medium" style={{
                          background: e.google_trends === "rising" ? "#34d39915" : e.google_trends === "declining" ? "#f8717115" : "#8b8fa315",
                          color: e.google_trends === "rising" ? "var(--green)" : e.google_trends === "declining" ? "var(--red)" : "var(--text-muted)",
                        }}>{e.google_trends}</span>
                      </td>
                      <td className="px-3 py-2.5 text-right text-[11px] font-mono" style={{ color: "var(--text-muted)" }}>{e.active_ads ?? "—"}</td>
                      <td className="px-3 py-2.5 text-right text-[11px] font-mono" style={{ color: "var(--text-muted)" }}>{e.reach ? e.reach.toLocaleString() : "—"}</td>
                      <td className="px-3 py-2.5">
                        {e.reach_pass !== null && (
                          <span className="text-[9px] font-semibold" style={{ color: e.reach_pass ? "var(--green)" : "var(--red)" }}>
                            {e.reach_pass ? "PASS" : "FAIL"}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="px-2 py-0.5 rounded text-[9px] font-semibold" style={{
                          background: e.verdict === "test" ? "#34d39915" : e.verdict === "skip" ? "#f8717115" : "#D4903A15",
                          color: e.verdict === "test" ? "var(--green)" : e.verdict === "skip" ? "var(--red)" : "var(--orange)",
                        }}>{e.verdict.toUpperCase()}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </main>
  )
}
