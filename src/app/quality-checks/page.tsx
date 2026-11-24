"use client"
import { PageShell } from "@/components/PageShell"

const FLAGGED = [
  { product: "Women's Faux Leather Blazer", store: "CC", units: 32, qualityRefunds: 5, rate: "15.6%", supplier: "Supplier A", status: "Flagged" },
  { product: "Men's Sherpa Lined Jacket", store: "WF", units: 28, qualityRefunds: 4, rate: "14.3%", supplier: "Supplier B", status: "Awaiting answer" },
  { product: "Women's Cable Knit Scarf", store: "BK", units: 22, qualityRefunds: 3, rate: "13.6%", supplier: "Supplier A", status: "Resolved" },
]

export default function QualityChecksPage() {
  return (
    <PageShell
      title="Quality Checks"
      breadcrumb="Customer Service → Quality Checks"
      description="Products flagged at 10%+ quality refund rate with 20+ units sold. Tracks supplier answers and visual match %."
      stats={[
        { label: "Flagged products", value: "2", color: "var(--red)" },
        { label: "Awaiting supplier", value: "1", color: "var(--orange)" },
        { label: "Resolved (30d)", value: "3" },
        { label: "Min units to flag", value: "20" },
      ]}
    >
      <div className="glass rounded-xl overflow-hidden">
        <table className="w-full text-[11px]">
          <thead>
            <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              {["Product", "Store", "Units", "Quality refunds", "Rate", "Supplier", "Status"].map((h) => (
                <th key={h} className="px-3 py-2.5 text-left font-semibold" style={{ color: "var(--text-muted)" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {FLAGGED.map((p, i) => (
              <tr key={i} style={{ borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                <td className="px-3 py-2.5 font-medium" style={{ color: "var(--text)" }}>{p.product}</td>
                <td className="px-3 py-2.5" style={{ color: "var(--text-muted)" }}>{p.store}</td>
                <td className="px-3 py-2.5" style={{ color: "var(--text-muted)" }}>{p.units}</td>
                <td className="px-3 py-2.5" style={{ color: "var(--red)" }}>{p.qualityRefunds}</td>
                <td className="px-3 py-2.5 font-medium" style={{ color: "var(--red)" }}>{p.rate}</td>
                <td className="px-3 py-2.5" style={{ color: "var(--text-muted)" }}>{p.supplier}</td>
                <td className="px-3 py-2.5">
                  <span className="px-2 py-0.5 rounded-full text-[9px] font-medium" style={{
                    background: p.status === "Flagged" ? "rgba(239,68,68,0.15)" : p.status === "Awaiting answer" ? "rgba(249,115,22,0.15)" : "rgba(34,197,94,0.15)",
                    color: p.status === "Flagged" ? "#ef4444" : p.status === "Awaiting answer" ? "#f97316" : "#22c55e",
                  }}>{p.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </PageShell>
  )
}
