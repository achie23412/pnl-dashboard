"use client"
import { useEffect, useState } from "react"
import { PageShell } from "@/components/PageShell"
import { FilterBar } from "@/components/PillSelect"
import { FilterSelect, EMPTY_FILTER, passes, type FilterValue } from "@/components/FilterSelect"
import { Panel, Badge, Button, EmptyState, Notice } from "@/components/ui"

type Priority = "high" | "medium" | "low"
type Category = "data" | "automation" | "dashboard" | "tracking" | "security"

interface Suggestion {
  id: string
  title: string
  description: string
  priority: Priority
  category: Category
  action?: string
  impact: string
}

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
  security: "Security",
}

export default function AdvisorPage() {
  const [filter, setFilter] = useState<FilterValue>(EMPTY_FILTER)
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  const [items, setItems] = useState<Suggestion[]>([])
  const [checkedAt, setCheckedAt] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch("/api/advisor", { cache: "no-store" })
      .then(async (r) => {
        const j = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`)
        setItems(j.items || [])
        setCheckedAt(j.checkedAt || null)
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false))
  }, [])

  const visible = items.filter(
    (s) => !dismissed.has(s.id) && passes(filter, s.priority)
  )
  const highCount = items.filter((s) => !dismissed.has(s.id) && s.priority === "high").length
  const medCount = items.filter((s) => !dismissed.has(s.id) && s.priority === "medium").length
  const lowCount = items.filter((s) => !dismissed.has(s.id) && s.priority === "low").length

  return (
    <PageShell
      title="Advisor"
      breadcrumb="Advisor"
      description={`Live checks of the data, refreshes and setup. Each item is something that's missing or broken right now${checkedAt ? ` (checked ${new Date(checkedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })})` : ""}.`}
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

      {error && <Notice tone="error">Couldn't run the checks: {error}</Notice>}
      {loading && <Notice tone="info">Running checks…</Notice>}

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
        {!loading && !error && visible.length === 0 && (
          <EmptyState title={dismissed.size > 0 ? "All suggestions dismissed" : "No suggestions"}>
            {dismissed.size > 0
              ? "Dismissed items come back on the next visit if they're still a problem."
              : "All checks pass: data is fresh and the setup is complete."}
          </EmptyState>
        )}
      </div>
    </PageShell>
  )
}
