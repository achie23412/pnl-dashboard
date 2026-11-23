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

type SearchMode = "shopping" | "ads"

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

export default function KeywordMakerPage() {
  const [data, setData] = useState<Keyword[]>([])
  const [loading, setLoading] = useState(true)
  const [category, setCategory] = useState("")
  const [search, setSearch] = useState("")
  const [modifier, setModifier] = useState("none")
  const [activeGeo, setActiveGeo] = useState("IE")
  const [searchMode, setSearchMode] = useState<SearchMode>("shopping")
  const [page, setPage] = useState(0)
  const [copied, setCopied] = useState<string | null>(null)

  useEffect(() => {
    fetch("/keywords.json")
      .then((r) => r.json())
      .then((d: Keyword[]) => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    return data
      .filter((d) => {
        if (d.k.trim().split(/\s+/).length < 2) return false
        if (category && d.c !== category) return false
        if (q && !d.k.includes(q)) return false
        return true
      })
      .sort((a, b) => -(a.uk + a.us) + (b.uk + b.us))
  }, [data, category, search])

  const pageData = filtered.slice(page * PER_PAGE, (page + 1) * PER_PAGE)
  const totalPages = Math.ceil(filtered.length / PER_PAGE)

  useEffect(() => { setPage(0) }, [category, search])

  const getSearchUrl = useCallback((keyword: string) => {
    const geo = GEOS.find((g) => g.code === activeGeo) || GEOS[0]
    const q = encodeURIComponent(applyModifier(keyword, modifier))
    if (searchMode === "ads") {
      return `https://adstransparency.google.com/?region=${geo.code}&q=${q}`
    }
    return `https://www.${geo.tld}/search?q=${q}&tbm=shop`
  }, [activeGeo, modifier, searchMode])

  const copyKeyword = useCallback((keyword: string) => {
    const text = applyModifier(keyword, modifier)
    navigator.clipboard.writeText(text).then(() => {
      setCopied(keyword)
      setTimeout(() => setCopied(null), 1500)
    })
  }, [modifier])

  const trendArrow = (tu: number, ta: number) => {
    const best = Math.abs(tu) > Math.abs(ta) ? tu : ta
    if (best > 10) return { icon: "↑", color: "var(--green)" }
    if (best < -10) return { icon: "↓", color: "var(--red)" }
    return { icon: "→", color: "var(--text-muted)" }
  }

  return (
    <main className="min-h-screen p-4 md:p-8 max-w-7xl mx-auto">
      <div className="mb-5">
        <h1 className="text-xl font-bold">Keyword Maker</h1>
        <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
          Full product queries to search on Google Shopping or Ads Library — find competitor stores in your target markets
        </p>
      </div>

      {/* Search */}
      <div className="mb-4">
        <input
          className="w-full px-4 py-2.5 rounded-lg text-sm outline-none"
          style={{ border: "1px solid var(--border)", background: "var(--bg-card)", color: "var(--text)" }}
          type="text"
          placeholder="Filter keywords..."
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

      {/* Controls row: search mode + market + modifier */}
      <div className="flex flex-wrap gap-2 items-center mb-4">
        <div className="flex gap-1 items-center">
          <span className="text-xs font-medium mr-1" style={{ color: "var(--text-muted)" }}>Search on:</span>
          <button
            onClick={() => setSearchMode("shopping")}
            className="px-3 py-1 rounded-md text-xs font-semibold"
            style={{
              border: "1px solid " + (searchMode === "shopping" ? "#34A853" : "var(--border)"),
              background: searchMode === "shopping" ? "#34A853" : "var(--bg-card)",
              color: searchMode === "shopping" ? "#fff" : "var(--text)",
            }}
          >
            Google Shopping
          </button>
          <button
            onClick={() => setSearchMode("ads")}
            className="px-3 py-1 rounded-md text-xs font-semibold"
            style={{
              border: "1px solid " + (searchMode === "ads" ? "#D47B6A" : "var(--border)"),
              background: searchMode === "ads" ? "#D47B6A" : "var(--bg-card)",
              color: searchMode === "ads" ? "#fff" : "var(--text)",
            }}
          >
            Ads Library
          </button>
        </div>

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

        <select
          value={modifier}
          onChange={(e) => setModifier(e.target.value)}
          className="ml-auto"
          style={{
            padding: "6px 10px", border: "1px solid var(--border)", borderRadius: "8px",
            background: "var(--bg-card)", color: "var(--text)", fontSize: "0.8rem", cursor: "pointer",
          }}
        >
          {MODIFIERS.map((m) => (
            <option key={m.key} value={m.key}>{m.label}</option>
          ))}
        </select>
      </div>

      {/* Stats */}
      {!loading && (
        <div className="text-xs mb-4" style={{ color: "var(--text-muted)" }}>
          <strong style={{ color: "var(--text)" }}>{filtered.length}</strong> product queries
          {modifier !== "none" && (
            <span style={{ color: "var(--orange)" }}> · modifier: {MODIFIERS.find(m => m.key === modifier)?.label}</span>
          )}
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
            const trend = trendArrow(d.tu, d.ta)
            const isCopied = copied === d.k
            return (
              <div
                key={d.k}
                className="rounded-xl p-4 border group transition-colors"
                style={{
                  background: "var(--bg-card)",
                  borderColor: "var(--border)",
                }}
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <a
                    href={getSearchUrl(d.k)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-semibold leading-snug hover:underline"
                    style={{ color: "var(--text)" }}
                  >
                    {displayText}
                  </a>
                  <span className="text-lg font-bold flex-shrink-0" style={{ color: trend.color, lineHeight: 1 }}>
                    {trend.icon}
                  </span>
                </div>

                <div className="flex items-center gap-3 mb-3">
                  <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                    UK <strong style={{ color: "var(--text)" }}>{fmtVol(d.uk)}</strong>
                  </span>
                  <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                    US <strong style={{ color: "var(--text)" }}>{fmtVol(d.us)}</strong>
                  </span>
                  <span
                    className="text-xs px-1.5 py-0.5 rounded capitalize"
                    style={{ background: "rgba(78,106,167,0.15)", color: "var(--text-muted)" }}
                  >
                    {d.c}
                  </span>
                </div>

                <div className="flex gap-2">
                  <a
                    href={getSearchUrl(d.k)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 text-center py-1.5 rounded-md text-xs font-semibold transition-opacity hover:opacity-90"
                    style={{
                      background: searchMode === "shopping" ? "#34A853" : "#D47B6A",
                      color: "#fff",
                      textDecoration: "none",
                    }}
                  >
                    {searchMode === "shopping" ? "Search Shopping" : "Search Ads Library"} ({activeGeo})
                  </a>
                  <button
                    onClick={() => copyKeyword(d.k)}
                    className="px-3 py-1.5 rounded-md text-xs font-semibold transition-colors"
                    style={{
                      border: "1px solid var(--border)",
                      background: isCopied ? "var(--green)" : "var(--bg-card)",
                      color: isCopied ? "#fff" : "var(--text-muted)",
                    }}
                  >
                    {isCopied ? "Copied!" : "Copy"}
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
