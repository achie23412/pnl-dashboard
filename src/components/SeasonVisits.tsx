"use client"
// Competitor monthly visitors (TrendTrack) per season category, and the "Peak starting" alerts.
// Used on the Season Board (chart + alerts) and the Main Hub (alerts only).
import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Panel, Badge, Button, Notice, Loading } from "@/components/ui"
import type { SeasonLine, PeakAlert } from "@/lib/competitor-visits"

export type SeasonVisitsData = {
  lines: SeasonLine[]
  alerts: PeakAlert[]
  months: string[]
  lastSnapshot: string | null
  rule: { risePct: number; peakWeeks: number; minVisits: number; minStores: number }
  error?: string
}

let pending: Promise<SeasonVisitsData> | null = null
export function useSeasonVisits(): { data: SeasonVisitsData | null; error: string | null; reload: () => void } {
  const [data, setData] = useState<SeasonVisitsData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [n, setN] = useState(0)
  useEffect(() => {
    let live = true
    if (n > 0) pending = null
    ;(pending ??= fetch("/api/season-visits").then((r) => r.json()))
      .then((j) => {
        if (!live) return
        if (j.error) setError(j.error)
        setData(j)
      })
      .catch((e) => {
        pending = null
        if (live) setError(e instanceof Error ? e.message : String(e))
      })
    return () => {
      live = false
    }
  }, [n])
  return { data, error, reload: () => setN((x) => x + 1) }
}

const k = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : String(Math.round(n)))
const mon = (m: string) => new Date(m + "T12:00:00Z").toLocaleDateString("en-GB", { month: "short", year: "2-digit" })

// "Peak starting" alerts. compact = Main Hub (one line each, links to the Season Board).
export function PeakAlerts({ data, market, compact }: { data: SeasonVisitsData | null; market?: string; compact?: boolean }) {
  const [open, setOpen] = useState<string | null>(null)
  if (!data?.alerts?.length) return null
  const list = data.alerts.filter((a) => !market || a.market === market)
  if (!list.length) return null
  return (
    <div className="glass rounded-xl p-3 mb-4" style={{ border: "1px solid rgba(251,191,36,0.35)", background: "rgba(251,191,36,0.06)" }}>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
        <span className="text-[12px] font-semibold" style={{ color: "var(--orange)" }}>Peak starting · {list.length}</span>
        {compact && <Link href="/season-board" className="text-[10px] underline" style={{ color: "var(--accent)" }}>Open Season Board</Link>}
      </div>
      {list.slice(0, compact ? 4 : 20).map((a) => {
        const key = `${a.market}|${a.category}`
        return (
          <div key={key} className="py-1.5 text-[11px]" style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
            <div className="flex flex-wrap items-center gap-2 cursor-pointer" onClick={() => setOpen(open === key ? null : key)}>
              <Badge tone={a.kind === "rising" ? "red" : "amber"}>{a.kind === "rising" ? "Rising" : "Peak soon"}</Badge>
              <span className="font-medium" style={{ color: "var(--text)" }}>{a.category} · {a.market}</span>
              <span style={{ color: "var(--text-muted)" }}>{a.why}</span>
              <span style={{ color: "var(--text-dim)" }}>
                → push {a.ourLive ? `your ${a.ourLive} live ${a.category === "All fashion" ? "products" : a.category.toLowerCase()}` : `nothing live yet: add ${a.category.toLowerCase()}`}
                {a.competitorBestsellers.length ? `, ${a.competitorBestsellers.length} competitor best-sellers to copy` : ""}
              </span>
            </div>
            {!compact && open === key && (
              <div className="grid gap-3 md:grid-cols-2 mt-2 pl-1 text-[10px]" style={{ color: "var(--text-muted)" }}>
                <div>
                  <div className="font-semibold mb-0.5" style={{ color: "var(--text)" }}>Push budget on (live in your store)</div>
                  {a.ourExamples.length ? a.ourExamples.map((t) => <div key={t} className="truncate">{t}</div>) : <div>None live: list a test batch of 15 (see What to list next below).</div>}
                  {a.ourLive > a.ourExamples.length && <div style={{ color: "var(--text-dim)" }}>+{a.ourLive - a.ourExamples.length} more</div>}
                </div>
                <div>
                  <div className="font-semibold mb-0.5" style={{ color: "var(--text)" }}>Add: competitor best-sellers in {a.category}</div>
                  {a.competitorBestsellers.length ? (
                    a.competitorBestsellers.map((p) => (
                      <div key={p.url} className="truncate">
                        <a href={p.url} target="_blank" rel="noreferrer" className="underline">{p.title}</a> <span style={{ color: "var(--text-dim)" }}>· {p.store}</span>
                      </div>
                    ))
                  ) : (
                    <div>No scanned best-sellers yet (Opportunities scans competitors daily).</div>
                  )}
                  <Link href="/opportunities" className="underline" style={{ color: "var(--accent)" }}>All opportunities</Link>
                </div>
              </div>
            )}
          </div>
        )
      })}
      {compact && list.length > 4 && <div className="text-[10px] mt-1" style={{ color: "var(--text-dim)" }}>+{list.length - 4} more on the Season Board</div>}
    </div>
  )
}

const PALETTE = ["#a5b4fc", "#fbbf24", "#34d399", "#f472b6", "#60a5fa", "#fb923c", "#c084fc", "#2dd4bf"]

function LineChart({ lines, months }: { lines: SeasonLine[]; months: string[] }) {
  const W = 720
  const H = 200
  const P = { l: 44, r: 10, t: 10, b: 22 }
  const max = Math.max(1, ...lines.flatMap((l) => l.points.map((p) => p.visits)))
  const x = (m: string) => P.l + (months.indexOf(m) / Math.max(1, months.length - 1)) * (W - P.l - P.r)
  const y = (v: number) => P.t + (1 - v / max) * (H - P.t - P.b)
  const ticks = [0, 0.5, 1].map((f) => max * f)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 240 }} role="img" aria-label="Competitor monthly visitors per category">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={P.l} x2={W - P.r} y1={y(t)} y2={y(t)} stroke="rgba(255,255,255,0.06)" />
          <text x={P.l - 6} y={y(t) + 3} textAnchor="end" fontSize="9" fill="var(--text-dim)">{k(t)}</text>
        </g>
      ))}
      {months.map((m, i) => (i % 3 === 0 || i === months.length - 1 ? <text key={m} x={x(m)} y={H - 6} textAnchor="middle" fontSize="9" fill="var(--text-dim)">{mon(m)}</text> : null))}
      {lines.map((l, i) => {
        const pts = l.points.filter((p) => months.includes(p.month))
        const c = PALETTE[i % PALETTE.length]
        return (
          <g key={l.category}>
            <polyline points={pts.map((p) => `${x(p.month)},${y(p.visits)}`).join(" ")} fill="none" stroke={c} strokeWidth={l.category === "All fashion" ? 2.2 : 1.6} strokeDasharray={l.category === "All fashion" ? undefined : undefined} />
            {pts.map((p) => (
              <circle key={p.month} cx={x(p.month)} cy={y(p.visits)} r={pts.length === 1 ? 3.5 : 2} fill={c}>
                <title>{`${l.category} · ${mon(p.month)}: ${p.visits.toLocaleString("en-GB")} visits (${p.stores} stores)`}</title>
              </circle>
            ))}
          </g>
        )
      })}
    </svg>
  )
}

// Season Board panel: monthly visitors per category for one market, with "Read TrendTrack now".
export function VisitorLinesPanel({ data, error, market, onReload }: { data: SeasonVisitsData | null; error: string | null; market: string; onReload: () => void }) {
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const mine = useMemo(() => (data?.lines || []).filter((l) => l.market === market), [data, market])
  const [picked, setPicked] = useState<string[] | null>(null)
  const shown = mine.filter((l) => (picked ? picked.includes(l.category) : true)).slice(0, picked ? 8 : 5)
  const months = (data?.months || []).slice(-13)

  const snapshot = async () => {
    setBusy(true)
    setMsg(null)
    const r = await fetch("/api/season-visits", { method: "POST" }).catch(() => null)
    const j = r ? await r.json().catch(() => null) : null
    setBusy(false)
    if (!r?.ok) return setMsg(j?.error || "Couldn't read TrendTrack")
    setMsg(`${j.refreshed} stores refreshed (${j.month})${j.histories ? `, history copied for ${j.histories}` : ""}${j.remaining ? `, ${j.remaining} left for the next run` : ""}${j.historySkipped ? ` · history skipped: ${j.historySkipped}` : ""}${j.errors?.length ? ` · ${j.errors[0]}` : ""}`)
    onReload()
  }

  return (
    <Panel
      className="mb-4"
      title={`Competitor visitors · ${market}`}
      sub={`Monthly visitors of the tracked competitors per clothing type (TrendTrack), saved every month so the line builds history. Hover a point for the numbers. ${data?.lastSnapshot ? `Last read ${new Date(data.lastSnapshot).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}.` : "Not read from TrendTrack yet."}`}
      right={<Button size="sm" onClick={snapshot} disabled={busy}>{busy ? "Reading TrendTrack…" : "Read TrendTrack now"}</Button>}
    >
      {msg && <div className="text-[10px] mb-2" style={{ color: "var(--text-muted)" }}>{msg}</div>}
      {error && <Notice tone="error">Couldn&apos;t load competitor visitors: {error}</Notice>}
      {!data && !error && <Loading>Loading competitor visitors…</Loading>}
      {data && !mine.length && (
        <div className="text-[11px]" style={{ color: "var(--text-dim)" }}>No competitor in {market} has visitor numbers yet. Add competitors for this market on the Competitor Tracker; TrendTrack is read every morning.</div>
      )}
      {mine.length > 0 && (
        <>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {mine.map((l, i) => {
              const on = picked ? picked.includes(l.category) : i < 5
              const c = on ? PALETTE[shown.findIndex((s) => s.category === l.category) % PALETTE.length] : undefined
              return (
                <button
                  key={l.category}
                  onClick={() => {
                    const cur = picked || mine.slice(0, 5).map((x) => x.category)
                    setPicked(cur.includes(l.category) ? cur.filter((x) => x !== l.category) : [...cur, l.category])
                  }}
                  className="rounded-md px-2 py-0.5 text-[10px]"
                  style={{ border: `1px solid ${on ? c : "rgba(255,255,255,0.1)"}`, color: on ? "var(--text)" : "var(--text-dim)" }}
                  title={`${l.stores} stores`}
                >
                  {l.category}{" "}
                  <span style={{ color: l.mom == null ? "var(--text-dim)" : l.mom > 0 ? "var(--green)" : "var(--red)" }}>
                    {l.mom == null ? "" : `${l.mom > 0 ? "+" : ""}${l.mom}%`}
                  </span>
                </button>
              )
            })}
          </div>
          <LineChart lines={shown} months={months} />
          <div className="text-[9px] mt-1" style={{ color: "var(--text-dim)" }}>
            % = latest month vs the month before, same stores. &quot;All fashion&quot; = every tracked competitor in {market}. A store&apos;s category comes from its niche on the Competitor Tracker (general stores count only in All fashion).
            Peak starting = visitors up more than {data?.rule.risePct}% month-over-month (at least {k(data?.rule.minVisits || 0)} visits, {data?.rule.minStores} stores) or within {data?.rule.peakWeeks} weeks of last year&apos;s peak month.
          </div>
        </>
      )}
    </Panel>
  )
}

// Main Hub: the alerts for all markets, one line each.
export function HomePeakAlerts() {
  const { data } = useSeasonVisits()
  return <PeakAlerts data={data} compact />
}
