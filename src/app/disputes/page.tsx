"use client"
import { PageShell } from "@/components/PageShell"

const DISPUTES = [
  { id: "CB-301", store: "CC", order: "#4480", amount: "€89.00", reason: "Item not received", deadline: "2026-12-05", status: "To fight", evidence: "Pending" },
  { id: "CB-300", store: "SA", order: "#4412", amount: "€124.00", reason: "Not as described", deadline: "2026-11-28", status: "Waiting", evidence: "Submitted" },
  { id: "CB-299", store: "WF", order: "#4350", amount: "€67.00", reason: "Unauthorized", deadline: "—", status: "Won", evidence: "Accepted" },
  { id: "CB-298", store: "CC", order: "#4290", amount: "€45.00", reason: "Item not received", deadline: "—", status: "Lost", evidence: "Rejected" },
]

export default function DisputesPage() {
  return (
    <PageShell
      title="Disputes & Chargebacks"
      breadcrumb="Disputes & Chargebacks"
      description="Shopify chargebacks via Disputifier. Fight, track evidence, monitor deadlines. Upload alert CSV for bulk import."
      stats={[
        { label: "To fight", value: "1", color: "var(--red)" },
        { label: "Waiting", value: "1", color: "var(--orange)" },
        { label: "Won (90d)", value: "5", color: "var(--green)" },
        { label: "Lost (90d)", value: "2" },
      ]}
      tabs={[
        { label: "To fight", count: 1, active: true },
        { label: "Waiting", count: 1 },
        { label: "Won", count: 5 },
        { label: "Lost", count: 2 },
      ]}
    >
      <div className="glass rounded-xl overflow-hidden">
        <table className="w-full text-[11px]">
          <thead>
            <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              {["ID", "Store", "Order", "Amount", "Reason", "Deadline", "Status", "Evidence"].map((h) => (
                <th key={h} className="px-3 py-2.5 text-left font-semibold" style={{ color: "var(--text-muted)" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {DISPUTES.map((d) => (
              <tr key={d.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                <td className="px-3 py-2.5 font-mono text-[10px]" style={{ color: "var(--accent)" }}>{d.id}</td>
                <td className="px-3 py-2.5" style={{ color: "var(--text-muted)" }}>{d.store}</td>
                <td className="px-3 py-2.5" style={{ color: "var(--text-muted)" }}>{d.order}</td>
                <td className="px-3 py-2.5 font-medium" style={{ color: "var(--text)" }}>{d.amount}</td>
                <td className="px-3 py-2.5" style={{ color: "var(--text-muted)" }}>{d.reason}</td>
                <td className="px-3 py-2.5" style={{ color: d.deadline !== "—" ? "var(--orange)" : "var(--text-dim)" }}>{d.deadline}</td>
                <td className="px-3 py-2.5">
                  <span className="px-2 py-0.5 rounded-full text-[9px] font-medium" style={{
                    background: d.status === "To fight" ? "rgba(239,68,68,0.15)" : d.status === "Waiting" ? "rgba(249,115,22,0.15)" : d.status === "Won" ? "rgba(34,197,94,0.15)" : "rgba(148,163,184,0.15)",
                    color: d.status === "To fight" ? "#ef4444" : d.status === "Waiting" ? "#f97316" : d.status === "Won" ? "#22c55e" : "#94a3b8",
                  }}>{d.status}</span>
                </td>
                <td className="px-3 py-2.5" style={{ color: "var(--text-muted)" }}>{d.evidence}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </PageShell>
  )
}
