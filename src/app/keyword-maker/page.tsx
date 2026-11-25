"use client"
import { useEffect, useState, useMemo, useCallback } from "react"
import { PillSelect } from "@/components/PillSelect"

interface Keyword {
  k: string
  uk: number
  us: number
  tu: number
  ta: number
  c: string
}

const CATEGORIES = [
  { key: "", label: "All", icon: "🔥" },
  { key: "dresses", label: "Dresses", icon: "👗" },
  { key: "shoes", label: "Shoes", icon: "👟" },
  { key: "outerwear", label: "Outerwear", icon: "🧥" },
  { key: "tops", label: "Tops", icon: "👕" },
  { key: "bottoms", label: "Bottoms", icon: "👖" },
  { key: "accessories", label: "Accessories", icon: "👜" },
  { key: "underwear", label: "Underwear", icon: "🩱" },
  { key: "sportswear", label: "Sportswear", icon: "🏃" },
  { key: "other", label: "Other", icon: "📦" },
]

const MODIFIERS = [
  { key: "none", label: "No modifier" },
  { key: "buy", label: "+ buy online" },
  { key: "shop", label: "+ shop" },
  { key: "sale", label: "+ sale" },
  { key: "cheap", label: "+ cheap" },
  { key: "womens", label: "+ women's" },
  { key: "mens", label: "+ men's" },
  { key: "uk", label: "+ uk" },
]

const GEOS = [
  { code: "IE", label: "Ireland", tld: "google.ie" },
  { code: "NL", label: "Nederland", tld: "google.nl" },
  { code: "DE", label: "Duitsland", tld: "google.de" },
  { code: "DK", label: "Denemarken", tld: "google.dk" },
  { code: "GB", label: "UK", tld: "google.co.uk" },
  { code: "US", label: "US", tld: "google.com" },
]

type SortKey = "volume" | "trend" | "name"

const PER_PAGE = 60

function fmtVol(n: number): string {
  if (!n) return "—"
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M"
  if (n >= 1_000) return (n / 1_000).toFixed(0) + "K"
  return n.toString()
}

function applyModifier(keyword: string, mod: string): string {
  if (mod === "none" || !mod) return keyword
  if (mod === "buy") return `buy ${keyword} online`
  if (mod === "shop") return `${keyword} shop`
  if (mod === "sale") return `${keyword} sale`
  if (mod === "cheap") return `cheap ${keyword}`
  if (mod === "womens") return `women's ${keyword}`
  if (mod === "mens") return `men's ${keyword}`
  if (mod === "uk") return `${keyword} uk`
  return keyword
}

function getShoppingUrl(keyword: string, geoCode: string, mod: string): string {
  const geo = GEOS.find((g) => g.code === geoCode) || GEOS[0]
  const q = encodeURIComponent(applyModifier(keyword, mod))
  return `https://www.${geo.tld}/search?q=${q}&tbm=shop`
}

function getAdsUrl(keyword: string, geoCode: string, mod: string): string {
  const q = encodeURIComponent(applyModifier(keyword, mod))
  return `https://adstransparency.google.com/?region=${geoCode}&q=${q}`
}

export default function KeywordMakerPage() {
  const [data, setData] = useState<Keyword[]>([])
  const [loading, setLoading] = useState(true)
  const [category, setCategory] = useState("")
  const [search, setSearch] = useState("")
  const [modifier, setModifier] = useState("none")
  const [activeGeo, setActiveGeo] = useState("IE")
  const [sortKey, setSortKey] = useState<SortKey>("volume")
  const [page, setPage] = useState(0)
  const [copied, setCopied] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkOpened, setBulkOpened] = useState(false)

  useEffect(() => {
    fetch("/keywords.json")
      .then((r) => r.json())
      .then((d: Keyword[]) => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const maxVol = useMemo(() => {
    if (!data.length) return 1
    return Math.max(...data.map((d) => d.uk + d.us))
  }, [data])

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    const result = data.filter((d) => {
      if (d.k.trim().split(/\s+/).length < 2) return false
      if (category && d.c !== category) return false
      if (q && !d.k.includes(q)) return false
      return true
    })

    if (sortKey === "volume") {
      result.sort((a, b) => (b.uk + b.us) - (a.uk + a.us))
    } else if (sortKey === "trend") {
      result.sort((a, b) => {
        const tA = Math.max(a.tu, a.ta)
        const tB = Math.max(b.tu, b.ta)
        return tB - tA
      })
    } else {
      result.sort((a, b) => a.k.localeCompare(b.k))
    }

    return result
  }, [data, category, search, sortKey])

  const pageData = filtered.slice(page * PER_PAGE, (page + 1) * PER_PAGE)
  const totalPages = Math.ceil(filtered.length / PER_PAGE)

  useEffect(() => { setPage(0) }, [category, search, sortKey])

  const copyKeyword = useCallback((keyword: string) => {
    const text = applyModifier(keyword, modifier)
    navigator.clipboard.writeText(text).then(() => {
      setCopied(keyword)
      setTimeout(() => setCopied(null), 1500)
    })
  }, [modifier])

  const toggleSelect = useCallback((keyword: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(keyword)) next.delete(keyword)
      else next.add(keyword)
      return next
    })
  }, [])

  const selectAllOnPage = useCallback(() => {
    setSelected((prev) => {
      const next = new Set(prev)
      const allSelected = pageData.every((d) => next.has(d.k))
      if (allSelected) {
        pageData.forEach((d) => next.delete(d.k))
      } else {
        pageData.forEach((d) => next.add(d.k))
      }
      return next
    })
  }, [pageData])

  const bulkOpen = useCallback((mode: "shopping" | "ads" | "both") => {
    const keywords = Array.from(selected)
    if (!keywords.length) return
    const max = Math.min(keywords.length, 10)
    for (let i = 0; i < max; i++) {
      if (mode === "shopping" || mode === "both") {
        window.open(getShoppingUrl(keywords[i], activeGeo, modifier), "_blank")
      }
      if (mode === "ads" || mode === "both") {
        window.open(getAdsUrl(keywords[i], activeGeo, modifier), "_blank")
      }
    }
    setBulkOpened(true)
    setTimeout(() => setBulkOpened(false), 2000)
  }, [selected, activeGeo, modifier])

  const trendInfo = (tu: number, ta: number) => {
    const best = Math.abs(tu) > Math.abs(ta) ? tu : ta
    const pct = Math.round(best)
    if (best > 50) return { icon: "🔥", color: "var(--green)", label: `+${pct}%`, hot: true }
    if (best > 10) return { icon: "↑", color: "var(--green)", label: `+${pct}%`, hot: false }
    if (best < -10) return { icon: "↓", color: "var(--red)", label: `${pct}%`, hot: false }
    return { icon: "→", color: "var(--text-muted)", label: `${pct > 0 ? "+" : ""}${pct}%`, hot: false }
  }

  const allPageSelected = pageData.length > 0 && pageData.every((d) => selected.has(d.k))

  return (
    <main className="min-h-screen p-4 md:p-8 max-w-7xl mx-auto">
      <div className="mb-5">
        <h1 className="text-xl font-bold">Keyword Maker</h1>
        <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
          Find Google Shopping competitor stores — search product queries across your target markets
        </p>
      </div>

      {/* Search */}
      <div className="mb-4">
        <input
          className="w-full px-4 py-2.5 rounded-lg text-sm outline-none"
          style={{ border: "1px solid var(--border)", background: "var(--bg-card)", color: "var(--text)" }}
          type="text"
          placeholder="Filter keywords... e.g. 'wedding', 'running shoes'"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Category pills */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        {CATEGORIES.map((c) => (
          <button
            key={c.key}
            onClick={() => setCategory(c.key)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
            style={{
              border: "1px solid " + (category === c.key ? "#4E6AA7" : "var(--border)"),
              background: category === c.key ? "#4E6AA7" : "var(--bg-card)",
              color: category === c.key ? "#fff" : "var(--text)",
            }}
          >
            {c.icon} {c.label}
          </button>
        ))}
      </div>

      {/* Controls row */}
      <div className="flex flex-wrap gap-2 items-center mb-3">
        <div className="flex gap-1 items-center">
          <span className="text-xs font-medium mr-1" style={{ color: "var(--text-muted)" }}>Market:</span>
          {GEOS.map((g) => (
            <button
              key={g.code}
              onClick={() => setActiveGeo(g.code)}
              className="px-2.5 py-1 rounded-md text-xs font-semibold"
              style={{
                border: "1px solid " + (activeGeo === g.code ? "#4E6AA7" : "var(--border)"),
                background: activeGeo === g.code ? "#4E6AA7" : "var(--bg-card)",
                color: activeGeo === g.code ? "#fff" : "var(--text)",
              }}
            >
              {g.code}
            </button>
          ))}
        </div>

        <div className="flex gap-1 items-center">
          <span className="text-xs font-medium mr-1" style={{ color: "var(--text-muted)" }}>Sort:</span>
          {([["volume", "Volume"], ["trend", "Trending"], ["name", "A–Z"]] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setSortKey(key)}
              className="px-2.5 py-1 rounded-md text-xs font-semibold"
              style={{
                border: "1px solid " + (sortKey === key ? "#4E6AA7" : "var(--border)"),
                background: sortKey === key ? "#4E6AA7" : "var(--bg-card)",
                color: sortKey === key ? "#fff" : "var(--text)",
              }}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="ml-auto">
          <PillSelect label="Modifier" value={modifier} onChange={setModifier} options={MODIFIERS.map((m) => ({ value: m.key, label: m.label }))} align="right" />
        </div>
      </div>

      {/* Stats + bulk actions */}
      {!loading && (
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <div className="text-xs" style={{ color: "var(--text-muted)" }}>
            <strong style={{ color: "var(--text)" }}>{filtered.length}</strong> product queries
            {modifier !== "none" && (
              <span style={{ color: "var(--orange)" }}> · modifier: {MODIFIERS.find(m => m.key === modifier)?.label}</span>
            )}
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <button
              onClick={selectAllOnPage}
              className="px-3 py-1 rounded-md text-xs font-medium"
              style={{ border: "1px solid var(--border)", background: "var(--bg-card)", color: "var(--text-muted)" }}
            >
              {allPageSelected ? "Deselect page" : "Select page"}
            </button>
            {selected.size > 0 && (
              <>
                <span className="text-xs font-semibold" style={{ color: "#4E6AA7" }}>
                  {selected.size} selected
                </span>
                <button
                  onClick={() => bulkOpen("shopping")}
                  className="px-3 py-1 rounded-md text-xs font-semibold"
                  style={{ background: "#34A853", color: "#fff" }}
                >
                  Open Shopping
                </button>
                <button
                  onClick={() => bulkOpen("ads")}
                  className="px-3 py-1 rounded-md text-xs font-semibold"
                  style={{ background: "#D47B6A", color: "#fff" }}
                >
                  Open Ads
                </button>
                <button
                  onClick={() => bulkOpen("both")}
                  className="px-3 py-1 rounded-md text-xs font-semibold"
                  style={{ background: "#4E6AA7", color: "#fff" }}
                >
                  Open Both
                </button>
                <button
                  onClick={() => setSelected(new Set())}
                  className="px-2 py-1 rounded-md text-xs"
                  style={{ color: "var(--text-muted)" }}
                >
                  Clear
                </button>
                {bulkOpened && (
                  <span className="text-xs font-semibold" style={{ color: "var(--green)" }}>
                    Opened! (max 10)
                  </span>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Keyword cards grid */}
      {loading ? (
        <div className="text-center py-20" style={{ color: "var(--text-muted)" }}>Loading keywords...</div>
      ) : pageData.length === 0 ? (
        <div className="text-center py-20" style={{ color: "var(--text-muted)" }}>No keywords match your filters</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {pageData.map((d) => {
            const displayText = applyModifier(d.k, modifier)
            const trend = trendInfo(d.tu, d.ta)
            const isCopied = copied === d.k
            const isSelected = selected.has(d.k)
            const totalVol = d.uk + d.us
            const volPct = maxVol > 0 ? Math.max((totalVol / maxVol) * 100, 2) : 0

            return (
              <div
                key={d.k}
                className="rounded-xl p-4 border transition-all cursor-pointer"
                onClick={() => toggleSelect(d.k)}
                style={{
                  background: "var(--bg-card)",
                  borderColor: isSelected ? "#4E6AA7" : "var(--border)",
                  boxShadow: isSelected ? "0 0 0 1px #4E6AA7" : "none",
                }}
              >
                {/* Header: keyword + badges */}
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div
                      className="w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center text-xs"
                      style={{
                        borderColor: isSelected ? "#4E6AA7" : "var(--border)",
                        background: isSelected ? "#4E6AA7" : "transparent",
                        color: "#fff",
                      }}
                    >
                      {isSelected && "✓"}
                    </div>
                    <span
                      className="text-sm font-semibold leading-snug truncate"
                      style={{ color: "var(--text)" }}
                      title={displayText}
                    >
                      {displayText}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {trend.hot && (
                      <span
                        className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                        style={{ background: "rgba(52,211,153,0.15)", color: "var(--green)" }}
                      >
                        HOT
                      </span>
                    )}
                    <span className="text-xs font-semibold" style={{ color: trend.color }}>
                      {trend.icon} {trend.label}
                    </span>
                  </div>
                </div>

                {/* Volume bar */}
                <div className="mb-2">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-3">
                      <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                        UK <strong style={{ color: "var(--text)" }}>{fmtVol(d.uk)}</strong>
                      </span>
                      <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                        US <strong style={{ color: "var(--text)" }}>{fmtVol(d.us)}</strong>
                      </span>
                    </div>
                    <span className="text-xs font-bold" style={{ color: "var(--text)" }}>
                      {fmtVol(totalVol)}
                    </span>
                  </div>
                  <div className="w-full h-1.5 rounded-full" style={{ background: "var(--border)" }}>
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${volPct}%`,
                        background: trend.hot
                          ? "linear-gradient(90deg, #34d399, #4E6AA7)"
                          : "#4E6AA7",
                      }}
                    />
                  </div>
                </div>

                {/* Category tag */}
                <div className="mb-3">
                  <span
                    className="text-[10px] px-1.5 py-0.5 rounded capitalize"
                    style={{ background: "rgba(78,106,167,0.15)", color: "var(--text-muted)" }}
                  >
                    {d.c}
                  </span>
                </div>

                {/* Action buttons */}
                <div className="flex gap-1.5" onClick={(e) => e.stopPropagation()}>
                  <a
                    href={getShoppingUrl(d.k, activeGeo, modifier)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 text-center py-1.5 rounded-md text-xs font-semibold transition-opacity hover:opacity-90"
                    style={{ background: "#34A853", color: "#fff", textDecoration: "none" }}
                  >
                    Shopping
                  </a>
                  <a
                    href={getAdsUrl(d.k, activeGeo, modifier)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 text-center py-1.5 rounded-md text-xs font-semibold transition-opacity hover:opacity-90"
                    style={{ background: "#D47B6A", color: "#fff", textDecoration: "none" }}
                  >
                    Ads Library
                  </a>
                  <button
                    onClick={() => copyKeyword(d.k)}
                    className="px-2.5 py-1.5 rounded-md text-xs font-semibold transition-colors"
                    style={{
                      border: "1px solid var(--border)",
                      background: isCopied ? "var(--green)" : "var(--bg-card)",
                      color: isCopied ? "#fff" : "var(--text-muted)",
                    }}
                  >
                    {isCopied ? "✓" : "Copy"}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center items-center gap-3 py-6">
          <button
            onClick={() => { setPage((p) => p - 1); window.scrollTo(0, 0) }}
            disabled={page === 0}
            className="px-4 py-2 rounded-md text-sm font-medium disabled:opacity-40"
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
            className="px-4 py-2 rounded-md text-sm font-medium disabled:opacity-40"
            style={{ border: "1px solid var(--border)", background: "var(--bg-card)", color: "var(--text)" }}
          >
            Next
          </button>
        </div>
      )}
    </main>
  )
}
