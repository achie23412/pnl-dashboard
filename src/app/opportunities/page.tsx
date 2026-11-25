"use client"
import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { runCompetitorScan, type ScanProgress } from "@/lib/competitor-scan"
import { ADAPT_CHECKS, TARGET_STORES, daysBetween, todayIn, missingChecks, type OppStatus } from "@/lib/opportunity-engine"
import { ImportJobActions, type ImportJob } from "@/components/ImportJobActions"
import { FixBanner } from "@/components/FixBanner"

interface Evidence {
  key: string
  competitor_domain: string
  competitor_name: string | null
  url: string
  title: string
  image: string | null
  price: number | null
  currency: string | null
  currency_assumed: boolean
  first_seen: string
  last_seen: string
  published_at: string | null
  bestseller_rank: number | null
}

interface Opportunity {
  id: number
  title: string
  category: string | null
  gender: string | null
  image: string | null
  status: OppStatus
  priority: "high" | "medium" | "low" | null
  priority_reason: string | null
  evidence_score: number | null
  commercial_score: number | null
  evidence?: Evidence[] // only in the detail response (loaded when a card opens)
  competitor_domains?: string[]
  first_source_url?: string | null
  competitor_count: number
  observations?: string[]
  inferences?: string[]
  data_gaps?: string[]
  season: string | null
  event_label: string | null
  event_date: string | null
  launch_by: string | null
  timing_source: "calendar" | "assumed" | null
  timing_note: string | null
  markets: string[]
  target_store: string | null
  source_url: string | null
  catalogue_match: string | null
  notes: string
  adapt_checks: Record<string, boolean>
  last_import_job_id: number | null
  first_observed: string | null
  last_observed: string | null
  updated_at: string
}

interface HistoryRow {
  id: number
  at: string
  from_status: string | null
  to_status: string | null
  note: string
}

const STATUS_LABEL: Record<OppStatus, string> = {
  new: "New",
  under_review: "Under review",
  approved: "Approved",
  queued: "Queued for import",
  importing: "Importing",
  imported: "Imported",
  adapting: "Adapting",
  ready_for_review: "Ready for final review",
  ready_to_publish: "Ready to publish",
  saved: "Saved for later",
  rejected: "Rejected",
  failed: "Import failed",
}

const TABS: { key: string; label: string; statuses: OppStatus[] }[] = [
  { key: "review", label: "To review", statuses: ["new", "under_review"] },
  { key: "approved", label: "Approved", statuses: ["approved"] },
  { key: "import", label: "Importing", statuses: ["queued", "importing", "failed"] },
  { key: "adapt", label: "Adapting", statuses: ["imported", "adapting"] },
  { key: "ready", label: "Ready", statuses: ["ready_for_review", "ready_to_publish"] },
  { key: "saved", label: "Saved", statuses: ["saved"] },
  { key: "rejected", label: "Rejected", statuses: ["rejected"] },
]

const PRIORITY_COLOR = { high: "var(--green)", medium: "var(--orange)", low: "var(--text-dim)" }
const STORE_TZ: Record<string, string> = Object.fromEntries(TARGET_STORES.map((s) => [s.name, s.timezone]))
const STORE_NAMES = ["Walsh & Farley", "Carter & Collins", "Susan & Allen", "LUMEGLASSES", "Blinky"]

const btn = "px-2.5 py-1 rounded-md text-[10px] font-semibold transition-opacity"
const field = "bg-transparent border rounded-md px-2 py-1 text-[10px]"
const border = { borderColor: "rgba(255,255,255,0.1)", color: "var(--text)" }

function money(price: number | null, cur: string | null, assumed: boolean) {
  if (price == null) return "—"
  return `${cur || "?"} ${price.toFixed(2)}${assumed ? "*" : ""}`
}

export default function OpportunitiesPage() {
  const [opps, setOpps] = useState<Opportunity[]>([])
  const [jobs, setJobs] = useState<ImportJob[]>([])
  const [patterns, setPatterns] = useState<{ label: string; detail: string }[]>([])
  const [scanInfo, setScanInfo] = useState<{ products_in_window: number; competitors_in_window: number; last_scan: string | null } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [setupNeeded, setSetupNeeded] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [scan, setScan] = useState<ScanProgress | null>(null)
  const [scanning, setScanning] = useState(false)

  const [tab, setTab] = useState("review")
  const [fStore, setFStore] = useState("all")
  const [fMarket, setFMarket] = useState("all")
  const [fCompetitor, setFCompetitor] = useState("all")
  const [fCategory, setFCategory] = useState("all")
  const [fSeason, setFSeason] = useState("all")
  const [fPriority, setFPriority] = useState("all")
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [open, setOpen] = useState<number | null>(null)
  const [bulkStore, setBulkStore] = useState("")

  const CACHE_KEY = "opportunities:v3"
  const applyData = (json: { opportunities?: Opportunity[]; jobs?: ImportJob[]; patterns?: { label: string; detail: string }[]; scan?: typeof scanInfo }) => {
    setOpps(json.opportunities || [])
    setJobs(json.jobs || [])
    setPatterns(json.patterns || [])
    setScanInfo(json.scan || null)
  }
  // Show the last loaded list right away (this browser only), then refresh.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(CACHE_KEY)
      if (raw) {
        applyData(JSON.parse(raw))
        setLoading(false)
      }
    } catch {
      // storage unavailable: load normally
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/opportunities", { cache: "no-store" })
      const json = await res.json()
      if (!res.ok) {
        setSetupNeeded(!!json.setup_needed)
        throw new Error(json.error || `HTTP ${res.status}`)
      }
      applyData(json)
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(json))
      } catch {
        // quota exceeded: caching is optional
      }
      setError(null)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // Deep links from the calendar to-do list: ?season=, ?store=, ?tab=
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search)
    const season = sp.get("season")
    const st = sp.get("store")
    const t = sp.get("tab")
    if (season) setFSeason(season)
    if (st) setFStore(st)
    if (t && TABS.some((x) => x.key === t)) setTab(t)
  }, [])

  const flash = (m: string) => {
    if (!m) return
    setToast(m)
    setTimeout(() => setToast(null), 4000)
  }

  const startScan = async () => {
    setScanning(true)
    setError(null)
    try {
      // 1) Server scan in rounds (same as the daily automatic scan).
      let scanned = 0
      let blocked = 0
      let failedCount = 0
      for (let round = 1; round <= 8; round++) {
        setScan({ done: scanned, total: scanned + 1, current: `server scan, round ${round}`, products: 0, failed: [] })
        const res = await fetch("/api/opportunities/auto-scan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ recompute: false }) })
        const j = await res.json()
        if (!res.ok) throw new Error(j.error || `Scan failed (HTTP ${res.status})`)
        scanned += j.scanned
        blocked += j.blocked
        failedCount += j.failed.length
        if (j.remaining === 0 || j.scanned + j.failed.length === 0) break
      }
      // 2) If the stores block the server, read them from this browser instead.
      if (blocked > 0 && blocked >= scanned) {
        const r = await runCompetitorScan((p) => setScan(p))
        flash(`Scan done (browser): ${r.created} new, ${r.updated} updated${r.failed?.length ? ` · ${r.failed.length} stores unreadable` : ""}.`)
      } else {
        const rc = await fetch("/api/opportunities", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "recompute" }) })
        const rj = await rc.json()
        if (!rc.ok) throw new Error(rj.error || "Rebuilding opportunities failed")
        flash(`Scan done: ${scanned} stores read, ${rj.created} new, ${rj.updated} updated${rj.resurfaced ? `, ${rj.resurfaced} resurfaced` : ""}${failedCount ? ` · ${failedCount} stores unreadable` : ""}.`)
      }
      await load()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setScanning(false)
      setScan(null)
    }
  }

  const patch = async (id: number, body: Record<string, unknown>) => {
    const res = await fetch(`/api/opportunities/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
    const json = await res.json()
    if (!res.ok) {
      flash(json.error || "Update failed")
      return false
    }
    setOpps((list) => list.map((o) => (o.id === id ? { ...o, ...json.opportunity } : o)))
    return true
  }

  const bulk = async (to: OppStatus) => {
    const ids = Array.from(selected)
    const res = await fetch("/api/opportunities/bulk", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids, to, target_store: bulkStore || undefined }) })
    const json = await res.json()
    const failed = (json.results || []).filter((r: { ok: boolean }) => !r.ok)
    flash(`${ids.length - failed.length} updated${failed.length ? `, ${failed.length} skipped (${failed[0].error})` : ""}.`)
    setSelected(new Set())
    load()
  }

  const queue = async (ids: number[]) => {
    const res = await fetch("/api/import-jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "queue", opportunity_ids: ids }) })
    const json = await res.json()
    const failed = (json.results || []).filter((r: { ok: boolean }) => !r.ok)
    flash(`${ids.length - failed.length} sent to the importer${failed.length ? `, ${failed.length} skipped (${failed[0].error})` : ""}.`)
    setSelected(new Set())
    load()
  }

  // ---------- filters
  const options = useMemo(() => {
    const uniq = (xs: (string | null | undefined)[]) => Array.from(new Set(xs.filter(Boolean) as string[])).sort()
    return {
      markets: uniq(opps.flatMap((o) => o.markets)),
      competitors: uniq(opps.flatMap((o) => o.competitor_domains || [])),
      categories: uniq(opps.map((o) => o.category)),
      seasons: uniq([...opps.map((o) => o.event_label || o.season), ...opps.map((o) => o.season), fSeason !== "all" ? fSeason : null]),
    }
  }, [opps, fSeason])

  const tabStatuses = TABS.find((t) => t.key === tab)?.statuses || []
  const visible = useMemo(
    () =>
      opps.filter(
        (o) =>
          tabStatuses.includes(o.status) &&
          (fStore === "all" || (fStore === "none" ? !o.target_store : o.target_store === fStore)) &&
          (fMarket === "all" || o.markets.includes(fMarket)) &&
          (fCompetitor === "all" || (o.competitor_domains || []).includes(fCompetitor)) &&
          (fCategory === "all" || o.category === fCategory) &&
          (fSeason === "all" || (o.event_label || o.season) === fSeason || o.season === fSeason) &&
          (fPriority === "all" || o.priority === fPriority),
      ),
    [opps, tabStatuses, fStore, fMarket, fCompetitor, fCategory, fSeason, fPriority],
  )
  const counts = useMemo(() => Object.fromEntries(TABS.map((t) => [t.key, opps.filter((o) => t.statuses.includes(o.status)).length])), [opps])
  const jobById = useMemo(() => new Map(jobs.map((j) => [j.id, j])), [jobs])

  const toggle = (id: number) =>
    setSelected((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  return (
    <div className="p-6 min-h-screen" style={{ background: "var(--bg)" }}>
      <div className="text-[10px] mb-1" style={{ color: "var(--text-dim)" }}>Front End → Product Opportunities</div>
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-4">
        <div>
          <h1 className="text-[20px] font-bold mb-1" style={{ color: "var(--text)" }}>Product Opportunities</h1>
          <p className="text-[12px] max-w-3xl" style={{ color: "var(--text-muted)" }}>
            Competitor research → your review → import as draft → adapt with Redo Listing → final check. Nothing is published from here.
          </p>
          <div className="text-[10px] mt-1" style={{ color: "var(--text-dim)" }}>
            {scanInfo?.last_scan
              ? `Last scan ${scanInfo.last_scan} · ${scanInfo.products_in_window.toLocaleString()} products from ${scanInfo.competitors_in_window} competitors (last 45 days)`
              : "No scan yet."}
            {" · Updates automatically every morning (06:30); season dates roll forward on their own."}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={startScan} disabled={scanning || setupNeeded} className={btn} style={{ background: "var(--accent)", color: "#fff", opacity: scanning || setupNeeded ? 0.5 : 1 }}>
            {scanning ? "Scanning…" : "Scan competitors"}
          </button>
        </div>
      </div>

      <FixBanner />

      {scan && (
        <div className="glass rounded-xl px-4 py-2.5 mb-4 text-[11px]" style={{ color: "var(--text-muted)" }}>
          Scanning {scan.done}/{scan.total} · {scan.current} · {scan.products.toLocaleString()} products read
          {scan.failed.length > 0 && ` · ${scan.failed.length} unreadable`}
          <div className="h-1 mt-2 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
            <div className="h-full" style={{ width: `${(scan.done / Math.max(scan.total, 1)) * 100}%`, background: "var(--accent)" }} />
          </div>
        </div>
      )}
      {toast && (
        <div className="fixed bottom-5 right-5 z-50 rounded-lg px-4 py-2 text-[11px]" style={{ background: "#1f2937", color: "#fff", border: "1px solid rgba(255,255,255,0.1)" }}>
          {toast}
        </div>
      )}
      {error && (
        <div className="rounded-xl px-4 py-2.5 mb-4 text-[11px]" style={{ background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.2)", color: "var(--red)" }}>
          {error}
          {setupNeeded && <div className="mt-1" style={{ color: "var(--text-muted)" }}>One-time setup: paste <code>supabase/opportunities.sql</code> into the Supabase SQL editor and run it.</div>}
        </div>
      )}

      {patterns.length > 0 && (
        <div className="glass rounded-xl p-4 mb-4">
          <div className="text-[11px] font-semibold mb-2" style={{ color: "var(--text)" }}>Patterns across tracked competitors <span className="font-normal" style={{ color: "var(--text-dim)" }}>(observed counts, not sales)</span></div>
          <div className="space-y-1">
            {patterns.map((p) => (
              <div key={p.label} className="text-[10px]">
                <span style={{ color: "var(--text-muted)" }}>{p.label}: </span>
                <span style={{ color: "var(--text)" }}>{p.detail}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="glass rounded-xl p-1.5 inline-flex gap-1 overflow-x-auto mb-3">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => {
              setTab(t.key)
              setSelected(new Set())
            }}
            className="px-3 py-1.5 rounded-lg text-[11px] font-semibold whitespace-nowrap"
            style={{ background: tab === t.key ? "rgba(255,255,255,0.08)" : "transparent", color: tab === t.key ? "#fff" : "var(--text-dim)" }}
          >
            {t.label} <span style={{ color: "var(--text-dim)" }}>{counts[t.key] || 0}</span>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-3">
        {[
          { v: fStore, set: setFStore, label: "Store", opts: [...STORE_NAMES, "none"] },
          { v: fMarket, set: setFMarket, label: "Market", opts: options.markets },
          { v: fCompetitor, set: setFCompetitor, label: "Competitor", opts: options.competitors },
          { v: fCategory, set: setFCategory, label: "Category", opts: options.categories },
          { v: fSeason, set: setFSeason, label: "Season/event", opts: options.seasons },
          { v: fPriority, set: setFPriority, label: "Priority", opts: ["high", "medium", "low"] },
        ].map((f) => (
          <select key={f.label} className={field} style={border} value={f.v} onChange={(e) => f.set(e.target.value)}>
            <option value="all">{f.label}: all</option>
            {f.opts.map((o) => (
              <option key={o} value={o}>{o === "none" ? "No store chosen" : o}</option>
            ))}
          </select>
        ))}
      </div>

      {/* Bulk bar */}
      {selected.size > 0 && (
        <div className="glass rounded-xl px-3 py-2 mb-3 flex flex-wrap items-center gap-2 text-[11px]" style={{ color: "var(--text)" }}>
          <span>{selected.size} selected</span>
          {tab === "approved" ? (
            <button className={btn} style={{ background: "var(--accent)", color: "#fff" }} onClick={() => queue(Array.from(selected))}>Send to importer</button>
          ) : (
            <>
              <select className={field} style={border} value={bulkStore} onChange={(e) => setBulkStore(e.target.value)}>
                <option value="">Store for items without one…</option>
                {STORE_NAMES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <button className={btn} style={{ background: "rgba(52,211,153,0.15)", color: "var(--green)" }} onClick={() => bulk("approved")}>Approve</button>
              <button className={btn} style={{ background: "rgba(255,255,255,0.08)", color: "var(--text)" }} onClick={() => bulk("saved")}>Save for later</button>
              <button className={btn} style={{ background: "rgba(248,113,113,0.12)", color: "var(--red)" }} onClick={() => bulk("rejected")}>Reject</button>
            </>
          )}
          <button className="text-[10px] underline ml-auto" style={{ color: "var(--text-dim)" }} onClick={() => setSelected(new Set())}>clear</button>
        </div>
      )}

      {loading ? (
        <div className="text-[11px] py-16 text-center" style={{ color: "var(--text-dim)" }}>Loading opportunities…</div>
      ) : visible.length === 0 ? (
        <div className="glass rounded-xl text-[11px] py-12 text-center" style={{ color: "var(--text-dim)" }}>
          {opps.length === 0 ? "No opportunities yet. Run “Scan competitors” to read your tracked competitors' catalogues." : "Nothing here with these filters."}
        </div>
      ) : (
        <div className="space-y-2">
          {visible.map((o) => (
            <OpportunityCard
              key={o.id}
              o={o}
              job={o.last_import_job_id ? jobById.get(o.last_import_job_id) || null : null}
              selected={selected.has(o.id)}
              onSelect={() => toggle(o.id)}
              expanded={open === o.id}
              onExpand={() => setOpen(open === o.id ? null : o.id)}
              patch={patch}
              queue={queue}
              reload={load}
              flash={flash}
            />
          ))}
        </div>
      )}
      <div className="text-[9px] mt-4" style={{ color: "var(--text-dim)" }}>
        * currency assumed from the competitor&apos;s market. Evidence = what the scan shows; Potential = timing, catalogue gap and market fit (inferences). Rejected items only come back if 2+ more competitors start listing them.
      </div>
    </div>
  )
}

function OpportunityCard(props: {
  o: Opportunity
  job: ImportJob | null
  selected: boolean
  onSelect: () => void
  expanded: boolean
  onExpand: () => void
  patch: (id: number, body: Record<string, unknown>) => Promise<boolean>
  queue: (ids: number[]) => Promise<void>
  reload: () => Promise<void>
  flash: (m: string) => void
}) {
  const { o, job, patch } = props
  const [notes, setNotes] = useState(o.notes || "")
  const [history, setHistory] = useState<HistoryRow[] | null>(null)
  const [detail, setDetail] = useState<Opportunity | null>(null)
  useEffect(() => setNotes(o.notes || ""), [o.notes])
  useEffect(() => {
    if (!props.expanded) return
    fetch(`/api/opportunities/${o.id}`).then((r) => r.json()).then((j) => {
      setHistory(j.history || [])
      if (j.opportunity) setDetail(j.opportunity)
    })
  }, [props.expanded, o.id, o.status])

  const tz = (o.target_store && STORE_TZ[o.target_store]) || "UTC"
  const daysLeft = o.launch_by ? daysBetween(todayIn(tz), o.launch_by) : null
  const go = (status: OppStatus, extra: Record<string, unknown> = {}) => patch(o.id, { status, ...extra })
  const missing = missingChecks(o.adapt_checks)
  const evidence = detail?.evidence || o.evidence || []
  const d = detail || o // long texts (observations, gaps…) come with the detail request
  const sourceUrl = o.source_url || o.first_source_url || evidence[0]?.url
  const lockedStore = ["queued", "importing", "imported", "adapting", "ready_for_review", "ready_to_publish"].includes(o.status)

  return (
    <div className="glass rounded-xl p-3">
      <div className="flex gap-3 items-start">
        <input type="checkbox" checked={props.selected} onChange={props.onSelect} className="mt-1" disabled={!["new", "under_review", "saved", "approved"].includes(o.status)} />
        {o.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={o.image} alt="" className="w-14 h-14 rounded-lg object-cover flex-shrink-0" style={{ background: "rgba(255,255,255,0.04)" }} />
        ) : (
          <div className="w-14 h-14 rounded-lg flex-shrink-0" style={{ background: "rgba(255,255,255,0.04)" }} />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={props.onExpand} className="text-[12px] font-semibold text-left truncate max-w-[520px]" style={{ color: "var(--text)" }}>{o.title}</button>
            {o.priority && (
              <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded" style={{ color: PRIORITY_COLOR[o.priority], background: "rgba(255,255,255,0.05)" }}>{o.priority}</span>
            )}
            <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ color: "var(--text-muted)", background: "rgba(255,255,255,0.05)" }}>{STATUS_LABEL[o.status]}</span>
          </div>
          <div className="text-[10px] mt-0.5" style={{ color: "var(--text-muted)" }}>
            {[o.gender, o.category].filter(Boolean).join(" · ") || "Uncategorised"} · {o.competitor_count} competitor{o.competitor_count === 1 ? "" : "s"} · Evidence {o.evidence_score ?? "—"}/100 · Potential {o.commercial_score ?? "—"}/100
          </div>
          <div className="text-[10px] mt-0.5" style={{ color: "var(--text-dim)" }}>
            {o.event_label || o.season || "No season"}
            {o.event_date ? ` (${o.event_date})` : ""}
            {o.launch_by ? ` · launch by ${o.launch_by}${daysLeft != null ? ` (${daysLeft >= 0 ? `${daysLeft} days left` : `${-daysLeft} days late`}, ${tz})` : ""}` : ""}
            {o.timing_source === "assumed" ? " · timing assumed" : ""}
          </div>
          {o.catalogue_match && <div className="text-[10px] mt-0.5" style={{ color: "var(--orange)" }}>Possible duplicate: {o.catalogue_match}</div>}
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <select
            className={field}
            style={border}
            value={o.target_store || ""}
            disabled={lockedStore}
            onChange={(e) => patch(o.id, { target_store: e.target.value || null })}
          >
            <option value="">Choose store…</option>
            {STORE_NAMES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <div className="flex flex-wrap justify-end gap-1">
            {["new", "under_review", "saved"].includes(o.status) && (
              <>
                <button className={btn} style={{ background: "rgba(52,211,153,0.15)", color: "var(--green)" }} onClick={() => go("approved")}>Approve</button>
                {o.status !== "saved" && <button className={btn} style={{ background: "rgba(255,255,255,0.08)", color: "var(--text)" }} onClick={() => go("saved")}>Later</button>}
                <button className={btn} style={{ background: "rgba(248,113,113,0.12)", color: "var(--red)" }} onClick={() => go("rejected")}>Reject</button>
              </>
            )}
            {o.status === "approved" && (
              <button className={btn} style={{ background: "var(--accent)", color: "#fff" }} onClick={() => props.queue([o.id])}>Send to importer</button>
            )}
            {o.status === "imported" && (
              <button className={btn} style={{ background: "var(--accent)", color: "#fff" }} onClick={async () => { if (await go("adapting")) window.location.href = `/product-importer?opportunity=${o.id}` }}>Adapt listing</button>
            )}
            {o.status === "adapting" && (
              <Link href={`/product-importer?opportunity=${o.id}`} className={btn} style={{ background: "rgba(255,255,255,0.08)", color: "var(--text)" }}>Open Redo Listing</Link>
            )}
            {o.status === "rejected" && (
              <button className={btn} style={{ background: "rgba(255,255,255,0.08)", color: "var(--text)" }} onClick={() => go("under_review")}>Reconsider</button>
            )}
          </div>
        </div>
      </div>

      {/* Import step */}
      {["queued", "importing", "failed"].includes(o.status) && job && (
        <div className="mt-3 pl-[88px]">
          <div className="text-[10px] mb-1.5" style={{ color: "var(--text-muted)" }}>
            Import into <b>{job.store}</b> from{" "}
            <a href={job.source_url} target="_blank" rel="noreferrer" className="underline">{job.source_url}</a>
          </div>
          <ImportJobActions job={job} onDone={(m) => { props.flash(m); props.reload() }} />
        </div>
      )}

      {/* Adaptation checklist */}
      {["adapting", "ready_for_review", "ready_to_publish"].includes(o.status) && (
        <div className="mt-3 pl-[88px]">
          {job?.admin_url && (
            <div className="text-[10px] mb-1.5" style={{ color: "var(--text-muted)" }}>
              Draft in Shopify: <a href={job.admin_url} target="_blank" rel="noreferrer" className="underline">open product</a>
            </div>
          )}
          <div className="grid sm:grid-cols-2 gap-x-4 gap-y-1">
            {ADAPT_CHECKS.map((c) => (
              <label key={c.key} className="flex items-center gap-2 text-[10px]" style={{ color: "var(--text)" }}>
                <input
                  type="checkbox"
                  checked={!!o.adapt_checks?.[c.key]}
                  disabled={o.status === "ready_to_publish"}
                  onChange={(e) => patch(o.id, { adapt_checks: { [c.key]: e.target.checked } })}
                />
                {c.label} <span style={{ color: "var(--text-dim)" }}>({c.via})</span>
              </label>
            ))}
          </div>
          <div className="flex flex-wrap gap-2 mt-2">
            {o.status === "adapting" && (
              <button
                className={btn}
                disabled={missing.length > 0}
                style={{ background: "var(--accent)", color: "#fff", opacity: missing.length ? 0.4 : 1 }}
                onClick={() => go("ready_for_review")}
                title={missing.length ? `Still open: ${missing.join("; ")}` : ""}
              >
                Ready for final review {missing.length ? `(${missing.length} open)` : ""}
              </button>
            )}
            {o.status === "ready_for_review" && (
              <>
                <button className={btn} style={{ background: "rgba(52,211,153,0.15)", color: "var(--green)" }} onClick={() => go("ready_to_publish", { note: "Final review approved. Publish manually in Shopify." })}>Approve: ready to publish</button>
                <button className={btn} style={{ background: "rgba(255,255,255,0.08)", color: "var(--text)" }} onClick={() => go("adapting")}>Back to adapting</button>
              </>
            )}
            {o.status === "ready_to_publish" && (
              <span className="text-[10px]" style={{ color: "var(--green)" }}>Ready. The product stays a draft until you publish it yourself in Shopify.</span>
            )}
          </div>
        </div>
      )}

      {props.expanded && (
        <div className="mt-3 pl-[88px] space-y-3">
          <div className="overflow-x-auto">
            <table className="w-full text-[10px]">
              <thead>
                <tr style={{ color: "var(--text-dim)" }}>
                  <th className="text-left py-1 pr-2">Use</th>
                  <th className="text-left py-1 pr-2">Competitor product</th>
                  <th className="text-right py-1 pr-2">Price</th>
                  <th className="text-right py-1 pr-2">Best-seller #</th>
                  <th className="text-right py-1 pr-2">Published</th>
                  <th className="text-right py-1">First / last seen</th>
                </tr>
              </thead>
              <tbody>
                {evidence.length === 0 && (
                  <tr><td colSpan={6} className="py-2" style={{ color: "var(--text-dim)" }}>Loading sources…</td></tr>
                )}
                {evidence.map((e) => (
                  <tr key={e.key} style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                    <td className="py-1 pr-2">
                      <input
                        type="radio"
                        name={`src-${o.id}`}
                        checked={sourceUrl === e.url}
                        disabled={lockedStore}
                        onChange={() => patch(o.id, { source_url: e.url })}
                        title="Import this competitor's version"
                      />
                    </td>
                    <td className="py-1 pr-2">
                      <a href={e.url} target="_blank" rel="noreferrer" className="underline" style={{ color: "var(--text)" }}>{e.title}</a>
                      <span style={{ color: "var(--text-dim)" }}> · {e.competitor_name || e.competitor_domain}</span>
                    </td>
                    <td className="py-1 pr-2 text-right tabular-nums" style={{ color: "var(--text)" }}>{money(e.price, e.currency, e.currency_assumed)}</td>
                    <td className="py-1 pr-2 text-right" style={{ color: "var(--text-muted)" }}>{e.bestseller_rank ?? "—"}</td>
                    <td className="py-1 pr-2 text-right" style={{ color: "var(--text-muted)" }}>{e.published_at ? e.published_at.slice(0, 10) : "—"}</td>
                    <td className="py-1 text-right" style={{ color: "var(--text-muted)" }}>{e.first_seen} / {e.last_seen}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="grid md:grid-cols-2 gap-3 text-[10px]">
            <div>
              <div className="font-semibold mb-1" style={{ color: "var(--text)" }}>Observed</div>
              {(d.observations || []).map((x, i) => <div key={i} style={{ color: "var(--text-muted)" }}>• {x}</div>)}
            </div>
            <div>
              <div className="font-semibold mb-1" style={{ color: "var(--text)" }}>Inferred (not proven)</div>
              {(d.inferences || []).map((x, i) => <div key={i} style={{ color: "var(--text-muted)" }}>• {x}</div>)}
              {d.timing_note && <div style={{ color: "var(--text-muted)" }}>• {d.timing_note}</div>}
            </div>
            <div>
              <div className="font-semibold mb-1" style={{ color: "var(--text)" }}>Priority</div>
              <div style={{ color: "var(--text-muted)" }}>{d.priority_reason || "Loading…"}</div>
            </div>
            <div>
              <div className="font-semibold mb-1" style={{ color: "var(--orange)" }}>Data gaps & risks</div>
              {(d.data_gaps || []).map((x, i) => <div key={i} style={{ color: "var(--text-muted)" }}>• {x}</div>)}
            </div>
          </div>
          <div>
            <div className="text-[10px] font-semibold mb-1" style={{ color: "var(--text)" }}>Notes</div>
            <textarea className="w-full bg-transparent border rounded-lg px-2 py-1.5 text-[10px]" style={border} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            {notes !== (o.notes || "") && (
              <button className={btn} style={{ background: "rgba(255,255,255,0.08)", color: "var(--text)" }} onClick={() => patch(o.id, { notes })}>Save notes</button>
            )}
          </div>
          <div>
            <div className="text-[10px] font-semibold mb-1" style={{ color: "var(--text)" }}>History</div>
            {(history || []).map((h) => (
              <div key={h.id} className="text-[10px]" style={{ color: "var(--text-dim)" }}>
                {new Date(h.at).toLocaleString()} — {h.from_status || h.to_status ? `${h.from_status ? STATUS_LABEL[h.from_status as OppStatus] || h.from_status : "—"} → ${h.to_status ? STATUS_LABEL[h.to_status as OppStatus] || h.to_status : "—"} · ` : ""}{h.note}
              </div>
            ))}
            {history === null && <div className="text-[10px]" style={{ color: "var(--text-dim)" }}>Loading…</div>}
          </div>
          {["new", "saved", "approved"].includes(o.status) && (
            <button className={btn} style={{ background: "rgba(255,255,255,0.08)", color: "var(--text)" }} onClick={() => go("under_review")}>Mark under review</button>
          )}
        </div>
      )}
    </div>
  )
}
