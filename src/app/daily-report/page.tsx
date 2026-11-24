"use client"
import { PageShell } from "@/components/PageShell"

const DEMO_STORES = [
  { name: "Walsh & Farley", revenue: "€4,210", orders: 47, roas: "2.8", spend: "€1,503", refunds: 2, profit: "€891" },
  { name: "Carter & Collins", revenue: "£3,890", orders: 41, roas: "3.1", spend: "£1,255", refunds: 1, profit: "£1,102" },
  { name: "Susan & Allen", revenue: "$2,150", orders: 23, roas: "2.4", spend: "$896", refunds: 0, profit: "$412" },
  { name: "Blinky", revenue: "€1,870", orders: 19, roas: "2.2", spend: "€850", refunds: 1, profit: "€310" },
  { name: "LUMEGLASSES", revenue: "$980", orders: 11, roas: "1.9", spend: "$516", refunds: 0, profit: "$142" },
]

export default function DailyReportPage() {
  const today = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
  return (
    <PageShell title="Daily Report" breadcrumb="Home → Daily Report" description={`Report for ${today}. Fill in every evening before closing.`}>
      <div className="space-y-4">
        <div className="glass rounded-xl overflow-hidden">
          <table className="w-full text-[11px]">
            <thead>
              <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                <th className="px-3 py-2.5 text-left font-semibold" style={{ color: "var(--text-muted)" }}>Store</th>
                <th className="px-3 py-2.5 text-right font-semibold" style={{ color: "var(--text-muted)" }}>Revenue</th>
                <th className="px-3 py-2.5 text-right font-semibold" style={{ color: "var(--text-muted)" }}>Orders</th>
                <th className="px-3 py-2.5 text-right font-semibold" style={{ color: "var(--text-muted)" }}>ROAS</th>
                <th className="px-3 py-2.5 text-right font-semibold" style={{ color: "var(--text-muted)" }}>Ad Spend</th>
                <th className="px-3 py-2.5 text-right font-semibold" style={{ color: "var(--text-muted)" }}>Refunds</th>
                <th className="px-3 py-2.5 text-right font-semibold" style={{ color: "var(--text-muted)" }}>Est. Profit</th>
              </tr>
            </thead>
            <tbody>
              {DEMO_STORES.map((s) => (
                <tr key={s.name} style={{ borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                  <td className="px-3 py-2 font-medium" style={{ color: "var(--text)" }}>{s.name}</td>
                  <td className="px-3 py-2 text-right" style={{ color: "var(--green)" }}>{s.revenue}</td>
                  <td className="px-3 py-2 text-right" style={{ color: "var(--text)" }}>{s.orders}</td>
                  <td className="px-3 py-2 text-right" style={{ color: parseFloat(s.roas) >= 2.5 ? "var(--green)" : "var(--orange)" }}>{s.roas}</td>
                  <td className="px-3 py-2 text-right" style={{ color: "var(--text-muted)" }}>{s.spend}</td>
                  <td className="px-3 py-2 text-right" style={{ color: s.refunds > 0 ? "var(--red)" : "var(--text-dim)" }}>{s.refunds}</td>
                  <td className="px-3 py-2 text-right font-medium" style={{ color: "var(--green)" }}>{s.profit}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="glass rounded-xl p-4">
          <div className="text-[11px] font-semibold mb-2" style={{ color: "var(--text-muted)" }}>Notes</div>
          <textarea
            className="w-full bg-transparent border rounded-lg p-3 text-[11px] resize-none"
            style={{ borderColor: "rgba(255,255,255,0.08)", color: "var(--text)", minHeight: 80 }}
            placeholder="Daily notes — what happened today, what to check tomorrow..."
          />
        </div>
      </div>
    </PageShell>
  )
}
