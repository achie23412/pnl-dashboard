"use client"
import { useState } from "react"
import { PageShell } from "@/components/PageShell"
import { FilterBar } from "@/components/PillSelect"
import { FilterSelect, EMPTY_FILTER, passes, type FilterValue } from "@/components/FilterSelect"
import { Panel, Badge, Button, EmptyState } from "@/components/ui"

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
    title: "Add Lume and Blinky to the profit sheet",
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

const PRIORITY_CONFIG: Record<Priority, { label: string; tone: "red" | "amber" | "blue" }> = {
  high: { label: "High", tone: "red" },
  medium: { label: "Medium", tone: "amber" },
  low: { label: "Low", tone: "blue" },
}

const CATEGORY_LABEL: Record<Category, string> = {
  data: "Data",
  automation: "Automation",
  dashboard: "Dashboard",
  tracking: "Tracking",
}

const fmtDay = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })

export default function AdvisorPage() {
  const [filter, setFilter] = useState<FilterValue>(EMPTY_FILTER)
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())

  const visible = SUGGESTIONS.filter(
    (s) => !dismissed.has(s.id) && passes(filter, s.priority)
  )
  const highCount = SUGGESTIONS.filter((s) => !dismissed.has(s.id) && s.priority === "high").length
  const medCount = SUGGESTIONS.filter((s) => !dismissed.has(s.id) && s.priority === "medium").length
  const lowCount = SUGGESTIONS.filter((s) => !dismissed.has(s.id) && s.priority === "low").length

  return (
    <PageShell
      title="Advisor"
      breadcrumb="Advisor"
      description="Improvements suggested by Claude. Each item would make the dashboard, data pipeline or automation more accurate or complete."
      stats={[
        { label: "High priority", value: String(highCount), color: highCount ? "var(--red)" : undefined },
        { label: "Medium priority", value: String(medCount) },
        { label: "Low priority", value: String(lowCount) },
      ]}
    >
      <FilterBar right={<span className="text-[10px]" style={{ color: "var(--text-dim)" }}>{visible.length} suggestion{visible.length !== 1 ? "s" : ""}</span>}>
        <FilterSelect
          label="Priority"
          options={[
            { value: "high", label: "High", count: highCount },
            { value: "medium", label: "Medium", count: medCount },
            { value: "low", label: "Low", count: lowCount },
          ]}
          value={filter}
          onChange={setFilter}
        />
      </FilterBar>

      {/* Suggestion cards */}
      <div className="space-y-3">
        {visible.map((s) => {
          const prio = PRIORITY_CONFIG[s.priority]
          return (
            <Panel key={s.id}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5">
                    <Badge tone={prio.tone}>{prio.label}</Badge>
                    <Badge>{CATEGORY_LABEL[s.category]}</Badge>
                    <span className="text-[9px]" style={{ color: "var(--text-dim)" }}>
                      Added {fmtDay(s.addedDate)}
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
                      <span className="font-semibold" style={{ color: "var(--text)" }}>
                        What to do:
                      </span>{" "}
                      {s.action}
                    </div>
                  )}
                  <div className="text-[10px]" style={{ color: "var(--text-dim)" }}>
                    <span className="font-semibold">Impact:</span> {s.impact}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setDismissed((prev) => { const next = new Set(Array.from(prev)); next.add(s.id); return next })}
                  title="Dismiss"
                >
                  Dismiss
                </Button>
              </div>
            </Panel>
          )
        })}
        {visible.length === 0 && (
          <EmptyState title={dismissed.size > 0 ? "All suggestions dismissed" : "No suggestions"}>
            {dismissed.size > 0
              ? "New suggestions will show here when Claude spots improvements."
              : "Nothing to improve right now."}
          </EmptyState>
        )}
      </div>
    </PageShell>
  )
}
