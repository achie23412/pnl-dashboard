"use client"
import { PageShell } from "@/components/PageShell"

export default function SupplierCasesPage() {
  return (
    <PageShell
      title="Supplier Cases"
      breadcrumb="Supply Chain → Supplier Cases"
      description="Escalated supplier issues: quality disputes, missing shipments, pricing disagreements. Track case progress and resolution."
      stats={[
        { label: "Open cases", value: "1", color: "var(--orange)" },
        { label: "Resolved (30d)", value: "3", color: "var(--green)" },
        { label: "Avg resolution", value: "5 days" },
        { label: "Active suppliers", value: "4" },
      ]}
    >
      <div className="space-y-2">
        <div className="glass rounded-xl px-4 py-3" style={{ borderLeft: "3px solid var(--orange)" }}>
          <div className="flex items-center justify-between mb-1">
            <div className="text-[11px] font-semibold" style={{ color: "var(--text)" }}>Supplier A — Quality dispute on Faux Leather Blazer</div>
            <span className="px-2 py-0.5 rounded-full text-[9px] font-medium" style={{ background: "rgba(249,115,22,0.15)", color: "#f97316" }}>In progress</span>
          </div>
          <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>Opened 2026-11-20. 15.6% quality refund rate. Supplier response pending — requesting replacement batch or credit.</div>
        </div>
      </div>
    </PageShell>
  )
}
