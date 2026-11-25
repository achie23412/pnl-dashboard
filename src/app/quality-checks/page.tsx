"use client"
// Quality Checks: quality refund rate per product (refund log ÷ units sold, last 90 days).
// Flag at 10%+ with 20+ units sold; CS follows up (test unit → supplier → resolved / drafted).
import { Fragment, useCallback, useEffect, useMemo, useState } from "react"
import { PageShell } from "@/components/PageShell"
import { FilterBar } from "@/components/PillSelect"
import { FilterSelect, EMPTY_FILTER, passes, type FilterValue } from "@/components/FilterSelect"
import { Panel, Badge, Button, Notice, Loading, EmptyState, TH, TD, ROW_BORDER } from "@/components/ui"
import { ProductLink } from "@/components/ProductLink"
import {
  complaintEvents, productKey, daysAgo, QUALITY_REASONS, QUALITY_RATE, QUALITY_MIN_UNITS, type ComplaintEvent,
} from "@/lib/product-complaints"
import type { ProductFlag } from "@/app/api/product-flags/route"

type CatalogProduct = { product_name: string; store: string; units_sold: number; product_ids?: string[] }
type Level = "flag" | "watch" | "ok"
const STATUSES = [
  { value: "open", label: "To check", tone: "red" as const },
  { value: "test_unit", label: "Test unit ordered", tone: "amber" as const },
  { value: "supplier", label: "Supplier contacted", tone: "amber" as const },
  { value: "resolved", label: "Resolved", tone: "green" as const },
  { value: "drafted", label: "Drafted", tone: "grey" as const },
]
const statusMeta = (s: string) => STATUSES.find((x) => x.value === s) || STATUSES[0]

export default function QualityChecksPage() {
  const [catalog, setCatalog] = useState<CatalogProduct[] | null>(null)
  const [events, setEvents] = useState<ComplaintEvent[]>([])
  const [flags, setFlags] = useState<ProductFlag[]>([])
  const [error, setError] = useState<string | null>(null)
  const [fStore, setFStore] = useState<FilterValue>(EMPTY_FILTER)
  const [fLevel, setFLevel] = useState<FilterValue>({ mode: "include", values: ["flag", "watch"] })
  const [open, setOpen] = useState<string | null>(null)
  const [noteDraft, setNoteDraft] = useState("")

  const loadFlags = useCallback(() => fetch("/api/product-flags?kind=quality").then((r) => r.json()).then((d) => setFlags(d.rows || [])), [])
  useEffect(() => {
    const from = daysAgo(89), to = daysAgo(0)
    Promise.all([
      fetch(`/api/product-catalog?store=all&from=${from}&to=${to}`).then((r) => r.json()),
      fetch("/api/cs-log?kind=refund").then((r) => r.json()),
      fetch("/api/inbox?only=complaints").then((r) => r.json()),
    ]).then(([cat, ref, tix]) => {
      if (cat.error) throw new Error(`products: ${cat.error}`)
      if (ref.error) throw new Error(`refund log: ${ref.error}`)
      setCatalog(cat.products || [])
      setEvents(complaintEvents(ref.rows || [], tix.rows || []))
    }).catch((e) => setError(e instanceof Error ? e.message : String(e)))
    loadFlags()
  }, [loadFlags])

  const rows = useMemo(() => {
    if (!catalog) return []
    const since = daysAgo(89)
    const units = new Map<string, { units: number; product: CatalogProduct }>()
    for (const p of catalog) {
      const k = productKey(p.store, p.product_name)
      const prev = units.get(k)
      units.set(k, { units: (prev?.units || 0) + (p.units_sold || 0), product: prev?.product || p })
    }
    const byKey = new Map<string, ComplaintEvent[]>()
    for (const e of events) if (e.date >= since) byKey.set(e.key, [...(byKey.get(e.key) || []), e])
    const keys = new Set([...Array.from(byKey.keys())])
    const flagMap = new Map(flags.map((f) => [productKey(f.store, f.product_title), f]))
    flags.forEach((f) => keys.add(productKey(f.store, f.product_title)))
    return Array.from(keys).map((key) => {
      const ev = byKey.get(key) || []
      const u = units.get(key)
      const quality = ev.filter((e) => e.source === "refund" && QUALITY_REASONS.includes(e.reason)).length
      const size = ev.filter((e) => e.reason === "size_fit").length
      const other = ev.length - quality - size
      const sold = u?.units || 0
      const rate = sold > 0 ? quality / sold : null
      const level: Level = rate != null && rate >= QUALITY_RATE && sold >= QUALITY_MIN_UNITS ? "flag"
        : (rate != null && rate >= QUALITY_RATE) || (rate != null && rate >= QUALITY_RATE / 2 && quality >= 2) || (sold === 0 && quality >= 2) ? "watch" : "ok"
      const flag = flagMap.get(key)
      const store = ev[0]?.store || flag?.store || u?.product.store || ""
      const product = ev[0]?.product || flag?.product_title || u?.product.product_name || ""
      return { key, store, product, productId: u?.product.product_ids?.[0], sold, quality, size, other, rate, level, events: ev, flag }
    }).sort((a, b) => ({ flag: 0, watch: 1, ok: 2 }[a.level] - { flag: 0, watch: 1, ok: 2 }[b.level]) || (b.rate || 0) - (a.rate || 0))
  }, [catalog, events, flags])

  const shown = rows.filter((r) => passes(fStore, r.store) && passes(fLevel, r.level))
  const stores = Array.from(new Set(rows.map((r) => r.store))).filter(Boolean)
  const flagged = rows.filter((r) => r.level === "flag" && (!r.flag || ["open", "test_unit", "supplier"].includes(r.flag.status))).length
  const awaiting = flags.filter((f) => f.status === "supplier").length
  const resolved30 = flags.filter((f) => ["resolved", "drafted"].includes(f.status) && f.updated_at >= daysAgo(30)).length

  const setStatus = async (r: (typeof rows)[number], status: string, note?: string) => {
    await fetch("/api/product-flags", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "quality", store: r.store, product_title: r.product, status, note: note ?? r.flag?.note ?? null, data: { rate: r.rate, sold: r.sold, quality: r.quality } }) })
    loadFlags()
  }

  return (
    <PageShell
      title="Quality Checks"
      breadcrumb="Customer Service → Quality Checks"
      description="Quality refund rate per product: refunds for a defect or not-as-described ÷ units sold, last 90 days. Flagged products get a test unit or a supplier check."
      stats={[
        { label: "Flagged products", value: catalog ? String(flagged) : "—", sub: "10%+ quality refunds, 20+ sold", color: flagged ? "var(--red)" : undefined },
        { label: "Awaiting supplier", value: String(awaiting) },
        { label: "Resolved (30d)", value: String(resolved30) },
        { label: "Min units to flag", value: String(QUALITY_MIN_UNITS), sub: `at ${QUALITY_RATE * 100}%+ quality refunds` },
      ]}
    >
      {error && <Notice tone="error">Couldn&apos;t load quality data: {error}.</Notice>}
      <FilterBar right={<span className="text-[10px]" style={{ color: "var(--text-dim)" }}>{shown.length} products</span>}>
        <FilterSelect label="Store" options={stores.map((s) => ({ value: s, count: rows.filter((r) => r.store === s).length }))} value={fStore} onChange={setFStore} />
        <FilterSelect label="Level" options={[{ value: "flag", label: "Flagged", count: rows.filter((r) => r.level === "flag").length }, { value: "watch", label: "Watch", count: rows.filter((r) => r.level === "watch").length }, { value: "ok", label: "OK", count: rows.filter((r) => r.level === "ok").length }]} value={fLevel} onChange={setFLevel} />
      </FilterBar>

      {!catalog && !error && <Loading>Loading refunds and units sold…</Loading>}
      {catalog && shown.length === 0 && (
        <EmptyState title="No quality problems in this view">
          Products show up here once the refund log has refunds for a defect or not-as-described (Customer Service → Refunds), or a ticket in the Inbox Queue is marked as a product complaint.
        </EmptyState>
      )}
      {catalog && shown.length > 0 && (
        <Panel pad={false} className="mb-4">
          <div className="overflow-x-auto">
            <table className="w-full whitespace-nowrap">
              <thead><tr style={{ color: "var(--text-dim)" }}>
                <th className={`${TH} text-left`}>Product</th><th className={`${TH} text-right`}>Sold (90d)</th><th className={`${TH} text-right`}>Quality refunds</th><th className={`${TH} text-right`}>Rate</th><th className={`${TH} text-right`}>Size</th><th className={`${TH} text-right`}>Other</th><th className={`${TH} text-left`}>Level</th><th className={`${TH} text-left`}>Follow-up</th>
              </tr></thead>
              <tbody>
                {shown.map((r) => (
                  <Fragment key={r.key}>
                    <tr style={ROW_BORDER} className="cursor-pointer hover:bg-white/[0.02]" onClick={() => { setOpen(open === r.key ? null : r.key); setNoteDraft(r.flag?.note || "") }}>
                      <td className={TD}><ProductLink store={r.store} name={r.product} productId={r.productId} maxWidth={280} /><div className="text-[9px]" style={{ color: "var(--text-dim)" }}>{r.store}</div></td>
                      <td className={`${TD} text-right tabular-nums`}>{r.sold || "—"}</td>
                      <td className={`${TD} text-right tabular-nums`}>{r.quality}</td>
                      <td className={`${TD} text-right tabular-nums`} style={{ color: r.level === "flag" ? "var(--red)" : r.level === "watch" ? "var(--orange)" : "var(--text-muted)" }}>{r.rate != null ? `${(r.rate * 100).toFixed(1)}%` : "—"}</td>
                      <td className={`${TD} text-right tabular-nums`} style={{ color: "var(--text-muted)" }}>{r.size || "—"}</td>
                      <td className={`${TD} text-right tabular-nums`} style={{ color: "var(--text-muted)" }}>{r.other || "—"}</td>
                      <td className={TD}><Badge tone={r.level === "flag" ? "red" : r.level === "watch" ? "amber" : "green"}>{r.level === "flag" ? "Flagged" : r.level === "watch" ? "Watch" : "OK"}</Badge></td>
                      <td className={TD}>{r.flag ? <Badge tone={statusMeta(r.flag.status).tone}>{statusMeta(r.flag.status).label}</Badge> : <span className="text-[10px]" style={{ color: "var(--text-dim)" }}>—</span>}</td>
                    </tr>
                    {open === r.key && (
                      <tr><td colSpan={8} className="px-3 pb-3 whitespace-normal text-[11px]" style={{ color: "var(--text-muted)" }}>
                        <div className="mb-2">
                          {r.level === "flag" ? "Over the limit: order a test unit to see the problem yourself, then send the photos and order numbers to the supplier and ask for a fix or a COGS refund (playbook 9.5). If it can't be fixed, draft the product."
                            : r.level === "watch" ? "Close to the limit or too few sales to judge. Keep an eye on new refunds; check the photos customers sent."
                              : "Within the limit."}
                          {r.size > 0 && ` ${r.size} size refund${r.size > 1 ? "s" : ""}: check the size chart and the fit wording on the product page.`}
                        </div>
                        <div className="space-y-0.5 mb-2">
                          {r.events.slice(0, 12).map((e, i) => (
                            <div key={i} className="text-[10px]">{e.date} · {e.reasonLabel}{e.order ? ` · ${e.order}` : ""}{e.note ? ` · “${e.note}”` : ""}{e.url && <> · <a href={e.url} target="_blank" rel="noreferrer" className="underline">conversation</a></>}</div>
                          ))}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <input value={noteDraft} onChange={(e) => setNoteDraft(e.target.value)} placeholder="Note (test unit result, supplier answer…)" className="px-2 py-1 rounded-md text-[11px] flex-1 min-w-[220px]" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", color: "var(--text)" }} />
                          {STATUSES.map((s) => <Button key={s.value} size="sm" variant={r.flag?.status === s.value ? "primary" : "secondary"} onClick={() => setStatus(r, s.value, noteDraft)}>{s.label}</Button>)}
                        </div>
                      </td></tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
      <div className="text-[10px]" style={{ color: "var(--text-dim)" }}>
        Quality refunds = refund log reasons &quot;Quality / defect&quot; and &quot;Not as expected / described&quot;. Units sold from Shopify (product catalog), last 90 days. Rule: flag at {QUALITY_RATE * 100}%+ with {QUALITY_MIN_UNITS}+ units sold (dashboard rule); watch at {QUALITY_RATE * 100}%+ with fewer sales, or {QUALITY_RATE * 50}%+ with 2+ quality refunds. Supplier claims follow the CS playbook section 9.5.
      </div>
    </PageShell>
  )
}
