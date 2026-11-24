"use client"
import { PageShell } from "@/components/PageShell"

const DEMO = [
  { product: "Women's Block Heel Ankle Boots", units: 251, revenue: "€8,120", refundRate: "6.3%", margin: "42%", trend: "up" },
  { product: "Men's Sherpa Lined Corduroy Jacket", units: 189, revenue: "€6,340", refundRate: "4.1%", margin: "38%", trend: "up" },
  { product: "Women's Wedding Guest Maxi Dress", units: 152, revenue: "€5,290", refundRate: "10.5%", margin: "35%", trend: "down" },
  { product: "Men's Warm Lined Slippers", units: 150, revenue: "€3,210", refundRate: "7.3%", margin: "45%", trend: "flat" },
  { product: "Women's Cable Knit Cardigan", units: 174, revenue: "€4,870", refundRate: "5.0%", margin: "31%", trend: "up" },
]

export default function ProductPerformancePage() {
  return (
    <PageShell
      title="Product Performance"
      breadcrumb="Front End → Product Performance"
      description="Every product ranked by contribution margin. Click a row to see its daily trend, refund breakdown and ad sets."
      stats={[
        { label: "Total products", value: "48" },
        { label: "Live", value: "34", color: "var(--green)" },
        { label: "Top performer", value: "Ankle Boots" },
        { label: "Avg refund rate", value: "5.2%" },
      ]}
    >
      <div className="glass rounded-xl overflow-hidden">
        <table className="w-full text-[11px]">
          <thead>
            <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              {["Product", "Units", "Revenue", "Refund %", "Margin", "Trend"].map((h) => (
                <th key={h} className="px-3 py-2.5 text-left font-semibold" style={{ color: "var(--text-muted)" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {DEMO.map((r, i) => (
              <tr key={i} style={{ borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                <td className="px-3 py-2 font-medium" style={{ color: "var(--text)" }}>{r.product}</td>
                <td className="px-3 py-2" style={{ color: "var(--text)" }}>{r.units}</td>
                <td className="px-3 py-2" style={{ color: "var(--green)" }}>{r.revenue}</td>
                <td className="px-3 py-2" style={{ color: parseFloat(r.refundRate) > 8 ? "var(--red)" : "var(--text)" }}>{r.refundRate}</td>
                <td className="px-3 py-2" style={{ color: "var(--text)" }}>{r.margin}</td>
                <td className="px-3 py-2">{r.trend === "up" ? "↑" : r.trend === "down" ? "↓" : "→"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </PageShell>
  )
}
