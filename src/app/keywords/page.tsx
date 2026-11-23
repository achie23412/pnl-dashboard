"use client"
import { useEffect, useState, useMemo, useCallback } from "react"

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
  { code: "NL", label: "Nederland" },
  { code: "DE", label: "Duitsland" },
  { code: "DK", label: "Denemarken" },
  { code: "GB", label: "UK" },
  { code: "US", label: "US" },
] as const

const LINK_MODES: { mode: LinkMode; label: string; color: string }[] = [
  { mode: "shopping", label: "Google Shopping", color: "#34A853" },
  { mode: "ads", label: "Ads Library", color: "#D47B6A" },
  { mode: "trends", label: "Google Trends", color: "#4E6AA7" },
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
  const [category, setCategory] = useState("")
  const [trendFilter, setTrendFilter] = useState("")
  const [minVol, setMinVol] = useState(0)
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
      if (category && d.c !== category) return false
      if (minVol && d.uk < minVol && d.us < minVol) return false
      if (trendFilter === "rising" && d.tu <= 10 && d.ta <= 10) return false
      if (trendFilter === "falling" && d.tu >= -10 && d.ta >= -10) return false
      return true
    })
    result.sort((a, b) => {
      const av = a[sortCol]
      const bv = b[sortCol]
      if (typeof av === "string" && typeof bv === "string") return sortDir * av.localeCompare(bv)
      return sortDir * ((av as number) - (bv as number))
    })
    return result
  }, [data, search, category, trendFilter, minVol, sortCol, sortDir])

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

  useEffect(() => { setPage(0) }, [search, category, trendFilter, minVol])

  const otherGeos = GEOS.filter((g) => g.code !== activeGeo).slice(0, 3)

  const selectStyle: React.CSSProperties = {
    padding: "8px 12px", border: "1px solid var(--border)", borderRadius: "8px",
    background: "var(--bg-card)", color: "var(--text)", fontSize: "0.8rem", cursor: "pointer",
  }

  return (
    <main className="min-h-screen p-4 md:p-8 max-w-7xl mx-auto">
      <div className="mb-4">
        <h1 className="text-xl font-bold">Keyword Research</h1>
        <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
          6,938 fashion keywords from UK + US Google Keyword Planner — search keywords on Google Shopping or Ads Library to find competitors
        </p>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap gap-2 items-center mb-3">
        <input
          className="flex-1 min-w-[200px] px-3 py-2 rounded-lg text-sm outline-none"
          style={{ border: "1px solid var(--border)", background: "var(--bg-card)", color: "var(--text)" }}
          type="text"
          placeholder="Search keywords..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select value={category} onChange={(e) => setCategory(e.target.value)} style={selectStyle}>
          <option value="">All categories</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
          ))}
        </select>
        <select value={trendFilter} onChange={(e) => setTrendFilter(e.target.value)} style={selectStyle}>
          <option value="">All trends</option>
          <option value="rising">Rising only</option>
          <option value="falling">Falling only</option>
        </select>
        <select value={minVol} onChange={(e) => setMinVol(Number(e.target.value))} style={selectStyle}>
          <option value={0}>Min volume: any</option>
          <option value={5000}>5K+</option>
          <option value={10000}>10K+</option>
          <option value={25000}>25K+</option>
          <option value={50000}>50K+</option>
          <option value={100000}>100K+</option>
        </select>
      </div>

      {/* Link mode toggle */}
      <div className="flex flex-wrap gap-1.5 items-center mb-3">
        <span className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>Open in:</span>
        {LINK_MODES.map((m) => (
          <button
            key={m.mode}
            onClick={() => setLinkMode(m.mode)}
            className="px-3 py-1 rounded-md text-xs font-semibold transition-colors"
            style={{
              border: "1px solid " + (linkMode === m.mode ? m.color : "var(--border)"),
              background: linkMode === m.mode ? m.color : "var(--bg-card)",
              color: linkMode === m.mode ? "#fff" : "var(--text)",
            }}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* Market bar */}
      <div className="flex flex-wrap gap-1.5 items-center mb-3">
        <span className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>Market:</span>
        {GEOS.map((g) => (
          <button
            key={g.code}
            onClick={() => setActiveGeo(g.code)}
            className="px-3 py-1 rounded-md text-xs font-semibold transition-colors"
            style={{
              border: "1px solid " + (activeGeo === g.code ? "#4E6AA7" : "var(--border)"),
              background: activeGeo === g.code ? "#4E6AA7" : "var(--bg-card)",
              color: activeGeo === g.code ? "#fff" : "var(--text)",
            }}
          >
            {g.label}
          </button>
        ))}
      </div>

      {/* Selected comparison bar */}
      {selected.size > 0 && (
        <div
          className="flex flex-wrap items-center gap-2 px-3 py-2.5 rounded-lg mb-3"
          style={{ background: "rgba(78, 106, 167, 0.15)" }}
        >
          <span className="text-xs font-semibold" style={{ color: "#4E6AA7" }}>Compare:</span>
          {Array.from(selected).map((kw) => (
            <span
              key={kw}
              className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium"
              style={{ background: "#4E6AA7", color: "#fff" }}
            >
              {kw}
              <button onClick={() => removeSelected(kw)} className="opacity-80 hover:opacity-100 ml-0.5">×</button>
            </span>
          ))}
          <a
            href={compareUrl(Array.from(selected), activeGeo, linkMode)}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto px-4 py-1.5 rounded-md text-xs font-semibold"
            style={{ background: LINK_MODES.find(m => m.mode === linkMode)?.color || "#4E6AA7", color: "#fff" }}
          >
            {linkMode === "trends" ? "Compare in Google Trends" : linkMode === "shopping" ? "Search Google Shopping" : "Search Ads Library"}
          </a>
        </div>
      )}

      {/* Stats */}
      {!loading && (
        <div className="flex gap-4 flex-wrap mb-3">
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>
            <strong style={{ color: "var(--text)" }}>{filtered.length}</strong> keywords
          </span>
          <span className="text-xs" style={{ color: "var(--green)" }}>
            <strong>{risingCount}</strong> rising
          </span>
          <span className="text-xs" style={{ color: "var(--red)" }}>
            <strong>{fallingCount}</strong> falling
          </span>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="text-center py-20" style={{ color: "var(--text-muted)" }}>
          Loading keyword data...
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl" style={{ border: "1px solid var(--border)" }}>
          <table className="w-full text-sm" style={{ minWidth: 700, borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th className="w-9 text-center" style={thStyle}>
                  <input
                    type="checkbox"
                    className="cursor-pointer"
                    style={{ accentColor: "#4E6AA7", width: 15, height: 15 }}
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
                <SortTh col="uk" label="UK Vol" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} align="right" />
                <SortTh col="tu" label="UK Trend" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} align="right" />
                <SortTh col="us" label="US Vol" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} align="right" />
                <SortTh col="ta" label="US Trend" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} align="right" />
                <th style={thStyle}>
                  {linkMode === "shopping" ? "Google Shopping" : linkMode === "ads" ? "Ads Library" : "Google Trends"}
                </th>
              </tr>
            </thead>
            <tbody>
              {pageData.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-10" style={{ color: "var(--text-muted)" }}>
                    No keywords match your filters
                  </td>
                </tr>
              ) : (
                pageData.map((d) => {
                  const isSelected = selected.has(d.k)
                  return (
                    <tr
                      key={d.k}
                      style={{ background: isSelected ? "rgba(78, 106, 167, 0.1)" : undefined }}
                      className="hover:bg-[var(--bg-card-hover)]"
                    >
                      <td className="text-center" style={tdStyle}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(d.k)}
                          className="cursor-pointer"
                          style={{ accentColor: "#4E6AA7", width: 15, height: 15 }}
                        />
                      </td>
                      <td style={tdStyle} className="font-medium">{d.k}</td>
                      <td style={tdStyle}>
                        <span
                          className="inline-block px-2 py-0.5 rounded text-xs font-medium capitalize"
                          style={{ background: "var(--bg-card)", color: "var(--text-muted)" }}
                        >
                          {d.c}
                        </span>
                      </td>
                      <td style={{ ...tdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmtVol(d.uk)}</td>
                      <TrendCell value={d.tu} hasData={!!d.uk} />
                      <td style={{ ...tdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmtVol(d.us)}</td>
                      <TrendCell value={d.ta} hasData={!!d.us} />
                      <td style={tdStyle}>
                        <div className="flex gap-1 flex-wrap">
                          <KeywordLink keyword={d.k} geo={activeGeo} mode={linkMode} />
                          {otherGeos.map((g) => (
                            <KeywordLink key={g.code} keyword={d.k} geo={g.code} mode={linkMode} />
                          ))}
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center items-center gap-2 py-4">
          <button
            onClick={() => { setPage((p) => p - 1); window.scrollTo(0, 0) }}
            disabled={page === 0}
            className="px-3.5 py-1.5 rounded-md text-sm disabled:opacity-40"
            style={{ border: "1px solid var(--border)", background: "var(--bg-card)", color: "var(--text)" }}
          >
            Prev
          </button>
          <span className="text-sm" style={{ color: "var(--text-muted)", fontVariantNumeric: "tabular-nums" }}>
            {page + 1} / {totalPages}
          </span>
          <button
            onClick={() => { setPage((p) => p + 1); window.scrollTo(0, 0) }}
            disabled={page >= totalPages - 1}
            className="px-3.5 py-1.5 rounded-md text-sm disabled:opacity-40"
            style={{ border: "1px solid var(--border)", background: "var(--bg-card)", color: "var(--text)" }}
          >
            Next
          </button>
        </div>
      )}
    </main>
  )
}

const thStyle: React.CSSProperties = {
  background: "var(--bg-card)",
  padding: "10px 12px",
  textAlign: "left",
  fontWeight: 600,
  fontSize: "0.7rem",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  color: "var(--text-muted)",
  borderBottom: "2px solid var(--border)",
  whiteSpace: "nowrap",
  userSelect: "none",
}

const tdStyle: React.CSSProperties = {
  padding: "8px 12px",
  borderBottom: "1px solid var(--border)",
  verticalAlign: "middle",
}

function SortTh({ col, label, sortCol, sortDir, onSort, align }: {
  col: SortCol; label: string; sortCol: SortCol; sortDir: number
  onSort: (c: SortCol) => void; align?: "right"
}) {
  const active = col === sortCol
  return (
    <th
      onClick={() => onSort(col)}
      className="cursor-pointer hover:text-[#4E6AA7]"
      style={{ ...thStyle, textAlign: align || "left", color: active ? "#4E6AA7" : "var(--text-muted)" }}
    >
      {label}
      {active && <span className="text-[0.65rem] ml-1">{sortDir === -1 ? "▼" : "▲"}</span>}
    </th>
  )
}

function TrendCell({ value, hasData }: { value: number; hasData: boolean }) {
  if (!hasData) return <td style={{ ...tdStyle, textAlign: "right", color: "var(--text-muted)" }}>—</td>
  const color = value > 10 ? "var(--green)" : value < -10 ? "var(--red)" : "var(--text-muted)"
  const sign = value > 0 ? "+" : ""
  return (
    <td style={{ ...tdStyle, textAlign: "right", fontWeight: 600, fontSize: "0.75rem", color, fontVariantNumeric: "tabular-nums" }}>
      {sign}{value}%
    </td>
  )
}

function KeywordLink({ keyword, geo, mode }: { keyword: string; geo: string; mode: LinkMode }) {
  const hoverColor = LINK_MODES.find(m => m.mode === mode)?.color || "#4E6AA7"
  return (
    <a
      href={getKeywordUrl(keyword, geo, mode)}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-block px-1.5 py-0.5 rounded text-[0.65rem] font-semibold transition-colors"
      style={{ border: "1px solid var(--border)", color: "var(--text-muted)", textDecoration: "none" }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = hoverColor
        e.currentTarget.style.color = hoverColor
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "var(--border)"
        e.currentTarget.style.color = "var(--text-muted)"
      }}
    >
      {geo}
    </a>
  )
}
