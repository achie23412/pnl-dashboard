"use client"
import { PageShell } from "@/components/PageShell"

const TICKETS = [
  { id: "CS-1042", customer: "John D.", store: "CC", subject: "Wrong size received", sla: "1h 20m", priority: "High", status: "Open" },
  { id: "CS-1041", customer: "Sarah M.", store: "WF", subject: "Order not arrived", sla: "2h 45m", priority: "Medium", status: "Open" },
  { id: "CS-1040", customer: "Mike R.", store: "SA", subject: "Refund request", sla: "3h 10m", priority: "High", status: "In progress" },
  { id: "CS-1039", customer: "Lisa K.", store: "BK", subject: "Product quality complaint", sla: "0h 50m", priority: "Urgent", status: "Open" },
]

export default function InboxQueuePage() {
  return (
    <PageShell
      title="Inbox Queue"
      breadcrumb="Customer Service → Inbox Queue"
      description="All open CS tickets across stores. 4-hour SLA target. Oldest first."
      stats={[
        { label: "Open tickets", value: "4", color: "var(--orange)" },
        { label: "Avg response time", value: "2h 1m" },
        { label: "SLA breached", value: "0", color: "var(--green)" },
        { label: "Resolved today", value: "7" },
      ]}
    >
      <div className="glass rounded-xl overflow-hidden">
        <table className="w-full text-[11px]">
          <thead>
            <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              {["ID", "Customer", "Store", "Subject", "SLA left", "Priority", "Status"].map((h) => (
                <th key={h} className="px-3 py-2.5 text-left font-semibold" style={{ color: "var(--text-muted)" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {TICKETS.map((t) => (
              <tr key={t.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                <td className="px-3 py-2.5 font-mono text-[10px]" style={{ color: "var(--accent)" }}>{t.id}</td>
                <td className="px-3 py-2.5" style={{ color: "var(--text)" }}>{t.customer}</td>
                <td className="px-3 py-2.5" style={{ color: "var(--text-muted)" }}>{t.store}</td>
                <td className="px-3 py-2.5" style={{ color: "var(--text)" }}>{t.subject}</td>
                <td className="px-3 py-2.5" style={{ color: parseFloat(t.sla) < 1.5 ? "var(--red)" : "var(--text-muted)" }}>{t.sla}</td>
                <td className="px-3 py-2.5">
                  <span className="px-2 py-0.5 rounded-full text-[9px] font-medium" style={{
                    background: t.priority === "Urgent" ? "rgba(239,68,68,0.15)" : t.priority === "High" ? "rgba(249,115,22,0.15)" : "rgba(148,163,184,0.15)",
                    color: t.priority === "Urgent" ? "#ef4444" : t.priority === "High" ? "#f97316" : "#94a3b8",
                  }}>{t.priority}</span>
                </td>
                <td className="px-3 py-2.5">
                  <span className="px-2 py-0.5 rounded-full text-[9px] font-medium" style={{
                    background: t.status === "In progress" ? "rgba(59,130,246,0.15)" : "rgba(249,115,22,0.15)",
                    color: t.status === "In progress" ? "#3b82f6" : "#f97316",
                  }}>{t.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </PageShell>
  )
}
