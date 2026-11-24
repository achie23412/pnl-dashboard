"use client"
import { PageShell } from "@/components/PageShell"

const DEMO_RULES = [
  { product: "Women's Block Heel Ankle Boots", store: "Carter & Collins", status: "Live", margin: "42%", roas: "3.2", action: "Scale" },
  { product: "Men's Sherpa Lined Corduroy Jacket", store: "Walsh & Farley", status: "Live", margin: "38%", roas: "2.1", action: "Watch" },
  { product: "Women's Cable Knit Cardigan", store: "Susan & Allen", status: "Draft", margin: "31%", roas: "1.4", action: "Draft" },
  { product: "Men's Warm Lined Slippers", store: "Blinky", status: "Live", margin: "45%", roas: "2.8", action: "Keep" },
]

export default function ProductRulesPage() {
  return (
    <PageShell
      title="Product Rules"
      breadcrumb="Front End → Product Rules"
      description="Decide what stays live, what gets drafted, and what scales. Based on margin, ROAS and refund rate."
      stats={[
        { label: "Live products", value: "34" },
        { label: "To review", value: "8", color: "var(--orange)" },
        { label: "Drafted this week", value: "3" },
        { label: "Avg margin", value: "39%" },
      ]}
    >
      <div className="glass rounded-xl overflow-hidden">
        <table className="w-full text-[11px]">
          <thead>
            <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              {["Product", "Store", "Status", "Margin", "ROAS", "Action"].map((h) => (
                <th key={h} className="px-3 py-2.5 text-left font-semibold" style={{ color: "var(--text-muted)" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {DEMO_RULES.map((r, i) => (
              <tr key={i} style={{ borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                <td className="px-3 py-2 font-medium" style={{ color: "var(--text)" }}>{r.product}</td>
                <td className="px-3 py-2" style={{ color: "var(--text-muted)" }}>{r.store}</td>
                <td className="px-3 py-2">
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-medium" style={{
                    background: r.status === "Live" ? "rgba(34,197,94,0.15)" : "rgba(148,163,184,0.15)",
                    color: r.status === "Live" ? "#22c55e" : "#94a3b8",
                  }}>{r.status}</span>
                </td>
                <td className="px-3 py-2" style={{ color: "var(--text)" }}>{r.margin}</td>
                <td className="px-3 py-2" style={{ color: parseFloat(r.roas) >= 2.5 ? "var(--green)" : "var(--orange)" }}>{r.roas}</td>
                <td className="px-3 py-2">
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-medium" style={{
                    background: r.action === "Scale" ? "rgba(34,197,94,0.15)" : r.action === "Draft" ? "rgba(239,68,68,0.15)" : "rgba(249,115,22,0.15)",
                    color: r.action === "Scale" ? "#22c55e" : r.action === "Draft" ? "#ef4444" : "#f97316",
                  }}>{r.action}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </PageShell>
  )
}
