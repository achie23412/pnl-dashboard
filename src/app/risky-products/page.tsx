"use client"
// Risky Products: early warning when a product gets 2+ complaints in 7 days (refund log +
// Inbox Queue tickets marked as a product complaint), so the supplier is told the same day.
import { Fragment, useCallback, useEffect, useMemo, useState } from "react"
import { PageShell } from "@/components/PageShell"
import { FixBanner } from "@/components/FixBanner"
import { FilterBar } from "@/components/PillSelect"
import { FilterSelect, EMPTY_FILTER, passes, type FilterValue } from "@/components/FilterSelect"
import { Panel, Badge, Button, Notice, Loading, EmptyState, TH, TD, ROW_BORDER } from "@/components/ui"
import { ProductLink } from "@/components/ProductLink"
import { complaintEvents, riskyProducts, daysAgo, RISKY_COMPLAINTS, RISKY_DAYS, type ComplaintEvent } from "@/lib/product-complaints"
import type { ProductFlag } from "@/app/api/product-flags/route"

const productKeyOf = (store: string, title: string) => `${store}|${title.trim().toLowerCase()}`

function supplierMessage(store: string, product: string, events: ComplaintEvent[]) {
  const reasons = Array.from(new Set(events.map((e) => e.reasonLabel))).join(", ")
  const orders = events.map((e) => e.order).filter(Boolean).join(", ")
  return [
    `Quality alert: ${product} (${store})`,
    `${events.length} customer complaints in the last ${RISKY_DAYS} days: ${reasons}.`,
    orders ? `Orders: ${orders}.` : "",
    ...events.filter((e) => e.note).slice(0, 5).map((e) => `- ${e.order || e.date}: ${e.note}`),
    "Please check the current stock and production for this item and tell us what caused it. Photos are in the customer conversations; we can send them.",
  ].filter(Boolean).join("\n")
}

export default function RiskyProductsPage() {
  const [events, setEvents] = useState<ComplaintEvent[] | null>(null)
  const [flags, setFlags] = useState<ProductFlag[]>([])
  const [error, setError] = useState<string | null>(null)
  const [fStore, setFStore] = useState<FilterValue>(EMPTY_FILTER)
  const [open, setOpen] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  const loadFlags = useCallback(() => fetch("/api/product-flags?kind=risky").then((r) => r.json()).then((d) => setFlags(d.rows || [])), [])
  useEffect(() => {
    Promise.all([fetch("/api/cs-log?kind=refund").then((r) => r.json()), fetch("/api/inbox?only=complaints").then((r) => r.json())])
      .then(([ref, tix]) => {
        if (ref.error) throw new Error(`refund log: ${ref.error}`)
        setEvents(complaintEvents(ref.rows || [], tix.rows || []))
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
    loadFlags()
  }, [loadFlags])

  const flagMap = useMemo(() => new Map(flags.map((f) => [productKeyOf(f.store, f.product_title), f])), [flags])
  const risky = useMemo(() => riskyProducts(events || []).map((r) => {
    const flag = flagMap.get(r.key)
    // Cleared earlier, but new complaints came in after that → risky again
    const clearedAt = flag?.status === "cleared" ? String(flag.data?.cleared_at || flag.updated_at) : null
    const newSince = clearedAt ? r.events.filter((e) => e.date > clearedAt.slice(0, 10)).length : r.events.length
    return { ...r, flag, active: !clearedAt || newSince > 0 }
  }), [events, flagMap])

  const shown = risky.filter((r) => passes(fStore, r.store))
  const stores = Array.from(new Set(risky.map((r) => r.store)))
  const riskyNow = risky.filter((r) => r.active).length
  const told = risky.filter((r) => r.active && r.flag?.status === "supplier_told").length
  const cleared30 = flags.filter((f) => f.status === "cleared" && f.updated_at >= daysAgo(30)).length

  const setStatus = async (r: (typeof risky)[number], status: string) => {
    await fetch("/api/product-flags", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "risky", store: r.store, product_title: r.product, status, data: { complaints: r.events.length } }) })
    loadFlags()
  }
  const copy = (r: (typeof risky)[number]) => {
    navigator.clipboard?.writeText(supplierMessage(r.store, r.product, r.events))
    setCopied(r.key)
    setTimeout(() => setCopied(null), 2000)
  }

  return (
    <PageShell
      title="Risky Products"
      breadcrumb="Customer Service → Risky Products"
      description={`Early warning: products with ${RISKY_COMPLAINTS}+ complaints in ${RISKY_DAYS} days, from the refund log and Inbox Queue tickets marked as a product complaint. Tell the supplier the same day.`}
      stats={[
        { label: "Risky now", value: events ? String(riskyNow) : "—", color: riskyNow ? "var(--red)" : undefined },
        { label: "Supplier notified", value: String(told), sub: `of ${riskyNow} risky now` },
        { label: "Cleared (30d)", value: String(cleared30) },
        { label: "Threshold", value: `${RISKY_COMPLAINTS}+ in ${RISKY_DAYS} days`, sub: "complaints per product" },
      ]}
    >
      <FixBanner />
      {error && <Notice tone="error">Couldn&apos;t load complaints: {error}.</Notice>}
      <FilterBar right={<span className="text-[10px]" style={{ color: "var(--text-dim)" }}>{shown.length} products</span>}>
        <FilterSelect label="Store" options={stores.map((s) => ({ value: s, count: risky.filter((r) => r.store === s).length }))} value={fStore} onChange={setFStore} />
      </FilterBar>

      {!events && !error && <Loading>Loading complaints…</Loading>}
      {events && shown.length === 0 && (
        <EmptyState title={`No product has ${RISKY_COMPLAINTS}+ complaints in the last ${RISKY_DAYS} days`}>
          Complaints count from refunds logged with a product reason (defect, not as described, damaged, wrong item, size) and Inbox Queue tickets marked as a product complaint. {events.length} complaints logged so far.
        </EmptyState>
      )}
      {events && shown.length > 0 && (
        <Panel pad={false} className="mb-4">
          <div className="overflow-x-auto">
            <table className="w-full whitespace-nowrap">
              <thead><tr style={{ color: "var(--text-dim)" }}>
                <th className={`${TH} text-left`}>Product</th><th className={`${TH} text-right`}>Complaints ({RISKY_DAYS}d)</th><th className={`${TH} text-left`}>Reasons</th><th className={`${TH} text-left`}>Last</th><th className={`${TH} text-left`}>Status</th><th className={`${TH} text-right`}></th>
              </tr></thead>
              <tbody>
                {shown.map((r) => (
                  <Fragment key={r.key}>
                    <tr style={ROW_BORDER} className="cursor-pointer hover:bg-white/[0.02]" onClick={() => setOpen(open === r.key ? null : r.key)}>
                      <td className={TD}><ProductLink store={r.store} name={r.product} maxWidth={280} /><div className="text-[9px]" style={{ color: "var(--text-dim)" }}>{r.store}</div></td>
                      <td className={`${TD} text-right tabular-nums`} style={{ color: "var(--red)" }}>{r.events.length}</td>
                      <td className={`${TD} text-[10px]`} style={{ color: "var(--text-muted)" }}>{Array.from(new Set(r.events.map((e) => e.reasonLabel))).join(", ")}</td>
                      <td className={`${TD} tabular-nums`} style={{ color: "var(--text-muted)" }}>{r.last}</td>
                      <td className={TD}>{!r.active ? <Badge tone="green">Cleared</Badge> : r.flag?.status === "supplier_told" ? <Badge tone="amber">Supplier told</Badge> : <Badge tone="red">Tell supplier</Badge>}</td>
                      <td className={`${TD} text-right`} onClick={(e) => e.stopPropagation()}>
                        <span className="inline-flex gap-1.5">
                          <Button size="sm" onClick={() => copy(r)}>{copied === r.key ? "Copied" : "Copy supplier message"}</Button>
                          {r.flag?.status !== "supplier_told" && r.active && <Button size="sm" variant="primary" onClick={() => setStatus(r, "supplier_told")}>Mark supplier told</Button>}
                          {r.active && <Button size="sm" variant="ghost" onClick={() => setStatus(r, "cleared")}>Clear</Button>}
                        </span>
                      </td>
                    </tr>
                    {open === r.key && (
                      <tr><td colSpan={6} className="px-3 pb-3 whitespace-normal text-[10px]" style={{ color: "var(--text-muted)" }}>
                        {r.events.map((e, i) => (
                          <div key={i}>{e.date} · {e.reasonLabel}{e.order ? ` · ${e.order}` : ""}{e.note ? ` · “${e.note}”` : ""}{e.url && <> · <a href={e.url} target="_blank" rel="noreferrer" className="underline">conversation</a></>}</div>
                        ))}
                        {r.flag?.status === "supplier_told" && <div className="mt-1">Supplier told on {String(r.flag.data?.supplier_told_at || r.flag.updated_at).slice(0, 10)}. Follow up weekly; no answer after 14 days goes to the Supply Chain Manager (CS playbook 9.5).</div>}
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
        Complaint = a refund logged with reason defect, not as described, damaged, wrong item or size, per product on the order, or an Inbox Queue ticket marked &quot;product complaint&quot;. Tell the supplier with photos and order numbers in the supplier WhatsApp group and log it in the inbound sheet (CS playbook 9.5). &quot;Clear&quot; hides it until a new complaint comes in. A product that also has a high quality refund rate shows on Quality Checks.
      </div>
    </PageShell>
  )
}
