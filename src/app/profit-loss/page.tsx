"use client"
import { PageShell } from "@/components/PageShell"

const STORES = [
  { name: "Walsh & Farley", revenue: "€12,340", spend: "€3,200", cogs: "€4,100", profit: "€5,040", roas: "3.86", refundRate: "4.2%", color: "#f97316" },
  { name: "Carter & Collins", revenue: "€9,870", spend: "€2,800", cogs: "€3,300", profit: "€3,770", roas: "3.53", refundRate: "3.8%", color: "#3b82f6" },
  { name: "Susan & Allen", revenue: "€7,650", spend: "€2,100", cogs: "€2,500", profit: "€3,050", roas: "3.64", refundRate: "5.1%", color: "#22c55e" },
  { name: "Blinky", revenue: "€4,200", spend: "€1,400", cogs: "€1,500", profit: "€1,300", roas: "3.00", refundRate: "3.5%", color: "#a855f7" },
  { name: "LUMEGLASSES", revenue: "€2,100", spend: "€600", cogs: "€700", profit: "€800", roas: "3.50", refundRate: "2.9%", color: "#eab308" },
]

export default function ProfitLossPage() {
  return (
    <PageShell
      title="Profit & Loss"
      breadcrumb="Finance → Profit & Loss"
      description="Per-store and overall P&L with Windsor ad-account mapping. All amounts in EUR."
      stats={[
        { label: "Revenue", value: "€36,160", color: "var(--text)" },
        { label: "Ad Spend", value: "€10,100", color: "var(--blue)" },
        { label: "COGS", value: "€12,100" },
        { label: "Operating Profit", value: "€13,960", color: "var(--green)" },
        { label: "Avg ROAS", value: "3.58" },
      ]}
      filters
    >
      <div className="glass rounded-xl overflow-hidden">
        <table className="w-full text-[11px]">
          <thead>
            <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              {["Store", "Revenue", "Ad Spend", "COGS", "Profit", "ROAS", "Refund %"].map((h) => (
                <th key={h} className="px-4 py-2.5 text-left font-semibold" style={{ color: "var(--text-muted)" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {STORES.map((s) => (
              <tr key={s.name} style={{ borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                <td className="px-4 py-2.5 font-medium" style={{ color: "var(--text)" }}>
                  <span className="inline-block w-2 h-2 rounded-full mr-2" style={{ background: s.color }} />
                  {s.name}
                </td>
                <td className="px-4 py-2.5" style={{ color: "var(--text)" }}>{s.revenue}</td>
                <td className="px-4 py-2.5" style={{ color: "var(--text-muted)" }}>{s.spend}</td>
                <td className="px-4 py-2.5" style={{ color: "var(--text-muted)" }}>{s.cogs}</td>
                <td className="px-4 py-2.5 font-medium" style={{ color: "var(--green)" }}>{s.profit}</td>
                <td className="px-4 py-2.5" style={{ color: "var(--text)" }}>{s.roas}</td>
                <td className="px-4 py-2.5" style={{ color: parseFloat(s.refundRate) > 5 ? "var(--red)" : "var(--text-muted)" }}>{s.refundRate}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </PageShell>
  )
}
