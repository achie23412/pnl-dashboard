"use client"
import { useState, useEffect, useCallback } from "react"
import { TodoPanel, type CustomTodo } from "@/components/TodoPanel"
import { HARDCODED_EVENTS } from "@/lib/calendar-hardcoded"
import { SingleDatePicker } from "@/components/SingleDatePicker"
import { PillSelect } from "@/components/PillSelect"
import { PageShell } from "@/components/PageShell"
import { Panel, Badge, Button } from "@/components/ui"

type CalendarEvent = {
  id?: string
  date: string
  label: string
  type: "deadline" | "sale" | "prep" | "shipping" | "season" | "launch" | "todo"
  store?: string
  note?: string
  source?: "hardcoded" | "dynamic"
}


const TYPE_COLORS: Record<CalendarEvent["type"], { bg: string; text: string; label: string }> = {
  deadline: { bg: "rgba(239,68,68,0.18)", text: "#ef4444", label: "Must-do" },
  sale: { bg: "rgba(34,197,94,0.18)", text: "#22c55e", label: "Sale / peak" },
  prep: { bg: "rgba(99,102,241,0.18)", text: "#818cf8", label: "Prep ahead" },
  shipping: { bg: "rgba(249,115,22,0.18)", text: "#f97316", label: "Shipping" },
  season: { bg: "rgba(148,163,184,0.15)", text: "#94a3b8", label: "Season" },
  launch: { bg: "rgba(14,165,233,0.18)", text: "#0ea5e9", label: "Launch" },
  todo: { bg: "rgba(255,255,255,0.08)", text: "#e2e8f0", label: "My task" },
}

const EVENT_TYPES: CalendarEvent["type"][] = ["deadline", "sale", "prep", "shipping", "season", "launch"]

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
  const [dynamicEvents, setDynamicEvents] = useState<CalendarEvent[]>([])
  const [showAdd, setShowAdd] = useState(false)
  const [addForm, setAddForm] = useState({ date: "", label: "", type: "deadline" as CalendarEvent["type"], store: "", note: "" })
  const [saving, setSaving] = useState(false)
  const [customTodos, setCustomTodos] = useState<CustomTodo[]>([])

  const fetchDynamic = useCallback(async () => {
    try {
      const res = await fetch("/api/calendar-events")
      if (!res.ok) return
      const data = await res.json()
      setDynamicEvents(data.map((e: CalendarEvent & { id: string }) => ({ ...e, source: "dynamic" as const })))
    } catch { /* ignore */ }
  }, [])

  useEffect(() => { fetchDynamic() }, [fetchDynamic])

  // Season Board keyword timing: "List N season keywords" / "Push budget on N season keywords"
  // per country and month (from the uploaded Keyword Planner exports). Also feeds the to-do list.
  const [seasonEvents, setSeasonEvents] = useState<CalendarEvent[]>([])
  useEffect(() => {
    fetch("/api/season?view=calendar")
      .then((r) => (r.ok ? r.json() : { events: [] }))
      .then((d) => setSeasonEvents((d.events || []).map((e: CalendarEvent) => ({ ...e, source: "hardcoded" as const }))))
      .catch(() => {})
  }, [])

  const allEvents: CalendarEvent[] = [
    ...HARDCODED_EVENTS.map((e) => ({ ...e, source: "hardcoded" as const })),
    ...seasonEvents,
    ...dynamicEvents,
  ]
  // Dated custom to-dos also show on the calendar
  const todoEvents: CalendarEvent[] = customTodos
    .filter((t) => t.date)
    .map((t) => ({ date: t.date!, label: `${t.done ? "✓ " : "☐ "}${t.label}`, type: "todo" as const, store: t.store || undefined }))

  const { offset, days, monthName } = getMonthData(viewYear, viewMonth)

  const eventMap = new Map<string, CalendarEvent[]>()
  for (const ev of [...allEvents, ...todoEvents]) {
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

  const handleAdd = async () => {
    if (!addForm.date || !addForm.label) return
    setSaving(true)
    try {
      const res = await fetch("/api/calendar-events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(addForm),
      })
      if (res.ok) {
        setAddForm({ date: "", label: "", type: "deadline", store: "", note: "" })
        setShowAdd(false)
        fetchDynamic()
      }
    } catch { /* ignore */ }
    setSaving(false)
  }

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/calendar-events?id=${id}`, { method: "DELETE" })
      if (res.ok) fetchDynamic()
    } catch { /* ignore */ }
  }

  return (
    <PageShell
      title="Calendar"
      breadcrumb="Home → Calendar"
      description="E-commerce action calendar: must-do deadlines, sales peaks, shipping cutoffs and advance prep for Google indexing."
      actions={
        <Button variant={showAdd ? "secondary" : "primary"} onClick={() => setShowAdd(!showAdd)}>
          {showAdd ? "Cancel" : "Add event"}
        </Button>
      }
    >
      {/* Add event form */}
      {showAdd && (
        <Panel title="New event" className="mb-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
            <div>
              <label className="text-[10px] block mb-1" style={{ color: "var(--text-dim)" }}>Date *</label>
              <SingleDatePicker value={addForm.date} onChange={(date) => setAddForm({ ...addForm, date })} align="left" fullWidth allowEmpty={false} placeholder="Pick a date" />
            </div>
            <div>
              <label className="text-[10px] block mb-1" style={{ color: "var(--text-dim)" }}>Label *</label>
              <input
                type="text"
                placeholder="Event name"
                value={addForm.label}
                onChange={(e) => setAddForm({ ...addForm, label: e.target.value })}
                className="w-full px-3 py-1.5 rounded-lg text-[11px]"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "var(--text)" }}
              />
            </div>
            <div>
              <label className="text-[10px] block mb-1" style={{ color: "var(--text-dim)" }}>Type</label>
              <PillSelect
                fullWidth
                value={addForm.type}
                onChange={(v) => setAddForm({ ...addForm, type: v as CalendarEvent["type"] })}
                options={EVENT_TYPES.map((t) => ({ value: t, label: TYPE_COLORS[t].label }))}
              />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
            <div>
              <label className="text-[10px] block mb-1" style={{ color: "var(--text-dim)" }}>Store (optional)</label>
              <input
                type="text"
                placeholder="e.g. WF, CC, SA"
                value={addForm.store}
                onChange={(e) => setAddForm({ ...addForm, store: e.target.value })}
                className="w-full px-3 py-1.5 rounded-lg text-[11px]"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "var(--text)" }}
              />
            </div>
            <div>
              <label className="text-[10px] block mb-1" style={{ color: "var(--text-dim)" }}>Note (optional)</label>
              <input
                type="text"
                placeholder="Details"
                value={addForm.note}
                onChange={(e) => setAddForm({ ...addForm, note: e.target.value })}
                className="w-full px-3 py-1.5 rounded-lg text-[11px]"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "var(--text)" }}
              />
            </div>
          </div>
          <Button variant="primary" onClick={handleAdd} disabled={saving || !addForm.date || !addForm.label}>
            {saving ? "Saving…" : "Add event"}
          </Button>
        </Panel>
      )}

      {/* Legend */}
      <div className="flex flex-wrap gap-2 mb-4">
        {Object.entries(TYPE_COLORS).map(([key, val]) => (
          <div key={key} className="flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px]" style={{ background: val.bg, color: val.text }}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: val.text }} />
            {val.label}
          </div>
        ))}
      </div>

      <TodoPanel events={allEvents} onCustomChange={setCustomTodos} />

      {/* Month nav */}
      <div className="glass rounded-xl p-4">
        <div className="flex items-center justify-between mb-4">
          <Button size="sm" onClick={prevMonth}>&larr; Previous</Button>
          <div className="text-[13px] font-bold" style={{ color: "var(--text)" }}>{monthName}</div>
          <Button size="sm" onClick={nextMonth}>Next &rarr;</Button>
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
            <h3 className="text-[12px] font-semibold" style={{ color: "var(--text)" }}>
              {new Date(selected + "T00:00:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
            </h3>
            <Button size="sm" variant="ghost" onClick={() => setSelected(null)}>Close</Button>
          </div>
          <div className="space-y-2">
            {selectedEvents.map((ev, i) => (
              <div key={i} className="rounded-lg p-3" style={{ background: TYPE_COLORS[ev.type].bg, border: `1px solid ${TYPE_COLORS[ev.type].text}22` }}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-bold" style={{ background: TYPE_COLORS[ev.type].text, color: "#000" }}>
                    {TYPE_COLORS[ev.type].label}
                  </span>
                  <span className="text-[12px] font-semibold" style={{ color: TYPE_COLORS[ev.type].text }}>{ev.label}</span>
                  {ev.store && <Badge>{ev.store}</Badge>}
                  {ev.source === "dynamic" && <Badge tone="accent">Custom</Badge>}
                  {ev.source === "dynamic" && ev.id && (
                    <Button
                      size="sm"
                      variant="danger"
                      className="ml-auto"
                      onClick={(e) => { e.stopPropagation(); handleDelete(ev.id!) }}
                    >
                      Delete
                    </Button>
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
        <h3 className="text-[12px] font-semibold mb-3" style={{ color: "var(--text)" }}>Upcoming</h3>
        <div className="space-y-1.5">
          {allEvents
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
                  <div className="w-[52px] text-[10px] tabular-nums shrink-0" style={{ color: "var(--text-dim)" }}>
                    {evDate.toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
                  </div>
                  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: TYPE_COLORS[ev.type].text }} />
                  <div className="flex-1 min-w-0">
                    <span className="text-[11px] font-medium" style={{ color: TYPE_COLORS[ev.type].text }}>{ev.label}</span>
                    {ev.store && <span className="ml-1.5 text-[9px]" style={{ color: "var(--text-dim)" }}>({ev.store})</span>}
                    {ev.source === "dynamic" && <span className="ml-1.5"><Badge tone="accent">Custom</Badge></span>}
                  </div>
                  <Badge tone={daysAway <= 3 ? "red" : daysAway <= 7 ? "amber" : "grey"}>
                    {daysAway === 0 ? "Today" : daysAway === 1 ? "Tomorrow" : `${daysAway}d`}
                  </Badge>
                </div>
              )
            })}
        </div>
      </div>
    </PageShell>
  )
}
