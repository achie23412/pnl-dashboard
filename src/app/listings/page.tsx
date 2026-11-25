"use client"
import { useEffect, useMemo, useState, useCallback } from "react"
import { PageShell } from "@/components/PageShell"
import type { LiveListing } from "@/app/api/listings/route"

const STORES = ["All", "Walsh & Farley", "Carter & Collins", "Susan & Allen"]
const FILTERS = [
  { key: "all", label: "All" },
  { key: "critical", label: "Must fix" },
  { key: "warning", label: "Tips only" },
  { key: "ok", label: "No issues" },
  { key: "soldout", label: "Sold out" },
] as const
const input = { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", color: "var(--text)" }

type Data = {
  fetchedAt: string
  stores: { store: string; domain: string; count: number; error: string | null }[]
  listings: LiveListing[]
}

// Auto-fixable issue types
const AUTO_FIX_TYPES: Record<string, string> = {
  "repeated_words": "Title: Repeated word",
  "colour_in_title": "Title: Colour in the title",
  "size_in_title": "Title: Size in the title",
}

function detectFixType(issueKey: string): string | null {
  if (issueKey.startsWith("Title: Repeated word")) return "repeated_words"
  if (issueKey.startsWith("Title: Colour in the title")) return "colour_in_title"
  if (issueKey.startsWith("Title: Size in the title")) return "size_in_title"
  return null
}

const COLOURS = [
  "black", "white", "red", "blue", "green", "yellow", "pink", "purple", "orange", "brown", "grey", "gray", "beige",
  "navy", "khaki", "cream", "ivory", "burgundy", "maroon", "olive", "camel", "tan", "gold", "silver", "teal", "mint",
  "apricot", "coffee", "wine", "lilac", "rose",
]
const SIZES = ["xxs", "xs", "s", "m", "l", "xl", "xxl", "xxxl", "2xl", "3xl", "4xl", "5xl", "small", "medium", "large", "plus size"]

function removeWord(title: string, word: string): string {
  const re = new RegExp(`(^|\\s)${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\s|$)`, "i")
  return title.replace(re, "$1").replace(/\s{2,}/g, " ").trim()
}

function computeFixedTitle(title: string, fixType: string): string {
  switch (fixType) {
    case "repeated_words": {
      const words = title.split(/\s+/)
      const seen = new Map<string, number>()
      const result: string[] = []
      for (const w of words) {
        const lower = w.toLowerCase().replace(/[^a-z0-9]/g, "")
        if (lower.length <= 3) { result.push(w); continue }
        if (seen.has(lower)) continue
        seen.set(lower, result.length)
        result.push(w)
      }
      return result.join(" ").replace(/\s{2,}/g, " ").trim()
    }
    case "colour_in_title": {
      let t = title
      for (const c of COLOURS) {
        if (new RegExp(`(^|[^a-z0-9])${c}([^a-z0-9]|$)`, "i").test(t)) t = removeWord(t, c)
      }
      return t
    }
    case "size_in_title": {
      let t = title
      for (const s of SIZES) {
        if (s.length > 2 && new RegExp(`(^|[^a-z0-9])${s}([^a-z0-9]|$)`, "i").test(t)) t = removeWord(t, s)
      }
      return t
    }
    default: return title
  }
}

type FixStatus = "idle" | "fixing" | "done" | "error"

export default function ListingsPage() {
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [store, setStore] = useState("All")
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("critical")
  const [q, setQ] = useState("")
  const [open, setOpen] = useState<string | null>(null)
  const [limit, setLimit] = useState(100)
  const [openIssue, setOpenIssue] = useState<string | null>(null)
  const [fixStatus, setFixStatus] = useState<Record<string, FixStatus>>({})
  const [fixResults, setFixResults] = useState<Record<string, { ok: number; failed: number; errors: string[] }>>({})
  const [fixedProducts, setFixedProducts] = useState<Set<string>>(new Set())

  useEffect(() => {
    fetch("/api/listings", { cache: "no-store" })
      .then(async (r) => {
        const d = await r.json()
        if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`)
        setData(d)
        const hasCritical = (d.listings as LiveListing[]).some((l) => l.issues.some((i) => i.level === "critical"))
        if (!hasCritical) setFilter("warning")
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
  }, [])

  const all = useMemo(() => data?.listings || [], [data])
  const inStore = useMemo(() => all.filter((l) => store === "All" || l.store === store), [all, store])
  const crit = (l: LiveListing) => l.issues.some((i) => i.level === "critical")
  const stats = {
    live: inStore.length,
    critical: inStore.filter(crit).length,
    warning: inStore.filter((l) => !crit(l) && l.issues.length > 0).length,
    soldOut: inStore.filter((l) => l.variants > 0 && l.inStock === 0).length,
  }

  // Most common problems with affected products
  const topIssues = useMemo(() => {
    const m: Record<string, { count: number; level: string; fix: string; products: LiveListing[] }> = {}
    for (const l of inStore) for (const i of l.issues) {
      const key = `${i.field}: ${i.message.replace(/\d+/g, "#").replace(/".*?"/g, '"…"').replace(/\(.*?\)/g, "").trim()}`
      if (!m[key]) m[key] = { count: 0, level: i.level, fix: i.fix, products: [] }
      m[key].count++
      m[key].products.push(l)
    }
    return Object.entries(m)
      .sort((a, b) => (a[1].level === b[1].level ? b[1].count - a[1].count : a[1].level === "critical" ? -1 : 1))
      .slice(0, 12)
  }, [inStore])

  const rows = inStore
    .filter((l) =>
      filter === "all" ? true
      : filter === "critical" ? crit(l)
      : filter === "warning" ? !crit(l) && l.issues.length > 0
      : filter === "ok" ? l.issues.length === 0
      : l.variants > 0 && l.inStock === 0)
    .filter((l) => !q || l.title.toLowerCase().includes(q.toLowerCase()) || l.handle.includes(q.toLowerCase()))
    .sort((a, b) => Number(crit(b)) - Number(crit(a)) || b.issues.length - a.issues.length)

  const fixAll = useCallback(async (issueKey: string, products: LiveListing[]) => {
    const fixType = detectFixType(issueKey)
    if (!fixType) return

    setFixStatus((s) => ({ ...s, [issueKey]: "fixing" }))

    const fixes = products
      .filter((p) => !fixedProducts.has(`${p.store}-${p.id}`))
      .map((p) => ({
        store: p.store,
        productId: p.id,
        fixType,
        newTitle: computeFixedTitle(p.title, fixType),
      }))
      .filter((f) => f.newTitle !== f.store) // only send if title actually changed

    if (fixes.length === 0) {
      setFixStatus((s) => ({ ...s, [issueKey]: "done" }))
      setFixResults((r) => ({ ...r, [issueKey]: { ok: 0, failed: 0, errors: ["All products already fixed"] } }))
      return
    }

    try {
      const res = await fetch("/api/listings/fix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fixes }),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || `HTTP ${res.status}`)

      const okIds = (result.results || []).filter((r: { ok: boolean }) => r.ok).map((r: { productId: number; store: string }) => `${r.store}-${r.productId}`)
      setFixedProducts((prev) => {
        const next = new Set(prev)
        okIds.forEach((id: string) => next.add(id))
        return next
      })

      const errors = (result.results || []).filter((r: { ok: boolean }) => !r.ok).map((r: { error?: string; store: string }) => `${r.store}: ${r.error}`)
      setFixResults((r) => ({ ...r, [issueKey]: { ok: result.summary.ok, failed: result.summary.failed, errors } }))
      setFixStatus((s) => ({ ...s, [issueKey]: result.summary.failed > 0 ? "error" : "done" }))
    } catch (e) {
      setFixStatus((s) => ({ ...s, [issueKey]: "error" }))
      setFixResults((r) => ({ ...r, [issueKey]: { ok: 0, failed: 0, errors: [e instanceof Error ? e.message : String(e)] } }))
    }
  }, [fixedProducts])

  const fixSingle = useCallback(async (l: LiveListing, fixType: string) => {
    const key = `single-${l.store}-${l.id}`
    setFixStatus((s) => ({ ...s, [key]: "fixing" }))

    const newTitle = computeFixedTitle(l.title, fixType)
    try {
      const res = await fetch("/api/listings/fix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fixes: [{ store: l.store, productId: l.id, fixType, newTitle }] }),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || `HTTP ${res.status}`)

      const ok = result.results?.[0]?.ok
      if (ok) {
        setFixedProducts((prev) => { const next = new Set(prev); next.add(`${l.store}-${l.id}`); return next })
      }
      setFixStatus((s) => ({ ...s, [key]: ok ? "done" : "error" }))
    } catch {
      setFixStatus((s) => ({ ...s, [key]: "error" }))
    }
  }, [])

  return (
    <PageShell
      title="Listings"
      breadcrumb="Front End → Listings"
      description="Every live product in the Google stores, checked for feed and listing problems, with how to fix each one."
      stats={[
        { label: "Live products", value: data ? String(stats.live) : "—" },
        { label: "Must fix", value: data ? String(stats.critical) : "—" },
        { label: "Tips only", value: data ? String(stats.warning) : "—" },
        { label: "Sold out", value: data ? String(stats.soldOut) : "—" },
      ]}
    >
      {error && <div className="rounded-lg px-3 py-2 mb-4 text-[11px]" style={{ background: "rgba(239,68,68,0.1)", color: "#f87171" }}>Couldn&apos;t load listings: {error}</div>}
      {!data && !error && <div className="glass rounded-xl p-6 text-[11px]" style={{ color: "var(--text-dim)" }}>Loading live products from the stores…</div>}

      {data && (
        <>
          {data.stores.some((s) => s.error) && (
            <div className="rounded-lg px-3 py-2 mb-4 text-[11px]" style={{ background: "rgba(245,158,11,0.1)", color: "#f59e0b" }}>
              {data.stores.filter((s) => s.error).map((s) => s.error).join(" · ")} — those products may be missing. Reload in a few minutes.
            </div>
          )}

          {/* Filters */}
          <div className="glass rounded-xl p-3 mb-4 flex flex-wrap items-center gap-2">
            {STORES.map((s) => {
              const n = s === "All" ? all.length : all.filter((l) => l.store === s).length
              return (
                <button key={s} onClick={() => { setStore(s); setLimit(100) }} className="px-3 py-1.5 rounded-lg text-[11px] font-medium" style={{
                  background: store === s ? "rgba(99,102,241,0.2)" : "rgba(255,255,255,0.03)",
                  color: store === s ? "#c7d2fe" : "var(--text-muted)",
                  border: `1px solid ${store === s ? "rgba(99,102,241,0.4)" : "rgba(255,255,255,0.06)"}`,
                }}>{s} <span style={{ opacity: 0.6 }}>{n}</span></button>
              )
            })}
            <span className="mx-1 h-5 w-px" style={{ background: "rgba(255,255,255,0.1)" }} />
            {FILTERS.map((f) => (
              <button key={f.key} onClick={() => { setFilter(f.key); setLimit(100) }} className="px-3 py-1.5 rounded-lg text-[11px] font-medium" style={{
                background: filter === f.key ? (f.key === "critical" ? "rgba(248,113,113,0.18)" : "rgba(255,255,255,0.1)") : "rgba(255,255,255,0.03)",
                color: filter === f.key ? (f.key === "critical" ? "#f87171" : "var(--text)") : "var(--text-muted)",
                border: "1px solid rgba(255,255,255,0.06)",
              }}>{f.label}</button>
            ))}
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search products…" className="ml-auto px-3 py-1.5 rounded-lg text-[11px] w-[200px]" style={input} />
          </div>

          {/* Most common problems — clickable */}
          {topIssues.length > 0 && (
            <div className="glass rounded-xl p-4 mb-4">
              <div className="text-[9px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-dim)" }}>
                Most common problems {store !== "All" ? `· ${store}` : ""} — click to see affected products
              </div>
              <div className="grid gap-1.5 md:grid-cols-2">
                {topIssues.map(([k, v]) => {
                  const isOpen = openIssue === k
                  const fixType = detectFixType(k)
                  const canAutoFix = !!fixType
                  const status = fixStatus[k] || "idle"
                  const result = fixResults[k]
                  const unfixedProducts = v.products.filter((p) => !fixedProducts.has(`${p.store}-${p.id}`))

                  return (
                    <div key={k} className="rounded-lg overflow-hidden" style={{ background: "rgba(255,255,255,0.03)" }}>
                      {/* Problem header — clickable */}
                      <button
                        onClick={() => setOpenIssue(isOpen ? null : k)}
                        className="w-full px-3 py-2 text-[11px] text-left flex items-center gap-2 hover:bg-white/[0.02] transition-colors"
                      >
                        <span style={{ color: v.level === "critical" ? "#f87171" : "#facc15" }}>{v.level === "critical" ? "●" : "○"}</span>
                        <span className="font-medium flex-1 min-w-0 truncate" style={{ color: "var(--text)" }}>{k}</span>
                        <span className="text-[10px] px-1.5 rounded shrink-0" style={{ background: "rgba(255,255,255,0.06)", color: "var(--text-muted)" }}>{v.count}×</span>
                        <span className="text-[10px] shrink-0" style={{ color: "var(--text-dim)" }}>{isOpen ? "▲" : "▼"}</span>
                      </button>

                      {/* Expanded: affected products + fix button */}
                      {isOpen && (
                        <div className="px-3 pb-3" style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                          <div className="text-[10px] mt-2 mb-2" style={{ color: "var(--text-dim)" }}>Fix: {v.fix}</div>

                          {/* Fix all button */}
                          {canAutoFix && unfixedProducts.length > 0 && (
                            <div className="mb-2">
                              <button
                                onClick={(e) => { e.stopPropagation(); fixAll(k, unfixedProducts) }}
                                disabled={status === "fixing"}
                                className="px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all hover:brightness-110 disabled:opacity-50"
                                style={{ background: "rgba(99,102,241,0.2)", color: "#a5b4fc", border: "1px solid rgba(99,102,241,0.3)" }}
                              >
                                {status === "fixing" ? "Fixing…" : status === "done" ? "Fixed!" : `Fix all ${unfixedProducts.length} products`}
                              </button>
                              {result && (
                                <span className="ml-2 text-[10px]" style={{ color: result.failed > 0 ? "#f87171" : "#34d399" }}>
                                  {result.ok > 0 && `${result.ok} fixed`}
                                  {result.failed > 0 && ` · ${result.failed} failed`}
                                  {result.errors.length > 0 && result.errors[0].includes("token") && " (needs write_products scope)"}
                                </span>
                              )}
                            </div>
                          )}
                          {canAutoFix && unfixedProducts.length === 0 && v.products.length > 0 && (
                            <div className="mb-2 text-[10px] font-semibold" style={{ color: "#34d399" }}>
                              All {v.products.length} products fixed
                            </div>
                          )}

                          {/* Affected products list */}
                          <div className="space-y-1 max-h-[300px] overflow-y-auto">
                            {v.products.map((p) => {
                              const pKey = `${p.store}-${p.id}`
                              const isFixed = fixedProducts.has(pKey)
                              const singleKey = `single-${pKey}`
                              const singleStatus = fixStatus[singleKey] || "idle"
                              const preview = fixType ? computeFixedTitle(p.title, fixType) : null
                              const changed = preview && preview !== p.title

                              return (
                                <div key={pKey} className="flex items-start gap-2 rounded-md px-2 py-1.5" style={{ background: isFixed ? "rgba(52,211,153,0.06)" : "rgba(255,255,255,0.02)" }}>
                                  {p.image ? (
                                    <img src={`${p.image}${p.image.includes("?") ? "&" : "?"}width=64`} alt="" className="w-8 h-8 rounded-md object-cover shrink-0 mt-0.5" loading="lazy" />
                                  ) : (
                                    <div className="w-8 h-8 rounded-md shrink-0 mt-0.5" style={{ background: "rgba(255,255,255,0.05)" }} />
                                  )}
                                  <div className="flex-1 min-w-0">
                                    <div className="text-[11px] truncate" style={{ color: isFixed ? "#34d399" : "var(--text)" }}>
                                      {isFixed ? "✓ " : ""}{p.title}
                                    </div>
                                    {changed && !isFixed && (
                                      <div className="text-[10px] mt-0.5" style={{ color: "var(--text-dim)" }}>
                                        → <span style={{ color: "#34d399" }}>{preview}</span>
                                      </div>
                                    )}
                                    <div className="text-[9px]" style={{ color: "var(--text-dim)" }}>{p.store}</div>
                                  </div>
                                  <div className="flex items-center gap-1 shrink-0">
                                    {canAutoFix && !isFixed && changed && (
                                      <button
                                        onClick={(e) => { e.stopPropagation(); fixSingle(p, fixType!) }}
                                        disabled={singleStatus === "fixing"}
                                        className="px-2 py-0.5 rounded text-[9px] font-semibold"
                                        style={{
                                          background: singleStatus === "done" ? "rgba(52,211,153,0.15)" : "rgba(99,102,241,0.15)",
                                          color: singleStatus === "done" ? "#34d399" : singleStatus === "error" ? "#f87171" : "#a5b4fc",
                                        }}
                                      >
                                        {singleStatus === "fixing" ? "…" : singleStatus === "done" ? "Done" : singleStatus === "error" ? "Failed" : "Fix"}
                                      </button>
                                    )}
                                    {isFixed && (
                                      <span className="text-[9px] font-semibold" style={{ color: "#34d399" }}>Fixed</span>
                                    )}
                                    <a
                                      href={p.adminUrl}
                                      target="_blank"
                                      rel="noreferrer"
                                      onClick={(e) => e.stopPropagation()}
                                      className="px-2 py-0.5 rounded text-[9px]"
                                      style={{ background: "rgba(255,255,255,0.05)", color: "var(--text-muted)" }}
                                    >
                                      Shopify
                                    </a>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Products */}
          <div className="glass rounded-xl p-2">
            {rows.length === 0 && <div className="p-4 text-[11px]" style={{ color: "var(--text-dim)" }}>No products match.</div>}
            {rows.slice(0, limit).map((l) => {
              const key = `${l.store}-${l.id}`
              const c = l.issues.filter((i) => i.level === "critical").length
              const w = l.issues.length - c
              const isOpen = open === key
              const isFixed = fixedProducts.has(key)
              return (
                <div key={key} className="rounded-lg" style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                  <button onClick={() => setOpen(isOpen ? null : key)} aria-expanded={isOpen} className="w-full flex items-center gap-3 p-2 text-left">
                    {l.image ? (
                      <img src={`${l.image}${l.image.includes("?") ? "&" : "?"}width=96`} alt="" className="w-10 h-10 rounded-md object-cover shrink-0" loading="lazy" />
                    ) : (
                      <div className="w-10 h-10 rounded-md shrink-0" style={{ background: "rgba(255,255,255,0.05)" }} />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-[12px] truncate" style={{ color: isFixed ? "#34d399" : "var(--text)" }}>
                        {isFixed ? "✓ " : ""}{l.title}
                      </div>
                      <div className="text-[10px] truncate" style={{ color: "var(--text-dim)" }}>
                        {l.store} · {l.price.toFixed(2)}{l.compareAt ? ` (was ${l.compareAt.toFixed(2)})` : ""} · {l.inStock}/{l.variants} in stock
                        {l.alsoOn.length ? ` · also on ${l.alsoOn.join(", ")}` : ""}
                      </div>
                    </div>
                    {c > 0 && <span className="text-[10px] px-2 py-0.5 rounded-full shrink-0" style={{ background: "rgba(248,113,113,0.15)", color: "#f87171" }}>{c} must fix</span>}
                    {w > 0 && <span className="text-[10px] px-2 py-0.5 rounded-full shrink-0" style={{ background: "rgba(250,204,21,0.12)", color: "#facc15" }}>{w} tip{w === 1 ? "" : "s"}</span>}
                    {l.issues.length === 0 && <span className="text-[10px] px-2 py-0.5 rounded-full shrink-0" style={{ background: "rgba(52,211,153,0.12)", color: "#34d399" }}>OK</span>}
                  </button>
                  {isOpen && (
                    <div className="px-3 pb-3 pl-[60px] text-[11px]">
                      {l.issues.length === 0 ? (
                        <div style={{ color: "#34d399" }}>No issues found by these checks.</div>
                      ) : (
                        <ul className="space-y-1.5 mb-2">
                          {l.issues.map((i, idx) => {
                            const issueFixType =
                              i.field === "Title" && i.message.includes("Repeated word") ? "repeated_words" :
                              i.field === "Title" && i.message.includes("Colour in the title") ? "colour_in_title" :
                              i.field === "Title" && i.message.includes("Size in the title") ? "size_in_title" :
                              null
                            const singleKey = `single-${l.store}-${l.id}-${idx}`
                            const singleStatus = fixStatus[`single-${l.store}-${l.id}`] || "idle"
                            const preview = issueFixType ? computeFixedTitle(l.title, issueFixType) : null
                            const changed = preview && preview !== l.title

                            return (
                              <li key={idx} className="flex gap-2">
                                <span style={{ color: i.level === "critical" ? "#f87171" : "#facc15" }}>{i.level === "critical" ? "●" : "○"}</span>
                                <div className="flex-1">
                                  <div>
                                    <b>{i.field}:</b> {i.message}
                                  </div>
                                  <div style={{ color: "var(--text-muted)" }}>
                                    How to fix: {i.fix} <span style={{ color: "var(--text-dim)" }}>({i.source})</span>
                                  </div>
                                  {issueFixType && changed && !isFixed && (
                                    <div className="flex items-center gap-2 mt-1">
                                      <span className="text-[10px]" style={{ color: "var(--text-dim)" }}>→ <span style={{ color: "#34d399" }}>{preview}</span></span>
                                      <button
                                        onClick={() => fixSingle(l, issueFixType)}
                                        disabled={singleStatus === "fixing"}
                                        className="px-2 py-0.5 rounded text-[9px] font-semibold"
                                        style={{ background: "rgba(99,102,241,0.15)", color: "#a5b4fc" }}
                                      >
                                        {singleStatus === "fixing" ? "Fixing…" : singleStatus === "done" ? "Done" : "Fix this"}
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </li>
                            )
                          })}
                        </ul>
                      )}
                      <div className="flex gap-3">
                        <a href={l.adminUrl} target="_blank" rel="noreferrer" className="underline" style={{ color: "#7dd3fc" }}>Edit in Shopify ↗</a>
                        <a href={l.url} target="_blank" rel="noreferrer" className="underline" style={{ color: "var(--text-muted)" }}>View in store ↗</a>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
            {rows.length > limit && (
              <button onClick={() => setLimit(limit + 100)} className="w-full py-2 text-[11px]" style={{ color: "var(--text-muted)" }}>
                Show more ({rows.length - limit} left)
              </button>
            )}
          </div>

          <div className="text-[10px] mt-3" style={{ color: "var(--text-dim)" }}>
            Live = published on the online store (read from each store&apos;s public product feed, cached 15 min; loaded {new Date(data.fetchedAt).toLocaleTimeString()}).
            Auto-fix works for: repeated words, colour in title, size in title. These update the Shopify title via the Admin API (needs a token with write_products scope).
            Other issues link to Shopify for manual editing.
          </div>
        </>
      )}
    </PageShell>
  )
}
