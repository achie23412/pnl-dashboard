"use client"
import { useEffect, useMemo, useState } from "react"
import { PageShell } from "@/components/PageShell"
import { FilterSelect, EMPTY_FILTER, passes, type FilterValue } from "@/components/FilterSelect"
import { FixBanner } from "@/components/FixBanner"
import { FilterBar } from "@/components/PillSelect"
import { Badge, Button, Notice, Loading, EmptyState, SectionLabel } from "@/components/ui"
import { SHOPIFY_STORES, STORE_COLORS } from "@/lib/constants"
import { buildAlerts, type Alert, type Severity, type StoreWindow, type WindowProduct } from "@/lib/product-alerts"

const SEV: Record<Severity, { label: string; color: string; tone: "red" | "amber" | "blue" }> = {
  critical: { label: "Critical", color: "var(--red)", tone: "red" },
  warning: { label: "Warning", color: "var(--orange)", tone: "amber" },
  info: { label: "Info", color: "var(--blue)", tone: "blue" },
}

const day = (offset: number) => new Date(Date.now() - offset * 86400000).toISOString().slice(0, 10)

async function loadWindow(from: string, to: string) {
  const res = await fetch(`/api/product-catalog?store=all&from=${from}&to=${to}`)
  const json = await res.json()
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`)
  return json as { products: WindowProduct[]; stores: StoreWindow[]; errors?: string[] }
}

function shopifyLink(a: Alert) {
  const cfg = SHOPIFY_STORES[a.store]
  if (!cfg || !a.product_ids[0]) return null
  return `https://admin.shopify.com/store/${cfg.domain.replace(".myshopify.com", "")}/products/${a.product_ids[0]}`
}

// "Done" is stored per alert AND its numbers: if the numbers change (e.g. the
// product kept spending because it wasn't actually drafted), the alert returns.
function doneKey(a: Alert): string {
  const text = `${a.id}|${a.why.join("|")}`
  let h = 5381
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0
  return `alert:${a.id.slice(0, 120)}:${(h >>> 0).toString(36)}`
}

export default function ProductAlertsPage() {
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [monitored, setMonitored] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])
  const [doneKeys, setDoneKeys] = useState<Set<string>>(new Set())
  const [showDone, setShowDone] = useState(false)

  // Done marks live in the same store as the calendar to-dos (todos table).
  useEffect(() => {
    fetch("/api/todos", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setDoneKeys(new Set((j.doneKeys || []) as string[])))
      .catch(() => {})
  }, [])

  const setDone = async (a: Alert, done: boolean) => {
    const key = doneKey(a)
    setDoneKeys((s) => {
      const n = new Set(s)
      if (done) n.add(key)
      else n.delete(key)
      return n
    })
    const res = await fetch("/api/todos", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ auto_key: key, label: `${a.issue}: ${a.product || a.store}`, done }),
    }).catch(() => null)
    if (!res || !res.ok) {
      // roll back if saving failed
      setDoneKeys((s) => {
        const n = new Set(s)
        if (done) n.delete(key)
        else n.add(key)
        return n
      })
    }
  }
  const [fStore, setFStoreF] = useState<FilterValue>(EMPTY_FILTER)
  const [fSev, setFSevF] = useState<FilterValue>(EMPTY_FILTER)
  const setFStore = (v: string) => setFStoreF({ mode: "include", values: [v] })
  const setFSev = (v: Severity) => setFSevF({ mode: "include", values: [v] })

  // Deep link from the calendar to-do list: /product-alerts?store=<name>
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search)
    const st = sp.get("store") || sp.get("fix_store")
    if (st) setFStore(st)
  }, [])

  useEffect(() => {
    // 30 / 14 / 7 days and the 7 days before that (drafting SOP windows).
    Promise.all([loadWindow(day(29), day(0)), loadWindow(day(13), day(0)), loadWindow(day(6), day(0)), loadWindow(day(13), day(7))])
      .then(([d30, d14, d7, prev7]) => {
        setAlerts(buildAlerts({ d30: d30.products, d14: d14.products, d7: d7.products, prev7: prev7.products, stores: d30.stores }))
        setMonitored(d30.products.filter((p) => p.ad_spend != null || p.units_sold > 0).length)
        setWarnings((d30.errors || []).filter((e) => !e.includes("no Shopify token")))
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false))
  }, [])

  const stores = useMemo(() => Array.from(new Set(alerts.map((a) => a.store))).sort(), [alerts])
  const open = alerts.filter((a) => !doneKeys.has(doneKey(a)))
  const done = alerts.filter((a) => doneKeys.has(doneKey(a)))
  const matchesFilters = (a: Alert) => passes(fStore, a.store) && passes(fSev, a.severity)
  const visible = open.filter(matchesFilters)
  const visibleDone = done.filter(matchesFilters)
  const count = (s: Severity) => open.filter((a) => a.severity === s).length

  return (
    <PageShell
      title="Product Alerts"
      breadcrumb="Front End → Product Alerts"
      description="Each alert says what the issue is, why (the numbers) and how to fix it, using the Ascend Drafting System SOP. Based on the last 30 / 14 / 7 days."
      stats={[
        { label: "Open alerts", value: loading ? "—" : String(open.length) },
        { label: "Critical (act now)", value: loading ? "—" : String(count("critical")), color: !loading && count("critical") > 0 ? "var(--red)" : undefined },
        { label: "Done", value: loading ? "—" : String(done.length) },
        { label: "Products monitored", value: loading ? "—" : String(monitored) },
      ]}
    >
      <FixBanner onApply={(ctx) => {
        if (ctx.store) setFStore(ctx.store)
        setFSev("critical")
      }} />
      <FilterBar>
        <FilterSelect label="Store" options={stores.map((s) => ({ value: s, count: alerts.filter((a) => a.store === s).length }))} value={fStore} onChange={setFStoreF} />
        <FilterSelect
          label="Severity"
          options={(["critical", "warning", "info"] as Severity[]).map((s) => ({ value: s, label: SEV[s].label, count: count(s) }))}
          value={fSev}
          onChange={setFSevF}
        />
      </FilterBar>

      {error && <Notice tone="error">Couldn&apos;t load product data: {error}.</Notice>}
      {warnings.length > 0 && (
        <Notice tone="warning">Some data didn&apos;t load, so alerts may be incomplete: {warnings.join("; ")}</Notice>
      )}

      {loading ? (
        <Loading>Checking products against the drafting rules…</Loading>
      ) : visible.length === 0 ? (
        done.length ? (
          <EmptyState title="All alerts handled">Done alerts come back if their numbers change.</EmptyState>
        ) : (
          <EmptyState title="No alerts">Nothing crosses a drafting rule or breakeven right now.</EmptyState>
        )
      ) : (
        <div className="space-y-2">
          {visible.map((a) => {
            const sev = SEV[a.severity]
            const link = shopifyLink(a)
            return (
              <div key={a.id} className="glass rounded-xl px-4 py-3" style={{ borderLeft: `3px solid ${sev.color}` }}>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={sev.tone}>{sev.label}</Badge>
                  <span className="text-[12px] font-semibold" style={{ color: "var(--text)" }}>{a.issue}</span>
                  <span className="text-[10px]" style={{ color: "var(--text-dim)" }}>· {a.rule}</span>
                  <span className="ml-auto">
                    <Button size="sm" onClick={() => setDone(a, true)} title="Hide this alert. It comes back if its numbers change.">
                      <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}><polyline points="20 6 9 17 4 12" /></svg>
                      Mark done
                    </Button>
                  </span>
                </div>
                <div className="text-[11px] mt-1" style={{ color: "var(--text)" }}>
                  <span className="inline-flex items-center gap-1 mr-1.5" style={{ color: "var(--text-muted)" }}>
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: STORE_COLORS[a.store] || "#666" }} />
                    {a.store}
                  </span>
                  {a.product && (link ? <a href={link} target="_blank" rel="noreferrer" className="underline">{a.product}</a> : a.product)}
                </div>
                <div className="grid md:grid-cols-[1fr_1fr] gap-3 mt-2">
                  <div>
                    <SectionLabel>Why</SectionLabel>
                    {a.why.map((w, i) => <div key={i} className="text-[10px]" style={{ color: "var(--text-muted)" }}>• {w}</div>)}
                  </div>
                  <div>
                    <SectionLabel>How to fix</SectionLabel>
                    <div className="text-[10px]" style={{ color: "var(--text)" }}>{a.fix}</div>
                  </div>
                </div>
                {a.caveat && <div className="text-[9px] mt-1.5" style={{ color: "var(--text-dim)" }}>Note: {a.caveat}</div>}
              </div>
            )
          })}
        </div>
      )}
      {!loading && visibleDone.length > 0 && (
        <div className="mt-4">
          <Button variant="ghost" size="sm" onClick={() => setShowDone((x) => !x)}>
            {showDone ? "▾" : "▸"} Done ({visibleDone.length})
          </Button>
          {showDone && (
            <div className="space-y-1.5 mt-2">
              {visibleDone.map((a) => (
                <div key={a.id} className="glass rounded-xl px-3 py-2 flex items-center gap-2">
                  <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth={3}><polyline points="20 6 9 17 4 12" /></svg>
                  <span className="text-[10px] line-through" style={{ color: "var(--text-dim)" }}>
                    {a.issue} · {a.store}{a.product ? ` · ${a.product}` : ""}
                  </span>
                  <span className="ml-auto"><Button variant="ghost" size="sm" onClick={() => setDone(a, false)}>Undo</Button></span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      <div className="text-[9px] mt-4" style={{ color: "var(--text-dim)" }}>
        Done alerts come back automatically if their numbers change (for example, a product that keeps spending after you marked it done).
        Product rules apply to Google stores (per-product spend from Google Shopping). Meta/TikTok stores get a store-level alert. Not covered yet: single-variant rule and live-date rules 2–3 (need Shopify product data), refund spikes (refunds arrive with the nightly refresh), competitor price changes.
      </div>
    </PageShell>
  )
}
