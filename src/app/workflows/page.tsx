"use client"
import { PageShell } from "@/components/PageShell"

export default function WorkflowsPage() {
  return (
    <PageShell
      title="Workflows"
      breadcrumb="Workflows"
      description="Automated workflows and task sequences. Set up triggers for refund processing, quality alerts, supplier notifications, and more."
      stats={[
        { label: "Active workflows", value: "—" },
        { label: "Runs today", value: "—" },
        { label: "Failed", value: "—" },
        { label: "Last run", value: "—" },
      ]}
    >
      <div className="space-y-2">
        {[
          { name: "Quality alert trigger", desc: "Flags product when quality refund rate hits 10% with 20+ units", runs: "On refund", status: "Active" },
          { name: "Risky product notification", desc: "Notifies supplier when 2+ complaints in 7 days", runs: "On complaint", status: "Active" },
          { name: "Refund approval routing", desc: "Routes refunds over €100 to owner for approval", runs: "On refund submit", status: "Active" },
          { name: "Daily P&L sync", desc: "Pulls revenue, spend, and COGS data for daily report", runs: "Daily 07:00", status: "Active" },
        ].map((w, i) => (
          <div key={i} className="glass rounded-xl px-4 py-3 flex items-center gap-4">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "rgba(99,102,241,0.15)" }}>
              <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--accent)" }}>
                <polyline points="22,12 18,12 15,21 9,3 6,12 2,12" />
              </svg>
            </div>
            <div className="flex-1">
              <div className="text-[11px] font-semibold" style={{ color: "var(--text)" }}>{w.name}</div>
              <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>{w.desc}</div>
            </div>
            <div className="text-[10px]" style={{ color: "var(--text-dim)" }}>{w.runs}</div>
            <span className="px-2 py-0.5 rounded-full text-[9px] font-medium" style={{ background: "rgba(34,197,94,0.15)", color: "#22c55e" }}>{w.status}</span>
          </div>
        ))}
      </div>
    </PageShell>
  )
}
