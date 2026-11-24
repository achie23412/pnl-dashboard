"use client"
import { PageShell } from "@/components/PageShell"

const WORKFLOWS = [
  {
    name: "New Refund Request",
    trigger: "Customer contacts CS about a refund",
    steps: ["Check order & product", "Offer store credit first", "If declined, process refund", "Log reason", "Update refund sheet"],
    status: "active",
  },
  {
    name: "Quality Flag",
    trigger: "Product hits ≥10% quality refund rate + ≥20 units",
    steps: ["Auto-flag on Quality Checks", "CS asks supplier for evidence", "Owner reviews", "Decision: keep/fix/draft"],
    status: "active",
  },
  {
    name: "Chargeback Response",
    trigger: "New chargeback from Disputifier",
    steps: ["CS fills specific reason & summary", "Collect evidence", "Submit to Disputifier/Shopify", "Track deadline"],
    status: "active",
  },
  {
    name: "Price Deduction Request",
    trigger: "Product passes 20/60/120 unit threshold",
    steps: ["Auto-create deduction row", "CS messages supplier", "Log new price when agreed", "Verify on next invoice"],
    status: "active",
  },
  {
    name: "Daily Report",
    trigger: "Every day at 07:00 after data refresh",
    steps: ["Pull revenue from all stores", "Pull ad spend", "Calculate P&L", "Post to Daily Report"],
    status: "active",
  },
]

export default function WorkflowsPage() {
  return (
    <PageShell
      title="Workflows"
      breadcrumb="Workflows"
      description="Automated and semi-automated workflows that keep the business running. Each workflow has a trigger, steps, and an owner."
    >
      <div className="p-6 space-y-4">
        {WORKFLOWS.map((wf) => (
          <div
            key={wf.name}
            className="rounded-xl p-5"
            style={{
              background: "rgba(255,255,255,0.02)",
              border: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="text-[13px] font-semibold" style={{ color: "var(--text)" }}>{wf.name}</div>
              <span
                className="px-2 py-0.5 rounded-full text-[9px] font-medium"
                style={{ background: "rgba(34,197,94,0.15)", color: "#22c55e" }}
              >
                {wf.status}
              </span>
            </div>
            <div className="text-[10px] mb-3" style={{ color: "var(--text-dim)" }}>
              Trigger: {wf.trigger}
            </div>
            <div className="flex gap-2 flex-wrap">
              {wf.steps.map((step, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <div
                    className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold"
                    style={{ background: "rgba(99,102,241,0.15)", color: "#6366f1" }}
                  >
                    {i + 1}
                  </div>
                  <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>{step}</span>
                  {i < wf.steps.length - 1 && (
                    <span className="text-[10px] mx-1" style={{ color: "var(--text-dim)" }}>→</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </PageShell>
  )
}
