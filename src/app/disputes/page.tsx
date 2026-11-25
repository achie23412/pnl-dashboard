"use client"
// Disputes / Chargebacks from Shopify Payments, handled per the CS playbook (section 1.5 and E5):
// never refund during an open chargeback; inquiry → a full refund closes it (CS Manager decides);
// chargeback → submit evidence before the respond-by date (thread, tracking, POD, offers made).
import { Fragment, useCallback, useEffect, useMemo, useState } from "react"
import { PageShell } from "@/components/PageShell"
import { FilterBar } from "@/components/PillSelect"
import { FilterSelect, EMPTY_FILTER, passes, type FilterValue } from "@/components/FilterSelect"
import { Panel, Badge, Button, Notice, Loading, EmptyState, TH, TD, ROW_BORDER } from "@/components/ui"
import type { Dispute } from "@/app/api/disputes/route"

type StoreInfo = { store: string; source: string | null; orders90d: number | null; disputes90d: number; error: string | null }
const EVIDENCE = [
  { key: "thread", label: "Customer conversation (full thread)" },
  { key: "tracking", label: "Tracking with delivery scan" },
  { key: "pod", label: "Proof of delivery (POD)" },
  { key: "offers", label: "Offers made (refund / credit / reship)" },
  { key: "policy", label: "Policy shown at checkout" },
]
const OPEN = ["NEEDS_RESPONSE", "needs_response", "open"]
const REVIEW = ["UNDER_REVIEW", "under_review"]
const label = (s: string) => s.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase())
const daysLeft = (d: string | null) => (d ? Math.ceil((Date.parse(d + (d.length === 10 ? "T23:59:59Z" : "")) - Date.now()) / 86400000) : null)
const money = (n: number | null, c: string | null) => (n == null ? "—" : `${c === "USD" ? "$" : c === "GBP" ? "£" : "€"}${n.toFixed(2)}`)

export default function DisputesPage() {
  const [disputes, setDisputes] = useState<Dispute[] | null>(null)
  const [stores, setStores] = useState<StoreInfo[]>([])
  const [error, setError] = useState<string | null>(null)
  const [fStore, setFStore] = useState<FilterValue>(EMPTY_FILTER)
  const [fState, setFState] = useState<FilterValue>(EMPTY_FILTER)
  const [open, setOpen] = useState<string | null>(null)
  const [draft, setDraft] = useState<{ decision: string | null; evidence: Record<string, boolean>; note: string }>({ decision: null, evidence: {}, note: "" })

  const load = useCallback(() => {
    fetch("/api/disputes", { cache: "no-store" }).then((r) => r.json()).then((d) => {
      if (d.error) throw new Error(d.error)
      setDisputes(d.disputes || [])
      setStores(d.stores || [])
    }).catch((e) => setError(e instanceof Error ? e.message : String(e)))
  }, [])
  useEffect(() => { load() }, [load])

  const stateOf = (d: Dispute) => (OPEN.includes(d.status) ? (d.submitted_at ? "submitted" : "act") : REVIEW.includes(d.status) ? "review" : ["WON", "won"].includes(d.status) ? "won" : ["LOST", "lost"].includes(d.status) ? "lost" : "closed")
  const list = useMemo(() => disputes || [], [disputes])
  const shown = list.filter((d) => passes(fStore, d.store) && passes(fState, stateOf(d)))
  const since90 = new Date(Date.now() - 90 * 86400000).toISOString()
  const toAct = list.filter((d) => stateOf(d) === "act")
  const urgent = toAct.filter((d) => (daysLeft(d.evidence_due_by) ?? 99) <= 3)

  const save = async (d: Dispute, submitted?: boolean) => {
    await fetch("/api/disputes", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ store: d.store, dispute_id: d.id, order_number: d.order_name, decision: draft.decision, evidence: draft.evidence, note: draft.note, submitted }) })
    load()
  }
  const needsScope = stores.some((s) => s.error?.includes("read_shopify_payments_disputes"))

  return (
    <PageShell
      title="Disputes / Chargebacks"
      breadcrumb="Disputes & Chargebacks → Disputes / Chargebacks"
      description="Payment disputes from Shopify Payments for every store, with the respond-by date. Chargeback: don't refund, submit evidence before the deadline. Inquiry: a full refund closes it; the CS Manager decides (CS playbook E5)."
      stats={[
        { label: "To act", value: disputes ? String(toAct.length) : "—", sub: urgent.length ? `${urgent.length} due within 3 days` : "need a response", color: toAct.length ? "var(--red)" : undefined },
        { label: "Waiting", value: disputes ? String(list.filter((d) => ["review", "submitted"].includes(stateOf(d))).length) : "—", sub: "evidence sent / under review" },
        { label: "Won (90d)", value: disputes ? String(list.filter((d) => stateOf(d) === "won" && (d.finalized_on || d.initiated_at || "") >= since90.slice(0, 10)).length) : "—", color: "var(--green)" },
        { label: "Lost (90d)", value: disputes ? String(list.filter((d) => stateOf(d) === "lost" && (d.finalized_on || d.initiated_at || "") >= since90.slice(0, 10)).length) : "—" },
      ]}
    >
      {error && <Notice tone="error">Couldn&apos;t load disputes: {error}.</Notice>}
      {needsScope && <Notice tone="warning">Reason, amount and respond-by date are missing until the read_shopify_payments_disputes permission is released in the store&apos;s Shopify app and approved in the store. Until then the list comes from the dispute status on each order (last 90 days).</Notice>}

      {stores.length > 0 && (
        <Panel title="Dispute rate per store" sub="Disputes opened in the last 90 days ÷ orders in the last 90 days. Card networks start monitoring around 0.65–1%." className="mb-4" pad={false}>
          <table className="w-full whitespace-nowrap">
            <thead><tr style={{ color: "var(--text-dim)" }}><th className={`${TH} text-left`}>Store</th><th className={`${TH} text-right`}>Disputes (90d)</th><th className={`${TH} text-right`}>Orders (90d)</th><th className={`${TH} text-right`}>Rate</th><th className={`${TH} text-left`}>Source</th></tr></thead>
            <tbody>
              {stores.map((s) => {
                const rate = s.orders90d ? s.disputes90d / s.orders90d : null
                return (
                  <tr key={s.store} style={ROW_BORDER}>
                    <td className={TD}>{s.store}</td>
                    <td className={`${TD} text-right tabular-nums`}>{s.disputes90d}</td>
                    <td className={`${TD} text-right tabular-nums`} style={{ color: "var(--text-muted)" }}>{s.orders90d ?? "—"}</td>
                    <td className={`${TD} text-right tabular-nums`} style={{ color: rate != null && rate >= 0.0065 ? "var(--red)" : "var(--text)" }}>{rate != null ? `${(rate * 100).toFixed(2)}%` : "—"}</td>
                    <td className={`${TD} text-[10px]`} style={{ color: "var(--text-dim)" }}>{s.source === "payments" ? "Shopify Payments" : s.source === "orders" ? "order status" : "—"}{s.error ? ` · ${s.error}` : ""}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Panel>
      )}

      <FilterBar>
        <FilterSelect label="Store" options={Array.from(new Set(list.map((d) => d.store))).map((s) => ({ value: s, count: list.filter((d) => d.store === s).length }))} value={fStore} onChange={setFStore} />
        <FilterSelect label="State" options={[
          { value: "act", label: "To act", count: toAct.length },
          { value: "submitted", label: "Evidence sent", count: list.filter((d) => stateOf(d) === "submitted").length },
          { value: "review", label: "Under review", count: list.filter((d) => stateOf(d) === "review").length },
          { value: "won", label: "Won", count: list.filter((d) => stateOf(d) === "won").length },
          { value: "lost", label: "Lost", count: list.filter((d) => stateOf(d) === "lost").length },
          { value: "closed", label: "Other closed", count: list.filter((d) => stateOf(d) === "closed").length },
        ]} value={fState} onChange={setFState} />
      </FilterBar>

      {!disputes && !error && <Loading>Loading disputes from Shopify…</Loading>}
      {disputes && shown.length === 0 && <EmptyState title={list.length ? "Nothing in this view" : "No disputes"}>{list.length ? "Change the filters to see other disputes." : "No disputes or chargebacks found on the stores' Shopify Payments accounts."}</EmptyState>}
      {disputes && shown.length > 0 && (
        <Panel pad={false} className="mb-4">
          <div className="overflow-x-auto">
            <table className="w-full whitespace-nowrap">
              <thead><tr style={{ color: "var(--text-dim)" }}>
                <th className={`${TH} text-left`}>Order</th><th className={`${TH} text-left`}>Type</th><th className={`${TH} text-left`}>Reason</th><th className={`${TH} text-right`}>Amount</th><th className={`${TH} text-left`}>Respond by</th><th className={`${TH} text-left`}>Status</th><th className={`${TH} text-left`}>Our decision</th>
              </tr></thead>
              <tbody>
                {shown.map((d) => {
                  const left = daysLeft(d.evidence_due_by)
                  const st = stateOf(d)
                  return (
                    <Fragment key={d.key}>
                      <tr style={ROW_BORDER} className="cursor-pointer hover:bg-white/[0.02]" onClick={() => { setOpen(open === d.key ? null : d.key); setDraft({ decision: d.decision, evidence: d.evidence || {}, note: d.note || "" }) }}>
                        <td className={TD}>{d.admin_url ? <a href={d.admin_url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="underline" style={{ color: "#a5b4fc" }}>{d.order_name || "order"}</a> : d.order_name || "—"}<div className="text-[9px]" style={{ color: "var(--text-dim)" }}>{d.store}</div></td>
                        <td className={TD}><Badge tone={/INQUIRY/i.test(d.type) ? "blue" : "red"}>{/INQUIRY/i.test(d.type) ? "Inquiry" : "Chargeback"}</Badge></td>
                        <td className={`${TD} text-[10px]`} style={{ color: "var(--text-muted)" }}>{d.reason ? label(d.reason) : "—"}</td>
                        <td className={`${TD} text-right tabular-nums`}>{money(d.amount, d.currency)}</td>
                        <td className={`${TD} tabular-nums`} style={{ color: left != null && left <= 3 && st === "act" ? "var(--red)" : "var(--text-muted)" }}>{d.evidence_due_by ? `${d.evidence_due_by.slice(0, 10)}${st === "act" && left != null ? ` · ${left}d left` : ""}` : "—"}</td>
                        <td className={TD}><Badge tone={st === "act" ? "red" : st === "won" ? "green" : st === "lost" ? "grey" : "amber"}>{st === "act" ? "Needs response" : st === "submitted" ? "Evidence sent" : label(d.status)}</Badge></td>
                        <td className={`${TD} text-[10px]`} style={{ color: "var(--text-muted)" }}>{d.decision === "fight" ? "Fight" : d.decision === "accept" ? "Accept" : d.decision === "refund_inquiry" ? "Refund inquiry" : "—"}</td>
                      </tr>
                      {open === d.key && (
                        <tr><td colSpan={7} className="px-3 pb-3 whitespace-normal text-[11px]" style={{ color: "var(--text-muted)" }}>
                          <div className="mb-2">
                            {/INQUIRY/i.test(d.type)
                              ? "Inquiry: a full refund closes it. A partial refund can still turn into a full chargeback. The CS Manager decides (playbook E5)."
                              : "Chargeback: do not refund (Shopify would pay out twice). The CS Manager submits evidence in Shopify before the respond-by date: the full conversation, tracking and proof of delivery, and the offers made. Tag the order dispute-open (playbook 1.5 / E5)."}
                          </div>
                          <div className="flex flex-wrap gap-2 mb-2">
                            {[{ v: "fight", l: "Fight (submit evidence)" }, { v: "accept", l: "Accept" }, ...(/INQUIRY/i.test(d.type) ? [{ v: "refund_inquiry", l: "Full refund (inquiry)" }] : [])].map((o) => (
                              <Button key={o.v} size="sm" variant={draft.decision === o.v ? "primary" : "secondary"} onClick={() => setDraft({ ...draft, decision: o.v })}>{o.l}</Button>
                            ))}
                          </div>
                          {draft.decision === "fight" && (
                            <div className="grid sm:grid-cols-2 gap-1 mb-2">
                              {EVIDENCE.map((e) => (
                                <label key={e.key} className="flex items-center gap-1.5 text-[11px]"><input type="checkbox" checked={!!draft.evidence[e.key]} onChange={(x) => setDraft({ ...draft, evidence: { ...draft.evidence, [e.key]: x.target.checked } })} /> {e.label}</label>
                              ))}
                            </div>
                          )}
                          <div className="flex flex-wrap items-center gap-2">
                            <input value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} placeholder="Note (what was sent, CommsLayer link…)" className="px-2 py-1 rounded-md text-[11px] flex-1 min-w-[220px]" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", color: "var(--text)" }} />
                            <Button size="sm" onClick={() => save(d)}>Save</Button>
                            {st === "act" && <Button size="sm" variant="primary" onClick={() => save(d, true)}>Evidence sent</Button>}
                            {d.submitted_at && <span className="text-[10px]">Sent {d.submitted_at.slice(0, 10)}</span>}
                            {d.admin_url && <a href={d.admin_url} target="_blank" rel="noreferrer" className="underline text-[10px]">Open order in Shopify</a>}
                          </div>
                        </td></tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
      <div className="text-[10px]" style={{ color: "var(--text-dim)" }}>
        From Shopify Payments (every store with a Shopify app). Lumé&apos;s Whop payments and PayPal disputes are not in this list. Watch for a dispute for 120 days after a chargeback threat (playbook E4).
      </div>
    </PageShell>
  )
}
