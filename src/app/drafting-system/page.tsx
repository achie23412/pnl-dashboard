"use client"
import { useState, useEffect, useCallback } from "react"
import { PageShell } from "@/components/PageShell"
import { Panel, Badge, Loading, EmptyState, TH, TD, ROW_BORDER } from "@/components/ui"

interface ProductMetrics {
  spend_7d: number; spend_14d: number; spend_30d: number
  clicks_7d: number; clicks_14d: number; clicks_30d: number
  cpc_30d: number
  sales_7d: number; sales_14d: number; sales_30d: number
  revenue_7d: number; revenue_14d: number; revenue_30d: number
  roas_7d: number; roas_14d: number; roas_30d: number
}

interface DraftingCandidate {
  store: string
  product_id: string
  product_title: string
  rule_number: number
  rule_type: "hard" | "review"
  action: "draft" | "raise_price" | "keep"
  reason: string
  metrics: ProductMetrics
}

interface DraftingResponse {
  generated_at: string
  period: { from: string; to: string }
  summary: { total_products: number; actionable: number; draft: number; raise_price: number }
  by_store: Record<string, DraftingCandidate[]>
  errors: string[]
  notes: string[]
}

const HARD_RULES = [
  {
    id: 1,
    situation: "No sale since live, and ad spend since live ≥ spend threshold (€30 or 70% of AOV).",
    action: "Draft now",
    when: "Any day",
  },
  {
    id: 2,
    situation: "Live 90+ days, and fewer than 2 sales in the last 90 days.",
    action: "Draft",
    when: "Any day",
  },
  {
    id: 3,
    situation: "Live 60+ days, and no ad spend and no sale in the last 60 days.",
    action: "Draft",
    when: "Any day",
  },
  {
    id: 4,
    situation: "Has sold, but ad spend since live ≥ €50 and ROAS since live < 1.",
    action: "Draft",
    when: "Any day",
  },
  {
    id: 5,
    situation: "Has sold before, but in the last 30d: spend ≥ €10, ROAS < 1, CPC > €1.05, and no sale in the last 14d.",
    action: "Draft",
    when: "Any day",
  },
]

const REVIEW_RULES = [
  {
    id: 6,
    situation: "Uptrend: ROAS rises from 30d → 14d → 7d (e.g. 1.7 → 2.5 → 3.5).",
    action: "Keep",
    note: "Re-check next week",
  },
  {
    id: 7,
    situation: "ROAS < 2 over 7d or 14d, with ≥ €100 spend in that window.",
    action: "Draft",
    note: "Exception: keep 7 more days, then draft if ROAS still < 2",
  },
  {
    id: 8,
    situation: "30-day ROAS < 1.7.",
    action: "Draft",
    note: "",
  },
  {
    id: 9,
    situation: "Downtrend: ROAS falls from 30d → 14d → 7d, and 30d ROAS is 1.7–2.2.",
    action: "Price +10%",
    note: "Once. Re-check after 7d: draft if ROAS didn't go up",
  },
  {
    id: 10,
    situation: "No sale in 14d, and 7d spend ≤ previous 7d spend.",
    action: "Draft",
    note: "",
  },
  {
    id: 11,
    situation: "None of the above.",
    action: "Keep",
    note: "Re-check next week",
  },
]

const WEEKLY_STEPS = [
  "Open Adgain and note the store’s spend threshold.",
  "Apply hard rules 1–5 to all live products.",
  "Filter the review list (30d spend ≥ threshold, 30d ROAS ≤ 2.2) and apply rules 6–11.",
  "Re-check last week’s price raises and 7-day extensions. No second extension.",
  "Draft in bulk (max 50/store/day). Log product, date and rule number.",
  "Check live product count. Keep adding 10 new products a day.",
]

function RuleRow({ id, situation, action, extra, actionTone }: {
  id: number
  situation: string
  action: string
  extra?: string
  actionTone: "red" | "green" | "amber"
}) {
  return (
    <tr style={ROW_BORDER} className="hover:bg-white/[0.02] transition-colors">
      <td className={`${TD} text-center tabular-nums font-bold`} style={{ color: "var(--text-dim)", width: 40 }}>
        {id}
      </td>
      <td className={TD}>
        <div className="text-[11px]" style={{ color: "var(--text)" }}>{situation}</div>
      </td>
      <td className={`${TD} text-center`} style={{ width: 100 }}>
        <Badge tone={actionTone}>{action}</Badge>
      </td>
      <td className={`${TD} text-[10px]`} style={{ color: "var(--text-dim)", width: 180 }}>
        {extra || "—"}
      </td>
    </tr>
  )
}

function ProductRow({ c }: { c: DraftingCandidate }) {
  const [open, setOpen] = useState(false)
  const m = c.metrics
  const actionTone = c.action === "draft" ? "red" as const : c.action === "raise_price" ? "amber" as const : "green" as const
  const actionLabel = c.action === "draft" ? "Draft" : c.action === "raise_price" ? "Price +10%" : "Keep"

  return (
    <>
      <tr
        style={ROW_BORDER}
        className="hover:bg-white/[0.02] transition-colors cursor-pointer"
        onClick={() => setOpen(!open)}
      >
        <td className={`${TD} text-center tabular-nums font-bold`} style={{ color: "var(--text-dim)", width: 40 }}>
          {c.rule_number}
        </td>
        <td className={TD}>
          <div className="text-[11px] font-medium" style={{ color: "var(--text)" }}>
            {c.product_title}
          </div>
          <div className="text-[10px] mt-0.5" style={{ color: "var(--text-dim)" }}>
            {c.reason}
          </div>
        </td>
        <td className={`${TD} text-center`} style={{ width: 90 }}>
          <Badge tone={actionTone}>{actionLabel}</Badge>
        </td>
        <td className={`${TD} text-right tabular-nums`} style={{ color: "var(--text-muted)", width: 80 }}>
          €{m.spend_30d.toFixed(0)}
        </td>
        <td className={`${TD} text-right tabular-nums`} style={{ color: m.roas_30d >= 2 ? "var(--green)" : m.roas_30d >= 1 ? "var(--text)" : "var(--red)", width: 65 }}>
          {m.roas_30d.toFixed(2)}
        </td>
        <td className={`${TD} text-center`} style={{ width: 30 }}>
          <svg width="10" height="10" viewBox="0 0 16 16" fill="none" style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}>
            <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </td>
      </tr>
      {open && (
        <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
          <td colSpan={6} className="px-3 py-2">
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 text-[10px]">
              {[
                ["Spend 7d", `€${m.spend_7d.toFixed(0)}`],
                ["Spend 14d", `€${m.spend_14d.toFixed(0)}`],
                ["CPC 30d", `€${m.cpc_30d.toFixed(2)}`],
                ["Sales 7d", String(m.sales_7d)],
                ["Sales 14d", String(m.sales_14d)],
                ["Sales 30d", String(m.sales_30d)],
                ["ROAS 7d", m.roas_7d.toFixed(2)],
                ["ROAS 14d", m.roas_14d.toFixed(2)],
                ["Rev 30d", `€${m.revenue_30d.toFixed(0)}`],
                ["Clicks 7d", String(m.clicks_7d)],
                ["Clicks 14d", String(m.clicks_14d)],
                ["Clicks 30d", String(m.clicks_30d)],
              ].map(([label, val]) => (
                <div key={label}>
                  <div style={{ color: "var(--text-dim)" }}>{label}</div>
                  <div className="font-medium tabular-nums" style={{ color: "var(--text)" }}>{val}</div>
                </div>
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

export default function DraftingSystemPage() {
  const [checklist, setChecklist] = useState<boolean[]>(WEEKLY_STEPS.map(() => false))
  const [data, setData] = useState<DraftingResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchProducts = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/drafting-products")
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
      setData(await res.json())
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchProducts() }, [fetchProducts])

  const toggle = (i: number) =>
    setChecklist((prev) => prev.map((v, j) => (j === i ? !v : v)))

  const done = checklist.filter(Boolean).length
  const total = WEEKLY_STEPS.length

  return (
    <PageShell
      title="Drafting System"
      breadcrumb="Front End → Drafting System"
      description="Decide when a product is set to draft. Check from top to bottom: the first rule that matches decides."
      stats={[
        { label: "Hard rules", value: "5" },
        { label: "Review rules", value: "6" },
        { label: "Spend threshold", value: "€30 / 70% AOV" },
        { label: "Need action", value: data ? String(data.summary.actionable) : "—" },
      ]}
    >
      {/* Basics */}
      <Panel title="The basics">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3 text-[11px]">
          <div>
            <div className="font-medium mb-1" style={{ color: "var(--text)" }}>When</div>
            <div style={{ color: "var(--text-muted)" }}>One cleanup a week per store. Rules 1–5 can be applied any day.</div>
          </div>
          <div>
            <div className="font-medium mb-1" style={{ color: "var(--text)" }}>Daily limit</div>
            <div style={{ color: "var(--text-muted)" }}>Max 50 drafts per store per day. Start with the worst performers.</div>
          </div>
          <div>
            <div className="font-medium mb-1" style={{ color: "var(--text)" }}>Spend threshold</div>
            <div style={{ color: "var(--text-muted)" }}>€30, or 70% of the store’s AOV (last 30 days). Choose one per store and keep it.</div>
          </div>
          <div>
            <div className="font-medium mb-1" style={{ color: "var(--text)" }}>New products</div>
            <div style={{ color: "var(--text-muted)" }}>Always import as draft. Publish 10 a day. Never import live.</div>
          </div>
          <div>
            <div className="font-medium mb-1" style={{ color: "var(--text)" }}>Numbers source</div>
            <div style={{ color: "var(--text-muted)" }}>
              All numbers come from{" "}
              <a href="https://app.adgain.io" target="_blank" rel="noopener noreferrer" className="underline decoration-dotted underline-offset-2 hover:decoration-solid" style={{ color: "var(--accent)" }}>
                Adgain
              </a>
              . Code ASCEND50 for 50% off first month.
            </div>
          </div>
          <div>
            <div className="font-medium mb-1" style={{ color: "var(--text)" }}>Catalogue size</div>
            <div style={{ color: "var(--text-muted)" }}>Start with 300–500 live products. Keep the feed from growing too big.</div>
          </div>
        </div>
      </Panel>

      {/* Hard rules 1-5 */}
      <Panel title="Hard rules (1–5) — always draft, no exceptions" pad={false}>
        <table className="w-full text-[11px]">
          <thead>
            <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <th className={`${TH} text-center`} style={{ color: "var(--text-dim)", width: 40 }}>#</th>
              <th className={`${TH} text-left`} style={{ color: "var(--text-dim)" }}>Situation</th>
              <th className={`${TH} text-center`} style={{ color: "var(--text-dim)", width: 100 }}>Action</th>
              <th className={`${TH} text-left`} style={{ color: "var(--text-dim)", width: 180 }}>Note</th>
            </tr>
          </thead>
          <tbody>
            {HARD_RULES.map((r) => (
              <RuleRow
                key={r.id}
                id={r.id}
                situation={r.situation}
                action={r.action}
                actionTone="red"
                extra={r.when}
              />
            ))}
          </tbody>
        </table>
      </Panel>

      {/* Review rules 6-11 */}
      <Panel
        title="Review rules (6–11) — only products on the review list"
        pad={false}
      >
        <div className="px-3 py-2 text-[10px]" style={{ color: "var(--text-dim)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          Review list = 30d spend ≥ threshold AND 30d ROAS ≤ 2.2
        </div>
        <table className="w-full text-[11px]">
          <thead>
            <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <th className={`${TH} text-center`} style={{ color: "var(--text-dim)", width: 40 }}>#</th>
              <th className={`${TH} text-left`} style={{ color: "var(--text-dim)" }}>Situation</th>
              <th className={`${TH} text-center`} style={{ color: "var(--text-dim)", width: 100 }}>Action</th>
              <th className={`${TH} text-left`} style={{ color: "var(--text-dim)", width: 180 }}>Note</th>
            </tr>
          </thead>
          <tbody>
            {REVIEW_RULES.map((r) => (
              <RuleRow
                key={r.id}
                id={r.id}
                situation={r.situation}
                action={r.action}
                actionTone={
                  r.action === "Keep" ? "green" : r.action === "Price +10%" ? "amber" : "red"
                }
                extra={r.note}
              />
            ))}
          </tbody>
        </table>
      </Panel>

      {/* Products needing action */}
      <Panel
        title={
          data
            ? `Products needing action (${data.summary.actionable})`
            : "Products needing action"
        }
        pad={false}
      >
        {loading && (
          <div className="p-6"><Loading /></div>
        )}
        {error && (
          <div className="p-3 text-[11px]" style={{ color: "var(--red)" }}>
            Failed to load: {error}{" "}
            <button onClick={fetchProducts} className="underline" style={{ color: "var(--accent)" }}>Retry</button>
          </div>
        )}
        {data && data.summary.actionable === 0 && !loading && (
          <div className="p-6"><EmptyState title="No products need drafting right now." /></div>
        )}
        {data && data.summary.actionable > 0 && (
          <>
            <div className="px-3 py-2 flex flex-wrap items-center gap-3 text-[10px]" style={{ color: "var(--text-dim)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <span>{data.period.from} — {data.period.to}</span>
              <Badge tone="red">{data.summary.draft} draft</Badge>
              {data.summary.raise_price > 0 && <Badge tone="amber">{data.summary.raise_price} price raise</Badge>}
              <span>{data.summary.total_products} products evaluated</span>
              <button onClick={fetchProducts} className="ml-auto underline decoration-dotted hover:decoration-solid" style={{ color: "var(--accent)" }}>
                Refresh
              </button>
            </div>
            {Object.entries(data.by_store).map(([store, candidates]) => (
              <div key={store}>
                <div className="px-3 py-1.5 text-[10px] font-medium" style={{ color: "var(--accent)", background: "rgba(255,255,255,0.02)" }}>
                  {store} ({candidates.length})
                </div>
                <table className="w-full text-[11px]">
                  <thead>
                    <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                      <th className={`${TH} text-center`} style={{ color: "var(--text-dim)", width: 40 }}>Rule</th>
                      <th className={`${TH} text-left`} style={{ color: "var(--text-dim)" }}>Product</th>
                      <th className={`${TH} text-center`} style={{ color: "var(--text-dim)", width: 90 }}>Action</th>
                      <th className={`${TH} text-right`} style={{ color: "var(--text-dim)", width: 80 }}>Spend 30d</th>
                      <th className={`${TH} text-right`} style={{ color: "var(--text-dim)", width: 65 }}>ROAS</th>
                      <th className={TH} style={{ width: 30 }} />
                    </tr>
                  </thead>
                  <tbody>
                    {candidates.map((c) => (
                      <ProductRow key={`${c.product_id}-${c.rule_number}`} c={c} />
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
            {data.errors.length > 0 && (
              <div className="px-3 py-2 text-[10px]" style={{ color: "var(--text-dim)" }}>
                {data.errors.map((e, i) => <div key={i}>⚠ {e}</div>)}
              </div>
            )}
            {data.notes.length > 0 && (
              <div className="px-3 py-2 text-[10px] space-y-0.5" style={{ color: "var(--text-dim)", borderTop: "1px solid rgba(255,255,255,0.03)" }}>
                {data.notes.map((n, i) => <div key={i}>• {n}</div>)}
              </div>
            )}
          </>
        )}
      </Panel>

      {/* Single variants */}
      <div className="glass rounded-xl p-3">
        <div className="text-[11px] font-medium mb-1" style={{ color: "var(--text)" }}>Single variants</div>
        <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>
          A variant with ≥€30 ad spend since live and ROAS since live &lt; 0.7 is taken out on its own with an Adgain automation. The rest of the product stays live and follows rules 1–11.
        </div>
      </div>

      {/* Exceptions */}
      <Panel title="Exceptions">
        <div className="space-y-3 text-[11px]">
          <div className="flex gap-2">
            <Badge tone="red">No exceptions</Badge>
            <span style={{ color: "var(--text-muted)" }}>Rules 1–4 always mean draft.</span>
          </div>
          <div>
            <span className="font-medium" style={{ color: "var(--text)" }}>Trending / in-demand niche:</span>{" "}
            <span style={{ color: "var(--text-muted)" }}>May stay 7 more days where rules 7–10 say draft. Once. Log the reason.</span>
          </div>
          <div>
            <span className="font-medium" style={{ color: "var(--text)" }}>Seasonal out of season:</span>{" "}
            <span style={{ color: "var(--text-muted)" }}>Draft even with good numbers. Goes live again when season starts. Keep a season calendar.</span>
          </div>
          <div>
            <span className="font-medium" style={{ color: "var(--text)" }}>Store-wide CPC &gt; €1 for 7 days:</span>{" "}
            <span style={{ color: "var(--text-muted)" }}>Don’t use rule 5. The problem is the store, not the product: Domain Switch advised.</span>
          </div>
        </div>
      </Panel>

      {/* Weekly routine checklist */}
      <Panel title={`Weekly routine (${done}/${total})`}>
        <div className="space-y-1">
          {WEEKLY_STEPS.map((step, i) => (
            <button
              key={i}
              onClick={() => toggle(i)}
              className="flex items-center gap-3 w-full text-left px-2 py-1.5 rounded-lg transition-colors hover:bg-white/[0.03]"
            >
              <div
                className="w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors"
                style={{
                  borderColor: checklist[i] ? "var(--green)" : "rgba(255,255,255,0.15)",
                  background: checklist[i] ? "var(--green)" : "transparent",
                }}
              >
                {checklist[i] && (
                  <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
                    <path d="M3 8l3.5 3.5L13 5" stroke="#000" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </div>
              <span
                className="text-[11px]"
                style={{
                  color: checklist[i] ? "var(--text-dim)" : "var(--text)",
                  textDecoration: checklist[i] ? "line-through" : "none",
                }}
              >
                {i + 1}. {step}
              </span>
            </button>
          ))}
        </div>
      </Panel>

      {/* Adgain reference */}
      <Panel title="Adgain — where to find each number">
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead>
              <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                <th className="text-left py-1.5 px-2 font-medium" style={{ color: "var(--text-dim)" }}>What you need</th>
                <th className="text-left py-1.5 px-2 font-medium" style={{ color: "var(--text-dim)" }}>Where in Adgain</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["Ad spend", "Cost, for the date range you set"],
                ["Revenue", "CV (conversion value)"],
                ["Sales", "Qty."],
                ["ROAS (7d / 14d / 30d)", "ROAS 7D, ROAS 14D, ROAS 30D"],
                ["Trend", "Trend, or compare the three ROAS columns"],
                ["CPC", "CPC"],
                ["Live date", "Published"],
                ["Single variants", "Open the product to see each variant"],
                ["Automations", "Automations menu, also per variant (SKU)"],
              ].map(([what, where]) => (
                <tr key={what} style={{ borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                  <td className="py-1.5 px-2 font-medium" style={{ color: "var(--text)" }}>{what}</td>
                  <td className="py-1.5 px-2" style={{ color: "var(--text-muted)" }}>{where}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex gap-2">
          <a
            href="https://app.adgain.io"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-colors hover:brightness-110"
            style={{ background: "rgba(255,255,255,0.08)", color: "var(--text)" }}
          >
            Open Adgain
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
              <path d="M6 3H3.5A1.5 1.5 0 002 4.5v8A1.5 1.5 0 003.5 14h8a1.5 1.5 0 001.5-1.5V10m-4-7h4.5m0 0V7.5m0-4.5L8 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </a>
        </div>
      </Panel>

      <div className="text-[9px] space-y-0.5" style={{ color: "var(--text-dim)" }}>
        <div>• Two rules: decide on numbers, not on feeling, and write down the reason for every draft or exception.</div>
        <div>• Check rules top to bottom. The first rule that matches decides. Stop there.</div>
        <div>• Source: Ascend E-commerce — Drafting System SOP.</div>
      </div>
    </PageShell>
  )
}
