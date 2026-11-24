"use client"
import { PageShell } from "@/components/PageShell"

const ISSUES = [
  { order: "#4521", store: "CC", issue: "Wrong item shipped", supplier: "Supplier A", date: "2026-11-22", status: "Open", age: "2d" },
  { order: "#4518", store: "WF", issue: "Missing item in package", supplier: "Supplier B", date: "2026-11-21", status: "Supplier contacted", age: "3d" },
  { order: "#4510", store: "SA", issue: "Tracking not updating", supplier: "Supplier A", date: "2026-11-19", status: "Resolved", age: "5d" },
]

export default function OrderIssuesPage() {
  return (
    <PageShell
      title="Order Issues"
      breadcrumb="Supply Chain → Order Issues"
      description="Track order-level problems: wrong items, missing items, damaged goods, tracking failures."
      stats={[
        { label: "Open issues", value: "2", color: "var(--orange)" },
        { label: "Resolved (30d)", value: "8" },
        { label: "Avg resolution", value: "3.2 days" },
        { label: "Supplier A issues", value: "5", color: "var(--red)" },
      ]}
    >
      <div className="glass rounded-xl overflow-hidden">
        <table className="w-full text-[11px]">
          <thead>
            <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              {["Order", "Store", "Issue", "Supplier", "Date", "Age", "Status"].map((h) => (
                <th key={h} className="px-3 py-2.5 text-left font-semibold" style={{ color: "var(--text-muted)" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ISSUES.map((r, i) => (
              <tr key={i} style={{ borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                <td className="px-3 py-2.5 font-mono text-[10px]" style={{ color: "var(--accent)" }}>{r.order}</td>
                <td className="px-3 py-2.5" style={{ color: "var(--text-muted)" }}>{r.store}</td>
                <td className="px-3 py-2.5 font-medium" style={{ color: "var(--text)" }}>{r.issue}</td>
                <td className="px-3 py-2.5" style={{ color: "var(--text-muted)" }}>{r.supplier}</td>
                <td className="px-3 py-2.5" style={{ color: "var(--text-muted)" }}>{r.date}</td>
                <td className="px-3 py-2.5" style={{ color: "var(--text-muted)" }}>{r.age}</td>
                <td className="px-3 py-2.5">
                  <span className="px-2 py-0.5 rounded-full text-[9px] font-medium" style={{
                    background: r.status === "Open" ? "rgba(239,68,68,0.15)" : r.status === "Supplier contacted" ? "rgba(249,115,22,0.15)" : "rgba(34,197,94,0.15)",
                    color: r.status === "Open" ? "#ef4444" : r.status === "Supplier contacted" ? "#f97316" : "#22c55e",
                  }}>{r.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </PageShell>
  )
}
