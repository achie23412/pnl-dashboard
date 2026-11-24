"use client"
import { useState } from "react"

type Priority = "high" | "medium" | "low"
type Category = "data" | "automation" | "dashboard" | "tracking"

interface Suggestion {
  id: string
  title: string
  description: string
  priority: Priority
  category: Category
  action?: string
  impact: string
  addedDate: string
}

const SUGGESTIONS: Suggestion[] = [
  {
    id: "shipgoods-vercel-token",
    title: "Verify SHIPGOODS_TOKEN is set in Vercel env vars",
    description:
      "The ShipGoods COGS fetch was fixed (API response parsing bug). It now works correctly, but the Vercel cron needs SHIPGOODS_TOKEN in its environment to call the ShipGoods API. Without it, the cron will log 'SHIPGOODS_TOKEN not set'.",
    priority: "high",
    category: "data",
    action: "Go to Vercel → pnl-dashboard → Settings → Environment Variables. Check SHIPGOODS_TOKEN is set. If not, add it.",
    impact: "Without the token, COGS stays at 0 on the live dashboard even though the code is now correct.",
    addedDate: "2026-11-25",
  },
  {
    id: "shipgoods-google-stores",
    title: "Google stores have no ShipGoods COGS",
    description:
      "ShipGoods only tracks LUMEGLASSES (shop 16918) and Blinky (shop 18132). Walsh & Farley, Carter & Collins, and Susan & Allen are not on ShipGoods — their COGS will remain at 0 or fall back to the per-order estimate.",
    priority: "high",
    category: "data",
    action: "Either add the Google stores to ShipGoods, or use the COGS launch sheet (per-product costs) as the fallback source for those 3 stores.",
    impact: "Without this, profit for the 3 Google stores is estimated, not actual.",
    addedDate: "2026-11-25",
  },
  {
    id: "add-lume-blinky-sheet",
    title: "Add Lume & Blinky to the Profit Sheet",
    description:
      "The Profit Sheet Setup tab has 3 stores (Susan & Allen, Carter & Collins, Walsh & Farley). The two Meta stores — LUMEGLASSES and Blinky — are tracked in Supabase but not in the sheet.",
    priority: "medium",
    category: "tracking",
    action: "Add Store 4 (LUMEGLASSES, USD) and Store 5 (Blinky, EUR) in the Setup tab, then update the auto-fill routine.",
    impact: "Full 5-store P&L in one sheet. Currently 2 stores have no daily sheet tracking.",
    addedDate: "2026-11-25",
  },
  {
    id: "meta-spend-supabase",
    title: "Check Meta ad spend is flowing into Supabase",
    description:
      "The daily_spend table has Google channel data. Confirm that Meta spend for LUMEGLASSES and Blinky is also being captured by the cron refresh.",
    priority: "medium",
    category: "data",
    action: "Query daily_spend for channel='Meta' and verify recent rows exist for both Meta stores.",
    impact: "Without Meta spend data the dashboard ROAS for those stores is wrong.",
    addedDate: "2026-11-25",
  },
  {
    id: "sessions-token",
    title: "Verify Shopify read_reports tokens for all stores",
    description:
      "CVR on the dashboard is calculated as orders / human sessions. If a store's Shopify access token doesn't have read_reports scope, sessions data can't be pulled.",
    priority: "low",
    category: "data",
    action: "Check each store's token scope in Vercel env vars. Stores missing read_reports won't have session data.",
    impact: "Accurate conversion rate for every store.",
    addedDate: "2026-11-25",
  },
  {
    id: "ecb-rates-fallback",
    title: "Add ECB rate fallback for weekends/holidays",
    description:
      "The dashboard converts USD/GBP to EUR using daily ECB rates. ECB doesn't publish rates on weekends or holidays — the cron should use the last available rate as a fallback.",
    priority: "low",
    category: "dashboard",
    action: "In the refresh cron, if no ECB rate is found for today, use the most recent available rate.",
    impact: "Prevents missing or zero conversions on weekends.",
    addedDate: "2026-11-25",
  },
]

const PRIORITY_CONFIG: Record<Priority, { label: string; color: string; bg: string }> = {
  high: { label: "High", color: "#ef4444", bg: "rgba(239,68,68,0.15)" },
  medium: { label: "Medium", color: "#f59e0b", bg: "rgba(245,158,11,0.15)" },
  low: { label: "Low", color: "#6366f1", bg: "rgba(99,102,241,0.15)" },
}

const CATEGORY_CONFIG: Record<Category, { label: string; color: string }> = {
  data: { label: "Data", color: "#10b981" },
  automation: { label: "Automation", color: "#8b5cf6" },
  dashboard: { label: "Dashboard", color: "#3b82f6" },
  tracking: { label: "Tracking", color: "#f59e0b" },
}

export default function AdvisorPage() {
  const [filter, setFilter] = useState<Priority | "all">("all")
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())

  const visible = SUGGESTIONS.filter(
    (s) => !dismissed.has(s.id) && (filter === "all" || s.priority === filter)
  )
  const highCount = SUGGESTIONS.filter((s) => !dismissed.has(s.id) && s.priority === "high").length
  const medCount = SUGGESTIONS.filter((s) => !dismissed.has(s.id) && s.priority === "medium").length
  const lowCount = SUGGESTIONS.filter((s) => !dismissed.has(s.id) && s.priority === "low").length

  return (
    <div className="p-6 min-h-screen" style={{ background: "var(--bg)" }}>
      <div className="text-[10px] mb-1" style={{ color: "var(--text-dim)" }}>
        System → Advisor
      </div>

      <div className="flex items-center justify-between mb-4">
        <h1 className="text-[20px] font-bold" style={{ color: "var(--text)" }}>
          Advisor
        </h1>
        <div className="text-[11px]" style={{ color: "var(--text-dim)" }}>
          {visible.length} suggestion{visible.length !== 1 ? "s" : ""}
        </div>
      </div>

      <p className="text-[12px] mb-5 max-w-3xl" style={{ color: "var(--text-muted)" }}>
        Improvements and changes suggested by Claude. Each item is something that would make the
        dashboard, data pipeline, or automation more accurate or complete.
      </p>

      {/* Priority filter pills */}
      <div className="flex gap-2 mb-5">
        {(["all", "high", "medium", "low"] as const).map((p) => {
          const active = filter === p
          const count = p === "all" ? highCount + medCount + lowCount : p === "high" ? highCount : p === "medium" ? medCount : lowCount
          return (
            <button
              key={p}
              onClick={() => setFilter(p)}
              className="px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all"
              style={{
                background: active ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.03)",
                border: `1px solid ${active ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.06)"}`,
                color: active ? "var(--text)" : "var(--text-muted)",
              }}
            >
              {p === "all" ? "All" : PRIORITY_CONFIG[p].label} ({count})
            </button>
          )
        })}
      </div>

      {/* Suggestion cards */}
      <div className="space-y-3">
        {visible.map((s) => {
          const prio = PRIORITY_CONFIG[s.priority]
          const cat = CATEGORY_CONFIG[s.category]
          return (
            <div
              key={s.id}
              className="rounded-xl p-4"
              style={{
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.06)",
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span
                      className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase"
                      style={{ background: prio.bg, color: prio.color }}
                    >
                      {prio.label}
                    </span>
                    <span
                      className="px-2 py-0.5 rounded-full text-[9px] font-medium"
                      style={{
                        background: "rgba(255,255,255,0.05)",
                        color: cat.color,
                      }}
                    >
                      {cat.label}
                    </span>
                    <span className="text-[9px]" style={{ color: "var(--text-dim)" }}>
                      {s.addedDate}
                    </span>
                  </div>
                  <h3 className="text-[13px] font-semibold mb-1" style={{ color: "var(--text)" }}>
                    {s.title}
                  </h3>
                  <p className="text-[11px] mb-2" style={{ color: "var(--text-muted)" }}>
                    {s.description}
                  </p>
                  {s.action && (
                    <div
                      className="text-[11px] px-3 py-2 rounded-lg mb-2"
                      style={{
                        background: "rgba(99,102,241,0.08)",
                        border: "1px solid rgba(99,102,241,0.15)",
                        color: "var(--text-muted)",
                      }}
                    >
                      <span className="font-semibold" style={{ color: "#818cf8" }}>
                        Action:
                      </span>{" "}
                      {s.action}
                    </div>
                  )}
                  <div className="text-[10px]" style={{ color: "var(--text-dim)" }}>
                    <span className="font-semibold">Impact:</span> {s.impact}
                  </div>
                </div>
                <button
                  onClick={() => setDismissed((prev) => new Set([...prev, s.id]))}
                  className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center transition-all hover:scale-110"
                  style={{
                    background: "rgba(255,255,255,0.05)",
                    color: "var(--text-dim)",
                  }}
                  title="Dismiss"
                >
                  <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            </div>
          )
        })}
        {visible.length === 0 && (
          <div className="text-center py-16">
            <div className="text-[13px] font-medium mb-1" style={{ color: "var(--text-muted)" }}>
              {dismissed.size > 0 ? "All suggestions dismissed" : "No suggestions"}
            </div>
            <div className="text-[11px]" style={{ color: "var(--text-dim)" }}>
              {dismissed.size > 0
                ? "New suggestions will appear here when Claude spots improvements."
                : "Nothing to improve right now."}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
