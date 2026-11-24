"use client"
import { PageShell } from "@/components/PageShell"

export default function FulfillmentRisksPage() {
  return (
    <PageShell
      title="Fulfillment Risks"
      breadcrumb="Supply Chain → Fulfillment Risks"
      description="Identify products and suppliers at risk of fulfillment failures: low stock, shipping delays, supplier reliability issues."
      stats={[
        { label: "High risk", value: "1", color: "var(--red)" },
        { label: "Medium risk", value: "3", color: "var(--orange)" },
        { label: "Low risk", value: "44", color: "var(--green)" },
        { label: "Risk score avg", value: "2.1/10" },
      ]}
    >
      <div className="space-y-2">
        <div className="glass rounded-xl px-4 py-3" style={{ borderLeft: "3px solid var(--red)" }}>
          <div className="flex items-center justify-between mb-1">
            <div className="text-[11px] font-semibold" style={{ color: "var(--text)" }}>Women's Faux Leather Blazer — High risk</div>
            <span className="text-[10px] font-medium" style={{ color: "var(--red)" }}>Risk: 8/10</span>
          </div>
          <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>Quality issue ongoing + supplier dispute open. Consider pausing sales until resolved.</div>
        </div>
        <div className="glass rounded-xl px-4 py-3" style={{ borderLeft: "3px solid var(--orange)" }}>
          <div className="flex items-center justify-between mb-1">
            <div className="text-[11px] font-semibold" style={{ color: "var(--text)" }}>Men's Warm Lined Slippers — Medium risk</div>
            <span className="text-[10px] font-medium" style={{ color: "var(--orange)" }}>Risk: 5/10</span>
          </div>
          <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>Avg delivery time increased from 7 to 12 days. Monitor for customer complaints.</div>
        </div>
      </div>
    </PageShell>
  )
}
