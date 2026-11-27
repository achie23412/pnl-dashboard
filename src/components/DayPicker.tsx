"use client"
// One-day picker in the same look as the Main Hub date range picker (DatePicker):
// quick picks for recent days, a month calendar, and no future days. Used on the Daily Report.
import { useEffect, useMemo, useRef, useState } from "react"
import { FloatingMenu } from "@/components/FloatingMenu"

const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`)
const toISO = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`
const daysIn = (y: number, m: number) => new Date(y, m + 1, 0).getDate()
const firstWeekday = (y: number, m: number) => {
  const d = new Date(y, m, 1).getDay()
  return d === 0 ? 6 : d - 1
}
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
const DAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]
const localISO = (d: Date) => toISO(d.getFullYear(), d.getMonth(), d.getDate())
const shift = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00`)
  d.setDate(d.getDate() + n)
  return localISO(d)
}
const label = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })

export function DayPicker({ value, onChange, allowFuture = false }: { value: string; onChange: (iso: string) => void; allowFuture?: boolean }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const today = localISO(new Date())
  const base = new Date(`${value || today}T12:00:00`)
  const [view, setView] = useState({ y: base.getFullYear(), m: base.getMonth() })

  useEffect(() => {
    if (!open) return
    const b = new Date(`${value || today}T12:00:00`)
    setView({ y: b.getFullYear(), m: b.getMonth() })
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node) && !menuRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false)
    document.addEventListener("mousedown", onDown)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onDown)
      document.removeEventListener("keydown", onKey)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const presets = [
    { label: "Today", iso: today },
    { label: "Yesterday", iso: shift(today, -1) },
    { label: "2 days ago", iso: shift(today, -2) },
    { label: "Same day last week", iso: shift(value || today, -7) },
  ]

  const cells = useMemo(() => {
    const { y, m } = view
    const out: { day: number; iso: string; current: boolean }[] = []
    const prevDays = m === 0 ? daysIn(y - 1, 11) : daysIn(y, m - 1)
    for (let i = firstWeekday(y, m) - 1; i >= 0; i--) out.push({ day: prevDays - i, iso: toISO(m === 0 ? y - 1 : y, m === 0 ? 11 : m - 1, prevDays - i), current: false })
    for (let d = 1; d <= daysIn(y, m); d++) out.push({ day: d, iso: toISO(y, m, d), current: true })
    const rest = 7 - (out.length % 7)
    if (rest < 7) for (let d = 1; d <= rest; d++) out.push({ day: d, iso: toISO(m === 11 ? y + 1 : y, m === 11 ? 0 : m + 1, d), current: false })
    return out
  }, [view])

  const pick = (iso: string) => {
    if (!allowFuture && iso > today) return
    onChange(iso)
    setOpen(false)
  }
  const move = (n: number) => setView((v) => ({ y: v.y + Math.floor((v.m + n) / 12), m: (v.m + n + 12) % 12 }))
  const nextDisabled = !allowFuture && toISO(view.y, view.m, 1) >= today.slice(0, 8) + "01"

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="glass px-3 py-1.5 rounded-lg text-[10px] font-semibold flex items-center gap-1.5 transition-colors hover:bg-[rgba(255,255,255,0.06)]"
        style={{ color: "var(--text-muted)" }}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
        {value === today ? `Today · ${label(value)}` : label(value)}
        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <FloatingMenu anchor={ref} menuRef={menuRef} align="right" gap={8} role="dialog" className="rounded-2xl overflow-hidden" style={{ width: 340, boxShadow: "0 24px 64px rgba(0,0,0,0.6)" }}>
          <div style={{ height: 3, background: "linear-gradient(90deg, transparent 20%, rgba(99,102,241,0.6) 50%, transparent 80%)" }} />

          <div className="flex flex-wrap gap-1 p-3 pb-2">
            {presets.map((p) => {
              const on = p.iso === value
              return (
                <button
                  key={p.label}
                  onClick={() => pick(p.iso)}
                  className="px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors"
                  style={{
                    background: on ? "rgba(99,102,241,0.2)" : "rgba(255,255,255,0.04)",
                    color: on ? "#a5b4fc" : "var(--text-muted)",
                    border: `1px solid ${on ? "rgba(99,102,241,0.3)" : "transparent"}`,
                  }}
                >
                  {p.label}
                </button>
              )
            })}
          </div>

          <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }} />

          <div className="flex items-center justify-between px-4 py-3">
            <button
              onClick={() => move(-1)}
              aria-label="Previous month"
              className="w-8 h-8 rounded-full flex items-center justify-center transition-colors hover:bg-[rgba(255,255,255,0.08)]"
              style={{ border: "1px solid rgba(255,255,255,0.1)", color: "var(--text-muted)" }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
            </button>
            <span className="text-[15px] font-semibold tracking-tight" style={{ color: "var(--text)" }}>
              {MONTHS[view.m]} {view.y}
            </span>
            <button
              onClick={() => move(1)}
              disabled={nextDisabled}
              aria-label="Next month"
              className="w-8 h-8 rounded-full flex items-center justify-center transition-colors hover:bg-[rgba(255,255,255,0.08)] disabled:opacity-30"
              style={{ border: "1px solid rgba(255,255,255,0.1)", color: "var(--text-muted)" }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
            </button>
          </div>

          <div className="grid grid-cols-7 px-3">
            {DAYS.map((d) => (
              <div key={d} className="text-center text-[10px] font-medium uppercase tracking-wider py-1" style={{ color: "var(--text-dim)" }}>{d}</div>
            ))}
          </div>

          <div className="grid grid-cols-7 px-3 pb-4 pt-1">
            {cells.map((c) => {
              const sel = c.iso === value
              const isToday = c.iso === today
              const future = !allowFuture && c.iso > today
              return (
                <button
                  key={c.iso}
                  onClick={() => pick(c.iso)}
                  disabled={future}
                  className="relative h-9 flex items-center justify-center text-[13px] transition-all disabled:cursor-not-allowed"
                  style={{
                    color: sel ? "#fff" : future || !c.current ? "rgba(255,255,255,0.15)" : isToday ? "#a5b4fc" : "var(--text-muted)",
                    fontWeight: sel || isToday ? 600 : 400,
                  }}
                >
                  {sel && (
                    <div className="absolute inset-0 m-auto w-8 h-8 rounded-full" style={{ background: "rgba(99,102,241,0.9)", boxShadow: "0 0 16px rgba(99,102,241,0.4), 0 0 4px rgba(99,102,241,0.3)" }} />
                  )}
                  {!sel && !future && <div className="absolute inset-0 m-auto w-8 h-8 rounded-full opacity-0 hover:opacity-100 transition-opacity" style={{ background: "rgba(255,255,255,0.06)" }} />}
                  <span className="relative z-10">{c.day}</span>
                </button>
              )
            })}
          </div>
        </FloatingMenu>
      )}
    </div>
  )
}
