"use client"
import { useState, useRef, useEffect } from "react"
import { DATE_PRESETS } from "@/lib/constants"

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

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [])

  const label =
    preset === "custom"
      ? `${customFrom} — ${customTo}`
      : DATE_PRESETS.find((p) => p.value === preset)?.label || preset

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="px-4 py-2 rounded-lg text-sm border flex items-center gap-2"
        style={{ background: "var(--bg-card)", borderColor: "var(--border)", color: "var(--text)" }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
        {label}
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && (
        <div
          className="absolute right-0 top-full mt-1 rounded-lg border shadow-xl z-50 p-2 min-w-[200px]"
          style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
        >
          {DATE_PRESETS.map((p) => (
            <button
              key={p.value}
              onClick={() => {
                onChange(p.value, "", "")
                setOpen(false)
              }}
              className="block w-full text-left px-3 py-2 rounded text-sm hover:opacity-80"
              style={{
                background: preset === p.value ? "var(--bg-card-hover)" : "transparent",
                color: "var(--text)",
              }}
            >
              {p.label}
            </button>
          ))}
          <div className="border-t mt-1 pt-2 px-3" style={{ borderColor: "var(--border)" }}>
            <div className="text-xs mb-1" style={{ color: "var(--text-muted)" }}>Custom range</div>
            <div className="flex gap-2">
              <input
                type="date"
                value={customFrom}
                onChange={(e) => onChange("custom", e.target.value, customTo)}
                className="text-xs rounded px-2 py-1 border w-full"
                style={{ background: "var(--bg)", borderColor: "var(--border)", color: "var(--text)" }}
              />
              <input
                type="date"
                value={customTo}
                onChange={(e) => {
                  onChange("custom", customFrom, e.target.value)
                  setOpen(false)
                }}
                className="text-xs rounded px-2 py-1 border w-full"
                style={{ background: "var(--bg)", borderColor: "var(--border)", color: "var(--text)" }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
