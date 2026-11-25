"use client"
import { useEffect, useState, useMemo, useCallback } from "react"
import { PillSelect, FilterBar } from "@/components/PillSelect"
import { PageShell } from "@/components/PageShell"
import { Panel, Badge, Button, Loading, EmptyState, TH, TD, ROW_BORDER } from "@/components/ui"
import { FilterSelect, EMPTY_FILTER, passes, passesAny, type FilterValue } from "@/components/FilterSelect"

interface Keyword {
  k: string
  uk: number
  us: number
  tu: number
  ta: number
  c: string
}

type SortCol = "k" | "c" | "uk" | "tu" | "us" | "ta"
type LinkMode = "trends" | "shopping" | "ads"

const GEOS = [
  { code: "IE", label: "Ireland" },
  { code: "NL", label: "Netherlands" },
  { code: "DE", label: "Germany" },
  { code: "DK", label: "Denmark" },
  { code: "GB", label: "UK" },
  { code: "US", label: "US" },
] as const

const LINK_MODES: { mode: LinkMode; label: string }[] = [
  { mode: "shopping", label: "Google Shopping" },
  { mode: "ads", label: "Ads Library" },
  { mode: "trends", label: "Google Trends" },
]

const SHOPPING_TLDS: Record<string, string> = {
  IE: "google.ie", NL: "google.nl", DE: "google.de",
  DK: "google.dk", GB: "google.co.uk", US: "google.com",
}

const CATEGORIES = [
  "dresses", "shoes", "outerwear", "tops", "bottoms",
  "accessories", "underwear", "sportswear", "other",
] as const

const PER_PAGE = 50

function fmtVol(n: number): string {
  if (!n) return "—"
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M"
  if (n >= 1_000) return (n / 1_000).toFixed(0) + "K"
  return n.toString()
}

function trendsUrl(keyword: string, geo: string): string {
  return `https://trends.google.com/trends/explore?geo=${geo}&q=${encodeURIComponent(keyword)}&hl=en`
}

function shoppingUrl(keyword: string, geo: string): string {
  const tld = SHOPPING_TLDS[geo] || "google.com"
  return `https://www.${tld}/search?q=${encodeURIComponent(keyword)}&tbm=shop`
}

function adsLibraryUrl(keyword: string, geo: string): string {
  return `https://adstransparency.google.com/?region=${geo}&q=${encodeURIComponent(keyword)}`
}

function getKeywordUrl(keyword: string, geo: string, mode: LinkMode): string {
  if (mode === "shopping") return shoppingUrl(keyword, geo)
  if (mode === "ads") return adsLibraryUrl(keyword, geo)
  return trendsUrl(keyword, geo)
}

function compareUrl(keywords: string[], geo: string, mode: LinkMode): string {
  if (mode === "trends") {
    return `https://trends.google.com/trends/explore?geo=${geo}&q=${keywords.map(k => encodeURIComponent(k)).join(",")}&hl=en`
  }
  return getKeywordUrl(keywords[0], geo, mode)
}

export default function KeywordsPage() {
  const [data, setData] = useState<Keyword[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [category, setCategory] = useState<FilterValue>(EMPTY_FILTER)
  const [trendFilter, setTrendFilter] = useState<FilterValue>(EMPTY_FILTER)
  const [minVol, setMinVol] = useState(0)
  const [minWords, setMinWords] = useState(2)
  const [sortCol, setSortCol] = useState<SortCol>("uk")
  const [sortDir, setSortDir] = useState<-1 | 1>(-1)
  const [page, setPage] = useState(0)
  const [activeGeo, setActiveGeo] = useState("IE")
  const [linkMode, setLinkMode] = useState<LinkMode>("shopping")
  const [selected, setSelected] = useState<Set<string>>(new Set())

  useEffect(() => {
    fetch("/keywords.json")
      .then((r) => r.json())
      .then((d: Keyword[]) => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    let result = data.filter((d) => {
      if (q && !d.k.includes(q)) return false
      if (!passes(category, d.c)) return false
      if (minVol && d.uk < minVol && d.us < minVol) return false
      if (minWords > 1 && d.k.trim().split(/\s+/).length < minWords) return false
      const rising = d.tu > 10 || d.ta > 10
      const falling = d.tu < -10 || d.ta < -10
      if (!passesAny(trendFilter, [rising ? "rising" : null, falling ? "falling" : null, !rising && !falling ? "flat" : null])) return false
      return true
    })
    result.sort((a, b) => {
      const av = a[sortCol]
      const bv = b[sortCol]
      if (typeof av === "string" && typeof bv === "string") return sortDir * av.localeCompare(bv)
      return sortDir * ((av as number) - (bv as number))
    })
    return result
  }, [data, search, category, trendFilter, minVol, minWords, sortCol, sortDir])

  const totalPages = Math.ceil(filtered.length / PER_PAGE)
  const pageData = filtered.slice(page * PER_PAGE, (page + 1) * PER_PAGE)
  const risingCount = filtered.filter((d) => d.tu > 10 || d.ta > 10).length
  const fallingCount = filtered.filter((d) => d.tu < -10 || d.ta < -10).length

  const handleSort = useCallback((col: SortCol) => {
    if (col === sortCol) setSortDir((d) => (d === -1 ? 1 : -1))
    else { setSortCol(col); setSortDir(-1) }
    setPage(0)
  }, [sortCol])

  const toggleSelect = useCallback((kw: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(kw)) next.delete(kw)
      else if (next.size < 5) next.add(kw)
      return next
    })
  }, [])

  const removeSelected = useCallback((kw: string) => {
    setSelected((prev) => { const next = new Set(prev); next.delete(kw); return next })
  }, [])

  useEffect(() => { setPage(0) }, [search, category, trendFilter, minVol, minWords])

  const otherGeos = GEOS.filter((g) => g.code !== activeGeo).slice(0, 3)

  return (
    <PageShell
      title="Keyword Research"
      breadcrumb="Front End → Keyword Research"
      description="6,938 fashion keywords from UK and US Google Keyword Planner. Open a keyword in Google Shopping or the Ads Library to find competitors."
      stats={loading ? undefined : [
        { label: "Keywords", value: filtered.length.toLocaleString("en-GB") },
        { label: "Rising", value: String(risingCount), sub: "UK or US trend above +10%", color: "var(--green)" },
        { label: "Falling", value: String(fallingCount), sub: "UK or US trend below −10%", color: "var(--red)" },
      ]}
    >
      <FilterBar>
        <input
          className="min-w-[200px] px-2.5 py-1 rounded-lg text-[10px] outline-none"
          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", color: "var(--text)" }}
          type="text"
          placeholder="Search keywords…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <FilterSelect label="Category" options={CATEGORIES.map((c) => ({ value: c, label: c.charAt(0).toUpperCase() + c.slice(1) }))} value={category} onChange={setCategory} />
        <FilterSelect
          label="Trend"
          options={[{ value: "rising", label: "Rising" }, { value: "falling", label: "Falling" }, { value: "flat", label: "Flat" }]}
          value={trendFilter}
          onChange={setTrendFilter}
        />
        <PillSelect
          label="Min volume"
          value={String(minVol)}
          onChange={(v) => setMinVol(Number(v))}
          options={[{ value: "0", label: "any" }, { value: "5000", label: "5K+" }, { value: "10000", label: "10K+" }, { value: "25000", label: "25K+" }, { value: "50000", label: "50K+" }, { value: "100000", label: "100K+" }]}
        />
        <PillSelect
          label="Words"
          value={String(minWords)}
          onChange={(v) => setMinWords(Number(v))}
          options={[{ value: "1", label: "all" }, { value: "2", label: "2+ words" }, { value: "3", label: "3+ words" }, { value: "4", label: "4+ words" }]}
        />
        <PillSelect
          label="Open in"
          value={linkMode}
          onChange={(v) => setLinkMode(v as LinkMode)}
          options={LINK_MODES.map((m) => ({ value: m.mode, label: m.label }))}
        />
        <PillSelect
          label="Market"
          value={activeGeo}
          onChange={setActiveGeo}
          options={GEOS.map((g) => ({ value: g.code, label: g.label }))}
        />
      </FilterBar>

      {/* Selected comparison bar */}
      {selected.size > 0 && (
        <Panel className="mb-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>Compare:</span>
            {Array.from(selected).map((kw) => (
              <span
                key={kw}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium"
                style={{ background: "rgba(99,102,241,0.18)", color: "#c7d2fe" }}
              >
                {kw}
                <button onClick={() => removeSelected(kw)} className="opacity-80 hover:opacity-100 ml-0.5" aria-label={`Remove ${kw}`}>×</button>
              </span>
            ))}
            <a
              href={compareUrl(Array.from(selected), activeGeo, linkMode)}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto inline-flex items-center px-3 py-1.5 rounded-lg text-[11px] font-medium hover:opacity-90"
              style={{ background: "var(--accent)", color: "#fff" }}
            >
              {linkMode === "trends" ? "Compare in Google Trends" : linkMode === "shopping" ? "Search Google Shopping" : "Search Ads Library"}
            </a>
          </div>
        </Panel>
      )}

      {/* Table */}
      {loading ? (
        <Loading>Loading keywords…</Loading>
      ) : pageData.length === 0 ? (
        <EmptyState title="No keywords match these filters">Clear the search or lower the minimum volume or word count.</EmptyState>
      ) : (
        <Panel pad={false}>
          <div className="overflow-x-auto">
          <table className="w-full" style={{ minWidth: 700 }}>
            <thead>
              <tr style={{ color: "var(--text-dim)" }}>
                <th className={`${TH} w-9 text-center`}>
                  <input
                    type="checkbox"
                    className="cursor-pointer"
                    style={{ accentColor: "var(--accent)", width: 13, height: 13 }}
                    onChange={(e) => {
                      setSelected((prev) => {
                        const next = new Set(prev)
                        if (e.target.checked) {
                          for (const d of pageData) { if (next.size >= 5) break; next.add(d.k) }
                        } else {
                          for (const d of pageData) next.delete(d.k)
                        }
                        return next
                      })
                    }}
                  />
                </th>
                <SortTh col="k" label="Keyword" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                <SortTh col="c" label="Category" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                <SortTh col="uk" label="UK vol" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} align="right" />
                <SortTh col="tu" label="UK trend" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} align="right" />
                <SortTh col="us" label="US vol" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} align="right" />
                <SortTh col="ta" label="US trend" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} align="right" />
                <th className={`${TH} text-left`}>
                  {linkMode === "shopping" ? "Google Shopping" : linkMode === "ads" ? "Ads Library" : "Google Trends"}
                </th>
              </tr>
            </thead>
            <tbody>
              {pageData.map((d) => {
                  const isSelected = selected.has(d.k)
                  return (
                    <tr
                      key={d.k}
                      style={{ ...ROW_BORDER, background: isSelected ? "rgba(99,102,241,0.08)" : undefined }}
                      className="hover:bg-white/[0.02]"
                    >
                      <td className={`${TD} text-center`}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(d.k)}
                          className="cursor-pointer"
                          style={{ accentColor: "var(--accent)", width: 13, height: 13 }}
                        />
                      </td>
                      <td className={`${TD} font-medium`} style={{ color: "var(--text)" }}>{d.k}</td>
                      <td className={TD}>
                        <Badge>{d.c}</Badge>
                      </td>
                      <td className={`${TD} text-right tabular-nums`}>{fmtVol(d.uk)}</td>
                      <TrendCell value={d.tu} hasData={!!d.uk} />
                      <td className={`${TD} text-right tabular-nums`}>{fmtVol(d.us)}</td>
                      <TrendCell value={d.ta} hasData={!!d.us} />
                      <td className={TD}>
                        <div className="flex gap-1 flex-wrap">
                          <KeywordLink keyword={d.k} geo={activeGeo} mode={linkMode} />
                          {otherGeos.map((g) => (
                            <KeywordLink key={g.code} keyword={d.k} geo={g.code} mode={linkMode} />
                          ))}
                        </div>
                      </td>
                    </tr>
                  )
                })}
            </tbody>
          </table>
          </div>
        </Panel>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center items-center gap-2 py-4">
          <Button
            onClick={() => { setPage((p) => p - 1); window.scrollTo(0, 0) }}
            disabled={page === 0}
          >
            Previous
          </Button>
          <span className="text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>
            {page + 1} / {totalPages}
          </span>
          <Button
            onClick={() => { setPage((p) => p + 1); window.scrollTo(0, 0) }}
            disabled={page >= totalPages - 1}
          >
            Next
          </Button>
        </div>
      )}
    </PageShell>
  )
}

function SortTh({ col, label, sortCol, sortDir, onSort, align }: {
  col: SortCol; label: string; sortCol: SortCol; sortDir: number
  onSort: (c: SortCol) => void; align?: "right"
}) {
  const active = col === sortCol
  return (
    <th
      onClick={() => onSort(col)}
      className={`${TH} cursor-pointer select-none whitespace-nowrap ${align === "right" ? "text-right" : "text-left"}`}
      style={{ color: active ? "var(--text)" : "var(--text-dim)" }}
    >
      {label}
      {active && <span className="ml-1">{sortDir === -1 ? "▼" : "▲"}</span>}
    </th>
  )
}

function TrendCell({ value, hasData }: { value: number; hasData: boolean }) {
  if (!hasData) return <td className={`${TD} text-right`} style={{ color: "var(--text-dim)" }}>—</td>
  const color = value > 10 ? "var(--green)" : value < -10 ? "var(--red)" : "var(--text-muted)"
  const sign = value > 0 ? "+" : ""
  return (
    <td className={`${TD} text-right tabular-nums font-semibold`} style={{ color }}>
      {sign}{value}%
    </td>
  )
}

function KeywordLink({ keyword, geo, mode }: { keyword: string; geo: string; mode: LinkMode }) {
  return (
    <a
      href={getKeywordUrl(keyword, geo, mode)}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-block px-1.5 py-0.5 rounded text-[9px] font-semibold transition-colors hover:!text-[var(--accent)] hover:!border-[var(--accent)]"
      style={{ border: "1px solid rgba(255,255,255,0.1)", color: "var(--text-muted)", textDecoration: "none" }}
    >
      {geo}
    </a>
  )
}
