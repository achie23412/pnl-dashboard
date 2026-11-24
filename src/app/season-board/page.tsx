"use client"
import { PageShell } from "@/components/PageShell"

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
const DEMO_KEYWORDS = [
  { keyword: "winter boots", country: "UK", status: "Push budget", months: [0,0,1,1,2,3,5,8,10,10,8,4] },
  { keyword: "christmas jumper", country: "IE", status: "List now", months: [0,0,0,0,0,1,2,4,8,10,10,3] },
  { keyword: "leather jacket", country: "US", status: "Phase out", months: [3,4,6,8,10,8,6,5,7,9,5,3] },
  { keyword: "summer dress", country: "UK", status: "Phase out", months: [1,2,5,8,10,10,8,5,3,1,0,0] },
]

export default function SeasonBoardPage() {
  return (
    <PageShell title="Season Board" breadcrumb="Front End → Season Board" description="Monthly keyword demand per country. Plan when to list, push budget, and phase out products.">
      <div className="glass rounded-xl overflow-hidden">
        <table className="w-full text-[11px]">
          <thead>
            <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <th className="px-3 py-2.5 text-left font-semibold" style={{ color: "var(--text-muted)" }}>Keyword</th>
              <th className="px-3 py-2.5 text-left font-semibold" style={{ color: "var(--text-muted)" }}>Country</th>
              <th className="px-3 py-2.5 text-left font-semibold" style={{ color: "var(--text-muted)" }}>Status</th>
              {MONTHS.map((m) => (
                <th key={m} className="px-1.5 py-2.5 text-center font-semibold text-[9px]" style={{ color: "var(--text-dim)" }}>{m}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {DEMO_KEYWORDS.map((r, i) => (
              <tr key={i} style={{ borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                <td className="px-3 py-2 font-medium" style={{ color: "var(--text)" }}>{r.keyword}</td>
                <td className="px-3 py-2" style={{ color: "var(--text-muted)" }}>{r.country}</td>
                <td className="px-3 py-2">
                  <span className="px-2 py-0.5 rounded-full text-[9px] font-medium" style={{
                    background: r.status === "Push budget" ? "rgba(34,197,94,0.15)" : r.status === "List now" ? "rgba(59,130,246,0.15)" : "rgba(148,163,184,0.15)",
                    color: r.status === "Push budget" ? "#22c55e" : r.status === "List now" ? "#3b82f6" : "#94a3b8",
                  }}>{r.status}</span>
                </td>
                {r.months.map((v, mi) => (
                  <td key={mi} className="px-1 py-2 text-center text-[9px]">
                    <div className="w-5 h-5 rounded mx-auto flex items-center justify-center" style={{
                      background: `rgba(99,102,241,${v / 10 * 0.8})`,
                      color: v > 3 ? "#fff" : "var(--text-dim)",
                    }}>{v > 0 ? v : ""}</div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </PageShell>
  )
}
