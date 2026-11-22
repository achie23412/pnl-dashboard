"use client"
import { useState } from "react"
import { createClient } from "@supabase/supabase-js"

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

export default function ResearchPage() {
  const [entries, setEntries] = useState<ResearchEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [showForm, setShowForm] = useState(true)
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
    <main className="min-h-screen p-4 md:p-8 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <h1 className="text-xl font-bold">Product Research</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-1.5 rounded-lg text-xs font-medium"
          style={{ background: "#4E6AA7", color: "#fff" }}
        >
          {showForm ? "Hide form" : "+ New research"}
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="rounded-xl p-4 border" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
          <div className="text-xs mb-1" style={{ color: "var(--text-muted)" }}>Products researched</div>
          <div className="text-lg font-bold">{entries.length}</div>
        </div>
        <div className="rounded-xl p-4 border" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
          <div className="text-xs mb-1" style={{ color: "var(--text-muted)" }}>Test</div>
          <div className="text-lg font-bold" style={{ color: "var(--green)" }}>{passCount}</div>
        </div>
        <div className="rounded-xl p-4 border" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
          <div className="text-xs mb-1" style={{ color: "var(--text-muted)" }}>Skip</div>
          <div className="text-lg font-bold" style={{ color: "var(--red)" }}>{skipCount}</div>
        </div>
      </div>

      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="rounded-xl p-5 border mb-6 space-y-4"
          style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
        >
          <div className="text-sm font-medium mb-2">Validation flow</div>

          {/* Step 1: Product basics */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs mb-1" style={{ color: "var(--text-muted)" }}>Product name</label>
              <input type="text" required value={form.product_name} onChange={(e) => setForm({ ...form, product_name: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border text-sm" style={{ background: "var(--bg)", borderColor: "var(--border)", color: "var(--text)" }} />
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: "var(--text-muted)" }}>Niche / category</label>
              <input type="text" value={form.niche} onChange={(e) => setForm({ ...form, niche: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border text-sm" style={{ background: "var(--bg)", borderColor: "var(--border)", color: "var(--text)" }} />
            </div>
          </div>

          {/* Step 2: Google Trends */}
          <div>
            <label className="block text-xs mb-1" style={{ color: "var(--text-muted)" }}>1. Google Trends category check</label>
            <select value={form.google_trends} onChange={(e) => setForm({ ...form, google_trends: e.target.value as ResearchEntry["google_trends"] })}
              className="w-full px-3 py-2 rounded-lg border text-sm" style={{ background: "var(--bg)", borderColor: "var(--border)", color: "var(--text)" }}>
              <option value="unknown">Not checked</option>
              <option value="rising">Rising</option>
              <option value="stable">Stable</option>
              <option value="declining">Declining</option>
            </select>
          </div>

          {/* Step 3: Top sellers */}
          <div>
            <label className="block text-xs mb-1" style={{ color: "var(--text-muted)" }}>2. Top-3 best-sellers (TrendTrack + Claude)</label>
            <textarea value={form.top_sellers} onChange={(e) => setForm({ ...form, top_sellers: e.target.value })} rows={2}
              placeholder="e.g. Brand A — product X, Brand B — product Y, Brand C — product Z"
              className="w-full px-3 py-2 rounded-lg border text-sm" style={{ background: "var(--bg)", borderColor: "var(--border)", color: "var(--text)" }} />
          </div>

          {/* Step 4: Active ads */}
          <div>
            <label className="block text-xs mb-1" style={{ color: "var(--text-muted)" }}>
              3. Competitor active ads (need 25+)
            </label>
            <input type="number" value={form.active_ads ?? ""} onChange={(e) => setForm({ ...form, active_ads: e.target.value ? parseInt(e.target.value) : null })}
              placeholder="Number of active ads"
              className="w-full px-3 py-2 rounded-lg border text-sm" style={{ background: "var(--bg)", borderColor: "var(--border)", color: "var(--text)" }} />
            {form.active_ads !== null && (
              <div className="text-xs mt-1" style={{ color: form.active_ads >= 25 ? "var(--green)" : "var(--red)" }}>
                {form.active_ads >= 25 ? "PASS" : "FAIL"} — {form.active_ads} active ads {form.active_ads >= 25 ? "(25+ required)" : "(need 25+)"}
              </div>
            )}
          </div>

          {/* Step 5: Reach check */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs mb-1" style={{ color: "var(--text-muted)" }}>4. Reach</label>
              <input type="number" value={form.reach ?? ""} onChange={(e) => setForm({ ...form, reach: e.target.value ? parseInt(e.target.value) : null })}
                placeholder="e.g. 150000"
                className="w-full px-3 py-2 rounded-lg border text-sm" style={{ background: "var(--bg)", borderColor: "var(--border)", color: "var(--text)" }} />
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: "var(--text-muted)" }}>Ad age (days)</label>
              <input type="number" value={form.reach_age_days ?? ""} onChange={(e) => setForm({ ...form, reach_age_days: e.target.value ? parseInt(e.target.value) : null })}
                placeholder="e.g. 10"
                className="w-full px-3 py-2 rounded-lg border text-sm" style={{ background: "var(--bg)", borderColor: "var(--border)", color: "var(--text)" }} />
            </div>
            <div>
              <label className="flex items-center gap-2 text-xs mt-5" style={{ color: "var(--text-muted)" }}>
                <input type="checkbox" checked={isCollection} onChange={(e) => setIsCollection(e.target.checked)} />
                Collection ad (2x threshold)
              </label>
            </div>
          </div>
          {reachResult && (
            <div className="text-xs" style={{ color: reachResult.pass ? "var(--green)" : "var(--red)" }}>
              {reachResult.pass ? "PASS" : "FAIL"} — Reach {(form.reach ?? 0).toLocaleString()} vs required {reachResult.required.toLocaleString()}
              {" "}(TSA table: {form.reach_age_days}d{isCollection ? ", collection 2x" : ""})
            </div>
          )}

          {/* Tiebreakers */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs mb-1" style={{ color: "var(--text-muted)" }}>5a. New ads/day</label>
              <input type="text" value={form.new_ads_per_day} onChange={(e) => setForm({ ...form, new_ads_per_day: e.target.value })}
                placeholder="e.g. 3-5/day"
                className="w-full px-3 py-2 rounded-lg border text-sm" style={{ background: "var(--bg)", borderColor: "var(--border)", color: "var(--text)" }} />
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: "var(--text-muted)" }}>5b. Momentum</label>
              <input type="text" value={form.momentum} onChange={(e) => setForm({ ...form, momentum: e.target.value })}
                placeholder="e.g. increasing, peaking"
                className="w-full px-3 py-2 rounded-lg border text-sm" style={{ background: "var(--bg)", borderColor: "var(--border)", color: "var(--text)" }} />
            </div>
            <div>
              <label className="flex items-center gap-2 text-xs mt-5" style={{ color: "var(--text-muted)" }}>
                <input type="checkbox" checked={form.sold_by_multiple} onChange={(e) => setForm({ ...form, sold_by_multiple: e.target.checked })} />
                5c. Sold by multiple stores
              </label>
            </div>
          </div>

          {/* Verdict */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs mb-1" style={{ color: "var(--text-muted)" }}>Verdict</label>
              <select value={form.verdict} onChange={(e) => setForm({ ...form, verdict: e.target.value as ResearchEntry["verdict"] })}
                className="w-full px-3 py-2 rounded-lg border text-sm" style={{ background: "var(--bg)", borderColor: "var(--border)", color: "var(--text)" }}>
                <option value="test">TEST</option>
                <option value="skip">SKIP</option>
                <option value="maybe">MAYBE</option>
              </select>
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: "var(--text-muted)" }}>Notes</label>
              <input type="text" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border text-sm" style={{ background: "var(--bg)", borderColor: "var(--border)", color: "var(--text)" }} />
            </div>
          </div>

          <button type="submit" className="w-full px-4 py-2 rounded-lg text-sm font-medium"
            style={{ background: "#4E6AA7", color: "#fff" }}>
            Save research
          </button>
        </form>
      )}

      {/* Saved entries */}
      {entries.length > 0 && (
        <div className="rounded-xl border overflow-x-auto" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                <th className="text-left px-4 py-3 text-xs font-medium" style={{ color: "var(--text-muted)" }}>Product</th>
                <th className="text-left px-4 py-3 text-xs font-medium" style={{ color: "var(--text-muted)" }}>Trends</th>
                <th className="text-right px-4 py-3 text-xs font-medium" style={{ color: "var(--text-muted)" }}>Ads</th>
                <th className="text-right px-4 py-3 text-xs font-medium" style={{ color: "var(--text-muted)" }}>Reach</th>
                <th className="text-left px-4 py-3 text-xs font-medium" style={{ color: "var(--text-muted)" }}>Reach</th>
                <th className="text-left px-4 py-3 text-xs font-medium" style={{ color: "var(--text-muted)" }}>Verdict</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e, i) => (
                <tr key={e.id || i} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td className="px-4 py-3">
                    <div className="font-medium">{e.product_name}</div>
                    <div className="text-xs" style={{ color: "var(--text-muted)" }}>{e.niche}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 rounded text-xs" style={{
                      background: e.google_trends === "rising" ? "#34d39922" : e.google_trends === "declining" ? "#f8717122" : "#8b8fa322",
                      color: e.google_trends === "rising" ? "var(--green)" : e.google_trends === "declining" ? "var(--red)" : "var(--text-muted)",
                    }}>{e.google_trends}</span>
                  </td>
                  <td className="px-4 py-3 text-right font-mono">{e.active_ads ?? "—"}</td>
                  <td className="px-4 py-3 text-right font-mono">{e.reach ? e.reach.toLocaleString() : "—"}</td>
                  <td className="px-4 py-3">
                    {e.reach_pass !== null && (
                      <span className="text-xs" style={{ color: e.reach_pass ? "var(--green)" : "var(--red)" }}>
                        {e.reach_pass ? "PASS" : "FAIL"}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 rounded text-xs font-medium" style={{
                      background: e.verdict === "test" ? "#34d39922" : e.verdict === "skip" ? "#f8717122" : "#D4903A22",
                      color: e.verdict === "test" ? "var(--green)" : e.verdict === "skip" ? "var(--red)" : "var(--orange)",
                    }}>{e.verdict.toUpperCase()}</span>
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
