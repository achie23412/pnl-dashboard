"use client"
import { useEffect, useState } from "react"
import { createClient } from "@supabase/supabase-js"
import { STORES } from "@/lib/constants"
import type { StoreName } from "@/lib/constants"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)

interface RefundRow {
  id?: number
  date: string
  store: string
  order_id: string
  amount: number
  reason: string
  source: "shopify" | "shipgoods" | "manual"
  status: string
}

export default function RefundsPage() {
  const [refunds, setRefunds] = useState<RefundRow[]>([])
  const [loading, setLoading] = useState(true)
  const [storeFilter, setStoreFilter] = useState<string>("all")
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ date: "", store: "LUMEGLASSES", order_id: "", amount: "", reason: "", status: "pending" })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadRefunds()
  }, [])

  async function loadRefunds() {
    setLoading(true)
    const { data } = await supabase
      .from("refunds")
      .select("*")
      .order("date", { ascending: false })
      .limit(200)
    setRefunds((data as RefundRow[]) || [])
    setLoading(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    await supabase.from("refunds").insert({
      date: form.date,
      store: form.store,
      order_id: form.order_id,
      amount: parseFloat(form.amount),
      reason: form.reason,
      source: "manual",
      status: form.status,
    })
    setForm({ date: "", store: "LUMEGLASSES", order_id: "", amount: "", reason: "", status: "pending" })
    setShowForm(false)
    setSaving(false)
    loadRefunds()
  }

  const filtered = storeFilter === "all" ? refunds : refunds.filter((r) => r.store === storeFilter)

  const totalAmount = filtered.reduce((s, r) => s + r.amount, 0)
  const pendingCount = filtered.filter((r) => r.status === "pending").length
  const resolvedCount = filtered.filter((r) => r.status === "resolved" || r.status === "refunded").length

  return (
    <main className="min-h-screen p-4 md:p-8 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <h1 className="text-xl font-bold">Refund Sheet</h1>
        <div className="flex gap-2">
          <select
            value={storeFilter}
            onChange={(e) => setStoreFilter(e.target.value)}
            className="px-3 py-1.5 rounded-lg border text-xs"
            style={{ background: "var(--bg-card)", borderColor: "var(--border)", color: "var(--text)" }}
          >
            <option value="all">All stores</option>
            {STORES.filter((s) => s !== "Overall").map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <button
            onClick={() => setShowForm(!showForm)}
            className="px-4 py-1.5 rounded-lg text-xs font-medium"
            style={{ background: "#4E6AA7", color: "#fff" }}
          >
            + Add refund
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="rounded-xl p-4 border" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
          <div className="text-xs mb-1" style={{ color: "var(--text-muted)" }}>Total refunds</div>
          <div className="text-lg font-bold" style={{ color: "var(--red)" }}>€{totalAmount.toFixed(2)}</div>
        </div>
        <div className="rounded-xl p-4 border" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
          <div className="text-xs mb-1" style={{ color: "var(--text-muted)" }}>Pending</div>
          <div className="text-lg font-bold" style={{ color: "var(--orange)" }}>{pendingCount}</div>
        </div>
        <div className="rounded-xl p-4 border" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
          <div className="text-xs mb-1" style={{ color: "var(--text-muted)" }}>Resolved</div>
          <div className="text-lg font-bold" style={{ color: "var(--green)" }}>{resolvedCount}</div>
        </div>
      </div>

      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="rounded-xl p-4 border mb-6 grid grid-cols-1 sm:grid-cols-3 gap-3"
          style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
        >
          <input type="date" required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })}
            className="px-3 py-2 rounded-lg border text-sm" style={{ background: "var(--bg)", borderColor: "var(--border)", color: "var(--text)" }} />
          <select value={form.store} onChange={(e) => setForm({ ...form, store: e.target.value })}
            className="px-3 py-2 rounded-lg border text-sm" style={{ background: "var(--bg)", borderColor: "var(--border)", color: "var(--text)" }}>
            {STORES.filter((s) => s !== "Overall").map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <input type="text" placeholder="Order ID" value={form.order_id} onChange={(e) => setForm({ ...form, order_id: e.target.value })}
            className="px-3 py-2 rounded-lg border text-sm" style={{ background: "var(--bg)", borderColor: "var(--border)", color: "var(--text)" }} />
          <input type="number" step="0.01" placeholder="Amount (€)" required value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })}
            className="px-3 py-2 rounded-lg border text-sm" style={{ background: "var(--bg)", borderColor: "var(--border)", color: "var(--text)" }} />
          <input type="text" placeholder="Reason" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })}
            className="px-3 py-2 rounded-lg border text-sm" style={{ background: "var(--bg)", borderColor: "var(--border)", color: "var(--text)" }} />
          <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}
            className="px-3 py-2 rounded-lg border text-sm" style={{ background: "var(--bg)", borderColor: "var(--border)", color: "var(--text)" }}>
            <option value="pending">Pending</option>
            <option value="refunded">Refunded</option>
            <option value="resolved">Resolved</option>
            <option value="disputed">Disputed</option>
          </select>
          <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg text-sm font-medium sm:col-span-3"
            style={{ background: saving ? "var(--border)" : "#4E6AA7", color: "#fff" }}>
            {saving ? "Saving..." : "Save refund"}
          </button>
        </form>
      )}

      {loading ? (
        <div className="text-center py-20" style={{ color: "var(--text-muted)" }}>Loading refunds...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20" style={{ color: "var(--text-muted)" }}>
          No refunds yet. Click &quot;+ Add refund&quot; to log one, or refunds will sync automatically via the cron job.
        </div>
      ) : (
        <div className="rounded-xl border overflow-x-auto" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                <th className="text-left px-4 py-3 text-xs font-medium" style={{ color: "var(--text-muted)" }}>Date</th>
                <th className="text-left px-4 py-3 text-xs font-medium" style={{ color: "var(--text-muted)" }}>Store</th>
                <th className="text-left px-4 py-3 text-xs font-medium" style={{ color: "var(--text-muted)" }}>Order</th>
                <th className="text-right px-4 py-3 text-xs font-medium" style={{ color: "var(--text-muted)" }}>Amount</th>
                <th className="text-left px-4 py-3 text-xs font-medium" style={{ color: "var(--text-muted)" }}>Reason</th>
                <th className="text-left px-4 py-3 text-xs font-medium" style={{ color: "var(--text-muted)" }}>Source</th>
                <th className="text-left px-4 py-3 text-xs font-medium" style={{ color: "var(--text-muted)" }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => (
                <tr key={r.id || i} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td className="px-4 py-3">{r.date}</td>
                  <td className="px-4 py-3">{r.store}</td>
                  <td className="px-4 py-3 font-mono text-xs">{r.order_id || "—"}</td>
                  <td className="px-4 py-3 text-right font-mono" style={{ color: "var(--red)" }}>€{r.amount.toFixed(2)}</td>
                  <td className="px-4 py-3">{r.reason || "—"}</td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 rounded text-xs" style={{
                      background: r.source === "shopify" ? "#4E6AA722" : r.source === "shipgoods" ? "#D4903A22" : "#8b8fa322",
                      color: r.source === "shopify" ? "#4E6AA7" : r.source === "shipgoods" ? "#D4903A" : "var(--text-muted)",
                    }}>{r.source}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 rounded text-xs" style={{
                      background: r.status === "resolved" || r.status === "refunded" ? "#34d39922" : r.status === "disputed" ? "#f8717122" : "#D4903A22",
                      color: r.status === "resolved" || r.status === "refunded" ? "var(--green)" : r.status === "disputed" ? "var(--red)" : "var(--orange)",
                    }}>{r.status}</span>
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
