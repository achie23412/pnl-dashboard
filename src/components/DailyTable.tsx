"use client"
import type { DailyBriefingRow } from "@/lib/types"

function fmt(n: number, decimals = 0): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

function fmtDate(d: string) {
  const date = new Date(d + "T12:00:00")
  const day = date.toLocaleDateString("en-US", { weekday: "short" })
  return `${day} ${date.getDate()}/${date.getMonth() + 1}`
}

function RoasCell({ roas }: { roas: number }) {
  const color = roas >= 2.5 ? "var(--green)" : roas >= 1 ? "var(--orange)" : "var(--red)"
  return <span style={{ color }}>{roas.toFixed(2)}x</span>
}

function RefundCell({ rate }: { rate: number }) {
  const color = rate <= 3 ? "var(--green)" : rate <= 5 ? "var(--orange)" : "var(--red)"
  return <span style={{ color }}>{rate.toFixed(1)}%</span>
}

export function DailyTable({ data }: { data: DailyBriefingRow[] }) {
  if (data.length === 0) return null

  return (
    <div className="glass rounded-xl overflow-x-auto">
      <table className="w-full text-[13px]">
        <thead>
          <tr style={{ borderBottom: "1px solid var(--border)" }}>
            {["Date", "Revenue", "Orders", "Ad Spend", "ROAS", "Refund Rate", "COGS", "Net Profit"].map((h, i) => (
              <th
                key={h}
                className={`${i === 0 ? "text-left" : "text-right"} px-4 py-3 text-[10px] font-semibold uppercase tracking-wider`}
                style={{ color: "var(--text-dim)" }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row) => {
            const profitColor = row.profit >= 0 ? "var(--green)" : "var(--red)"
            return (
              <tr
                key={row.date}
                className="transition-colors hover:bg-[rgba(255,255,255,0.03)]"
                style={{
                  borderBottom: "1px solid var(--border)",
                  opacity: row.isToday ? 0.5 : 1,
                }}
              >
                <td className="px-4 py-2.5">
                  <span style={{ color: "var(--text)" }}>{fmtDate(row.date)}</span>
                  {row.isToday && (
                    <span
                      className="ml-2 px-1.5 py-0.5 rounded text-[9px] font-medium uppercase"
                      style={{ background: "rgba(212,144,58,0.15)", color: "var(--orange)" }}
                    >
                      Live
                    </span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-right font-mono" style={{ color: "var(--text)" }}>€{fmt(row.revenue)}</td>
                <td className="px-4 py-2.5 text-right font-mono" style={{ color: "var(--text-muted)" }}>{row.orders}</td>
                <td className="px-4 py-2.5 text-right font-mono" style={{ color: "var(--text)" }}>€{fmt(row.spend)}</td>
                <td className="px-4 py-2.5 text-right font-mono"><RoasCell roas={row.roas} /></td>
                <td className="px-4 py-2.5 text-right font-mono"><RefundCell rate={row.refundRate} /></td>
                <td className="px-4 py-2.5 text-right font-mono" style={{ color: "var(--orange)" }}>€{fmt(row.cogs)}</td>
                <td className="px-4 py-2.5 text-right font-mono" style={{ color: profitColor }}>€{fmt(row.profit)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
