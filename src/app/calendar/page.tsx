"use client"
import { useState } from "react"

type CalendarEvent = {
  date: string
  label: string
  type: "deadline" | "sale" | "prep" | "shipping" | "season" | "launch"
  store?: string
  note?: string
}

const EVENTS: CalendarEvent[] = [
  // ── BLACK FRIDAY / CYBER MONDAY WEEK ──
  { date: "2026-11-27", label: "Black Friday", type: "sale", note: "Peak ad spend day. All stores max budget." },
  { date: "2026-11-28", label: "Black Saturday", type: "sale", note: "BF weekend — keep budgets high." },
  { date: "2026-11-29", label: "BF Sunday", type: "sale", note: "Momentum day — don't cut spend." },
  { date: "2026-11-30", label: "Cyber Monday", type: "sale", note: "Last big promo day. Push remaining BF stock." },

  // ── DECEMBER: Q4 PEAK ──
  { date: "2026-12-01", label: "List winter products", type: "prep", note: "Publish winter coats, knitwear, boots for Google indexing. Algorithm needs 2-3 weeks before peak." },
  { date: "2026-12-01", label: "December campaigns live", type: "launch", note: "Switch creatives to Christmas/gift angle. All stores." },
  { date: "2026-12-02", label: "Free Shipping Day prep", type: "prep", note: "Prep banners/badges for Dec 14 Free Shipping Day." },
  { date: "2026-12-05", label: "List NYE & party products", type: "prep", note: "NYE dresses, sparkly items, party accessories. Google needs indexing time before Dec 20+ searches." },
  { date: "2026-12-07", label: "Green Monday", type: "sale", note: "2nd biggest online shopping day in Dec. Push gift angles." },
  { date: "2026-12-08", label: "Review Q4 ROAS", type: "deadline", note: "Mid-Q4 check: draft underperformers (SOP rule 1-5), scale winners." },
  { date: "2026-12-10", label: "🇮🇪 IE shipping cutoff soon", type: "shipping", store: "WF", note: "Walsh & Farley: last safe order date for pre-Xmas delivery ~Dec 14 (ShipGoods EU 10-15 days)." },
  { date: "2026-12-10", label: "List Jan trending products", type: "prep", note: "Athleisure, gym wear, cozy loungewear for 'New Year New Me'. List NOW for Google algorithm." },
  { date: "2026-12-12", label: "🇬🇧 UK shipping cutoff soon", type: "shipping", store: "CC", note: "Carter & Collins: flag last order date for guaranteed Xmas delivery." },
  { date: "2026-12-14", label: "Free Shipping Day", type: "sale", note: "Offer free shipping across all stores. Big conversion driver." },
  { date: "2026-12-14", label: "🇺🇸 US shipping cutoff soon", type: "shipping", store: "SA", note: "Susan & Allen: last safe date for Xmas delivery (varies by carrier)." },
  { date: "2026-12-15", label: "Switch to 'Last Chance' angle", type: "launch", note: "Creatives → urgency: 'Order now for Xmas delivery'. Gift cards as backup offer." },
  { date: "2026-12-17", label: "Draft slow Christmas stock", type: "deadline", note: "Draft products that won't sell before Xmas. Free up ad budget for winners." },
  { date: "2026-12-18", label: "Super Saturday", type: "sale", note: "Last big shopping Saturday before Xmas. In-store rush → online last-chancers." },
  { date: "2026-12-20", label: "Gift card push starts", type: "launch", note: "Past shipping cutoffs → push digital gift cards and e-vouchers hard." },
  { date: "2026-12-21", label: "Winter Solstice", type: "season", note: "Shortest day. 'Winter essentials' angle for content." },
  { date: "2026-12-24", label: "Christmas Eve", type: "sale", note: "Last-minute digital/gift card sales. Reduce ad spend on physical products." },
  { date: "2026-12-25", label: "Christmas Day", type: "season", note: "Low ad spend. People browse with gift money. Prep Boxing Day campaigns." },
  { date: "2026-12-26", label: "Boxing Day / Q5 starts", type: "sale", note: "🔥 Q5 begins! CPMs drop 30-50%, gift card spend floods in. Scale aggressively." },
  { date: "2026-12-27", label: "Scale Q5 winners", type: "launch", note: "Double budgets on winners. Low CPMs + high intent = best ROAS window of the year." },
  { date: "2026-12-28", label: "List spring preview products", type: "prep", note: "Early spring: light jackets, transitional pieces, Valentine's gifts. Google needs 3+ weeks." },
  { date: "2026-12-31", label: "New Year's Eve", type: "season", note: "NYE outfit searches peak. Party/sparkle product push." },

  // ── JANUARY: Q5 & NEW YEAR ──
  { date: "2027-01-01", label: "New Year's Day / Q5 peak", type: "sale", note: "Resolution shoppers. Athleisure, wellness, self-improvement products spike." },
  { date: "2027-01-02", label: "New Year sales continue", type: "sale", note: "Q5 momentum. Keep budgets elevated — CPMs still low." },
  { date: "2027-01-03", label: "Review holiday performance", type: "deadline", note: "Full Q4 + Q5 review. Identify winners to keep, losers to draft." },
  { date: "2027-01-04", label: "List Valentine's products", type: "prep", note: "Valentine's search starts mid-Jan. List jewelry, gifts, accessories NOW for Google indexing." },
  { date: "2027-01-05", label: "Weekly product review", type: "deadline", note: "Drafting SOP review rules 6-11. Check ROAS, refund rates, margin on all live products." },
  { date: "2027-01-06", label: "Q5 wind-down check", type: "deadline", note: "CPMs start normalizing. Evaluate which Q5 budgets to pull back." },
  { date: "2027-01-07", label: "Publish spring collection", type: "prep", note: "Transition from winter clearance to spring arrivals. Light layers, rain gear, pastels." },
]

const TYPE_COLORS: Record<CalendarEvent["type"], { bg: string; text: string; label: string }> = {
  deadline: { bg: "rgba(239,68,68,0.18)", text: "#ef4444", label: "Must-do" },
  sale: { bg: "rgba(34,197,94,0.18)", text: "#22c55e", label: "Sale / Peak" },
  prep: { bg: "rgba(99,102,241,0.18)", text: "#818cf8", label: "Prep ahead" },
  shipping: { bg: "rgba(249,115,22,0.18)", text: "#f97316", label: "Shipping" },
  season: { bg: "rgba(148,163,184,0.15)", text: "#94a3b8", label: "Season" },
  launch: { bg: "rgba(14,165,233,0.18)", text: "#0ea5e9", label: "Launch" },
}

function getMonthData(year: number, month: number) {
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const firstDay = new Date(year, month, 1).getDay()
  const offset = firstDay === 0 ? 6 : firstDay - 1
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1)
  const monthName = new Date(year, month, 1).toLocaleDateString("en-GB", { month: "long", year: "numeric" })
  return { daysInMonth, offset, days, monthName, year, month }
}

function dateKey(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
}

export default function CalendarPage() {
  const now = new Date()
  const [viewMonth, setViewMonth] = useState(now.getMonth())
  const [viewYear, setViewYear] = useState(now.getFullYear())
  const [selected, setSelected] = useState<string | null>(null)

  const { offset, days, monthName } = getMonthData(viewYear, viewMonth)

  const eventMap = new Map<string, CalendarEvent[]>()
  for (const ev of EVENTS) {
    const list = eventMap.get(ev.date) || []
    list.push(ev)
    eventMap.set(ev.date, list)
  }

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(viewYear - 1) }
    else setViewMonth(viewMonth - 1)
  }
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(viewYear + 1) }
    else setViewMonth(viewMonth + 1)
  }

  const selectedEvents = selected ? (eventMap.get(selected) || []) : []

  return (
    <div className="p-6 min-h-screen" style={{ background: "var(--bg)" }}>
      <div className="text-[10px] mb-1" style={{ color: "var(--text-dim)" }}>Home → Calendar</div>
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-[20px] font-bold" style={{ color: "var(--text)" }}>Calendar</h1>
      </div>
      <p className="text-[12px] mb-4 max-w-3xl" style={{ color: "var(--text-muted)" }}>
        E-commerce action calendar — must-do deadlines, sales peaks, shipping cutoffs, and advance prep for Google indexing.
      </p>

      {/* Legend */}
      <div className="flex flex-wrap gap-2 mb-4">
        {Object.entries(TYPE_COLORS).map(([key, val]) => (
          <div key={key} className="flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px]" style={{ background: val.bg, color: val.text }}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: val.text }} />
            {val.label}
          </div>
        ))}
      </div>

      {/* Month nav */}
      <div className="glass rounded-xl p-4">
        <div className="flex items-center justify-between mb-4">
          <button onClick={prevMonth} className="px-3 py-1 rounded-lg text-[11px] font-medium" style={{ background: "rgba(255,255,255,0.05)", color: "var(--text-muted)", border: "1px solid rgba(255,255,255,0.08)" }}>← Prev</button>
          <div className="text-sm font-bold" style={{ color: "var(--text)" }}>{monthName}</div>
          <button onClick={nextMonth} className="px-3 py-1 rounded-lg text-[11px] font-medium" style={{ background: "rgba(255,255,255,0.05)", color: "var(--text-muted)", border: "1px solid rgba(255,255,255,0.08)" }}>Next →</button>
        </div>
        <div className="grid grid-cols-7 gap-px">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
            <div key={d} className="text-[10px] font-semibold text-center py-1" style={{ color: "var(--text-dim)" }}>{d}</div>
          ))}
          {Array.from({ length: offset }).map((_, i) => (
            <div key={`e${i}`} />
          ))}
          {days.map((d) => {
            const key = dateKey(viewYear, viewMonth, d)
            const isToday = d === now.getDate() && viewMonth === now.getMonth() && viewYear === now.getFullYear()
            const dayEvents = eventMap.get(key) || []
            const isSelected = selected === key
            const isPast = new Date(viewYear, viewMonth, d) < new Date(now.getFullYear(), now.getMonth(), now.getDate())

            return (
              <div
                key={d}
                onClick={() => dayEvents.length > 0 ? setSelected(isSelected ? null : key) : undefined}
                className="rounded-lg p-1.5 min-h-[72px] text-[10px] transition-all"
                style={{
                  background: isSelected ? "rgba(99,102,241,0.2)" : isToday ? "rgba(99,102,241,0.12)" : "rgba(255,255,255,0.02)",
                  border: isSelected ? "1px solid var(--accent)" : isToday ? "1px solid rgba(99,102,241,0.4)" : "1px solid rgba(255,255,255,0.04)",
                  color: "var(--text)",
                  opacity: isPast ? 0.4 : 1,
                  cursor: dayEvents.length > 0 ? "pointer" : "default",
                }}
              >
                <div className="font-semibold mb-0.5">{d}</div>
                {dayEvents.slice(0, 2).map((ev, i) => (
                  <div
                    key={i}
                    className="rounded px-1 py-0.5 mb-0.5 truncate text-[8px] font-medium leading-tight"
                    style={{ background: TYPE_COLORS[ev.type].bg, color: TYPE_COLORS[ev.type].text }}
                  >
                    {ev.label}
                  </div>
                ))}
                {dayEvents.length > 2 && (
                  <div className="text-[8px]" style={{ color: "var(--text-dim)" }}>+{dayEvents.length - 2} more</div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Detail panel */}
      {selected && selectedEvents.length > 0 && (
        <div className="mt-4 glass rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[13px] font-bold" style={{ color: "var(--text)" }}>
              {new Date(selected + "T00:00:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
            </h3>
            <button onClick={() => setSelected(null)} className="text-[10px] px-2 py-1 rounded-lg" style={{ background: "rgba(255,255,255,0.05)", color: "var(--text-muted)" }}>Close</button>
          </div>
          <div className="space-y-2">
            {selectedEvents.map((ev, i) => (
              <div key={i} className="rounded-lg p-3" style={{ background: TYPE_COLORS[ev.type].bg, border: `1px solid ${TYPE_COLORS[ev.type].text}22` }}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-bold" style={{ background: TYPE_COLORS[ev.type].text, color: "#000" }}>
                    {TYPE_COLORS[ev.type].label}
                  </span>
                  <span className="text-[12px] font-semibold" style={{ color: TYPE_COLORS[ev.type].text }}>{ev.label}</span>
                  {ev.store && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full" style={{ background: "rgba(255,255,255,0.1)", color: "var(--text-muted)" }}>{ev.store}</span>
                  )}
                </div>
                {ev.note && <div className="text-[11px] leading-relaxed" style={{ color: "var(--text-muted)" }}>{ev.note}</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Upcoming events list */}
      <div className="mt-4 glass rounded-xl p-4">
        <h3 className="text-[13px] font-bold mb-3" style={{ color: "var(--text)" }}>Upcoming (next 6 weeks)</h3>
        <div className="space-y-1.5">
          {EVENTS
            .filter((ev) => {
              const evDate = new Date(ev.date + "T00:00:00")
              const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
              return evDate >= todayStart
            })
            .sort((a, b) => a.date.localeCompare(b.date))
            .map((ev, i) => {
              const evDate = new Date(ev.date + "T00:00:00")
              const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
              const daysAway = Math.round((evDate.getTime() - todayStart.getTime()) / 86400000)
              return (
                <div key={i} className="flex items-center gap-3 px-3 py-2 rounded-lg" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)" }}>
                  <div className="w-[52px] text-[10px] font-mono shrink-0" style={{ color: "var(--text-dim)" }}>
                    {evDate.toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
                  </div>
                  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: TYPE_COLORS[ev.type].text }} />
                  <div className="flex-1 min-w-0">
                    <span className="text-[11px] font-medium" style={{ color: TYPE_COLORS[ev.type].text }}>{ev.label}</span>
                    {ev.store && <span className="ml-1.5 text-[9px]" style={{ color: "var(--text-dim)" }}>({ev.store})</span>}
                  </div>
                  <div className="text-[9px] shrink-0 px-1.5 py-0.5 rounded-full" style={{
                    background: daysAway <= 3 ? "rgba(239,68,68,0.15)" : daysAway <= 7 ? "rgba(249,115,22,0.15)" : "rgba(255,255,255,0.05)",
                    color: daysAway <= 3 ? "#ef4444" : daysAway <= 7 ? "#f97316" : "var(--text-dim)",
                  }}>
                    {daysAway === 0 ? "Today" : daysAway === 1 ? "Tomorrow" : `${daysAway}d`}
                  </div>
                </div>
              )
            })}
        </div>
      </div>
    </div>
  )
}
