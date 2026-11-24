"use client"
import { PageShell } from "@/components/PageShell"

export default function CSReportsPage() {
  return (
    <PageShell
      title="CS Reports"
      breadcrumb="Customer Service → Reports"
      description="Refund rate per store, per reason breakdown, funnel acceptance rate, store credit report, refund by collection."
      stats={[
        { label: "Avg acceptance rate", value: "78%", color: "var(--green)" },
        { label: "Top reason", value: "Wrong size" },
        { label: "Highest refund store", value: "SA (5.1%)" },
        { label: "Store credits used", value: "€210" },
      ]}
      tabs={[
        { label: "By store", active: true },
        { label: "By reason" },
        { label: "By collection" },
        { label: "Store credit" },
      ]}
    >
      <div className="glass rounded-xl p-6">
        <div className="text-center py-8">
          <div className="text-[13px] font-medium mb-1" style={{ color: "var(--text-muted)" }}>Reports will populate from refund data</div>
          <div className="text-[11px]" style={{ color: "var(--text-dim)" }}>Charts and breakdowns appear as refund records are added.</div>
        </div>
      </div>
    </PageShell>
  )
}
