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
  store_name: string
  store_url: string
  niche: string
  active_ads: number | null
  last_checked: string
  ppspy_rank: number | null
  ad_library_url: string
  notes: string
  status: "watching" | "scaling" | "dead" | "new"
}

export default function CompetitorsPage() {
  const [competitors, setCompetitors] = useState<Competitor[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<Omit<Competitor, "id" | "created_at">>({
    store_name: "", store_url: "", niche: "", active_ads: null,
    last_checked: new Date().toISOString().split("T")[0],
    ppspy_rank: null, ad_library_url: "", notes: "", status: "new",
  })
  const [saving, setSaving] = useState(false)
  const [statusFilter, setStatusFilter] = useState<string>("all")

  useEffect(() => { loadCompetitors() }, [])

  async function loadCompetitors() {
    setLoading(true)
    const { data } = await supabase
      .from("competitors")
      .select("*")
      .order("active_ads", { ascending: false })
      .limit(100)
    setCompetitors((data as Competitor[]) || [])
    setLoading(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    await supabase.from("competitors").insert({
      ...form,
      active_ads: form.active_ads,
      ppspy_rank: form.ppspy_rank,
    })
    setForm({
      store_name: "", store_url: "", niche: "", active_ads: null,
      last_checked: new Date().toISOString().split("T")[0],
      ppspy_rank: null, ad_library_url: "", notes: "", status: "new",
    })
    setShowForm(false)
    setSaving(false)
    loadCompetitors()
  }

  const filtered = statusFilter === "all" ? competitors : competitors.filter((c) => c.status === statusFilter)
  const scalingCount = competitors.filter((c) => c.status === "scaling").length
  const watchingCount = competitors.filter((c) => c.status === "watching").length

  return (
    <main className="min-h-screen p-4 md:p-8 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <h1 className="text-xl font-bold">Competitor Tracker</h1>
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

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
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
      </div>

      {showForm && (
        <form onSubmit={handleSubmit}
          className="rounded-xl p-4 border mb-6 grid grid-cols-1 sm:grid-cols-3 gap-3"
          style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
          <input type="text" required placeholder="Store name" value={form.store_name} onChange={(e) => setForm({ ...form, store_name: e.target.value })}
            className="px-3 py-2 rounded-lg border text-sm" style={{ background: "var(--bg)", borderColor: "var(--border)", color: "var(--text)" }} />
          <input type="url" placeholder="Store URL" value={form.store_url} onChange={(e) => setForm({ ...form, store_url: e.target.value })}
            className="px-3 py-2 rounded-lg border text-sm" style={{ background: "var(--bg)", borderColor: "var(--border)", color: "var(--text)" }} />
          <input type="text" placeholder="Niche" value={form.niche} onChange={(e) => setForm({ ...form, niche: e.target.value })}
            className="px-3 py-2 rounded-lg border text-sm" style={{ background: "var(--bg)", borderColor: "var(--border)", color: "var(--text)" }} />
          <input type="number" placeholder="Active ads" value={form.active_ads ?? ""} onChange={(e) => setForm({ ...form, active_ads: e.target.value ? parseInt(e.target.value) : null })}
            className="px-3 py-2 rounded-lg border text-sm" style={{ background: "var(--bg)", borderColor: "var(--border)", color: "var(--text)" }} />
          <input type="number" placeholder="PPSpy rank" value={form.ppspy_rank ?? ""} onChange={(e) => setForm({ ...form, ppspy_rank: e.target.value ? parseInt(e.target.value) : null })}
            className="px-3 py-2 rounded-lg border text-sm" style={{ background: "var(--bg)", borderColor: "var(--border)", color: "var(--text)" }} />
          <input type="url" placeholder="Ad Library URL" value={form.ad_library_url} onChange={(e) => setForm({ ...form, ad_library_url: e.target.value })}
            className="px-3 py-2 rounded-lg border text-sm" style={{ background: "var(--bg)", borderColor: "var(--border)", color: "var(--text)" }} />
          <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as Competitor["status"] })}
            className="px-3 py-2 rounded-lg border text-sm" style={{ background: "var(--bg)", borderColor: "var(--border)", color: "var(--text)" }}>
            <option value="new">New</option>
            <option value="watching">Watching</option>
            <option value="scaling">Scaling</option>
            <option value="dead">Dead</option>
          </select>
          <input type="text" placeholder="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
            className="px-3 py-2 rounded-lg border text-sm sm:col-span-2" style={{ background: "var(--bg)", borderColor: "var(--border)", color: "var(--text)" }} />
          <button type="submit" disabled={saving}
            className="px-4 py-2 rounded-lg text-sm font-medium sm:col-span-3"
            style={{ background: saving ? "var(--border)" : "#4E6AA7", color: "#fff" }}>
            {saving ? "Saving..." : "Save competitor"}
          </button>
        </form>
      )}

      {loading ? (
        <div className="text-center py-20" style={{ color: "var(--text-muted)" }}>Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20" style={{ color: "var(--text-muted)" }}>
          No competitors tracked yet. Click &quot;+ Add competitor&quot; to start.
        </div>
      ) : (
        <div className="rounded-xl border overflow-x-auto" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                <th className="text-left px-4 py-3 text-xs font-medium" style={{ color: "var(--text-muted)" }}>Store</th>
                <th className="text-left px-4 py-3 text-xs font-medium" style={{ color: "var(--text-muted)" }}>Niche</th>
                <th className="text-right px-4 py-3 text-xs font-medium" style={{ color: "var(--text-muted)" }}>Active ads</th>
                <th className="text-right px-4 py-3 text-xs font-medium" style={{ color: "var(--text-muted)" }}>PPSpy</th>
                <th className="text-left px-4 py-3 text-xs font-medium" style={{ color: "var(--text-muted)" }}>Checked</th>
                <th className="text-left px-4 py-3 text-xs font-medium" style={{ color: "var(--text-muted)" }}>Status</th>
                <th className="text-left px-4 py-3 text-xs font-medium" style={{ color: "var(--text-muted)" }}>Links</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c, i) => (
                <tr key={c.id || i} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td className="px-4 py-3">
                    {c.store_url ? (
                      <a href={c.store_url} target="_blank" rel="noopener noreferrer" className="hover:underline" style={{ color: "#4E6AA7" }}>{c.store_name}</a>
                    ) : c.store_name}
                  </td>
                  <td className="px-4 py-3">{c.niche || "—"}</td>
                  <td className="px-4 py-3 text-right font-mono">{c.active_ads ?? "—"}</td>
                  <td className="px-4 py-3 text-right font-mono">{c.ppspy_rank ?? "—"}</td>
                  <td className="px-4 py-3 text-xs">{c.last_checked}</td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 rounded text-xs" style={{
                      background: c.status === "scaling" ? "#34d39922" : c.status === "watching" ? "#4E6AA722" : c.status === "dead" ? "#f8717122" : "#D4903A22",
                      color: c.status === "scaling" ? "var(--green)" : c.status === "watching" ? "#4E6AA7" : c.status === "dead" ? "var(--red)" : "var(--orange)",
                    }}>{c.status}</span>
                  </td>
                  <td className="px-4 py-3">
                    {c.ad_library_url && (
                      <a href={c.ad_library_url} target="_blank" rel="noopener noreferrer" className="text-xs hover:underline" style={{ color: "#4E6AA7" }}>Ad Library</a>
                    )}
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
