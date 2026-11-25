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
const inputStyle = { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", color: "var(--text)" }

type Data = {
  fetchedAt: string
  stores: { store: string; domain: string; count: number; error: string | null }[]
  listings: LiveListing[]
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

type PendingFix = {
  store: string
  productId: number
  oldTitle: string
  newTitle: string
  fixType: string
  image: string | null
  checked: boolean
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
  const [fixedProducts, setFixedProducts] = useState<Set<string>>(new Set())

  // Confirmation modal state
  const [pendingFixes, setPendingFixes] = useState<PendingFix[]>([])
  const [showModal, setShowModal] = useState(false)
  const [pushing, setPushing] = useState(false)
  const [pushResult, setPushResult] = useState<{ ok: number; failed: number; errors: string[] } | null>(null)

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

  // Open confirmation modal for bulk fix
  const requestFixAll = useCallback((issueKey: string, products: LiveListing[]) => {
    const fixType = detectFixType(issueKey)
    if (!fixType) return
    const fixes: PendingFix[] = products
      .filter((p) => !fixedProducts.has(`${p.store}-${p.id}`))
      .map((p) => {
        const newTitle = computeFixedTitle(p.title, fixType)
        return { store: p.store, productId: p.id, oldTitle: p.title, newTitle, fixType, image: p.image, checked: newTitle !== p.title }
      })
      .filter((f) => f.oldTitle !== f.newTitle)
    if (fixes.length === 0) return
    setPendingFixes(fixes)
    setPushResult(null)
    setShowModal(true)
  }, [fixedProducts])

  // Open confirmation modal for single fix
  const requestFixSingle = useCallback((l: LiveListing, fixType: string) => {
    const newTitle = computeFixedTitle(l.title, fixType)
    if (newTitle === l.title) return
    setPendingFixes([{ store: l.store, productId: l.id, oldTitle: l.title, newTitle, fixType, image: l.image, checked: true }])
    setPushResult(null)
    setShowModal(true)
  }, [])

  // Toggle a fix in the modal
  const toggleFix = (idx: number) => {
    setPendingFixes((prev) => prev.map((f, i) => i === idx ? { ...f, checked: !f.checked } : f))
  }
  const toggleAll = (checked: boolean) => {
    setPendingFixes((prev) => prev.map((f) => ({ ...f, checked })))
  }

  // Confirm and push to Shopify
  const confirmAndPush = useCallback(async () => {
    const toFix = pendingFixes.filter((f) => f.checked)
    if (toFix.length === 0) return

    setPushing(true)
    setPushResult(null)

    try {
      const res = await fetch("/api/listings/fix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fixes: toFix.map((f) => ({ store: f.store, productId: f.productId, fixType: f.fixType, newTitle: f.newTitle })),
        }),
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
      setPushResult({ ok: result.summary.ok, failed: result.summary.failed, errors })

      if (result.summary.failed === 0) {
        setTimeout(() => setShowModal(false), 1500)
      }
    } catch (e) {
      setPushResult({ ok: 0, failed: toFix.length, errors: [e instanceof Error ? e.message : String(e)] })
    } finally {
      setPushing(false)
    }
  }, [pendingFixes])

  const checkedCount = pendingFixes.filter((f) => f.checked).length

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
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search products…" className="ml-auto px-3 py-1.5 rounded-lg text-[11px] w-[200px]" style={inputStyle} />
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
                  const unfixedProducts = v.products.filter((p) => !fixedProducts.has(`${p.store}-${p.id}`))

                  return (
                    <div key={k} className="rounded-lg overflow-hidden" style={{ background: "rgba(255,255,255,0.03)" }}>
                      <button
                        onClick={() => setOpenIssue(isOpen ? null : k)}
                        className="w-full px-3 py-2 text-[11px] text-left flex items-center gap-2 hover:bg-white/[0.02] transition-colors"
                      >
                        <span style={{ color: v.level === "critical" ? "#f87171" : "#facc15" }}>{v.level === "critical" ? "●" : "○"}</span>
                        <span className="font-medium flex-1 min-w-0 truncate" style={{ color: "var(--text)" }}>{k}</span>
                        <span className="text-[10px] px-1.5 rounded shrink-0" style={{ background: "rgba(255,255,255,0.06)", color: "var(--text-muted)" }}>{v.count}×</span>
                        <span className="text-[10px] shrink-0" style={{ color: "var(--text-dim)" }}>{isOpen ? "▲" : "▼"}</span>
                      </button>

                      {isOpen && (
                        <div className="px-3 pb-3" style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                          <div className="text-[10px] mt-2 mb-2" style={{ color: "var(--text-dim)" }}>Fix: {v.fix}</div>

                          {canAutoFix && unfixedProducts.length > 0 && (
                            <div className="mb-2">
                              <button
                                onClick={(e) => { e.stopPropagation(); requestFixAll(k, unfixedProducts) }}
                                className="px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all hover:brightness-110"
                                style={{ background: "rgba(99,102,241,0.2)", color: "#a5b4fc", border: "1px solid rgba(99,102,241,0.3)" }}
                              >
                                Review & fix {unfixedProducts.length} products
                              </button>
                            </div>
                          )}
                          {canAutoFix && unfixedProducts.length === 0 && v.products.length > 0 && (
                            <div className="mb-2 text-[10px] font-semibold" style={{ color: "#34d399" }}>
                              All {v.products.length} products fixed
                            </div>
                          )}

                          <div className="space-y-1 max-h-[300px] overflow-y-auto">
                            {v.products.map((p) => {
                              const pKey = `${p.store}-${p.id}`
                              const isFixed = fixedProducts.has(pKey)
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
                                        onClick={(e) => { e.stopPropagation(); requestFixSingle(p, fixType!) }}
                                        className="px-2 py-0.5 rounded text-[9px] font-semibold"
                                        style={{ background: "rgba(99,102,241,0.15)", color: "#a5b4fc" }}
                                      >
                                        Fix
                                      </button>
                                    )}
                                    {isFixed && (
                                      <span className="text-[9px] font-semibold" style={{ color: "#34d399" }}>Fixed</span>
                                    )}
                                    <a href={p.adminUrl} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="px-2 py-0.5 rounded text-[9px]" style={{ background: "rgba(255,255,255,0.05)", color: "var(--text-muted)" }}>
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
                            const preview = issueFixType ? computeFixedTitle(l.title, issueFixType) : null
                            const changed = preview && preview !== l.title

                            return (
                              <li key={idx} className="flex gap-2">
                                <span style={{ color: i.level === "critical" ? "#f87171" : "#facc15" }}>{i.level === "critical" ? "●" : "○"}</span>
                                <div className="flex-1">
                                  <div><b>{i.field}:</b> {i.message}</div>
                                  <div style={{ color: "var(--text-muted)" }}>
                                    How to fix: {i.fix} <span style={{ color: "var(--text-dim)" }}>({i.source})</span>
                                  </div>
                                  {issueFixType && changed && !isFixed && (
                                    <div className="flex items-center gap-2 mt-1">
                                      <span className="text-[10px]" style={{ color: "var(--text-dim)" }}>→ <span style={{ color: "#34d399" }}>{preview}</span></span>
                                      <button
                                        onClick={() => requestFixSingle(l, issueFixType)}
                                        className="px-2 py-0.5 rounded text-[9px] font-semibold"
                                        style={{ background: "rgba(99,102,241,0.15)", color: "#a5b4fc" }}
                                      >
                                        Review & fix
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
            Auto-fix works for: repeated words, colour in title, size in title. Every fix opens a review modal first — nothing pushes to Shopify without your confirmation.
          </div>
        </>
      )}

      {/* ═══ CONFIRMATION MODAL ═══ */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}>
          <div className="w-full max-w-2xl rounded-2xl overflow-hidden" style={{ background: "var(--surface, #1a1b2e)", border: "1px solid rgba(255,255,255,0.1)" }}>
            {/* Header */}
            <div className="px-5 py-4 flex items-center gap-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
              <div className="w-8 h-8 rounded-lg flex items-center justify-center text-[16px]" style={{ background: "rgba(99,102,241,0.2)" }}>
                🔧
              </div>
              <div className="flex-1">
                <div className="text-[14px] font-bold" style={{ color: "var(--text)" }}>Review title changes</div>
                <div className="text-[11px]" style={{ color: "var(--text-dim)" }}>
                  {pendingFixes.length} product{pendingFixes.length !== 1 ? "s" : ""} · uncheck any you don&apos;t want to change
                </div>
              </div>
              <button onClick={() => { setShowModal(false); setPushResult(null) }} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/10" style={{ color: "var(--text-dim)" }}>
                ✕
              </button>
            </div>

            {/* Select all / none */}
            <div className="px-5 py-2 flex items-center gap-3" style={{ background: "rgba(255,255,255,0.02)" }}>
              <label className="flex items-center gap-2 text-[11px] cursor-pointer" style={{ color: "var(--text-muted)" }}>
                <input
                  type="checkbox"
                  checked={checkedCount === pendingFixes.length}
                  onChange={(e) => toggleAll(e.target.checked)}
                  className="rounded"
                  style={{ accentColor: "#6366f1" }}
                />
                Select all ({checkedCount}/{pendingFixes.length})
              </label>
            </div>

            {/* Changes list */}
            <div className="px-5 py-3 space-y-2 max-h-[400px] overflow-y-auto">
              {pendingFixes.map((f, idx) => (
                <label
                  key={`${f.store}-${f.productId}`}
                  className="flex items-start gap-3 rounded-lg px-3 py-2 cursor-pointer transition-colors hover:bg-white/[0.02]"
                  style={{
                    background: f.checked ? "rgba(99,102,241,0.06)" : "rgba(255,255,255,0.01)",
                    border: `1px solid ${f.checked ? "rgba(99,102,241,0.2)" : "rgba(255,255,255,0.05)"}`,
                    opacity: f.checked ? 1 : 0.5,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={f.checked}
                    onChange={() => toggleFix(idx)}
                    className="mt-1 shrink-0 rounded"
                    style={{ accentColor: "#6366f1" }}
                  />
                  {f.image ? (
                    <img src={`${f.image}${f.image.includes("?") ? "&" : "?"}width=64`} alt="" className="w-8 h-8 rounded-md object-cover shrink-0 mt-0.5" loading="lazy" />
                  ) : (
                    <div className="w-8 h-8 rounded-md shrink-0 mt-0.5" style={{ background: "rgba(255,255,255,0.05)" }} />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px]" style={{ color: "var(--text-dim)" }}>
                      <span style={{ textDecoration: "line-through", opacity: 0.6 }}>{f.oldTitle}</span>
                    </div>
                    <div className="text-[11px] mt-0.5" style={{ color: "#34d399" }}>
                      → {f.newTitle}
                    </div>
                    <div className="text-[9px] mt-0.5" style={{ color: "var(--text-dim)" }}>{f.store}</div>
                  </div>
                </label>
              ))}
            </div>

            {/* Result banner */}
            {pushResult && (
              <div className="px-5 py-2">
                <div className="rounded-lg px-3 py-2 text-[11px]" style={{
                  background: pushResult.failed > 0 ? "rgba(248,113,113,0.1)" : "rgba(52,211,153,0.1)",
                  color: pushResult.failed > 0 ? "#f87171" : "#34d399",
                }}>
                  {pushResult.ok > 0 && `${pushResult.ok} title${pushResult.ok !== 1 ? "s" : ""} updated on Shopify. `}
                  {pushResult.failed > 0 && `${pushResult.failed} failed. `}
                  {pushResult.errors.length > 0 && pushResult.errors.slice(0, 3).join(" · ")}
                </div>
              </div>
            )}

            {/* Footer */}
            <div className="px-5 py-4 flex items-center gap-3" style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
              <button
                onClick={() => { setShowModal(false); setPushResult(null) }}
                className="px-4 py-2 rounded-lg text-[12px] font-medium"
                style={{ background: "rgba(255,255,255,0.05)", color: "var(--text-muted)" }}
              >
                Cancel
              </button>
              <button
                onClick={confirmAndPush}
                disabled={pushing || checkedCount === 0}
                className="px-5 py-2 rounded-lg text-[12px] font-bold transition-all hover:brightness-110 disabled:opacity-40"
                style={{ background: "#6366f1", color: "#fff" }}
              >
                {pushing ? "Pushing to Shopify…" : `Confirm & push ${checkedCount} change${checkedCount !== 1 ? "s" : ""}`}
              </button>
              <div className="ml-auto text-[10px]" style={{ color: "var(--text-dim)" }}>
                Changes go live on Shopify immediately
              </div>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  )
}
