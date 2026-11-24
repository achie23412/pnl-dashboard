"use client"
import { PageShell } from "@/components/PageShell"

export default function RiskyProductsPage() {
  return (
    <PageShell
      title="Risky Products"
      breadcrumb="Customer Service → Risky Products"
      description="Early warning: products with 2+ complaints in 7 days. Triggers supplier notification."
      stats={[
        { label: "Risky now", value: "—" },
        { label: "Supplier notified", value: "—" },
        { label: "Cleared (30d)", value: "—" },
        { label: "Threshold", value: "—" },
      ]}
    >
      <div className="space-y-2">
        <div className="glass rounded-xl px-4 py-3 flex items-center gap-3" style={{ borderLeft: "3px solid var(--red)" }}>
          <div className="flex-1">
            <div className="text-[11px] font-semibold" style={{ color: "var(--text)" }}>Women's Faux Leather Blazer</div>
            <div className="text-[10px] mt-0.5" style={{ color: "var(--text-muted)" }}>3 complaints in 5 days — quality issue, peeling reported. Supplier A notified 2026-11-22.</div>
          </div>
          <span className="px-2 py-0.5 rounded-full text-[9px] font-bold" style={{ background: "rgba(239,68,68,0.15)", color: "#ef4444" }}>Active</span>
        </div>
      </div>
    </PageShell>
  )
}
