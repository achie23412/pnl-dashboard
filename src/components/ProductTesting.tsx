"use client"
import { useState, useEffect } from "react"
import { createClient } from "@supabase/supabase-js"
import { STORES, STORE_COLORS, AVG_COGS_PER_ORDER } from "@/lib/constants"
import type { ProductTest } from "@/lib/types"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)

const STORES_NO_OVERALL = STORES.filter((s) => s !== "Overall")

interface KillResult {
  shouldKill: boolean
  rule: string | null
  nextRule: string | null
  nextThreshold: number
  progress: number
}

interface ScaleResult {
  gates: { label: string; pass: boolean; value: string }[]
  canScale: boolean
}

function getKillStatus(t: ProductTest): KillResult {
  if (t.total_spend >= 10 && t.avg_cpc > 1 && t.total_atc === 0) {
    return { shouldKill: true, rule: "$10 CPC>$1 + 0 ATC", nextRule: null, nextThreshold: 10, progress: 1 }
  }
  if (t.total_spend >= 20 && t.total_atc === 0) {
    return { shouldKill: true, rule: "$20 + 0 ATC", nextRule: null, nextThreshold: 20, progress: 1 }
  }
  if (t.total_spend >= 30 && t.total_orders === 0) {
    return { shouldKill: true, rule: "$30 + 0 sales", nextRule: null, nextThreshold: 30, progress: 1 }
  }
  if (t.total_spend >= 60 && t.total_orders < 2) {
    return { shouldKill: true, rule: "$60 + <2 sales", nextRule: null, nextThreshold: 60, progress: 1 }
  }

  if (t.total_spend < 10) {
    return { shouldKill: false, rule: null, nextRule: "$10 CPC>$1 + 0 ATC", nextThreshold: 10, progress: t.total_spend / 10 }
  }
  if (t.total_spend < 20) {
    return { shouldKill: false, rule: null, nextRule: "$20 + 0 ATC", nextThreshold: 20, progress: t.total_spend / 20 }
  }
  if (t.total_spend < 30) {
    return { shouldKill: false, rule: null, nextRule: "$30 + 0 sales", nextThreshold: 30, progress: t.total_spend / 30 }
  }
  if (t.total_spend < 60) {
    return { shouldKill: false, rule: null, nextRule: "$60 + <2 sales", nextThreshold: 60, progress: t.total_spend / 60 }
  }
  return { shouldKill: false, rule: null, nextRule: null, nextThreshold: 60, progress: 1 }
}

function getScaleGates(t: ProductTest): ScaleResult {
  const totalCogs = t.total_orders * t.cogs_per_order
  const totalProfit = t.total_revenue - t.total_spend - totalCogs
  const totalMargin = t.total_revenue > 0 ? (totalProfit / t.total_revenue) * 100 : 0

  const todayCogs = t.today_orders * t.cogs_per_order
  const todayProfit = t.today_revenue - t.today_spend - todayCogs
  const todayMargin = t.today_revenue > 0 ? (todayProfit / t.today_revenue) * 100 : 0

  const yCogs = t.yesterday_orders * t.cogs_per_order
  const yProfit = t.yesterday_revenue - t.yesterday_spend - yCogs
  const yMargin = t.yesterday_revenue > 0 ? (yProfit / t.yesterday_revenue) * 100 : 0

  const gates = [
    { label: "Spend > $60", pass: t.total_spend > 60, value: `$${t.total_spend.toFixed(0)}` },
    { label: "Total profit > 20%", pass: totalMargin > 20, value: `${totalMargin.toFixed(1)}%` },
    { label: "Today profit > 20%", pass: todayMargin > 20, value: `${todayMargin.toFixed(1)}%` },
    { label: "Yesterday profit > 20%", pass: yMargin > 20, value: `${yMargin.toFixed(1)}%` },
  ]

  return { gates, canScale: gates.every((g) => g.pass) }
}

function getDaysRunning(launchDate: string): number {
  const launch = new Date(launchDate)
  const now = new Date()
  return Math.max(0, Math.floor((now.getTime() - launch.getTime()) / 86400000))
}

function StatusBadge({ status }: { status: ProductTest["status"] }) {
  const colors: Record<string, { bg: string; text: string }> = {
    testing: { bg: "rgba(212,144,58,0.15)", text: "var(--orange)" },
    killed: { bg: "rgba(248,113,113,0.15)", text: "var(--red)" },
    scaling: { bg: "rgba(99,102,241,0.15)", text: "var(--accent)" },
    winner: { bg: "rgba(52,211,153,0.15)", text: "var(--green)" },
    paused: { bg: "rgba(100,116,139,0.15)", text: "var(--text-muted)" },
  }
  const c = colors[status] || colors.testing
  return (
    <span
      className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide"
      style={{ background: c.bg, color: c.text }}
    >
      {status}
    </span>
  )
}

function KillRuleBar({ test }: { test: ProductTest }) {
  const kill = getKillStatus(test)
  if (test.status === "killed") {
    return (
      <div className="flex items-center gap-1.5">
        <div className="w-full h-1 rounded-full" style={{ background: "var(--red)" }} />
        <span className="text-[9px] whitespace-nowrap" style={{ color: "var(--red)" }}>
          {test.kill_reason || kill.rule}
        </span>
      </div>
    )
  }
  if (kill.shouldKill) {
    return (
      <div className="flex items-center gap-1.5">
        <div className="w-full h-1 rounded-full" style={{ background: "var(--red)" }} />
        <span className="text-[9px] whitespace-nowrap" style={{ color: "var(--red)" }}>
          KILL: {kill.rule}
        </span>
      </div>
    )
  }
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-full h-1 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${kill.progress * 100}%`, background: kill.progress > 0.7 ? "var(--orange)" : "var(--accent)" }}
        />
      </div>
      <span className="text-[9px] whitespace-nowrap" style={{ color: "var(--text-dim)" }}>
        ${test.total_spend.toFixed(0)}/${kill.nextThreshold}
      </span>
    </div>
  )
}

function ScaleGateDots({ test }: { test: ProductTest }) {
  const { gates, canScale } = getScaleGates(test)
  return (
    <div className="flex items-center gap-1">
      {gates.map((g, i) => (
        <div
          key={i}
          className="w-2 h-2 rounded-full"
          title={`${g.label}: ${g.value}`}
          style={{
            background: g.pass ? "var(--green)" : "rgba(255,255,255,0.1)",
            boxShadow: g.pass ? "0 0 4px rgba(52,211,153,0.4)" : "none",
          }}
        />
      ))}
      {canScale && (
        <span className="text-[9px] font-semibold ml-1" style={{ color: "var(--green)" }}>
          SCALE
        </span>
      )}
    </div>
  )
}

const emptyTest: ProductTest = {
  product_name: "",
  store: STORES_NO_OVERALL[0],
  launch_date: new Date().toISOString().slice(0, 10),
  status: "testing",
  daily_budget: 30,
  total_spend: 0,
  total_revenue: 0,
  total_orders: 0,
  total_atc: 0,
  total_clicks: 0,
  avg_cpc: 0,
  today_spend: 0,
  today_revenue: 0,
  today_orders: 0,
  yesterday_spend: 0,
  yesterday_revenue: 0,
  yesterday_orders: 0,
  cogs_per_order: 0,
  notes: "",
  kill_reason: null,
}

export function ProductTesting() {
  const [tests, setTests] = useState<ProductTest[]>([])
  const [loading, setLoading] = useState(true)
  const [tableError, setTableError] = useState(false)
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState<ProductTest>({ ...emptyTest })
  const [editForm, setEditForm] = useState<Partial<ProductTest>>({})

  async function loadTests() {
    setLoading(true)
    const { data, error } = await supabase
      .from("product_tests")
      .select("*")
      .order("created_at", { ascending: false })
    if (error) {
      if (error.code === "42P01" || error.message?.includes("does not exist")) {
        setTableError(true)
      }
      setLoading(false)
      return
    }
    setTests((data as ProductTest[]) || [])
    setTableError(false)
    setLoading(false)
  }

  useEffect(() => {
    loadTests()
  }, [])

  async function createTable() {
    const res = await fetch("/api/migrate/product-tests", { method: "POST" })
    if (res.ok) {
      setTableError(false)
      loadTests()
    }
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    const kill = getKillStatus(form)
    const entry = {
      ...form,
      status: kill.shouldKill ? "killed" as const : form.status,
      kill_reason: kill.shouldKill ? kill.rule : null,
    }
    await supabase.from("product_tests").insert(entry)
    setForm({ ...emptyTest })
    setShowAddForm(false)
    loadTests()
  }

  async function handleUpdate(id: number) {
    const existing = tests.find((t) => t.id === id)
    if (!existing) return
    const updated = { ...existing, ...editForm }
    const kill = getKillStatus(updated as ProductTest)
    const scale = getScaleGates(updated as ProductTest)

    let newStatus = updated.status
    if (kill.shouldKill && updated.status === "testing") {
      newStatus = "killed"
    } else if (scale.canScale && updated.status === "testing") {
      newStatus = "scaling"
    }

    await supabase
      .from("product_tests")
      .update({
        ...editForm,
        status: newStatus,
        kill_reason: kill.shouldKill ? kill.rule : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
    setEditingId(null)
    setEditForm({})
    loadTests()
  }

  async function handleStatusChange(id: number, status: ProductTest["status"]) {
    await supabase
      .from("product_tests")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", id)
    loadTests()
  }

  async function handleDelete(id: number) {
    await supabase.from("product_tests").delete().eq("id", id)
    loadTests()
  }

  const activeTests = tests.filter((t) => t.status === "testing")
  const killedTests = tests.filter((t) => t.status === "killed")
  const scalingTests = tests.filter((t) => t.status === "scaling" || t.status === "winner")
  const avgRoas = activeTests.length > 0
    ? activeTests.reduce((s, t) => s + (t.total_spend > 0 ? t.total_revenue / t.total_spend : 0), 0) / activeTests.length
    : 0
  const killRate = tests.length > 0 ? (killedTests.length / tests.length) * 100 : 0

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: "var(--accent)", borderTopColor: "transparent" }} />
      </div>
    )
  }

  if (tableError) {
    return (
      <div className="glass rounded-xl p-6 text-center">
        <div className="text-[11px] font-medium mb-3" style={{ color: "var(--text-muted)" }}>
          Product tests table not found
        </div>
        <button
          onClick={createTable}
          className="px-4 py-2 rounded-lg text-[11px] font-semibold"
          style={{ background: "var(--accent)", color: "#fff" }}
        >
          Create Table
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* KPI Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "ACTIVE TESTS", value: activeTests.length.toString(), color: "var(--orange)" },
          { label: "AVG ROAS", value: avgRoas.toFixed(2) + "x", color: avgRoas >= 2 ? "var(--green)" : "var(--red)" },
          { label: "KILL RATE", value: killRate.toFixed(0) + "%", color: "var(--red)" },
          { label: "SCALING", value: scalingTests.length.toString(), color: "var(--green)" },
        ].map((kpi) => (
          <div key={kpi.label} className="glass rounded-xl px-3 py-2.5">
            <div className="text-[9px] font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--text-dim)" }}>
              {kpi.label}
            </div>
            <div className="text-[18px] font-bold" style={{ color: kpi.color }}>
              {kpi.value}
            </div>
          </div>
        ))}
      </div>

      {/* Kill & Scale Rules Reference */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="glass rounded-xl px-3 py-2.5">
          <div className="text-[9px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-dim)" }}>
            KILL RULES (Simo)
          </div>
          <div className="space-y-1.5">
            {[
              { spend: "$10", rule: "CPC > $1 + 0 ATC" },
              { spend: "$20", rule: "0 ATC" },
              { spend: "$30", rule: "0 sales" },
              { spend: "$60", rule: "< 2 sales" },
            ].map((r) => (
              <div key={r.spend} className="flex items-center gap-2">
                <span className="text-[10px] font-mono font-semibold w-8" style={{ color: "var(--red)" }}>
                  {r.spend}
                </span>
                <div className="w-1 h-1 rounded-full" style={{ background: "var(--red)", opacity: 0.5 }} />
                <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                  {r.rule}
                </span>
              </div>
            ))}
          </div>
        </div>
        <div className="glass rounded-xl px-3 py-2.5">
          <div className="text-[9px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-dim)" }}>
            SCALE GATES (all 4 must pass)
          </div>
          <div className="space-y-1.5">
            {[
              "Spend > $60",
              "Total net profit > 20%",
              "Today net profit > 20%",
              "Yesterday net profit > 20%",
            ].map((g) => (
              <div key={g} className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full" style={{ background: "rgba(52,211,153,0.3)" }} />
                <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                  {g}
                </span>
              </div>
            ))}
            <div className="text-[9px] mt-1" style={{ color: "var(--text-dim)" }}>
              Pass all 4 → double budget at midnight, compare 72h
            </div>
          </div>
        </div>
      </div>

      {/* Add Product Test */}
      <div className="flex items-center justify-between">
        <div className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-dim)" }}>
          PRODUCT TESTS
        </div>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="glass px-3 py-1 rounded-lg text-[10px] font-semibold transition-colors hover:bg-[rgba(255,255,255,0.06)]"
          style={{ color: showAddForm ? "var(--red)" : "var(--accent)" }}
        >
          {showAddForm ? "Cancel" : "+ Add Test"}
        </button>
      </div>

      {showAddForm && (
        <form onSubmit={handleAdd} className="glass rounded-xl p-4 space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="col-span-2">
              <label className="block text-[9px] uppercase tracking-wider font-medium mb-1" style={{ color: "var(--text-dim)" }}>Product name</label>
              <input
                type="text"
                required
                value={form.product_name}
                onChange={(e) => setForm({ ...form, product_name: e.target.value })}
                className="w-full px-2.5 py-1.5 rounded-lg text-[11px] font-medium"
                style={{ background: "var(--bg)", border: "1px solid var(--border)", color: "var(--text)" }}
              />
            </div>
            <div>
              <label className="block text-[9px] uppercase tracking-wider font-medium mb-1" style={{ color: "var(--text-dim)" }}>Store</label>
              <select
                value={form.store}
                onChange={(e) => {
                  const store = e.target.value
                  const cogs = AVG_COGS_PER_ORDER[store] || 0
                  setForm({ ...form, store, cogs_per_order: cogs })
                }}
                className="w-full px-2.5 py-1.5 rounded-lg text-[11px] font-medium"
                style={{ background: "var(--bg)", border: "1px solid var(--border)", color: "var(--text)" }}
              >
                {STORES_NO_OVERALL.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[9px] uppercase tracking-wider font-medium mb-1" style={{ color: "var(--text-dim)" }}>Launch date</label>
              <input
                type="date"
                value={form.launch_date}
                onChange={(e) => setForm({ ...form, launch_date: e.target.value })}
                className="w-full px-2.5 py-1.5 rounded-lg text-[11px] font-medium"
                style={{ background: "var(--bg)", border: "1px solid var(--border)", color: "var(--text)" }}
              />
            </div>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
            <div>
              <label className="block text-[9px] uppercase tracking-wider font-medium mb-1" style={{ color: "var(--text-dim)" }}>Budget/day</label>
              <input
                type="number"
                step="1"
                value={form.daily_budget}
                onChange={(e) => setForm({ ...form, daily_budget: parseFloat(e.target.value) || 0 })}
                className="w-full px-2.5 py-1.5 rounded-lg text-[11px] font-medium"
                style={{ background: "var(--bg)", border: "1px solid var(--border)", color: "var(--text)" }}
              />
            </div>
            <div>
              <label className="block text-[9px] uppercase tracking-wider font-medium mb-1" style={{ color: "var(--text-dim)" }}>COGS/order</label>
              <input
                type="number"
                step="0.01"
                value={form.cogs_per_order}
                onChange={(e) => setForm({ ...form, cogs_per_order: parseFloat(e.target.value) || 0 })}
                className="w-full px-2.5 py-1.5 rounded-lg text-[11px] font-medium"
                style={{ background: "var(--bg)", border: "1px solid var(--border)", color: "var(--text)" }}
              />
            </div>
            <div>
              <label className="block text-[9px] uppercase tracking-wider font-medium mb-1" style={{ color: "var(--text-dim)" }}>Spend</label>
              <input
                type="number"
                step="0.01"
                value={form.total_spend || ""}
                onChange={(e) => setForm({ ...form, total_spend: parseFloat(e.target.value) || 0 })}
                className="w-full px-2.5 py-1.5 rounded-lg text-[11px] font-medium"
                style={{ background: "var(--bg)", border: "1px solid var(--border)", color: "var(--text)" }}
              />
            </div>
            <div>
              <label className="block text-[9px] uppercase tracking-wider font-medium mb-1" style={{ color: "var(--text-dim)" }}>Avg CPC</label>
              <input
                type="number"
                step="0.01"
                value={form.avg_cpc || ""}
                onChange={(e) => setForm({ ...form, avg_cpc: parseFloat(e.target.value) || 0 })}
                className="w-full px-2.5 py-1.5 rounded-lg text-[11px] font-medium"
                style={{ background: "var(--bg)", border: "1px solid var(--border)", color: "var(--text)" }}
              />
            </div>
            <div>
              <label className="block text-[9px] uppercase tracking-wider font-medium mb-1" style={{ color: "var(--text-dim)" }}>ATC</label>
              <input
                type="number"
                value={form.total_atc || ""}
                onChange={(e) => setForm({ ...form, total_atc: parseInt(e.target.value) || 0 })}
                className="w-full px-2.5 py-1.5 rounded-lg text-[11px] font-medium"
                style={{ background: "var(--bg)", border: "1px solid var(--border)", color: "var(--text)" }}
              />
            </div>
            <div>
              <label className="block text-[9px] uppercase tracking-wider font-medium mb-1" style={{ color: "var(--text-dim)" }}>Orders</label>
              <input
                type="number"
                value={form.total_orders || ""}
                onChange={(e) => setForm({ ...form, total_orders: parseInt(e.target.value) || 0 })}
                className="w-full px-2.5 py-1.5 rounded-lg text-[11px] font-medium"
                style={{ background: "var(--bg)", border: "1px solid var(--border)", color: "var(--text)" }}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[9px] uppercase tracking-wider font-medium mb-1" style={{ color: "var(--text-dim)" }}>Revenue</label>
              <input
                type="number"
                step="0.01"
                value={form.total_revenue || ""}
                onChange={(e) => setForm({ ...form, total_revenue: parseFloat(e.target.value) || 0 })}
                className="w-full px-2.5 py-1.5 rounded-lg text-[11px] font-medium"
                style={{ background: "var(--bg)", border: "1px solid var(--border)", color: "var(--text)" }}
              />
            </div>
            <div>
              <label className="block text-[9px] uppercase tracking-wider font-medium mb-1" style={{ color: "var(--text-dim)" }}>Notes</label>
              <input
                type="text"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                className="w-full px-2.5 py-1.5 rounded-lg text-[11px] font-medium"
                style={{ background: "var(--bg)", border: "1px solid var(--border)", color: "var(--text)" }}
                placeholder="Optional notes..."
              />
            </div>
          </div>
          <button
            type="submit"
            className="w-full px-4 py-2 rounded-lg text-[11px] font-semibold transition-colors"
            style={{ background: "var(--accent)", color: "#fff" }}
          >
            Add Product Test
          </button>
        </form>
      )}

      {/* Product Tests Table */}
      {tests.length === 0 ? (
        <div className="glass rounded-xl p-8 text-center">
          <div className="text-[11px]" style={{ color: "var(--text-dim)" }}>
            No product tests yet. Click &quot;+ Add Test&quot; to start tracking.
          </div>
        </div>
      ) : (
        <div className="glass rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  {["Product", "Days", "Spend", "CPC", "ATC", "Orders", "Revenue", "ROAS", "Kill Progress", "Scale", "Status", ""].map((h) => (
                    <th
                      key={h}
                      className="text-left px-3 py-2.5 text-[9px] font-semibold uppercase tracking-wider whitespace-nowrap"
                      style={{ color: "var(--text-dim)" }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tests.map((t) => {
                  const roas = t.total_spend > 0 ? t.total_revenue / t.total_spend : 0
                  const days = getDaysRunning(t.launch_date)
                  const isEditing = editingId === t.id
                  const color = STORE_COLORS[t.store] || "#666"

                  return (
                    <tr key={t.id}>
                      <td colSpan={12}>
                        <div
                          className="transition-colors hover:bg-[rgba(255,255,255,0.02)]"
                          style={{ borderBottom: "1px solid var(--border)" }}
                        >
                          <div className="grid items-center px-3 py-2" style={{ gridTemplateColumns: "minmax(120px,1.5fr) 40px 65px 55px 40px 50px 65px 55px minmax(100px,1fr) 70px 70px 50px" }}>
                            {/* Product */}
                            <div className="flex items-center gap-1.5 min-w-0">
                              <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: color }} />
                              <div className="min-w-0">
                                <div className="text-[11px] font-semibold truncate" style={{ color: "var(--text)" }}>
                                  {t.product_name}
                                </div>
                                <div className="text-[9px] truncate" style={{ color: "var(--text-dim)" }}>
                                  {t.store}
                                </div>
                              </div>
                            </div>
                            {/* Days */}
                            <div className="text-[11px] font-mono" style={{ color: "var(--text-muted)" }}>
                              {days}d
                            </div>
                            {/* Spend */}
                            <div className="text-[11px] font-mono font-medium" style={{ color: "var(--text)" }}>
                              ${t.total_spend.toFixed(0)}
                            </div>
                            {/* CPC */}
                            <div className="text-[11px] font-mono" style={{ color: t.avg_cpc > 1 ? "var(--red)" : "var(--text-muted)" }}>
                              ${t.avg_cpc.toFixed(2)}
                            </div>
                            {/* ATC */}
                            <div className="text-[11px] font-mono" style={{ color: t.total_atc === 0 && t.total_spend >= 10 ? "var(--red)" : "var(--text-muted)" }}>
                              {t.total_atc}
                            </div>
                            {/* Orders */}
                            <div className="text-[11px] font-mono" style={{ color: t.total_orders === 0 && t.total_spend >= 30 ? "var(--red)" : "var(--text-muted)" }}>
                              {t.total_orders}
                            </div>
                            {/* Revenue */}
                            <div className="text-[11px] font-mono font-medium" style={{ color: "var(--text)" }}>
                              ${t.total_revenue.toFixed(0)}
                            </div>
                            {/* ROAS */}
                            <div className="text-[11px] font-mono font-semibold" style={{ color: roas >= 2 ? "var(--green)" : roas > 0 ? "var(--orange)" : "var(--text-dim)" }}>
                              {roas.toFixed(2)}x
                            </div>
                            {/* Kill Progress */}
                            <div className="min-w-0">
                              <KillRuleBar test={t} />
                            </div>
                            {/* Scale */}
                            <div>
                              <ScaleGateDots test={t} />
                            </div>
                            {/* Status */}
                            <div>
                              <StatusBadge status={t.status} />
                            </div>
                            {/* Actions */}
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => {
                                  if (isEditing) {
                                    setEditingId(null)
                                    setEditForm({})
                                  } else {
                                    setEditingId(t.id!)
                                    setEditForm({
                                      total_spend: t.total_spend,
                                      avg_cpc: t.avg_cpc,
                                      total_atc: t.total_atc,
                                      total_orders: t.total_orders,
                                      total_revenue: t.total_revenue,
                                      today_spend: t.today_spend,
                                      today_revenue: t.today_revenue,
                                      today_orders: t.today_orders,
                                      yesterday_spend: t.yesterday_spend,
                                      yesterday_revenue: t.yesterday_revenue,
                                      yesterday_orders: t.yesterday_orders,
                                    })
                                  }
                                }}
                                className="text-[9px] font-semibold px-1.5 py-0.5 rounded"
                                style={{ color: isEditing ? "var(--red)" : "var(--accent)" }}
                              >
                                {isEditing ? "X" : "Edit"}
                              </button>
                            </div>
                          </div>

                          {/* Expandable Edit Row */}
                          {isEditing && (
                            <div className="px-3 pb-3 pt-1 space-y-2" style={{ background: "rgba(255,255,255,0.02)" }}>
                              <div className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-dim)" }}>
                                UPDATE METRICS
                              </div>
                              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                                {([
                                  ["total_spend", "Total Spend"],
                                  ["avg_cpc", "Avg CPC"],
                                  ["total_atc", "Total ATC"],
                                  ["total_orders", "Total Orders"],
                                  ["total_revenue", "Total Revenue"],
                                  ["total_clicks", "Total Clicks"],
                                ] as const).map(([key, label]) => (
                                  <div key={key}>
                                    <label className="block text-[8px] uppercase tracking-wider mb-0.5" style={{ color: "var(--text-dim)" }}>{label}</label>
                                    <input
                                      type="number"
                                      step={key === "total_atc" || key === "total_orders" || key === "total_clicks" ? "1" : "0.01"}
                                      value={(editForm as Record<string, number>)[key] ?? ""}
                                      onChange={(e) => setEditForm({ ...editForm, [key]: parseFloat(e.target.value) || 0 })}
                                      className="w-full px-2 py-1 rounded text-[10px] font-mono"
                                      style={{ background: "var(--bg)", border: "1px solid var(--border)", color: "var(--text)" }}
                                    />
                                  </div>
                                ))}
                              </div>
                              <div className="text-[9px] font-semibold uppercase tracking-wider pt-1" style={{ color: "var(--text-dim)" }}>
                                TODAY & YESTERDAY (for scale gates)
                              </div>
                              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                                {([
                                  ["today_spend", "Today Spend"],
                                  ["today_revenue", "Today Rev"],
                                  ["today_orders", "Today Orders"],
                                  ["yesterday_spend", "Yest. Spend"],
                                  ["yesterday_revenue", "Yest. Rev"],
                                  ["yesterday_orders", "Yest. Orders"],
                                ] as const).map(([key, label]) => (
                                  <div key={key}>
                                    <label className="block text-[8px] uppercase tracking-wider mb-0.5" style={{ color: "var(--text-dim)" }}>{label}</label>
                                    <input
                                      type="number"
                                      step={key.includes("orders") ? "1" : "0.01"}
                                      value={(editForm as Record<string, number>)[key] ?? ""}
                                      onChange={(e) => setEditForm({ ...editForm, [key]: parseFloat(e.target.value) || 0 })}
                                      className="w-full px-2 py-1 rounded text-[10px] font-mono"
                                      style={{ background: "var(--bg)", border: "1px solid var(--border)", color: "var(--text)" }}
                                    />
                                  </div>
                                ))}
                              </div>
                              <div className="flex items-center gap-2 pt-1">
                                <button
                                  onClick={() => handleUpdate(t.id!)}
                                  className="px-3 py-1 rounded-lg text-[10px] font-semibold"
                                  style={{ background: "var(--accent)", color: "#fff" }}
                                >
                                  Save
                                </button>
                                <select
                                  value={t.status}
                                  onChange={(e) => handleStatusChange(t.id!, e.target.value as ProductTest["status"])}
                                  className="px-2 py-1 rounded-lg text-[10px] font-medium"
                                  style={{ background: "var(--bg)", border: "1px solid var(--border)", color: "var(--text)" }}
                                >
                                  <option value="testing">Testing</option>
                                  <option value="killed">Killed</option>
                                  <option value="scaling">Scaling</option>
                                  <option value="winner">Winner</option>
                                  <option value="paused">Paused</option>
                                </select>
                                <button
                                  onClick={() => handleDelete(t.id!)}
                                  className="px-2 py-1 rounded-lg text-[10px] font-semibold ml-auto"
                                  style={{ color: "var(--red)" }}
                                >
                                  Delete
                                </button>
                              </div>

                              {/* Scale Gates Detail */}
                              {t.total_spend > 30 && (
                                <div className="pt-1">
                                  <div className="text-[9px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "var(--text-dim)" }}>
                                    SCALE GATE STATUS
                                  </div>
                                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                    {getScaleGates(t).gates.map((g) => (
                                      <div
                                        key={g.label}
                                        className="flex items-center gap-1.5 px-2 py-1 rounded"
                                        style={{ background: g.pass ? "rgba(52,211,153,0.08)" : "rgba(255,255,255,0.03)" }}
                                      >
                                        <div
                                          className="w-2 h-2 rounded-full flex-shrink-0"
                                          style={{ background: g.pass ? "var(--green)" : "rgba(255,255,255,0.1)" }}
                                        />
                                        <div>
                                          <div className="text-[9px]" style={{ color: g.pass ? "var(--green)" : "var(--text-dim)" }}>
                                            {g.label}
                                          </div>
                                          <div className="text-[10px] font-mono font-semibold" style={{ color: g.pass ? "var(--green)" : "var(--text-muted)" }}>
                                            {g.value}
                                          </div>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
