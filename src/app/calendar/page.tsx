"use client"
import { PageShell } from "@/components/PageShell"

export default function CalendarPage() {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const firstDay = new Date(year, month, 1).getDay()
  const offset = firstDay === 0 ? 6 : firstDay - 1

  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1)
  const monthName = now.toLocaleDateString("en-GB", { month: "long", year: "numeric" })

  return (
    <PageShell title="Calendar" breadcrumb="Home → Calendar" description="Month view with revenue targets, launches, and events.">
      <div className="glass rounded-xl p-4">
        <div className="text-sm font-bold mb-4" style={{ color: "var(--text)" }}>{monthName}</div>
        <div className="grid grid-cols-7 gap-px">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
            <div key={d} className="text-[10px] font-semibold text-center py-1" style={{ color: "var(--text-dim)" }}>{d}</div>
          ))}
          {Array.from({ length: offset }).map((_, i) => (
            <div key={`e${i}`} />
          ))}
          {days.map((d) => {
            const isToday = d === now.getDate()
            return (
              <div
                key={d}
                className="rounded-lg p-2 min-h-[60px] text-[10px]"
                style={{
                  background: isToday ? "rgba(99,102,241,0.15)" : "rgba(255,255,255,0.02)",
                  border: isToday ? "1px solid var(--accent)" : "1px solid rgba(255,255,255,0.04)",
                  color: "var(--text)",
                }}
              >
                <div className="font-semibold">{d}</div>
              </div>
            )
          })}
        </div>
      </div>
    </PageShell>
  )
}
