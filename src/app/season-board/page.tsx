"use client"
// Season Board — built to the Dashboard Guide §7:
// what customers search for per month and country (Google Ads Keyword Planner export),
// which keywords to list now, push budget on, or phase out, which stores still miss them,
// and what to list next per category. Dates come from the same calendar as the Calendar
// page and the to-do list (src/lib/calendar-hardcoded.ts + season schedule).
import { Fragment, useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { PageShell } from "@/components/PageShell"
import { ProductLink } from "@/components/ProductLink"
import { PillSelect, FilterBar } from "@/components/PillSelect"
import { Panel, Badge, Button, Notice, Loading, SectionLabel, TH, TD, ROW_BORDER } from "@/components/ui"
import { HARDCODED_EVENTS } from "@/lib/calendar-hardcoded"
import { PeakAlerts, VisitorLinesPanel, useSeasonVisits } from "@/components/SeasonVisits"
import {
  MONTHS, COUNTRIES, STATUS_LABEL, SEASON_COLOR, seasonOfMonth, timing, statusFor, indexTitles, coveredBy,
  decodeExport, parseKeywordPlanner, categoryOf, type Status, type Timing, type TitleIndex,
} from "@/lib/season-keywords"

type DbKeyword = { country: string; keyword: string; category: string | null; months: number[]; avg_monthly: number; uploaded_at: string; source?: string | null }
type Suggestion = { id: number; created_at: string; keyword: string; country: string; category: string | null; why: string | null; status: string; note: string | null; decided_at: string | null }
type CatalogProduct = { product_name: string; store: string; units_sold: number; sales_revenue: number; ad_spend: number | null; roas: number | null; be_roas: number | null; product_ids?: string[] }
type StoreSummary = { store: string; revenue: number; ad_spend: number; roas: number | null; be_roas: number | null }
type SeasonData = { hidden?: number; keywords: DbKeyword[]; suggestions: Suggestion[]; titles: { store: string; title: string }[]; stores: string[]; updatedAt: string }
type Tone = "red" | "green" | "amber" | "blue" | "grey" | "accent"

type Row = DbKeyword & { t: Timing; covered: { store: string; n: number }[]; status: Status; category: string }

const STATUS_TONE: Record<Status, Tone> = {
  list_now: "red",
  indexing: "blue",
  push_budget: "amber",
  at_peak: "green",
  phase_out: "accent",
  off_season: "grey",
  evergreen: "grey",
}
const EVENT_TONE: Record<string, Tone> = { prep: "blue", sale: "green", shipping: "amber", deadline: "red", launch: "accent" }
const COUNTRY_OPTIONS = COUNTRIES.map((c) => ({ value: c.code, label: c.label }))
const k = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}K` : String(Math.round(n)))
const field = { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", color: "var(--text)" }
const PAGE = 25

// 12-month search trend. Hover a month for its exact search volume (Keyword Planner).
function Spark({ months, now }: { months: number[]; now: number }) {
  const [hi, setHi] = useState<number | null>(null)
  const W = 132
  const H = 34
  const max = Math.max(...months, 1)
  const x = (i: number) => 3 + (i / 11) * (W - 6)
  const y = (v: number) => H - 4 - (v / max) * (H - 10)
  const pts = months.map((v, i) => `${x(i)},${y(v)}`).join(" ")
  const peak = months.indexOf(Math.max(...months))
  return (
    <div className="relative inline-flex items-center gap-2" onMouseLeave={() => setHi(null)}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={months.map((v, i) => `${MONTHS[i]} ${v.toLocaleString("en-GB")}`).join(", ")}>
        <line x1={x(now)} y1="0" x2={x(now)} y2={H} stroke="rgba(255,255,255,0.15)" strokeDasharray="2 2" />
        <polyline points={pts} fill="none" stroke="#a5b4fc" strokeWidth="1.5" />
        {months.map((v, i) => (
          <g key={i}>
            <circle cx={x(i)} cy={y(v)} r={hi === i ? 3 : i === peak ? 2 : 0} fill={hi === i ? "#fff" : "#a5b4fc"} />
            {/* hover zone per month */}
            <rect x={x(i) - (W - 6) / 22} y={0} width={(W - 6) / 11} height={H} fill="transparent" onMouseEnter={() => setHi(i)}>
              <title>{`${MONTHS[i]}: ${v.toLocaleString("en-GB")} searches`}</title>
            </rect>
          </g>
        ))}
      </svg>
      <span className="w-[74px] text-[10px] tabular-nums leading-tight" style={{ color: hi != null ? "var(--text)" : "var(--text-dim)" }}>
        {hi != null ? (
          <>
            <span style={{ color: "var(--text-dim)" }}>{MONTHS[hi]}</span> {months[hi].toLocaleString("en-GB")}
          </>
        ) : (
          <>
            {MONTHS[now]} {months[now].toLocaleString("en-GB")}
            <span className="block text-[9px]">hover for other months</span>
          </>
        )}
      </span>
    </div>
  )
}

export default function SeasonBoardPage() {
  const nowMonth = new Date().getMonth()
  const [country, setCountry] = useState("US")
  const [month, setMonth] = useState(nowMonth)
  const [data, setData] = useState<SeasonData | null>(null)
  const [catalog, setCatalog] = useState<{ products: CatalogProduct[]; stores: StoreSummary[] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const visits = useSeasonVisits()
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [q, setQ] = useState("")
  const [filter, setFilter] = useState<"all" | Status>("all")
  const [page, setPage] = useState(0)
  const [minVol, setMinVol] = useState(1000)
  const [showSettings, setShowSettings] = useState(false)
  const [sug, setSug] = useState({ keyword: "", country: "US", category: "", why: "" })
  const [openCat, setOpenCat] = useState<string | null>(null)

  useEffect(() => {
    try { const v = Number(localStorage.getItem("season-minvol")); if (v > 0) setMinVol(v) } catch {}
  }, [])

  const load = useCallback(async () => {
    setError(null)
    try {
      const res = await fetch(`/api/season?country=${country}`, { cache: "no-store" })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || `HTTP ${res.status}`)
      setData(d)
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
  }, [country])
  useEffect(() => { setData(null); setPage(0); load() }, [load])
  useEffect(() => {
    fetch("/api/product-catalog?store=all").then((r) => r.json()).then((d) => setCatalog({ products: d.products || [], stores: d.stores || [] })).catch(() => setCatalog({ products: [], stores: [] }))
  }, [])

  const stores = useMemo(() => data?.stores || [], [data])
  const titleIdx = useMemo(() => {
    const m: Record<string, TitleIndex> = {}
    for (const s of stores) m[s] = indexTitles((data?.titles || []).filter((t) => t.store === s).map((t) => t.title))
    return m
  }, [data, stores])

  const rows: Row[] = useMemo(() => (data?.keywords || [])
    .filter((kw) => kw.avg_monthly >= minVol)
    .map((kw) => {
      const t = timing(kw.months)
      const covered = stores.map((s) => ({ store: s, n: coveredBy(kw.keyword, titleIdx[s] || []) }))
      const allCovered = covered.length > 0 && covered.every((c) => c.n > 0)
      return { ...kw, t, covered, status: statusFor(t, month, allCovered), category: kw.category || categoryOf(kw.keyword) }
    })
    .sort((a, b) => b.avg_monthly - a.avg_monthly), [data, minVol, month, stores, titleIdx])

  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const r of rows) c[r.status] = (c[r.status] || 0) + 1
    return c
  }, [rows])
  const listNow = rows.filter((r) => r.status === "list_now" || r.status === "indexing").sort((a, b) => b.t.peakVol - a.t.peakVol)
  const filtered = rows.filter((r) => (filter === "all" || r.status === filter) && (!q || r.keyword.includes(q.toLowerCase())))
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE))

  // Calendar events (same source as the Calendar page and the to-do list) in the selected month
  const year = new Date().getFullYear() + (month < nowMonth ? 1 : 0)
  const monthKey = `${year}-${String(month + 1).padStart(2, "0")}`
  const monthEvents = HARDCODED_EVENTS.filter((e) => e.date.startsWith(monthKey) && e.type !== "season")
  const thisSeason = seasonOfMonth(month)
  const nextSeason = seasonOfMonth((month + 2) % 12)

  // What to list next: per category, keyword demand now → next + test-and-learn per store
  const nextList = useMemo(() => {
    const active = rows.filter((r) => r.status === "list_now" || r.status === "indexing" || r.status === "push_budget")
    const byCat = new Map<string, Row[]>()
    for (const r of active) byCat.set(r.category, [...(byCat.get(r.category) || []), r])
    const out: { category: string; keywords: Row[]; now: number; next: number; growth: number; peakM: number; peakV: number; status: Status; score: number; perStore: { store: string; live: number; tested: number; winners: number; add: number; why: string }[] }[] = []
    byCat.forEach((list, category) => {
      if (category === "Other") return
      const sum = (m: number) => list.reduce((a, r) => a + r.months[m], 0)
      const now = sum(month)
      const next = sum((month + 1) % 12)
      let peakM = 0
      for (let i = 1; i < 12; i++) if (sum(i) > sum(peakM)) peakM = i
      const statusCount: Record<string, number> = {}
      for (const r of list) statusCount[r.status] = (statusCount[r.status] || 0) + 1
      const status = (Object.entries(statusCount).sort((a, b) => b[1] - a[1])[0]?.[0] || "push_budget") as Status
      const perStore = stores.map((s) => {
        const live = (data?.titles || []).filter((t) => t.store === s && categoryOf(t.title) === category).length
        const prods = (catalog?.products || []).filter((p) => p.store === s && categoryOf(p.product_name) === category && (p.ad_spend || 0) >= 10)
        const winners = prods.filter((p) => (p.roas || 0) >= (p.be_roas || 2.5) && p.units_sold >= 1).length
        const tested = prods.length
        // Test and learn (guide): small batch first, then the hit rate decides
        let add = 15
        let why = "test batch: fewer than 5 tested"
        if (tested >= 5) {
          const hit = winners / tested
          if (hit >= 0.2) { add = 20; why = `scale: ${winners}/${tested} winners` }
          else if (hit >= 0.1) { add = 10; why = `mixed: ${winners}/${tested} winners, try other styles` }
          else { add = 0; why = `stop: ${winners}/${tested} winners, find better products` }
        }
        return { store: s, live, tested, winners, add, why }
      })
      const growth = now > 0 ? (next - now) / now : 1
      out.push({ category, keywords: list, now, next, growth: now > 0 ? growth : 0, peakM, peakV: sum(peakM), status, score: next * (1 + Math.max(-0.5, Math.min(1, growth))), perStore })
    })
    const max = Math.max(1, ...out.map((o) => o.score))
    return out.map((o) => ({ ...o, priority: Math.round((o.score / max) * 100) })).sort((a, b) => b.priority - a.priority)
  }, [rows, month, stores, data, catalog])

  const onFile = async (file: File | null) => {
    if (!file) return
    setBusy(true); setMsg(null); setError(null)
    try {
      const text = decodeExport(await file.arrayBuffer())
      const parsed = parseKeywordPlanner(text)
      if (parsed.error) throw new Error(parsed.error)
      const replace = confirm(`${parsed.rows.length} keywords found for ${country}. Replace the current ${country} keywords?\n\nOK = replace · Cancel = add/update only`)
      const res = await fetch("/api/season", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "upload", country, rows: parsed.rows, replace, source: /trends/i.test(file.name) ? "keyword_planner+trends" : "keyword_planner" }) })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || `HTTP ${res.status}`)
      setMsg(`Saved ${d.saved} keywords for ${country}${d.skipped ? `; left out ${d.skipped} brand or non-clothing searches` : ""}.`)
      await load()
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    setBusy(false)
  }

  const copyPlan = () => {
    const lines = listNow.map((r) => {
      const miss = r.covered.filter((c) => c.n === 0).map((c) => c.store)
      return `${r.keyword}: push budget from ${MONTHS[r.t.pushFrom]}, peak ${MONTHS[r.t.peak]} ${k(r.t.peakVol)}${miss.length ? `, missing in ${miss.join(", ")}` : ""}`
    })
    navigator.clipboard?.writeText(`List now, ${MONTHS[month]} · ${country}\n${lines.join("\n")}`)
    setMsg("List plan copied.")
  }

  const suggest = async () => {
    if (!sug.keyword.trim()) return
    const res = await fetch("/api/season", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "suggest", ...sug }) })
    if (res.ok) { setSug({ keyword: "", country, category: "", why: "" }); load() }
    else setError((await res.json()).error || "Couldn't save the suggestion")
  }
  const decide = async (id: number, status: string) => {
    const note = prompt("Note (optional)") || ""
    await fetch("/api/season", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, status, note }) })
    load()
  }

  // Store budget board (kept from the old Season Board)
  const budget = (catalog?.stores || []).filter((s) => s.ad_spend > 0).map((s) => {
    const sp = (catalog?.products || []).filter((p) => p.store === s.store)
    const advice: [string, Tone, string] = s.roas && s.be_roas && s.roas > s.be_roas * 1.3 ? ["Scale", "green", "ROAS above 1.3× breakeven"] : s.roas && s.be_roas && s.roas < s.be_roas ? ["Cut", "red", "ROAS below breakeven"] : ["Hold", "amber", "Within range"]
    return { ...s, winners: sp.filter((p) => (p.roas || 0) > 2.5 && p.units_sold >= 2).length, losers: sp.filter((p) => p.be_roas != null && p.roas != null && p.roas < p.be_roas && (p.ad_spend || 0) > 20).length, advice }
  })
  const rising = (catalog?.products || []).filter((p) => (p.roas || 0) > 2.5 && p.units_sold >= 3 && (p.ad_spend || 0) > 20).sort((a, b) => (b.roas || 0) - (a.roas || 0)).slice(0, 6)
  const declining = (catalog?.products || []).filter((p) => (p.ad_spend || 0) >= 20 && p.roas != null && p.roas > 0 && ((p.be_roas && p.roas < p.be_roas) || (p.roas < 1.5 && p.units_sold <= 1))).sort((a, b) => (a.roas || 0) - (b.roas || 0)).slice(0, 6)
  const movers: [string, CatalogProduct[], string][] = [["Rising (ROAS > 2.5, 3+ sales)", rising, "var(--green)"], ["Losing steam (below breakeven)", declining, "#f87171"]]

  const hasData = (data?.keywords.length || 0) > 0
  const fromTrends = (data?.keywords || []).some((kw) => kw.source === "keyword_planner+trends")
  const pendingSug = (data?.suggestions || []).filter((s) => s.status === "pending")
  const decidedSug = (data?.suggestions || []).filter((s) => s.status !== "pending").slice(0, 8)
  const countryName = COUNTRIES.find((c) => c.code === country)?.label.split("— ")[1] || country

  return (
    <PageShell
      title="Season Board"
      breadcrumb="Front End → Season Board"
      description="What customers search for per country and month, which keywords to list before demand climbs, and which stores still miss them. Source: Google Ads Keyword Planner export per country. Dates match the Calendar and the to-do list."
      actions={
        <>
          <PillSelect label="Country" value={country} onChange={(v) => { setCountry(v); setSug((s) => ({ ...s, country: v })) }} options={COUNTRY_OPTIONS} align="right" />
          <label className="inline-flex items-center px-3 py-1.5 rounded-lg text-[11px] font-medium cursor-pointer hover:opacity-90" style={{ background: "var(--accent)", color: "#fff", opacity: busy ? 0.5 : 1 }}>
            {busy ? "Uploading…" : "Upload export"}
            <input type="file" accept=".csv,.tsv,.txt" className="hidden" disabled={busy} onChange={(e) => { onFile(e.target.files?.[0] || null); e.currentTarget.value = "" }} />
          </label>
          <Button onClick={() => setShowSettings(!showSettings)}>Settings</Button>
        </>
      }
      stats={[
        { label: "List now", value: String(counts.list_now || 0), sub: "list and get indexed before the climb" },
        { label: "Push budget", value: String(counts.push_budget || 0), sub: "demand is climbing: should be live" },
        { label: "Phase out", value: String(counts.phase_out || 0), sub: "past peak: wind down spend" },
        { label: "Keywords", value: String(rows.length), sub: `${country}${data?.updatedAt ? ` · updated ${new Date(data.updatedAt).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}` : ""}` },
      ]}
    >
      {showSettings && (
        <Panel className="mb-4" title="Settings" sub="Saved in this browser.">
          <label className="flex items-center gap-2 text-[11px]" style={{ color: "var(--text-muted)" }}>
            Hide keywords under
            <input type="number" value={minVol} onChange={(e) => { const v = Math.max(0, Number(e.target.value) || 0); setMinVol(v); try { localStorage.setItem("season-minvol", String(v)) } catch {} }} className="w-24 px-2 py-1 rounded-md tabular-nums" style={field} />
            searches a month
          </label>
        </Panel>
      )}
      <PeakAlerts data={visits.data} market={country} />
      {msg && <Notice tone="success">{msg}</Notice>}
      {error && <Notice tone="error">Couldn&apos;t load the Season Board: {error}.</Notice>}

      {fromTrends && (
        <Notice tone="info">
          Estimated months: the Google Ads accounts only get rounded averages from Keyword Planner, so each keyword&apos;s average volume (Keyword Planner) is spread over the year with the Google Trends pattern of its main clothing term (e.g. &quot;wool coat&quot;, &quot;maxi dress&quot;), last 12 months, per country. US: a shared April–May jump across almost all US clothing searches was removed and replaced by the UK&apos;s shared pattern. Timing is reliable per clothing type; exact numbers are estimates (Keyword Planner rounds volumes to 50 / 500 / 5K / 50K / 500K for these accounts).{data?.hidden ? ` ${data.hidden} brand or non-clothing searches are hidden.` : ""}
        </Notice>
      )}

      <VisitorLinesPanel data={visits.data} error={visits.error} market={country} onReload={visits.reload} />

      {/* Year strip */}
      <Panel className="mb-4" title="The year" sub={`Click a month to plan ahead. Store for ${country}: ${stores.join(", ") || "none"}; coverage is checked against its live products.`}>
        <div className="grid grid-cols-12 gap-1">
          {MONTHS.map((m, i) => (
            <button key={m} onClick={() => { setMonth(i); setPage(0) }} className="rounded-md py-1.5 text-[10px] font-medium" style={{
              borderTop: `3px solid ${SEASON_COLOR[seasonOfMonth(i)]}`,
              background: i === month ? "rgba(99,102,241,0.25)" : "rgba(255,255,255,0.03)",
              color: i === month ? "#fff" : "var(--text-muted)",
            }}>
              {m}{i === nowMonth && <div className="text-[8px] font-bold" style={{ color: "#a5b4fc" }}>NOW</div>}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2 mt-3 text-[11px]">
          <span style={{ color: SEASON_COLOR[thisSeason] }}>{thisSeason}</span>
          {nextSeason !== thisSeason && <><span style={{ color: "var(--text-dim)" }}>›</span><span style={{ color: SEASON_COLOR[nextSeason] }}>{nextSeason}</span></>}
          <span style={{ color: "var(--text-muted)" }}>
            Acting in <b>{MONTHS[month]}</b>: list the &quot;List now&quot; keywords so they get indexed, then push budget as {nextSeason.toLowerCase()} demand climbs.
          </span>
          {listNow.length > 0 && <span className="ml-auto"><Button size="sm" onClick={copyPlan}>Copy list plan</Button></span>}
        </div>
        <div className="mt-3 pt-3" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          <SectionLabel>In the calendar for {MONTHS[month]}</SectionLabel>
          {monthEvents.length === 0 ? (
            <div className="text-[11px]" style={{ color: "var(--text-dim)" }}>Nothing planned this month.</div>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {monthEvents.map((e, i) => (
                <Badge key={i} tone={EVENT_TONE[e.type] || "grey"} title={e.note}>
                  {Number(e.date.slice(8))} {MONTHS[month]} · {e.label}{e.store ? ` (${e.store})` : ""}
                </Badge>
              ))}
            </div>
          )}
          <div className="mt-2"><Button size="sm" variant="ghost" href="/calendar">Open calendar and to-do</Button></div>
        </div>
      </Panel>

      {!data && !error && <Loading>Loading keywords…</Loading>}

      {data && !hasData && (
        <Panel className="mb-4" title={`No keyword data for ${country} yet`} sub="Upload a Keyword Planner export to fill the board.">
          <ol className="list-decimal pl-5 space-y-1 text-[11px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
            <li>Google Ads → Tools → <b>Keyword Planner</b> → <b>Discover new keywords</b>.</li>
            <li>Enter seed words for what you sell (e.g. coat, dress, boots, knitwear, jeans), up to 10 at a time.</li>
            <li>Set the location to <b>{countryName}</b> and the date range to the <b>last 12 months</b>.</li>
            <li><b>Download keyword ideas</b> as CSV, then click <b>Upload export</b> at the top (country = {country}).</li>
          </ol>
          <div className="mt-2 text-[11px]" style={{ color: "var(--text-dim)" }}>Repeat per country: US for Susan & Allen, UK for Carter & Collins, IE for Walsh & Farley.</div>
        </Panel>
      )}

      {data && hasData && (
        <>
          {/* List now */}
          <Panel className="mb-4" pad={false} title={`List now: ${MONTHS[month]} · ${country}`} sub="Keywords whose demand starts climbing next month. Missing = the store has no live product matching every word.">
            {listNow.length === 0 ? <div className="px-4 pb-4 text-[11px]" style={{ color: "var(--text-dim)" }}>No keyword starts its climb next month.</div> : (
              <div className="overflow-x-auto">
                <table className="w-full whitespace-nowrap">
                  <thead><tr style={{ color: "var(--text-dim)" }}><th className={`${TH} text-left`}>Keyword</th><th className={`${TH} text-left`}>Push budget from</th><th className={`${TH} text-right`}>Peak</th><th className={`${TH} text-left`}>Store coverage</th></tr></thead>
                  <tbody>
                    {listNow.map((r) => (
                      <tr key={r.keyword} style={ROW_BORDER}>
                        <td className={`${TD} font-medium`} style={{ color: "var(--text)" }}>{r.keyword}</td>
                        <td className={TD} style={{ color: "#fbbf24" }}>{MONTHS[r.t.pushFrom]}</td>
                        <td className={`${TD} text-right tabular-nums`}>{MONTHS[r.t.peak]} <span style={{ color: "var(--text-dim)" }}>{k(r.t.peakVol)}</span></td>
                        <td className={TD}><span className="flex flex-wrap gap-1">{r.covered.map((c) => <Badge key={c.store} tone={c.n ? "green" : "red"}>{c.n ? `${c.store}: ${c.n} live` : `Missing: ${c.store}`}</Badge>)}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          {/* All keywords */}
          <Panel className="mb-4" title="All keywords" sub="How timing works: a keyword's climb starts in the first month its searches are 15% of the way from their low point to their peak (Dashboard Guide §7 uses 15% of peak; same result when the off-season is near zero). List by = one month before (get indexed, low spend). Push budget = from the climb month. Evergreen = the quietest month is still 60%+ of the peak. Phase out doesn't mean delete: stop spending on it. Source: Dashboard Guide §7.">
            <FilterBar>
              <input value={q} onChange={(e) => { setQ(e.target.value); setPage(0) }} placeholder="Search keywords…" className="px-3 py-1.5 rounded-lg text-[11px] w-[220px]" style={field} />
              {(["all", "list_now", "indexing", "push_budget", "at_peak", "phase_out", "evergreen", "off_season"] as const).map((f) => (
                <Button key={f} size="sm" variant={filter === f ? "primary" : "secondary"} onClick={() => { setFilter(f); setPage(0) }}>
                  {f === "all" ? "All" : STATUS_LABEL[f]}{f !== "all" && <span style={{ opacity: 0.6 }}>{counts[f] || 0}</span>}
                </Button>
              ))}
            </FilterBar>
            <div className="overflow-x-auto -mx-4">
              <table className="w-full whitespace-nowrap">
                <thead><tr style={{ color: "var(--text-dim)" }}>
                  <th className={`${TH} text-left`}>Keyword</th><th className={`${TH} text-left`}>12-month trend</th><th className={`${TH} text-right`}>Avg / month</th><th className={`${TH} text-right`}>Peak</th><th className={`${TH} text-left`}>List → push</th><th className={`${TH} text-left`}>Status</th><th className={`${TH} text-left`}>Coverage</th>
                </tr></thead>
                <tbody>
                  {filtered.slice(page * PAGE, page * PAGE + PAGE).map((r) => {
                    const missing = r.covered.filter((c) => c.n === 0)
                    return (
                      <tr key={r.keyword} style={ROW_BORDER}>
                        <td className={`${TD} font-medium`} style={{ color: "var(--text)" }}>{r.keyword}<div className="text-[9px] font-normal" style={{ color: "var(--text-dim)" }}>{r.category}</div></td>
                        <td className={TD}><Spark months={r.months} now={month} /></td>
                        <td className={`${TD} text-right tabular-nums`}>{k(r.avg_monthly)}</td>
                        <td className={`${TD} text-right tabular-nums`}>{MONTHS[r.t.peak]} <span style={{ color: "var(--text-dim)" }}>{k(r.t.peakVol)}</span></td>
                        <td className={TD}>{r.t.evergreen ? <span style={{ color: "var(--text-dim)" }}>year-round</span> : <>{MONTHS[r.t.listBy]} → <span style={{ color: "#fbbf24" }}>{MONTHS[r.t.pushFrom]}</span></>}</td>
                        <td className={TD}><Badge tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Badge></td>
                        <td className={TD}><span className="tabular-nums">{r.covered.filter((c) => c.n > 0).length}/{r.covered.length}</span> {missing.length > 0 && <Badge tone="red">Missing: {missing.map((c) => c.store).join(", ")}</Badge>}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-center gap-2 mt-3 text-[10px]" style={{ color: "var(--text-muted)" }}>
              <Button size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</Button>
              Page {page + 1} of {pages}
              <Button size="sm" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>Next</Button>
            </div>
          </Panel>

          {/* What to list next */}
          <Panel className="mb-4" pad={false} title="What to list next" sub="Keyword demand for the coming weeks per clothing type, with what the store has live and how the type sells for us. Test and learn (Dashboard Guide §7): list a small batch (15), let it run, then the hit rate decides. Scale = +20 similar to the winners, Mixed = +10 in other styles, Stop = find better products. Click a row for the numbers.">
            {nextList.length === 0 ? <div className="px-4 pb-4 text-[11px]" style={{ color: "var(--text-dim)" }}>No category is in its listing or push window in {MONTHS[month]}.</div> : (
              <div className="overflow-x-auto">
                <table className="w-full whitespace-nowrap">
                  <thead><tr style={{ color: "var(--text-dim)" }}><th className={`${TH} text-left`}>Category</th><th className={`${TH} text-left`}>Priority</th><th className={`${TH} text-right`}>Searches now → next</th><th className={`${TH} text-right`}>Peak</th><th className={`${TH} text-left`}>Add per store</th></tr></thead>
                  <tbody>
                    {nextList.map((c) => (
                      <Fragment key={c.category}>
                        <tr style={ROW_BORDER} className="cursor-pointer hover:bg-white/[0.02]" onClick={() => setOpenCat(openCat === c.category ? null : c.category)}>
                          <td className={TD}><span className="font-medium" style={{ color: "var(--text)" }}>{openCat === c.category ? "▾" : "▸"} {c.category}</span> <Badge tone={STATUS_TONE[c.status]}>{STATUS_LABEL[c.status]}</Badge><div className="text-[9px]" style={{ color: "var(--text-dim)" }}>{c.keywords.length} keywords</div></td>
                          <td className={`${TD} tabular-nums`}><span className="inline-block h-1.5 rounded-full mr-2 align-middle" style={{ width: `${Math.max(4, c.priority * 0.6)}px`, background: "#a5b4fc" }} />{c.priority}</td>
                          <td className={`${TD} text-right tabular-nums`}>{k(c.now)} → <b>{k(c.next)}</b><div className="text-[9px]" style={{ color: c.growth >= 0 ? "var(--green)" : "#f87171" }}>{c.growth >= 0 ? "+" : ""}{Math.round(c.growth * 100)}%</div></td>
                          <td className={`${TD} text-right tabular-nums`}>{MONTHS[c.peakM]} · {k(c.peakV)}</td>
                          <td className={TD}><span className="flex flex-wrap gap-1">{c.perStore.map((p) => <Badge key={p.store} tone={p.add === 0 ? "grey" : p.add >= 20 ? "green" : "amber"} title={`${p.why} · ${p.live} live`}>{p.store}: {p.add ? `+${p.add}` : "stop"}</Badge>)}</span></td>
                        </tr>
                        {openCat === c.category && (
                          <tr><td colSpan={5} className="px-3 pb-3 text-[10px] whitespace-normal" style={{ color: "var(--text-muted)" }}>
                            {c.perStore.map((p) => <div key={p.store}>{p.store}: {p.live} live · {p.tested} tested (€10+ spend, last 30 days) · {p.winners} winners → {p.why}</div>)}
                            <div className="mt-1">Keywords: {c.keywords.slice(0, 12).map((r) => r.keyword).join(", ")}{c.keywords.length > 12 ? "…" : ""}</div>
                            <div className="mt-2 flex gap-2"><Button size="sm" href="/opportunities">Upload planner</Button><Button size="sm" href="/product-importer">Product Importer</Button></div>
                          </td></tr>
                        )}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="px-4 py-3 text-[9px]" style={{ color: "var(--text-dim)" }}>Priority = next month&apos;s searches × growth, scaled to 100. Hit rate = products in that category at or above breakeven ROAS with a sale ÷ products with €10+ ad spend (last 30 days, product catalog).</div>
          </Panel>
        </>
      )}

      {/* Keyword suggestions */}
      {data && (
        <Panel className="mb-4" title={<>Keyword suggestions {pendingSug.length > 0 && <Badge tone="amber">{pendingSug.length} to review</Badge>}</>} sub="New keywords the team recommends. Approved ones are a reminder to add them as seed words in that country's next Keyword Planner export.">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <input value={sug.keyword} onChange={(e) => setSug({ ...sug, keyword: e.target.value })} placeholder="e.g. wool wrap coat" className="px-3 py-1.5 rounded-lg text-[11px] flex-1 min-w-[160px]" style={field} />
            <PillSelect label="Country" value={sug.country} onChange={(v) => setSug({ ...sug, country: v })} options={COUNTRIES.map((c) => c.code)} />
            <input value={sug.category} onChange={(e) => setSug({ ...sug, category: e.target.value })} placeholder="Category (optional)" className="px-3 py-1.5 rounded-lg text-[11px] w-[150px]" style={field} />
            <input value={sug.why} onChange={(e) => setSug({ ...sug, why: e.target.value })} placeholder="Where you saw it, why it could sell" className="px-3 py-1.5 rounded-lg text-[11px] flex-1 min-w-[200px]" style={field} />
            <Button variant="primary" onClick={suggest} disabled={!sug.keyword.trim()}>Suggest</Button>
          </div>
          {pendingSug.map((s) => (
            <div key={s.id} className="flex flex-wrap items-center gap-2 py-1.5 text-[11px]" style={ROW_BORDER}>
              <b style={{ color: "var(--text)" }}>{s.keyword}</b><span style={{ color: "var(--text-dim)" }}>{s.country} · {s.category || categoryOf(s.keyword)}</span>
              <span className="flex-1" style={{ color: "var(--text-muted)" }}>{s.why}</span>
              <Button size="sm" variant="primary" onClick={() => decide(s.id, "approved")}>Approve</Button>
              <Button size="sm" onClick={() => decide(s.id, "rejected")}>Reject</Button>
            </div>
          ))}
          {decidedSug.map((s) => (
            <div key={s.id} className="flex items-center gap-2 text-[10px] py-0.5" style={{ color: "var(--text-dim)" }}>
              <Badge tone={s.status === "approved" ? "green" : "red"}>{s.status === "approved" ? "Approved" : "Rejected"}</Badge>
              <b style={{ color: "var(--text-muted)" }}>{s.keyword}</b> · {s.country} · {s.category}{s.note ? ` · "${s.note}"` : ""}
            </div>
          ))}
        </Panel>
      )}

      {/* Store budget board + product movers */}
      <Panel className="mb-4" title="Store budget board" sub="Last 30 days. Scale above 1.3× breakeven ROAS, cut below breakeven.">
        {!catalog ? <div className="text-[11px]" style={{ color: "var(--text-dim)" }}>Loading store data…</div> : budget.length === 0 ? <div className="text-[11px]" style={{ color: "var(--text-dim)" }}>No stores with ad spend in the last 30 days.</div> : (
          <div className="space-y-1.5">
            {budget.map((s) => (
              <div key={s.store} className="flex flex-wrap items-center gap-3 p-2 rounded-lg text-[10px]" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}>
                <span className="font-medium text-[11px] w-[130px]" style={{ color: "var(--text)" }}>{s.store}</span>
                <span className="tabular-nums" style={{ color: "var(--text-dim)" }}>ROAS {s.roas ? `${s.roas.toFixed(2)}x` : "—"} · breakeven {s.be_roas ? `${s.be_roas.toFixed(2)}x` : "—"} · {s.winners} winners / {s.losers} losers</span>
                <span className="ml-auto flex items-center gap-2"><span style={{ color: "var(--text-dim)" }}>{s.advice[2]}</span><Badge tone={s.advice[1]}>{s.advice[0]}</Badge></span>
              </div>
            ))}
          </div>
        )}
        {(rising.length > 0 || declining.length > 0) && (
          <div className="grid gap-3 md:grid-cols-2 mt-4">
            {movers.map(([title, list, color]) => (
              <div key={title}>
                <SectionLabel>{title}</SectionLabel>
                {list.map((p, i) => (
                  <div key={i} className="flex items-center justify-between py-1 text-[10px]" style={ROW_BORDER}>
                    <span className="min-w-0 flex items-center gap-1"><ProductLink store={p.store} name={p.product_name} productId={p.product_ids?.[0]} maxWidth={220} /><span style={{ color: "var(--text-dim)" }}>{p.store}</span></span>
                    <span className="tabular-nums" style={{ color }}>{(p.roas || 0).toFixed(2)}x</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
        <div className="mt-3"><Link href="/product-performance" className="text-[10px] underline" style={{ color: "var(--text-muted)" }}>All products on Product Performance</Link></div>
      </Panel>
    </PageShell>
  )
}
