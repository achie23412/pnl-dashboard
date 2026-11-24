"use client"
import { useState } from "react"

const DEMO_STORES = [
  { name: "Walsh & Farley", revenue: "€4,210", orders: 47, roas: "2.8", spend: "€1,503", refunds: 2, profit: "€891" },
  { name: "Carter & Collins", revenue: "£3,890", orders: 41, roas: "3.1", spend: "£1,255", refunds: 1, profit: "£1,102" },
  { name: "Susan & Allen", revenue: "$2,150", orders: 23, roas: "2.4", spend: "$896", refunds: 0, profit: "$412" },
  { name: "Blinky", revenue: "€1,870", orders: 19, roas: "2.2", spend: "€850", refunds: 1, profit: "€310" },
  { name: "LUMEGLASSES", revenue: "$980", orders: 11, roas: "1.9", spend: "$516", refunds: 0, profit: "$142" },
]

function toInputDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00")
  return d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
}

export default function DailyReportPage() {
  const [date, setDate] = useState(toInputDate(new Date()))

  return (
    <div className="p-6 min-h-screen" style={{ background: "var(--bg)" }}>
      <div className="text-[10px] mb-1" style={{ color: "var(--text-dim)" }}>Home → Daily Report</div>

      <div className="flex items-center justify-between mb-1">
        <h1 className="text-[20px] font-bold" style={{ color: "var(--text)" }}>Daily Report</h1>
      </div>

      {/* Date picker row */}
      <div className="flex items-center gap-3 mb-4">
        <button
          onClick={() => {
            const d = new Date(date + "T00:00:00")
            d.setDate(d.getDate() - 1)
            setDate(toInputDate(d))
          }}
          className="px-2 py-1 rounded-lg text-[11px] font-medium"
          style={{ background: "rgba(255,255,255,0.05)", color: "var(--text-muted)", border: "1px solid rgba(255,255,255,0.08)" }}
        >
          ←
        </button>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="px-3 py-1.5 rounded-lg text-[11px] font-medium"
          style={{
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.08)",
            color: "var(--text)",
            colorScheme: "dark",
          }}
        />
        <button
          onClick={() => {
            const d = new Date(date + "T00:00:00")
            d.setDate(d.getDate() + 1)
            setDate(toInputDate(d))
          }}
          className="px-2 py-1 rounded-lg text-[11px] font-medium"
          style={{ background: "rgba(255,255,255,0.05)", color: "var(--text-muted)", border: "1px solid rgba(255,255,255,0.08)" }}
        >
          →
        </button>
        <button
          onClick={() => setDate(toInputDate(new Date()))}
          className="px-2.5 py-1 rounded-lg text-[10px] font-medium"
          style={{ background: "rgba(99,102,241,0.15)", color: "#818cf8", border: "1px solid rgba(99,102,241,0.3)" }}
        >
          Today
        </button>
        <div className="text-[12px] font-medium" style={{ color: "var(--text-muted)" }}>
          {formatDate(date)}. Fill in every evening before closing.
        </div>
      </div>

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
    </div>
  )
}
