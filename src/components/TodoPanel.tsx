"use client"
import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import type { AutoTodo } from "@/lib/todo-rules"
import { calendarAction } from "@/lib/todo-actions"
import { SingleDatePicker } from "@/components/SingleDatePicker"

export type CustomTodo = {
  id: number
  label: string
  date: string | null
  store: string | null
  note: string | null
  done: boolean
  done_at: string | null
}

type CalEvent = { date: string; label: string; type: string; note?: string; store?: string }

type Props = {
  events: CalEvent[]
  onCustomChange?: (todos: CustomTodo[]) => void
}

type MustDo = AutoTodo & { done: boolean; due?: string }

const STORES = ["LUMEGLASSES", "Blinky", "Walsh & Farley", "Carter & Collins", "Susan & Allen"]
const inputStyle = { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "var(--text)" }

const addDays = (d: string, n: number) => {
  const x = new Date(d + "T00:00:00Z")
  x.setUTCDate(x.getUTCDate() + n)
  return x.toISOString().slice(0, 10)
}
const shortDate = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" })

export function TodoPanel({ events, onCustomChange }: Props) {
  const [today, setToday] = useState<string | null>(null)
  const [auto, setAuto] = useState<MustDo[]>([])
  const [custom, setCustom] = useState<CustomTodo[]>([])
  const [doneKeys, setDoneKeys] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [openWhy, setOpenWhy] = useState<string | null>(null)
  const [form, setForm] = useState({ label: "", date: "", store: "" })
  const [saving, setSaving] = useState(false)
  const [showDone, setShowDone] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/todos", { cache: "no-store" })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      setToday(data.today)
      setAuto(data.auto)
      setCustom(data.custom)
      setDoneKeys(new Set(data.doneKeys))
      setError(null)
      onCustomChange?.(data.custom)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
    setLoading(false)
  }, [onCustomChange])

  useEffect(() => { load() }, [load])

  // Calendar must-dos: today's events (not plain season markers) + must-do deadlines in the next 2 days
  const calendarTodos: MustDo[] = today
    ? events
        .filter((e) =>
          (e.date === today && e.type !== "season") ||
          (e.type === "deadline" && e.date > today && e.date <= addDays(today, 2)))
        .map((e) => {
          const key = `cal:${e.date}:${e.label}`
          return {
            key,
            title: e.date === today ? e.label : `${e.label} (in ${Math.round((Date.parse(e.date) - Date.parse(today)) / 86400000)}d)`,
            why: e.note || "",
            source: "Calendar",
            ...calendarAction(e),
            priority: e.type === "deadline" || e.type === "shipping" ? "high" : "normal",
            store: e.store,
            done: doneKeys.has(key),
            due: e.date,
          } as MustDo
        })
    : []

  const mustDos = [...auto, ...calendarTodos].sort(
    (a, b) => Number(a.done) - Number(b.done) || (a.priority === "high" ? 0 : 1) - (b.priority === "high" ? 0 : 1),
  )

  const toggleAuto = async (t: MustDo) => {
    const next = !t.done
    setAuto((xs) => xs.map((x) => (x.key === t.key ? { ...x, done: next } : x)))
    setDoneKeys((s) => {
      const n = new Set(s)
      if (next) n.add(t.key)
      else n.delete(t.key)
      return n
    })
    await fetch("/api/todos", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ auto_key: t.key, label: t.title, done: next }),
    })
  }

  const toggleCustom = async (t: CustomTodo) => {
    const next = !t.done
    const updated = custom.map((x) => (x.id === t.id ? { ...x, done: next, done_at: next ? new Date().toISOString() : null } : x))
    setCustom(updated)
    onCustomChange?.(updated)
    await fetch("/api/todos", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: t.id, done: next }),
    })
  }

  const removeCustom = async (t: CustomTodo) => {
    const updated = custom.filter((x) => x.id !== t.id)
    setCustom(updated)
    onCustomChange?.(updated)
    await fetch(`/api/todos?id=${t.id}`, { method: "DELETE" })
  }

  const addCustom = async () => {
    if (!form.label.trim()) return
    setSaving(true)
    try {
      const res = await fetch("/api/todos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: form.label.trim(), date: form.date || null, store: form.store || null }),
      })
      if (res.ok) {
        setForm({ label: "", date: "", store: "" })
        await load()
      } else {
        const d = await res.json().catch(() => ({}))
        setError(d.error || `HTTP ${res.status}`)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
    setSaving(false)
  }

  const t = today || ""
  const openCustom = custom.filter((c) => !c.done && (!c.date || c.date <= t))
  const laterCustom = custom.filter((c) => !c.done && c.date && c.date > t).sort((a, b) => a.date!.localeCompare(b.date!))
  const doneCustom = custom.filter((c) => c.done)
  const openMust = mustDos.filter((m) => !m.done).length

  const Check = ({ done, onClick, label }: { done: boolean; onClick: () => void; label: string }) => (
    <button
      onClick={onClick}
      aria-label={done ? `Mark "${label}" as not done` : `Mark "${label}" as done`}
      className="shrink-0 w-4 h-4 mt-[1px] rounded flex items-center justify-center transition-all"
      style={{
        border: `1.5px solid ${done ? "var(--green)" : "rgba(255,255,255,0.25)"}`,
        background: done ? "rgba(52,211,153,0.2)" : "transparent",
      }}
    >
      {done && (
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      )}
    </button>
  )

  return (
    <div className="glass rounded-xl p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[13px] font-bold" style={{ color: "var(--text)" }}>
          To-do {today && <span className="font-normal text-[11px]" style={{ color: "var(--text-dim)" }}>· {shortDate(today)}</span>}
        </h3>
        {!loading && !error && (
          <span className="text-[10px]" style={{ color: openMust ? "#ef4444" : "var(--green)" }}>
            {openMust ? `${openMust} must-do left` : "All must-dos done"}
          </span>
        )}
      </div>

      {error && (
        <div className="rounded-lg px-3 py-2 mb-3 text-[11px]" style={{ background: "rgba(239,68,68,0.1)", color: "#ef4444" }}>
          Couldn&apos;t load the to-do list: {error}
        </div>
      )}
      {loading && <div className="text-[11px]" style={{ color: "var(--text-dim)" }}>Loading…</div>}

      {!loading && !error && (
        <div className="grid gap-4 lg:grid-cols-2">
          {/* Must do */}
          <div>
            <div className="text-[9px] font-semibold uppercase tracking-wider mb-2" style={{ color: "#ef4444" }}>
              Must do · from your data and SOPs
            </div>
            <div className="space-y-1.5">
              {mustDos.length === 0 && (
                <div className="text-[11px]" style={{ color: "var(--text-dim)" }}>Nothing triggered today.</div>
              )}
              {mustDos.map((m) => (
                <div
                  key={m.key}
                  className="rounded-lg px-3 py-2"
                  style={{
                    background: m.priority === "high" && !m.done ? "rgba(239,68,68,0.08)" : "rgba(255,255,255,0.02)",
                    border: `1px solid ${m.priority === "high" && !m.done ? "rgba(239,68,68,0.2)" : "rgba(255,255,255,0.05)"}`,
                    opacity: m.done ? 0.5 : 1,
                  }}
                >
                  <div className="flex items-start gap-2">
                    <Check done={m.done} onClick={() => toggleAuto(m)} label={m.title} />
                    <button
                      className="flex-1 text-left"
                      onClick={() => setOpenWhy(openWhy === m.key ? null : m.key)}
                      aria-expanded={openWhy === m.key}
                    >
                      <div className="text-[11px] font-medium" style={{ color: "var(--text)", textDecoration: m.done ? "line-through" : undefined }}>
                        {m.priority === "high" && !m.done && <span style={{ color: "#ef4444" }}>● </span>}
                        {m.title}
                      </div>
                      {openWhy === m.key ? (
                        <div className="mt-1 text-[10px] leading-relaxed space-y-0.5">
                          {m.why && <div style={{ color: "var(--text-muted)" }}><b>Why:</b> {m.why}</div>}
                          {m.fix && <div style={{ color: "var(--text)" }}><b>Fix:</b> {m.fix}</div>}
                          <div style={{ color: "var(--text-dim)" }}><b>Rule:</b> {m.source}</div>
                        </div>
                      ) : (
                        <div className="text-[9px] mt-0.5" style={{ color: "var(--text-dim)" }}>{m.source.split(":")[0]} · tap for why and fix</div>
                      )}
                    </button>
                    {m.href && !m.done && (
                      <Link
                        href={`${m.href}${m.href.includes("?") ? "&" : "?"}fix_title=${encodeURIComponent(m.title)}&fix_why=${encodeURIComponent(m.why)}&fix_action=${encodeURIComponent(m.fix)}&fix_source=${encodeURIComponent(m.source)}${m.store ? `&fix_store=${encodeURIComponent(m.store)}` : ""}`}
                        className="text-[10px] font-semibold whitespace-nowrap px-2 py-1 rounded-md"
                        style={{ background: "rgba(99,102,241,0.15)", color: "#a5b4fc" }}
                        title={m.hrefLabel ? `Open ${m.hrefLabel}` : "Open"}
                      >
                        Go fix →
                      </Link>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* My tasks */}
          <div>
            <div className="text-[9px] font-semibold uppercase tracking-wider mb-2" style={{ color: "#818cf8" }}>My tasks</div>
            <div className="flex flex-wrap gap-2 mb-2">
              <input
                type="text"
                placeholder="Add a task…"
                value={form.label}
                onChange={(e) => setForm({ ...form, label: e.target.value })}
                onKeyDown={(e) => { if (e.key === "Enter") addCustom() }}
                className="flex-1 min-w-[160px] px-3 py-1.5 rounded-lg text-[11px]"
                style={inputStyle}
              />
              <SingleDatePicker value={form.date} onChange={(date) => setForm({ ...form, date })} />
              <select
                value={form.store}
                onChange={(e) => setForm({ ...form, store: e.target.value })}
                className="px-2 py-1.5 rounded-lg text-[11px]"
                style={inputStyle}
                aria-label="Store (optional)"
              >
                <option value="">Any store</option>
                {STORES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <button
                onClick={addCustom}
                disabled={saving || !form.label.trim()}
                className="px-3 py-1.5 rounded-lg text-[11px] font-medium"
                style={{
                  background: form.label.trim() ? "var(--accent)" : "rgba(255,255,255,0.05)",
                  color: form.label.trim() ? "#fff" : "var(--text-dim)",
                  opacity: saving ? 0.5 : 1,
                }}
              >
                {saving ? "Adding…" : "Add"}
              </button>
            </div>

            <div className="space-y-1.5">
              {openCustom.length === 0 && laterCustom.length === 0 && (
                <div className="text-[11px]" style={{ color: "var(--text-dim)" }}>No open tasks. Add one above; give it a date to put it on the calendar.</div>
              )}
              {[...openCustom, ...laterCustom].map((c) => {
                const overdue = c.date && c.date < t
                const later = c.date && c.date > t
                return (
                  <div key={c.id} className="group rounded-lg px-3 py-2 flex items-start gap-2" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}>
                    <Check done={c.done} onClick={() => toggleCustom(c)} label={c.label} />
                    <div className="flex-1 min-w-0">
                      <div className="text-[11px]" style={{ color: "var(--text)" }}>{c.label}</div>
                      {(c.date || c.store) && (
                        <div className="text-[9px] mt-0.5" style={{ color: overdue ? "#ef4444" : later ? "#818cf8" : "var(--text-dim)" }}>
                          {c.date && (overdue ? `Overdue · ${shortDate(c.date)}` : later ? `Due ${shortDate(c.date)}` : "Today")}
                          {c.date && c.store ? " · " : ""}
                          {c.store}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => removeCustom(c)}
                      aria-label={`Delete "${c.label}"`}
                      className="shrink-0 text-[10px] px-1.5 rounded opacity-50 hover:opacity-100"
                      style={{ color: "#ef4444" }}
                    >
                      ✕
                    </button>
                  </div>
                )
              })}
            </div>

            {doneCustom.length > 0 && (
              <div className="mt-2">
                <button onClick={() => setShowDone(!showDone)} className="text-[10px]" style={{ color: "var(--text-dim)" }}>
                  {showDone ? "Hide" : "Show"} done ({doneCustom.length})
                </button>
                {showDone && (
                  <div className="space-y-1.5 mt-1.5">
                    {doneCustom.map((c) => (
                      <div key={c.id} className="rounded-lg px-3 py-1.5 flex items-start gap-2" style={{ opacity: 0.5 }}>
                        <Check done onClick={() => toggleCustom(c)} label={c.label} />
                        <div className="flex-1 text-[11px] line-through" style={{ color: "var(--text)" }}>{c.label}</div>
                        <button onClick={() => removeCustom(c)} aria-label={`Delete "${c.label}"`} className="text-[10px] px-1.5" style={{ color: "#ef4444" }}>✕</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
