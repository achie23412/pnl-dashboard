"use client"
import { useEffect, useState, useMemo, useCallback } from "react"
import { PillSelect, FilterBar } from "@/components/PillSelect"
import { PageShell } from "@/components/PageShell"
import { Badge, Button, Loading, EmptyState } from "@/components/ui"

interface Keyword {
  k: string
  uk: number
  us: number
  tu: number
  ta: number
  c: string
}

const CATEGORIES = [
  { key: "", label: "all" },
  { key: "dresses", label: "Dresses" },
  { key: "shoes", label: "Shoes" },
  { key: "outerwear", label: "Outerwear" },
  { key: "tops", label: "Tops" },
  { key: "bottoms", label: "Bottoms" },
  { key: "accessories", label: "Accessories" },
  { key: "underwear", label: "Underwear" },
  { key: "sportswear", label: "Sportswear" },
  { key: "other", label: "Other" },
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
  { code: "NL", label: "Netherlands", tld: "google.nl" },
  { code: "DE", label: "Germany", tld: "google.de" },
  { code: "DK", label: "Denmark", tld: "google.dk" },
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
    if (best > 50) return { icon: "↑", color: "var(--green)", label: `+${pct}%`, hot: true }
    if (best > 10) return { icon: "↑", color: "var(--green)", label: `+${pct}%`, hot: false }
    if (best < -10) return { icon: "↓", color: "var(--red)", label: `${pct}%`, hot: false }
    return { icon: "→", color: "var(--text-muted)", label: `${pct > 0 ? "+" : ""}${pct}%`, hot: false }
  }

  const allPageSelected = pageData.length > 0 && pageData.every((d) => selected.has(d.k))

  return (
    <PageShell
      title="Keyword Maker"
      breadcrumb="Front End → Keyword Maker"
      description="Find Google Shopping competitor stores: search product queries in your target markets and open them in Google Shopping or the Ads Library."
      stats={loading ? undefined : [
        { label: "Product queries", value: filtered.length.toLocaleString("en-GB"), sub: modifier !== "none" ? `Modifier: ${MODIFIERS.find((m) => m.key === modifier)?.label}` : undefined },
        { label: "Selected", value: String(selected.size), sub: "Bulk open is capped at 10" },
      ]}
    >
      <FilterBar
        right={!loading && (
          <>
            <Button size="sm" onClick={selectAllOnPage}>
              {allPageSelected ? "Deselect page" : "Select page"}
            </Button>
            {selected.size > 0 && (
              <>
                <Button size="sm" variant="primary" onClick={() => bulkOpen("shopping")}>Open Shopping</Button>
                <Button size="sm" onClick={() => bulkOpen("ads")}>Open Ads Library</Button>
                <Button size="sm" onClick={() => bulkOpen("both")}>Open both</Button>
                <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
                {bulkOpened && <Badge tone="green">Opened (max 10)</Badge>}
              </>
            )}
          </>
        )}
      >
        <input
          className="min-w-[220px] px-2.5 py-1 rounded-lg text-[10px] outline-none"
          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", color: "var(--text)" }}
          type="text"
          placeholder="Filter keywords, e.g. wedding, running shoes"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <PillSelect label="Category" value={category} onChange={setCategory} options={CATEGORIES.map((c) => ({ value: c.key, label: c.label }))} />
        <PillSelect label="Market" value={activeGeo} onChange={setActiveGeo} options={GEOS.map((g) => ({ value: g.code, label: g.label }))} />
        <PillSelect
          label="Sort"
          value={sortKey}
          onChange={(v) => setSortKey(v as SortKey)}
          options={[{ value: "volume", label: "Volume" }, { value: "trend", label: "Trending" }, { value: "name", label: "A–Z" }]}
        />
        <PillSelect label="Modifier" value={modifier} onChange={setModifier} options={MODIFIERS.map((m) => ({ value: m.key, label: m.label }))} />
      </FilterBar>

      {/* Keyword cards grid */}
      {loading ? (
        <Loading>Loading keywords…</Loading>
      ) : pageData.length === 0 ? (
        <EmptyState title="No keywords match these filters">Clear the search or pick another category.</EmptyState>
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
                className="glass rounded-xl p-4 transition-all cursor-pointer"
                onClick={() => toggleSelect(d.k)}
                style={{
                  boxShadow: isSelected ? "0 0 0 1px var(--accent)" : "none",
                }}
              >
                {/* Header: keyword + badges */}
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div
                      className="w-3.5 h-3.5 rounded flex-shrink-0 flex items-center justify-center text-[9px]"
                      style={{
                        border: `1px solid ${isSelected ? "var(--accent)" : "rgba(255,255,255,0.15)"}`,
                        background: isSelected ? "var(--accent)" : "transparent",
                        color: "#fff",
                      }}
                    >
                      {isSelected && "✓"}
                    </div>
                    <span
                      className="text-[12px] font-semibold leading-snug truncate"
                      style={{ color: "var(--text)" }}
                      title={displayText}
                    >
                      {displayText}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {trend.hot && <Badge tone="green">Hot</Badge>}
                    <span className="text-[10px] font-semibold tabular-nums" style={{ color: trend.color }}>
                      {trend.icon} {trend.label}
                    </span>
                  </div>
                </div>

                {/* Volume bar */}
                <div className="mb-2">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-3">
                      <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                        UK <strong className="tabular-nums" style={{ color: "var(--text)" }}>{fmtVol(d.uk)}</strong>
                      </span>
                      <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                        US <strong className="tabular-nums" style={{ color: "var(--text)" }}>{fmtVol(d.us)}</strong>
                      </span>
                    </div>
                    <span className="text-[10px] font-bold tabular-nums" style={{ color: "var(--text)" }}>
                      {fmtVol(totalVol)}
                    </span>
                  </div>
                  <div className="w-full h-1.5 rounded-full" style={{ background: "rgba(255,255,255,0.06)" }}>
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${volPct}%`,
                        background: trend.hot ? "var(--green)" : "var(--accent)",
                      }}
                    />
                  </div>
                </div>

                {/* Category tag */}
                <div className="mb-3">
                  <Badge>{d.c}</Badge>
                </div>

                {/* Action buttons */}
                <div className="flex gap-1.5" onClick={(e) => e.stopPropagation()}>
                  <a
                    href={getShoppingUrl(d.k, activeGeo, modifier)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 text-center py-1 rounded-lg text-[10px] font-medium transition-opacity hover:opacity-90"
                    style={{ background: "var(--accent)", color: "#fff", textDecoration: "none" }}
                  >
                    Shopping
                  </a>
                  <a
                    href={getAdsUrl(d.k, activeGeo, modifier)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 text-center py-1 rounded-lg text-[10px] font-medium transition-opacity hover:opacity-90"
                    style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "var(--text)", textDecoration: "none" }}
                  >
                    Ads Library
                  </a>
                  <Button size="sm" variant={isCopied ? "ghost" : "secondary"} onClick={() => copyKeyword(d.k)}>
                    {isCopied ? "Copied" : "Copy"}
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
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
