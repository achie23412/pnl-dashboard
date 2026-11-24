"use client"
import { PageShell } from "@/components/PageShell"

const CAUSES = [
  { reason: "Wrong size", count: 12, pct: "28%", trend: "↑" },
  { reason: "Quality issue", count: 8, pct: "19%", trend: "→" },
  { reason: "Not as described", count: 7, pct: "16%", trend: "↓" },
  { reason: "Changed mind", count: 6, pct: "14%", trend: "→" },
  { reason: "Late delivery", count: 5, pct: "12%", trend: "↑" },
  { reason: "Damaged in transit", count: 5, pct: "12%", trend: "→" },
]

export default function RefundReportPage() {
  return (
    <PageShell
      title="Refund Report"
      breadcrumb="Finance → Refund Report"
      description="Refund rate by cause, store and product. Target: stay below 5%."
      stats={[
        { label: "Overall refund rate", value: "4.1%", color: "var(--green)" },
        { label: "Total refunds (30d)", value: "43" },
        { label: "Refund value", value: "€2,890" },
        { label: "Target", value: "< 5%" },
      ]}
      tabs={[
        { label: "7 days", active: false },
        { label: "30 days", active: true },
        { label: "90 days", active: false },
      ]}
    >
      <div className="glass rounded-xl overflow-hidden">
        <table className="w-full text-[11px]">
          <thead>
            <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              {["Reason", "Count", "% of total", "Trend"].map((h) => (
                <th key={h} className="px-4 py-2.5 text-left font-semibold" style={{ color: "var(--text-muted)" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {CAUSES.map((c) => (
              <tr key={c.reason} style={{ borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                <td className="px-4 py-2.5 font-medium" style={{ color: "var(--text)" }}>{c.reason}</td>
                <td className="px-4 py-2.5" style={{ color: "var(--text-muted)" }}>{c.count}</td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <div className="w-16 h-1.5 rounded-full" style={{ background: "rgba(255,255,255,0.06)" }}>
                      <div className="h-full rounded-full" style={{ width: c.pct, background: "var(--accent)" }} />
                    </div>
                    <span style={{ color: "var(--text-muted)" }}>{c.pct}</span>
                  </div>
                </td>
                <td className="px-4 py-2.5" style={{ color: c.trend === "↑" ? "var(--red)" : c.trend === "↓" ? "var(--green)" : "var(--text-dim)" }}>{c.trend}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </PageShell>
  )
}
