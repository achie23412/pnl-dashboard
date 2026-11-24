"use client"
import { PageShell } from "@/components/PageShell"

const QUEUE = [
  { supplier: "Supplier A", date: "2026-11-20", items: 15, total: "$1,245.00", status: "Needs confirmation" },
  { supplier: "Supplier B", date: "2026-11-18", items: 8, total: "$780.50", status: "Confirmed" },
  { supplier: "Supplier C", date: "2026-11-15", items: 22, total: "$2,100.00", status: "Confirmed" },
]

export default function COGSInvoicesPage() {
  return (
    <PageShell
      title="COGS Invoices"
      breadcrumb="Finance → COGS Invoices"
      description="Supplier invoice confirmation workflow. Paste a supplier message or upload a PDF to parse COGS. Track confirmation status and audit COGS changes."
      stats={[
        { label: "Pending confirmation", value: "1", color: "var(--orange)" },
        { label: "Confirmed this month", value: "2" },
        { label: "Total invoiced", value: "$4,125" },
        { label: "COGS changes (7d)", value: "3" },
      ]}
      tabs={[
        { label: "Needs confirmation", count: 1, active: true },
        { label: "Confirmed", count: 2 },
        { label: "Audit log" },
      ]}
    >
      <div className="glass rounded-xl p-4 mb-4">
        <div className="text-[12px] font-semibold mb-3" style={{ color: "var(--text)" }}>Parse supplier message</div>
        <textarea className="w-full bg-transparent border rounded-lg px-3 py-2 text-[11px] h-20 resize-none" style={{ borderColor: "rgba(255,255,255,0.08)", color: "var(--text)" }} placeholder="Paste supplier message here to extract COGS data..." />
        <div className="flex gap-2 mt-2">
          <button className="px-4 py-1.5 rounded-lg text-[11px] font-medium" style={{ background: "var(--accent)", color: "#fff" }}>Parse message</button>
          <button className="px-4 py-1.5 rounded-lg text-[11px] font-medium" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", color: "var(--text-muted)" }}>Upload PDF</button>
        </div>
      </div>
      <div className="glass rounded-xl overflow-hidden">
        <table className="w-full text-[11px]">
          <thead>
            <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              {["Supplier", "Date", "Items", "Total", "Status"].map((h) => (
                <th key={h} className="px-4 py-2.5 text-left font-semibold" style={{ color: "var(--text-muted)" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {QUEUE.map((r, i) => (
              <tr key={i} style={{ borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                <td className="px-4 py-2.5 font-medium" style={{ color: "var(--text)" }}>{r.supplier}</td>
                <td className="px-4 py-2.5" style={{ color: "var(--text-muted)" }}>{r.date}</td>
                <td className="px-4 py-2.5" style={{ color: "var(--text-muted)" }}>{r.items}</td>
                <td className="px-4 py-2.5" style={{ color: "var(--text)" }}>{r.total}</td>
                <td className="px-4 py-2.5">
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-medium" style={{
                    background: r.status === "Needs confirmation" ? "rgba(249,115,22,0.15)" : "rgba(34,197,94,0.15)",
                    color: r.status === "Needs confirmation" ? "#f97316" : "#22c55e",
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
