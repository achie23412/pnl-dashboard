"use client"
// Single-choice dropdown in the same look as FilterSelect ("Label: value ⌄").
// Use it everywhere a native <select> was used: sort orders, modes, form fields.
// For filters where picking several values makes sense, use FilterSelect.
import { useEffect, useMemo, useRef, useState } from "react"

export interface PillOption {
  value: string
  label?: string
  count?: number
  hint?: string // small grey text under the label
}

export function PillSelect({
  label,
  value,
  onChange,
  options,
  placeholder = "choose…",
  fullWidth = false,
  align = "left",
  disabled = false,
  title,
}: {
  label?: string // shown before the value ("Store: all"); omit in forms that already have a label
  value: string
  onChange: (v: string) => void
  options: (PillOption | string)[]
  placeholder?: string
  fullWidth?: boolean
  align?: "left" | "right"
  disabled?: boolean
  title?: string
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState("")
  const [hi, setHi] = useState(-1)
  const ref = useRef<HTMLDivElement>(null)
  const opts: PillOption[] = useMemo(() => options.map((o) => (typeof o === "string" ? { value: o } : o)), [options])
  const current = opts.find((o) => o.value === value)
  const shown = q ? opts.filter((o) => (o.label || o.value).toLowerCase().includes(q.toLowerCase())) : opts

  useEffect(() => {
    if (!open) return
    setHi(Math.max(0, shown.findIndex((o) => o.value === value)))
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onDown)
    return () => document.removeEventListener("mousedown", onDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const pick = (v: string) => {
    onChange(v)
    setOpen(false)
    setQ("")
  }
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") return setOpen(false)
    if (!open && (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ")) {
      e.preventDefault()
      return setOpen(true)
    }
    if (!open) return
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setHi((h) => Math.min(shown.length - 1, h + 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setHi((h) => Math.max(0, h - 1))
    } else if (e.key === "Enter" && shown[hi]) {
      e.preventDefault()
      pick(shown[hi].value)
    }
  }

  return (
    <div className={`relative ${fullWidth ? "w-full" : ""}`} ref={ref} onKeyDown={onKey}>
      <button
        type="button"
        disabled={disabled}
        title={title}
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] whitespace-nowrap transition-colors ${fullWidth ? "w-full justify-between py-1.5" : "max-w-[260px]"}`}
        style={{
          background: "rgba(255,255,255,0.04)",
          border: `1px solid ${open ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.1)"}`,
          color: "var(--text)",
          opacity: disabled ? 0.5 : 1,
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="flex items-center gap-1.5 min-w-0">
          {label && <span style={{ color: "var(--text-dim)" }}>{label}:</span>}
          <span className="truncate" style={{ color: current ? "var(--text)" : "var(--text-dim)" }}>
            {current ? current.label || current.value : placeholder}
          </span>
        </span>
        <svg width={9} height={9} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} style={{ opacity: 0.6, flexShrink: 0, transform: open ? "rotate(180deg)" : undefined }}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div
          className={`absolute ${align === "right" ? "right-0" : "left-0"} top-full mt-1.5 z-50 rounded-xl p-1.5 ${fullWidth ? "w-full min-w-[200px]" : "min-w-[200px] max-w-[320px]"}`}
          style={{ background: "rgba(15,19,32,0.98)", border: "1px solid rgba(255,255,255,0.1)", boxShadow: "0 12px 32px rgba(0,0,0,0.45)", backdropFilter: "blur(16px)" }}
        >
          {opts.length > 8 && (
            <input
              autoFocus
              value={q}
              onChange={(e) => {
                setQ(e.target.value)
                setHi(0)
              }}
              placeholder={`Search${label ? " " + label.toLowerCase() : ""}…`}
              className="w-full mb-1.5 px-2 py-1 rounded-md text-[10px] outline-none"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", color: "var(--text)" }}
            />
          )}
          <div className="max-h-[260px] overflow-y-auto" role="listbox">
            {shown.length === 0 && <div className="text-[10px] px-2 py-1.5" style={{ color: "var(--text-dim)" }}>No matches</div>}
            {shown.map((o, i) => {
              const sel = o.value === value
              return (
                <button
                  key={o.value}
                  type="button"
                  role="option"
                  aria-selected={sel}
                  onClick={() => pick(o.value)}
                  onMouseEnter={() => setHi(i)}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-[11px] text-left transition-colors"
                  style={{ color: sel ? "#c7d2fe" : "var(--text)", background: i === hi ? "rgba(255,255,255,0.06)" : sel ? "rgba(99,102,241,0.12)" : "transparent" }}
                >
                  <span className="w-3 flex-shrink-0">
                    {sel && (
                      <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="#818cf8" strokeWidth={3.5}>
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block truncate">{o.label || o.value}</span>
                    {o.hint && <span className="block text-[9px] truncate" style={{ color: "var(--text-dim)" }}>{o.hint}</span>}
                  </span>
                  {o.count != null && <span className="text-[9px] tabular-nums" style={{ color: "var(--text-dim)" }}>{o.count}</span>}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// Wraps filters in one line (wraps on small screens), same spacing on every page.
export function FilterBar({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2 mb-4">
      {children}
      {right && <div className="ml-auto flex items-center gap-2">{right}</div>}
    </div>
  )
}
