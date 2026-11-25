"use client"
import { useEffect, useMemo, useState } from "react"
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

export default function ListingsPage() {
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [store, setStore] = useState("All")
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("critical")
  const [q, setQ] = useState("")
  const [open, setOpen] = useState<string | null>(null)
  const [limit, setLimit] = useState(100)

  useEffect(() => {
    fetch("/api/listings", { cache: "no-store" })
      .then(async (r) => {
        const d = await r.json()
        if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`)
        setData(d)
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

  // Most common problems → fix in bulk
  const topIssues = useMemo(() => {
    const m: Record<string, { count: number; level: string; fix: string }> = {}
    for (const l of inStore) for (const i of l.issues) {
      const key = `${i.field}: ${i.message.replace(/\d+/g, "#").replace(/".*?"/g, '"…"').replace(/\(.*?\)/g, "").trim()}`
      if (!m[key]) m[key] = { count: 0, level: i.level, fix: i.fix }
      m[key].count++
    }
    return Object.entries(m)
      .sort((a, b) => (a[1].level === b[1].level ? b[1].count - a[1].count : a[1].level === "critical" ? -1 : 1))
      .slice(0, 8)
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

          {/* Most common problems */}
          {topIssues.length > 0 && (
            <div className="glass rounded-xl p-4 mb-4">
              <div className="text-[9px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-dim)" }}>
                Most common problems {store !== "All" ? `· ${store}` : ""} — fix these first
              </div>
              <div className="grid gap-1.5 md:grid-cols-2">
                {topIssues.map(([k, v]) => (
                  <div key={k} className="rounded-lg px-3 py-2 text-[11px]" style={{ background: "rgba(255,255,255,0.03)" }}>
                    <div className="flex items-center gap-2">
                      <span style={{ color: v.level === "critical" ? "#f87171" : "#facc15" }}>{v.level === "critical" ? "●" : "○"}</span>
                      <span className="font-medium" style={{ color: "var(--text)" }}>{k}</span>
                      <span className="ml-auto text-[10px] px-1.5 rounded" style={{ background: "rgba(255,255,255,0.06)", color: "var(--text-muted)" }}>{v.count}×</span>
                    </div>
                    <div className="text-[10px] mt-0.5 pl-4" style={{ color: "var(--text-dim)" }}>Fix: {v.fix}</div>
                  </div>
                ))}
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
              return (
                <div key={key} className="rounded-lg" style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                  <button onClick={() => setOpen(isOpen ? null : key)} aria-expanded={isOpen} className="w-full flex items-center gap-3 p-2 text-left">
                    {l.image ? (
                      <img src={`${l.image}${l.image.includes("?") ? "&" : "?"}width=96`} alt="" className="w-10 h-10 rounded-md object-cover shrink-0" loading="lazy" />
                    ) : (
                      <div className="w-10 h-10 rounded-md shrink-0" style={{ background: "rgba(255,255,255,0.05)" }} />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-[12px] truncate" style={{ color: "var(--text)" }}>{l.title}</div>
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
                          {l.issues.map((i, k) => (
                            <li key={k} className="flex gap-2">
                              <span style={{ color: i.level === "critical" ? "#f87171" : "#facc15" }}>{i.level === "critical" ? "●" : "○"}</span>
                              <span>
                                <b>{i.field}:</b> {i.message}
                                <span className="block" style={{ color: "var(--text-muted)" }}>How to fix: {i.fix} <span style={{ color: "var(--text-dim)" }}>({i.source})</span></span>
                              </span>
                            </li>
                          ))}
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
            These checks cover the product data itself. Actual Merchant Center approvals and disapprovals live in GMC / Simprosys and aren&apos;t connected here yet.
          </div>
        </>
      )}
    </PageShell>
  )
}
