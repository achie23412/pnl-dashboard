"use client"
import { PageShell } from "@/components/PageShell"

const CREDITS = [
  { id: "SC-201", customer: "Anna P.", store: "CC", type: "Discount code", amount: "€25.00", status: "To issue", reason: "Quality complaint" },
  { id: "SC-200", customer: "Tom B.", store: "WF", type: "Gift card", amount: "€40.00", status: "Issued", reason: "Late delivery" },
  { id: "SC-199", customer: "Eve R.", store: "SA", type: "Discount code", amount: "€15.00", status: "Used", reason: "Partial refund alternative" },
]

export default function StoreCreditPage() {
  return (
    <PageShell
      title="Store Credit"
      breadcrumb="Customer Service → Store Credit"
      description="Discount codes and gift cards issued to customers. Track status: To issue → Issued → Used."
      stats={[
        { label: "To issue", value: "1", color: "var(--orange)" },
        { label: "Active (issued)", value: "1" },
        { label: "Used (30d)", value: "5" },
        { label: "Total value issued", value: "€340" },
      ]}
      tabs={[
        { label: "To issue", count: 1, active: true },
        { label: "Issued", count: 1 },
        { label: "Used", count: 5 },
        { label: "Add credit" },
      ]}
    >
      <div className="glass rounded-xl overflow-hidden">
        <table className="w-full text-[11px]">
          <thead>
            <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              {["ID", "Customer", "Store", "Type", "Amount", "Status", "Reason"].map((h) => (
                <th key={h} className="px-3 py-2.5 text-left font-semibold" style={{ color: "var(--text-muted)" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {CREDITS.map((c) => (
              <tr key={c.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                <td className="px-3 py-2.5 font-mono text-[10px]" style={{ color: "var(--accent)" }}>{c.id}</td>
                <td className="px-3 py-2.5" style={{ color: "var(--text)" }}>{c.customer}</td>
                <td className="px-3 py-2.5" style={{ color: "var(--text-muted)" }}>{c.store}</td>
                <td className="px-3 py-2.5" style={{ color: "var(--text-muted)" }}>{c.type}</td>
                <td className="px-3 py-2.5 font-medium" style={{ color: "var(--text)" }}>{c.amount}</td>
                <td className="px-3 py-2.5">
                  <span className="px-2 py-0.5 rounded-full text-[9px] font-medium" style={{
                    background: c.status === "To issue" ? "rgba(249,115,22,0.15)" : c.status === "Issued" ? "rgba(59,130,246,0.15)" : "rgba(34,197,94,0.15)",
                    color: c.status === "To issue" ? "#f97316" : c.status === "Issued" ? "#3b82f6" : "#22c55e",
                  }}>{c.status}</span>
                </td>
                <td className="px-3 py-2.5" style={{ color: "var(--text-muted)" }}>{c.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </PageShell>
  )
}
