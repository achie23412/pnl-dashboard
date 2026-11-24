"use client"
import { useState, useRef, useEffect, useMemo } from "react"
import { DATE_PRESETS } from "@/lib/constants"

function pad(n: number) { return n < 10 ? `0${n}` : `${n}` }
function toISO(y: number, m: number, d: number) { return `${y}-${pad(m + 1)}-${pad(d)}` }

function getDaysInMonth(year: number, month: number) { return new Date(year, month + 1, 0).getDate() }
function getFirstDayOfWeek(year: number, month: number) {
  const d = new Date(year, month, 1).getDay()
  return d === 0 ? 6 : d - 1
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
const DAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]

export function DatePicker({
  preset,
  customFrom,
  customTo,
  onChange,
}: {
  preset: string
  customFrom: string
  customTo: string
  onChange: (preset: string, from: string, to: string) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const now = new Date()
  const [viewYear, setViewYear] = useState(now.getFullYear())
  const [viewMonth, setViewMonth] = useState(now.getMonth())

  const [rangeStart, setRangeStart] = useState<string | null>(customFrom || null)
  const [rangeEnd, setRangeEnd] = useState<string | null>(customTo || null)
  const [hoveredDate, setHoveredDate] = useState<string | null>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [])

  useEffect(() => {
    if (customFrom) setRangeStart(customFrom)
    if (customTo) setRangeEnd(customTo)
  }, [customFrom, customTo])

  const label =
    preset === "custom"
      ? `${customFrom} — ${customTo}`
      : DATE_PRESETS.find((p) => p.value === preset)?.label || preset

  function prevMonth() {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(viewYear - 1) }
    else setViewMonth(viewMonth - 1)
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(viewYear + 1) }
    else setViewMonth(viewMonth + 1)
  }

  const days = useMemo(() => {
    const daysInMonth = getDaysInMonth(viewYear, viewMonth)
    const firstDay = getFirstDayOfWeek(viewYear, viewMonth)
    const prevMonthDays = viewMonth === 0 ? getDaysInMonth(viewYear - 1, 11) : getDaysInMonth(viewYear, viewMonth - 1)
    const cells: { day: number; iso: string; current: boolean }[] = []

    for (let i = firstDay - 1; i >= 0; i--) {
      const d = prevMonthDays - i
      const m = viewMonth === 0 ? 11 : viewMonth - 1
      const y = viewMonth === 0 ? viewYear - 1 : viewYear
      cells.push({ day: d, iso: toISO(y, m, d), current: false })
    }
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({ day: d, iso: toISO(viewYear, viewMonth, d), current: true })
    }
    const remaining = 7 - (cells.length % 7)
    if (remaining < 7) {
      for (let d = 1; d <= remaining; d++) {
        const m = viewMonth === 11 ? 0 : viewMonth + 1
        const y = viewMonth === 11 ? viewYear + 1 : viewYear
        cells.push({ day: d, iso: toISO(y, m, d), current: false })
      }
    }
    return cells
  }, [viewYear, viewMonth])

  const todayISO = toISO(now.getFullYear(), now.getMonth(), now.getDate())

  function handleDayClick(iso: string) {
    if (!rangeStart || (rangeStart && rangeEnd)) {
      setRangeStart(iso)
      setRangeEnd(null)
    } else {
      const from = iso < rangeStart ? iso : rangeStart
      const to = iso < rangeStart ? rangeStart : iso
      setRangeStart(from)
      setRangeEnd(to)
      onChange("custom", from, to)
      setOpen(false)
    }
  }

  function isInRange(iso: string) {
    if (rangeStart && rangeEnd) return iso >= rangeStart && iso <= rangeEnd
    if (rangeStart && !rangeEnd && hoveredDate) {
      const from = hoveredDate < rangeStart ? hoveredDate : rangeStart
      const to = hoveredDate < rangeStart ? rangeStart : hoveredDate
      return iso >= from && iso <= to
    }
    return false
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="glass px-3 py-1.5 rounded-lg text-[10px] font-semibold flex items-center gap-1.5 transition-colors hover:bg-[rgba(255,255,255,0.06)]"
        style={{ color: "var(--text-muted)" }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
        {label}
        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-2 rounded-2xl shadow-2xl z-50 overflow-hidden"
          style={{
            background: "rgba(13,18,36,0.97)",
            backdropFilter: "blur(32px)",
            border: "1px solid rgba(255,255,255,0.08)",
            boxShadow: "0 24px 64px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04)",
            width: 340,
          }}
        >
          {/* Top glow accent */}
          <div style={{
            height: 3,
            background: "linear-gradient(90deg, transparent 20%, rgba(99,102,241,0.6) 50%, transparent 80%)",
            borderRadius: "2px 2px 0 0",
          }} />

          {/* Presets row */}
          <div className="flex flex-wrap gap-1 p-3 pb-2">
            {DATE_PRESETS.map((p) => (
              <button
                key={p.value}
                onClick={() => {
                  onChange(p.value, "", "")
                  setOpen(false)
                }}
                className="px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors"
                style={{
                  background: preset === p.value ? "rgba(99,102,241,0.2)" : "rgba(255,255,255,0.04)",
                  color: preset === p.value ? "#a5b4fc" : "var(--text-muted)",
                  border: `1px solid ${preset === p.value ? "rgba(99,102,241,0.3)" : "transparent"}`,
                }}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }} />

          {/* Month navigation */}
          <div className="flex items-center justify-between px-4 py-3">
            <button
              onClick={prevMonth}
              className="w-8 h-8 rounded-full flex items-center justify-center transition-colors hover:bg-[rgba(255,255,255,0.08)]"
              style={{ border: "1px solid rgba(255,255,255,0.1)", color: "var(--text-muted)" }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
            <span className="text-[15px] font-semibold tracking-tight" style={{ color: "var(--text)" }}>
              {MONTHS[viewMonth]} {viewYear}
            </span>
            <button
              onClick={nextMonth}
              className="w-8 h-8 rounded-full flex items-center justify-center transition-colors hover:bg-[rgba(255,255,255,0.08)]"
              style={{ border: "1px solid rgba(255,255,255,0.1)", color: "var(--text-muted)" }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          </div>

          {/* Day headers */}
          <div className="grid grid-cols-7 px-3">
            {DAYS.map((d) => (
              <div key={d} className="text-center text-[10px] font-medium uppercase tracking-wider py-1" style={{ color: "var(--text-dim)" }}>
                {d}
              </div>
            ))}
          </div>

          {/* Day grid */}
          <div className="grid grid-cols-7 px-3 pb-4 pt-1">
            {days.map((cell, i) => {
              const isToday = cell.iso === todayISO
              const isSelected = cell.iso === rangeStart || cell.iso === rangeEnd
              const inRange = isInRange(cell.iso)
              const isRangeStart = cell.iso === rangeStart
              const isRangeEnd = cell.iso === rangeEnd || (!rangeEnd && cell.iso === hoveredDate && rangeStart)

              return (
                <button
                  key={i}
                  onClick={() => handleDayClick(cell.iso)}
                  onMouseEnter={() => setHoveredDate(cell.iso)}
                  onMouseLeave={() => setHoveredDate(null)}
                  className="relative h-9 flex items-center justify-center text-[13px] transition-all"
                  style={{
                    color: isSelected
                      ? "#fff"
                      : !cell.current
                      ? "rgba(255,255,255,0.15)"
                      : isToday
                      ? "#a5b4fc"
                      : inRange
                      ? "#c7d2fe"
                      : "var(--text-muted)",
                    fontWeight: isSelected || isToday ? 600 : 400,
                    background: inRange && !isSelected ? "rgba(99,102,241,0.08)" : "transparent",
                    borderRadius: isRangeStart ? "8px 0 0 8px" : isRangeEnd ? "0 8px 8px 0" : "0",
                  }}
                >
                  {isSelected && (
                    <div
                      className="absolute inset-0 m-auto w-8 h-8 rounded-full"
                      style={{
                        background: "rgba(99,102,241,0.9)",
                        boxShadow: "0 0 16px rgba(99,102,241,0.4), 0 0 4px rgba(99,102,241,0.3)",
                      }}
                    />
                  )}
                  <span className="relative z-10">{cell.day}</span>
                </button>
              )
            })}
          </div>

          {/* Range hint */}
          {rangeStart && !rangeEnd && (
            <div className="text-center text-[11px] pb-3" style={{ color: "var(--text-dim)" }}>
              Click end date to complete range
            </div>
          )}
        </div>
      )}
    </div>
  )
}
