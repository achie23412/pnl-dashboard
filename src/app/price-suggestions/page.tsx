"use client"
import { PageShell } from "@/components/PageShell"

const DEMO = [
  { product: "Women's Block Heel Ankle Boots", current: "€54.95", suggested: "€59.95", reason: "High demand, low refund rate", margin: "+3.2%" },
  { product: "Men's Warm Lined Slippers", current: "€29.95", suggested: "€34.95", reason: "Competitor avg is €37", margin: "+5.1%" },
  { product: "Women's Cable Knit Cardigan", current: "€44.95", suggested: "€39.95", reason: "High refund rate, reduce price", margin: "-2.8%" },
]

export default function PriceSuggestionsPage() {
  return (
    <PageShell
      title="Price Suggestions"
      breadcrumb="Front End → Price Suggestions"
      description="AI-generated pricing suggestions based on competitor pricing, refund rates and demand. Review before applying."
      stats={[
        { label: "Suggestions", value: "12" },
        { label: "Price increases", value: "7", color: "var(--green)" },
        { label: "Price decreases", value: "5", color: "var(--red)" },
        { label: "Est. margin impact", value: "+1.8%" },
      ]}
    >
      <div className="glass rounded-xl overflow-hidden">
        <table className="w-full text-[11px]">
          <thead>
            <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              {["Product", "Current", "Suggested", "Reason", "Margin Impact"].map((h) => (
                <th key={h} className="px-3 py-2.5 text-left font-semibold" style={{ color: "var(--text-muted)" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {DEMO.map((r, i) => (
              <tr key={i} style={{ borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                <td className="px-3 py-2 font-medium" style={{ color: "var(--text)" }}>{r.product}</td>
                <td className="px-3 py-2" style={{ color: "var(--text-muted)" }}>{r.current}</td>
                <td className="px-3 py-2 font-medium" style={{ color: "var(--text)" }}>{r.suggested}</td>
                <td className="px-3 py-2" style={{ color: "var(--text-muted)" }}>{r.reason}</td>
                <td className="px-3 py-2" style={{ color: r.margin.startsWith("+") ? "var(--green)" : "var(--red)" }}>{r.margin}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </PageShell>
  )
}
