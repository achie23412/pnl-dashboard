"use client"
import { useEffect, useMemo, useState } from "react"
import { PageShell } from "@/components/PageShell"
import { FixBanner } from "@/components/FixBanner"
import { SHOPIFY_STORES, STORE_COLORS } from "@/lib/constants"
import { buildAlerts, type Alert, type Severity, type StoreWindow, type WindowProduct } from "@/lib/product-alerts"

const SEV: Record<Severity, { label: string; color: string }> = {
  critical: { label: "Critical", color: "var(--red)" },
  warning: { label: "Warning", color: "var(--orange)" },
  info: { label: "Info", color: "var(--blue)" },
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

export default function ProductAlertsPage() {
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [monitored, setMonitored] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])
  const [fStore, setFStore] = useState("all")
  const [fSev, setFSev] = useState<"all" | Severity>("all")

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
  const visible = alerts.filter((a) => (fStore === "all" || a.store === fStore) && (fSev === "all" || a.severity === fSev))
  const count = (s: Severity) => alerts.filter((a) => a.severity === s).length
  const field = "bg-transparent border rounded-md px-2 py-1 text-[10px]"
  const border = { borderColor: "rgba(255,255,255,0.1)", color: "var(--text)" }

  return (
    <PageShell
      title="Product Alerts"
      breadcrumb="Front End → Product Alerts"
      description="Each alert says what the issue is, why (the numbers) and how to fix it, using the Ascend Drafting System SOP. Based on the last 30 / 14 / 7 days."
      stats={[
        { label: "Active alerts", value: loading ? "—" : String(alerts.length) },
        { label: "Critical (act now)", value: loading ? "—" : String(count("critical")) },
        { label: "Warnings", value: loading ? "—" : String(count("warning")) },
        { label: "Products monitored", value: loading ? "—" : String(monitored) },
      ]}
    >
      <FixBanner onApply={(ctx) => {
        if (ctx.store) setFStore(ctx.store)
        setFSev("critical")
      }} />
      <div className="flex flex-wrap gap-2 mb-3">
        <select className={field} style={border} value={fStore} onChange={(e) => setFStore(e.target.value)}>
          <option value="all">Store: all</option>
          {stores.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className={field} style={border} value={fSev} onChange={(e) => setFSev(e.target.value as "all" | Severity)}>
          <option value="all">Severity: all</option>
          <option value="critical">Critical</option>
          <option value="warning">Warning</option>
          <option value="info">Info</option>
        </select>
      </div>

      {error && <div className="text-[11px] mb-3" style={{ color: "var(--red)" }}>{error}</div>}
      {warnings.length > 0 && (
        <div className="text-[10px] mb-3" style={{ color: "var(--orange)" }}>Some data didn&apos;t load, so alerts may be incomplete: {warnings.join("; ")}</div>
      )}

      {loading ? (
        <div className="text-[11px] py-12 text-center" style={{ color: "var(--text-dim)" }}>Checking products against the drafting rules…</div>
      ) : visible.length === 0 ? (
        <div className="glass rounded-xl text-[11px] py-10 text-center" style={{ color: "var(--text-dim)" }}>No alerts. Nothing crosses a drafting rule or breakeven right now.</div>
      ) : (
        <div className="space-y-2">
          {visible.map((a) => {
            const sev = SEV[a.severity]
            const link = shopifyLink(a)
            return (
              <div key={a.id} className="glass rounded-xl px-4 py-3" style={{ borderLeft: `3px solid ${sev.color}` }}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="px-2 py-0.5 rounded-full text-[9px] font-bold" style={{ background: "rgba(255,255,255,0.05)", color: sev.color }}>{sev.label}</span>
                  <span className="text-[12px] font-semibold" style={{ color: "var(--text)" }}>{a.issue}</span>
                  <span className="text-[10px]" style={{ color: "var(--text-dim)" }}>· {a.rule}</span>
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
                    <div className="text-[9px] font-semibold uppercase tracking-wider mb-0.5" style={{ color: "var(--text-dim)" }}>Why</div>
                    {a.why.map((w, i) => <div key={i} className="text-[10px]" style={{ color: "var(--text-muted)" }}>• {w}</div>)}
                  </div>
                  <div>
                    <div className="text-[9px] font-semibold uppercase tracking-wider mb-0.5" style={{ color: "var(--text-dim)" }}>How to fix</div>
                    <div className="text-[10px]" style={{ color: "var(--text)" }}>{a.fix}</div>
                  </div>
                </div>
                {a.caveat && <div className="text-[9px] mt-1.5" style={{ color: "var(--text-dim)" }}>Note: {a.caveat}</div>}
              </div>
            )
          })}
        </div>
      )}
      <div className="text-[9px] mt-4" style={{ color: "var(--text-dim)" }}>
        Product rules apply to Google stores (per-product spend from Google Shopping). Meta/TikTok stores get a store-level alert. Not covered yet: single-variant rule and live-date rules 2–3 (need Shopify product data), refund spikes (refunds arrive with the nightly refresh), competitor price changes.
      </div>
    </PageShell>
  )
}
