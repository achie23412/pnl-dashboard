"use client"
// Compact single-date picker in the dashboard's dark style: quick choices
// (Today, Tomorrow, next Monday, in a week, no date) plus a month grid.
// Value is "YYYY-MM-DD" or "" (no date).
import { useEffect, useRef, useState } from "react"

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
const DAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"]

const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`)
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const fromIso = (s: string) => new Date(`${s}T12:00:00`)
const plus = (d: Date, n: number) => {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

function label(value: string, today: string): string {
  if (!value) return "No date"
  if (value === today) return "Today"
  if (value === iso(plus(fromIso(today), 1))) return "Tomorrow"
  const d = fromIso(value)
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })
}

export function SingleDatePicker({
  value,
  onChange,
  placeholder = "No date",
  align = "right",
  fullWidth = false,
  allowEmpty = true,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  align?: "left" | "right"
  fullWidth?: boolean
  allowEmpty?: boolean // show the "No date" choice
}) {
  const [open, setOpen] = useState(false)
  const now = new Date()
  const today = iso(now)
  const base = value ? fromIso(value) : now
  const [view, setView] = useState({ y: base.getFullYear(), m: base.getMonth() })
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false)
    }
    document.addEventListener("mousedown", onDown)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onDown)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  useEffect(() => {
    if (open) {
      const b = value ? fromIso(value) : new Date()
      setView({ y: b.getFullYear(), m: b.getMonth() })
    }
  }, [open, value])

  const pick = (v: string) => {
    onChange(v)
    setOpen(false)
  }

  const nextMonday = (() => {
    const d = new Date(now)
    const add = ((8 - d.getDay()) % 7) || 7
    return iso(plus(d, add))
  })()
  const quick = [
    { label: "Today", v: today },
    { label: "Tomorrow", v: iso(plus(now, 1)) },
    { label: "Next Mon", v: nextMonday },
    { label: "In a week", v: iso(plus(now, 7)) },
    ...(allowEmpty ? [{ label: "No date", v: "" }] : []),
  ]

  // Month grid, weeks start on Monday.
  const first = new Date(view.y, view.m, 1)
  const offset = (first.getDay() + 6) % 7
  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate()
  const cells: (string | null)[] = []
  for (let i = 0; i < offset; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(`${view.y}-${pad(view.m + 1)}-${pad(d)}`)
  while (cells.length % 7) cells.push(null)

  const shift = (n: number) =>
    setView((v) => {
      const d = new Date(v.y, v.m + n, 1)
      return { y: d.getFullYear(), m: d.getMonth() }
    })

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] whitespace-nowrap transition-colors ${fullWidth ? "w-full" : ""}`}
        style={{
          background: open ? "rgba(99,102,241,0.12)" : "rgba(255,255,255,0.05)",
          border: `1px solid ${open ? "rgba(99,102,241,0.4)" : "rgba(255,255,255,0.1)"}`,
          color: value ? "var(--text)" : "var(--text-dim)",
        }}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Due date"
      >
        <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.7 }}>
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
        {value ? label(value, today) : placeholder}
      </button>

      {open && (
        <div
          role="dialog"
          className={`absolute ${align === "left" ? "left-0" : "right-0"} top-full mt-1.5 z-50 rounded-xl p-3 w-[248px]`}
          style={{ background: "rgba(15,19,32,0.98)", border: "1px solid rgba(255,255,255,0.1)", boxShadow: "0 12px 32px rgba(0,0,0,0.45)", backdropFilter: "blur(16px)" }}
        >
          <div className="flex flex-wrap gap-1 mb-3">
            {quick.map((q) => {
              const active = q.v === value
              return (
                <button
                  key={q.label}
                  type="button"
                  onClick={() => pick(q.v)}
                  className="px-2 py-1 rounded-md text-[10px] font-medium transition-colors"
                  style={{
                    background: active ? "rgba(99,102,241,0.25)" : "rgba(255,255,255,0.05)",
                    color: active ? "#c7d2fe" : "var(--text-muted)",
                  }}
                >
                  {q.label}
                </button>
              )
            })}
          </div>

          <div className="flex items-center justify-between mb-2">
            <button type="button" onClick={() => shift(-1)} className="w-6 h-6 rounded-md flex items-center justify-center hover:bg-[rgba(255,255,255,0.06)]" style={{ color: "var(--text-muted)" }} aria-label="Previous month">‹</button>
            <div className="text-[11px] font-semibold" style={{ color: "var(--text)" }}>{MONTHS[view.m]} {view.y}</div>
            <button type="button" onClick={() => shift(1)} className="w-6 h-6 rounded-md flex items-center justify-center hover:bg-[rgba(255,255,255,0.06)]" style={{ color: "var(--text-muted)" }} aria-label="Next month">›</button>
          </div>

          <div className="grid grid-cols-7 gap-0.5 mb-1">
            {DAYS.map((d) => (
              <div key={d} className="text-center text-[9px] font-semibold uppercase" style={{ color: "var(--text-dim)" }}>{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-0.5">
            {cells.map((c, i) => {
              if (!c) return <div key={i} />
              const selected = c === value
              const isToday = c === today
              const past = c < today
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => pick(c)}
                  className="h-7 rounded-md text-[10px] tabular-nums transition-colors hover:bg-[rgba(255,255,255,0.08)]"
                  style={{
                    background: selected ? "#6366f1" : "transparent",
                    color: selected ? "#fff" : past ? "var(--text-dim)" : "var(--text)",
                    fontWeight: selected || isToday ? 600 : 400,
                    boxShadow: isToday && !selected ? "inset 0 0 0 1px rgba(99,102,241,0.6)" : undefined,
                  }}
                  aria-label={fromIso(c).toDateString()}
                  aria-pressed={selected}
                >
                  {Number(c.slice(8))}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
