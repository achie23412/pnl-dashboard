"use client"
// Multi-select filter in the dashboard's dark style. Pick several values and
// choose whether to show only those (Include) or hide them (Exclude).
import { FloatingMenu } from "@/components/FloatingMenu"
import { useEffect, useMemo, useRef, useState } from "react"

export type FilterMode = "include" | "exclude"
export interface FilterValue {
  mode: FilterMode
  values: string[]
}
export interface FilterOption {
  value: string
  label?: string
  count?: number
}

export const EMPTY_FILTER: FilterValue = { mode: "include", values: [] }

// True when `v` passes the filter (no values selected = everything passes).
export function passes(f: FilterValue, v: string | null | undefined): boolean {
  if (!f.values.length) return true
  const hit = v != null && f.values.includes(v)
  return f.mode === "include" ? hit : !hit
}

// Same for a field with several values (e.g. markets, competitors).
export function passesAny(f: FilterValue, vs: (string | null | undefined)[]): boolean {
  if (!f.values.length) return true
  const hit = vs.some((v) => v != null && f.values.includes(v))
  return f.mode === "include" ? hit : !hit
}

export function FilterSelect({
  label,
  options,
  value,
  onChange,
  allowExclude = true,
}: {
  label: string
  options: (FilterOption | string)[]
  value: FilterValue
  onChange: (v: FilterValue) => void
  allowExclude?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState("")
  const ref = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const opts: FilterOption[] = useMemo(() => options.map((o) => (typeof o === "string" ? { value: o } : o)), [options])
  const nameOf = (v: string) => opts.find((o) => o.value === v)?.label || v

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node) && !menuRef.current?.contains(e.target as Node)) setOpen(false)
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

  const active = value.values.length > 0
  const summary = !active
    ? "all"
    : value.values.length <= 2
      ? `${value.mode === "exclude" ? "not " : ""}${value.values.map(nameOf).join(", ")}`
      : `${value.mode === "exclude" ? "excluding " : ""}${value.values.length} selected`

  const toggle = (v: string) => {
    const has = value.values.includes(v)
    onChange({ ...value, values: has ? value.values.filter((x) => x !== v) : [...value.values, v] })
  }
  const shown = q ? opts.filter((o) => (o.label || o.value).toLowerCase().includes(q.toLowerCase())) : opts
  const accent = value.mode === "exclude" ? "#f87171" : "#818cf8"

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] whitespace-nowrap transition-colors max-w-[260px]"
        style={{
          background: active ? (value.mode === "exclude" ? "rgba(248,113,113,0.1)" : "rgba(99,102,241,0.12)") : "rgba(255,255,255,0.04)",
          border: `1px solid ${active ? accent + "66" : open ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.1)"}`,
          color: "var(--text)",
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span style={{ color: "var(--text-dim)" }}>{label}:</span>
        <span className="truncate" style={{ color: active ? accent : "var(--text)" }}>{summary}</span>
        <svg width={9} height={9} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} style={{ opacity: 0.6, transform: open ? "rotate(180deg)" : undefined }}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <FloatingMenu anchor={ref} menuRef={menuRef} className="rounded-xl p-2 w-[240px]">
          {allowExclude && (
            <div className="grid grid-cols-2 gap-1 p-0.5 rounded-lg mb-2" style={{ background: "rgba(255,255,255,0.04)" }}>
              {(["include", "exclude"] as FilterMode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => onChange({ ...value, mode: m })}
                  className="py-1 rounded-md text-[10px] font-semibold capitalize transition-colors"
                  style={{
                    background: value.mode === m ? (m === "exclude" ? "rgba(248,113,113,0.18)" : "rgba(99,102,241,0.22)") : "transparent",
                    color: value.mode === m ? (m === "exclude" ? "#fca5a5" : "#c7d2fe") : "var(--text-dim)",
                  }}
                >
                  {m === "include" ? "Only show" : "Hide"}
                </button>
              ))}
            </div>
          )}
          {opts.length > 8 && (
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={`Search ${label.toLowerCase()}…`}
              className="w-full mb-1.5 px-2 py-1 rounded-md text-[10px] outline-none"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", color: "var(--text)" }}
            />
          )}
          <div className="max-h-[240px] overflow-y-auto" role="listbox" aria-multiselectable>
            {shown.length === 0 && <div className="text-[10px] px-2 py-1.5" style={{ color: "var(--text-dim)" }}>No matches</div>}
            {shown.map((o) => {
              const checked = value.values.includes(o.value)
              return (
                <button
                  key={o.value}
                  type="button"
                  role="option"
                  aria-selected={checked}
                  onClick={() => toggle(o.value)}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-[11px] text-left transition-colors hover:bg-[rgba(255,255,255,0.06)]"
                  style={{ color: "var(--text)" }}
                >
                  <span
                    className="w-3.5 h-3.5 rounded flex items-center justify-center flex-shrink-0"
                    style={{ border: `1px solid ${checked ? accent : "rgba(255,255,255,0.25)"}`, background: checked ? accent : "transparent" }}
                  >
                    {checked && (
                      <svg width={9} height={9} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={3.5}>
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </span>
                  <span className="flex-1 truncate">{o.label || o.value}</span>
                  {o.count != null && <span className="text-[9px] tabular-nums" style={{ color: "var(--text-dim)" }}>{o.count}</span>}
                </button>
              )
            })}
          </div>
          <div className="flex items-center justify-between mt-1.5 pt-1.5" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
            <button type="button" onClick={() => onChange({ ...value, values: opts.map((o) => o.value) })} className="text-[10px] px-1.5 py-0.5 rounded hover:bg-[rgba(255,255,255,0.06)]" style={{ color: "var(--text-muted)" }}>
              Select all
            </button>
            <button type="button" onClick={() => onChange(EMPTY_FILTER)} className="text-[10px] px-1.5 py-0.5 rounded hover:bg-[rgba(255,255,255,0.06)]" style={{ color: active ? "var(--text)" : "var(--text-dim)" }}>
              Clear
            </button>
          </div>
        </FloatingMenu>
      )}
    </div>
  )
}
