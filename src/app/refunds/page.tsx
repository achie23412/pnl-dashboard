"use client"
// Customer Service → Refunds: CS logs every refund here. Pick the store and order
// number, the order's products come from Shopify, tick what's refunded, pick the
// reason and percentage, paste the CommsLayer conversation link, save.
import { Fragment, useCallback, useEffect, useMemo, useState } from "react"
import { PageShell } from "@/components/PageShell"
import { PillSelect, FilterBar } from "@/components/PillSelect"
import { FilterSelect, EMPTY_FILTER, passes, type FilterValue } from "@/components/FilterSelect"
import { SingleDatePicker } from "@/components/SingleDatePicker"
import { Panel, Badge, Button, Notice, Loading, EmptyState, SectionLabel, TH, TD, ROW_BORDER } from "@/components/ui"
import { SHOPIFY_STORES } from "@/lib/constants"
import { STORE_CURRENCY } from "@/lib/currency"
import { REFUND_REASONS, GOODWILL_LADDER, reasonLabel, money, type CsRefund, type OrderLookup, type OrderItem } from "@/lib/cs-log"

const STORES = Object.keys(SHOPIFY_STORES)
const inputCls = "w-full rounded-lg px-3 py-1.5 text-[11px] outline-none"
const inputStyle = { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", color: "var(--text)" }
const today = () => new Date().toISOString().slice(0, 10)
const fmtDay = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })
const round2 = (n: number) => Math.round(n * 100) / 100

type Picked = OrderItem & { picked: boolean; refundQty: number }

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div>
      <span className="block text-[10px] mb-1" style={{ color: "var(--text-dim)" }}>{label}</span>
      {children}
      {hint && <span className="block text-[9px] mt-1" style={{ color: "var(--text-dim)" }}>{hint}</span>}
    </div>
  )
}

export default function RefundsPage() {
  const [rows, setRows] = useState<CsRefund[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  // form
  const [store, setStore] = useState("")
  const [date, setDate] = useState(today())
  const [orderNo, setOrderNo] = useState("")
  const [order, setOrder] = useState<OrderLookup | null>(null)
  const [items, setItems] = useState<Picked[]>([])
  const [manualItem, setManualItem] = useState("")
  const [finding, setFinding] = useState(false)
  const [findError, setFindError] = useState<string | null>(null)
  const [type, setType] = useState<"full" | "partial">("partial")
  const [reason, setReason] = useState("")
  const [note, setNote] = useState("")
  const [pct, setPct] = useState("100")
  const [amount, setAmount] = useState("")
  const [amountTouched, setAmountTouched] = useState(false)
  const [convo, setConvo] = useState("")
  const [loggedBy, setLoggedBy] = useState("")
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState<{ tone: "success" | "error"; text: string } | null>(null)

  // list filters
  const [fStore, setFStore] = useState<FilterValue>(EMPTY_FILTER)
  const [fReason, setFReason] = useState<FilterValue>(EMPTY_FILTER)
  const [fType, setFType] = useState<FilterValue>(EMPTY_FILTER)
  const [openId, setOpenId] = useState<number | null>(null)

  const currency = order?.currency || (store ? STORE_CURRENCY[store] : "EUR") || "EUR"

  const load = useCallback(() => {
    setLoading(true)
    fetch("/api/cs-log?kind=refund", { cache: "no-store" })
      .then(async (r) => {
        const j = await r.json()
        if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`)
        setRows(j.rows)
        setLoadError(null)
      })
      .catch((e: unknown) => setLoadError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false))
  }, [])

  // Opened from the Refund Report's "Log it": prefill store + order.
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search)
    const st = sp.get("store")
    const id = sp.get("order_id")
    if (st && SHOPIFY_STORES[st]) {
      setStore(st)
      if (id) findOrder({ store: st, id })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    load()
    try {
      setLoggedBy(localStorage.getItem("cs:name") || "")
    } catch {
      // optional
    }
  }, [load])

  const findOrder = async (opts?: { store: string; id: string }) => {
    setFindError(null)
    setOrder(null)
    setItems([])
    const st = opts?.store || store
    if (!st) return setFindError("Pick the store first.")
    if (!opts && !orderNo.trim()) return setFindError("Enter the order number.")
    setFinding(true)
    try {
      const q = opts ? `id=${encodeURIComponent(opts.id)}` : `order=${encodeURIComponent(orderNo.trim())}`
      const r = await fetch(`/api/shopify-order?store=${encodeURIComponent(st)}&${q}`)
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`)
      const o = j as OrderLookup
      setOrder(o)
      setOrderNo(o.order_number)
      setItems(o.items.map((i) => ({ ...i, picked: o.items.length === 1, refundQty: i.qty })))
    } catch (e: unknown) {
      setFindError(e instanceof Error ? e.message : String(e))
    } finally {
      setFinding(false)
    }
  }

  // Purchase price of what's refunded = ticked items × qty × price paid.
  const purchase = useMemo(() => round2(items.filter((i) => i.picked).reduce((a, i) => a + i.price * i.refundQty, 0)), [items])
  const base = type === "full" && order ? order.total : purchase
  const suggested = round2((base * (parseFloat(pct) || 0)) / 100)
  useEffect(() => {
    if (!amountTouched) setAmount(base > 0 ? String(suggested) : "")
  }, [suggested, base, amountTouched])
  useEffect(() => {
    if (type === "full") setPct("100")
  }, [type])

  const reset = () => {
    setOrderNo("")
    setOrder(null)
    setItems([])
    setManualItem("")
    setReason("")
    setNote("")
    setPct("100")
    setType("partial")
    setAmount("")
    setAmountTouched(false)
    setConvo("")
    setDate(today())
    setFindError(null)
  }

  const save = async () => {
    setSaveMsg(null)
    const picked = items.filter((i) => i.picked).map((i) => ({ title: i.title, variant: i.variant, qty: i.refundQty, price: i.price, product_id: i.product_id }))
    const extra = manualItem.trim() ? [{ title: manualItem.trim(), variant: null, qty: 1, price: 0, product_id: null }] : []
    setSaving(true)
    try {
      try {
        localStorage.setItem("cs:name", loggedBy)
      } catch {
        // optional
      }
      const r = await fetch("/api/cs-log?kind=refund", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          store,
          refund_date: date,
          order_number: order?.order_number || orderNo,
          shopify_order_id: order?.shopify_order_id,
          customer_email: order?.customer_email,
          conversation_url: convo,
          refund_type: type,
          reason,
          reason_note: note,
          percentage: pct,
          amount,
          currency,
          order_total: order?.total ?? null,
          items: [...picked, ...extra],
          logged_by: loggedBy,
        }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`)
      setRows((x) => [j.row, ...x])
      setSaveMsg({ tone: "success", text: `Logged ${money(Number(j.row.amount), j.row.currency)} for ${j.row.order_number} (${reasonLabel(j.row.reason)}).` })
      reset()
    } catch (e: unknown) {
      setSaveMsg({ tone: "error", text: `Couldn't save the refund: ${e instanceof Error ? e.message : String(e)}` })
    } finally {
      setSaving(false)
    }
  }

  const remove = async (id: number) => {
    const r = await fetch(`/api/cs-log?kind=refund&id=${id}`, { method: "DELETE" })
    if (r.ok) setRows((x) => x.filter((y) => y.id !== id))
  }

  const filtered = rows.filter((r) => passes(fStore, r.store) && passes(fReason, r.reason) && passes(fType, r.refund_type))
  const since = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)
  const last30 = rows.filter((r) => r.refund_date >= since)
  const byCur = last30.reduce<Record<string, number>>((a, r) => ({ ...a, [r.currency]: (a[r.currency] || 0) + Number(r.amount) }), {})
  const topReason = Object.entries(last30.reduce<Record<string, number>>((a, r) => ({ ...a, [r.reason]: (a[r.reason] || 0) + 1 }), {})).sort((a, b) => b[1] - a[1])[0]
  const goodwill = reason === "goodwill"
  const fullRemedy = ["quality_defect", "wrong_item", "not_received", "chargeback"].includes(reason)

  return (
    <PageShell
      title="Refunds"
      breadcrumb="Customer Service → Refunds"
      description="Log every refund here: the order's products come from Shopify, add the reason, percentage and the CommsLayer conversation. The Refund Report is built from this log."
      stats={[
        { label: "Logged (30d)", value: loading ? "—" : String(last30.length) },
        { label: "Refunded (30d)", value: loading ? "—" : Object.entries(byCur).map(([c, v]) => money(v, c)).join(" · ") || "—" },
        { label: "Full / partial (30d)", value: loading ? "—" : `${last30.filter((r) => r.refund_type === "full").length} / ${last30.filter((r) => r.refund_type === "partial").length}` },
        { label: "Top reason (30d)", value: loading ? "—" : topReason ? reasonLabel(topReason[0]) : "—", sub: topReason ? `${topReason[1]} refunds` : undefined },
      ]}
    >
      {loadError && <Notice tone="error">Couldn&apos;t load the refund log: {loadError}</Notice>}

      <Panel title="Log a refund" sub="Do the refund in Shopify first, then log it here." className="mb-4">
        <div className="grid gap-3 md:grid-cols-4 mb-3">
          <Field label="Store">
            <PillSelect fullWidth value={store} onChange={(v) => { setStore(v); setOrder(null); setItems([]) }} options={STORES} placeholder="Pick store" />
          </Field>
          <Field label="Refund date">
            <SingleDatePicker value={date} onChange={setDate} allowEmpty={false} fullWidth align="left" />
          </Field>
          <Field label="Order number">
            <div className="flex gap-2">
              <input value={orderNo} onChange={(e) => setOrderNo(e.target.value)} onKeyDown={(e) => e.key === "Enter" && findOrder()} className={inputCls} style={inputStyle} placeholder="#1042" />
              <Button onClick={() => findOrder()} disabled={finding}>{finding ? "Finding…" : "Find"}</Button>
            </div>
          </Field>
          <Field label="CommsLayer conversation">
            <input value={convo} onChange={(e) => setConvo(e.target.value)} className={inputCls} style={inputStyle} placeholder="Paste the conversation link" />
          </Field>
        </div>

        {findError && <Notice tone="warning">{findError}</Notice>}

        {order && (
          <div className="rounded-lg p-3 mb-3" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
            <div className="flex flex-wrap items-center gap-2 mb-2 text-[11px]" style={{ color: "var(--text-muted)" }}>
              <span className="font-semibold" style={{ color: "var(--text)" }}>{order.order_number}</span>
              <span>{fmtDay(order.created_at.slice(0, 10))}</span>
              <span>· paid {money(order.total, order.currency)}</span>
              {order.refunded > 0 && <Badge tone="amber">already refunded {money(order.refunded, order.currency)}</Badge>}
              <Badge tone="grey">{order.financial_status.replace(/_/g, " ")}</Badge>
              {order.customer_email && <span>· {order.customer_email}</span>}
              <a href={order.admin_url} target="_blank" rel="noreferrer" className="ml-auto underline text-[10px]">Open in Shopify</a>
            </div>
            <SectionLabel>Tick the refunded products</SectionLabel>
            {items.map((it, i) => (
              <div key={i} className="flex items-center gap-3 py-1.5 text-[11px]" style={ROW_BORDER}>
                <input type="checkbox" checked={it.picked} onChange={(e) => setItems((x) => x.map((y, j) => (j === i ? { ...y, picked: e.target.checked } : y)))} />
                <span className="flex-1 min-w-0 truncate" style={{ color: "var(--text)" }}>
                  {it.title}
                  {it.variant && <span style={{ color: "var(--text-dim)" }}> · {it.variant}</span>}
                </span>
                <span className="text-[10px]" style={{ color: "var(--text-dim)" }}>qty</span>
                <input
                  type="number"
                  min={1}
                  max={it.qty}
                  value={it.refundQty}
                  onChange={(e) => setItems((x) => x.map((y, j) => (j === i ? { ...y, refundQty: Math.max(1, Math.min(it.qty, parseInt(e.target.value) || 1)) } : y)))}
                  className="w-12 rounded px-1.5 py-0.5 text-[11px] text-right"
                  style={inputStyle}
                />
                <span className="text-[10px]" style={{ color: "var(--text-dim)" }}>of {it.qty}</span>
                <span className="w-20 text-right tabular-nums" style={{ color: "var(--text-muted)" }}>{money(it.price, order.currency)}</span>
              </div>
            ))}
          </div>
        )}
        {!order && (
          <div className="mb-3">
            <Field label="Product (only if the order can't be found)" hint="Find the order to pick products, quantities and prices automatically.">
              <input value={manualItem} onChange={(e) => setManualItem(e.target.value)} className={inputCls} style={inputStyle} placeholder="Product name, variant, qty" />
            </Field>
          </div>
        )}

        <div className="grid gap-3 md:grid-cols-4 mb-3">
          <Field label="Refund type">
            <PillSelect fullWidth value={type} onChange={(v) => setType(v as "full" | "partial")} options={[{ value: "partial", label: "Partial refund" }, { value: "full", label: "Full refund" }]} />
          </Field>
          <Field label="Reason">
            <PillSelect fullWidth value={reason} onChange={setReason} options={REFUND_REASONS.map((r) => ({ value: r.value, label: r.label }))} placeholder="Pick reason" />
          </Field>
          <Field label="Percentage" hint={goodwill ? "Goodwill ladder: 10% → 20% → 30% refund (or 60 / 80 / 100% store credit). Move up only after a decline." : undefined}>
            <div className="flex gap-1.5">
              <input value={pct} onChange={(e) => { setPct(e.target.value); setAmountTouched(false) }} className={inputCls} style={inputStyle} inputMode="decimal" />
              {(goodwill ? GOODWILL_LADDER.map((g) => g.refundPct) : [25, 50, 100]).map((p) => (
                <Button key={p} size="sm" variant={pct === String(p) ? "primary" : "secondary"} onClick={() => { setPct(String(p)); setAmountTouched(false) }}>
                  {p}%
                </Button>
              ))}
            </div>
          </Field>
          <Field label={`Refund amount (${currency})`} hint={base > 0 ? `${pct || 0}% of ${money(base, currency)} ${type === "full" ? "order total" : "purchase price"}` : "Find the order to calculate this, or type it."}>
            <input value={amount} onChange={(e) => { setAmount(e.target.value); setAmountTouched(true) }} className={inputCls} style={inputStyle} inputMode="decimal" />
          </Field>
        </div>
        <div className="grid gap-3 md:grid-cols-4">
          <div className="md:col-span-3">
            <Field label="Note (optional)">
              <input value={note} onChange={(e) => setNote(e.target.value)} className={inputCls} style={inputStyle} placeholder="What happened, what was agreed" />
            </Field>
          </div>
          <Field label="Logged by">
            <input value={loggedBy} onChange={(e) => setLoggedBy(e.target.value)} className={inputCls} style={inputStyle} placeholder="Your name" />
          </Field>
        </div>
        {fullRemedy && (
          <div className="text-[10px] mt-2" style={{ color: "var(--orange)" }}>
            No goodwill ladder for defects, wrong items, non-delivery or disputes: these get the full remedy (CS playbook).
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2 mt-3">
          <Button variant="primary" onClick={save} disabled={saving}>{saving ? "Saving…" : "Log refund"}</Button>
          <Button variant="ghost" onClick={reset}>Clear</Button>
          {saveMsg && <span className="text-[11px]" style={{ color: saveMsg.tone === "success" ? "var(--green)" : "var(--red)" }}>{saveMsg.text}</span>}
        </div>
      </Panel>

      <FilterBar right={<span className="text-[10px]" style={{ color: "var(--text-dim)" }}>{filtered.length} refunds</span>}>
        <FilterSelect label="Store" options={STORES} value={fStore} onChange={setFStore} />
        <FilterSelect label="Reason" options={REFUND_REASONS.map((r) => ({ value: r.value, label: r.label }))} value={fReason} onChange={setFReason} />
        <FilterSelect label="Type" options={[{ value: "full", label: "Full" }, { value: "partial", label: "Partial" }]} value={fType} onChange={setFType} />
      </FilterBar>

      {loading && rows.length === 0 ? (
        <Loading>Loading refunds…</Loading>
      ) : filtered.length === 0 ? (
        <EmptyState title={rows.length ? "No refunds match these filters" : "No refunds logged yet"}>
          {rows.length ? "Clear a filter to see more." : "Log the first refund with the form above."}
        </EmptyState>
      ) : (
        <Panel pad={false}>
          <table className="w-full">
            <thead>
              <tr style={{ color: "var(--text-dim)" }}>
                <th className={`${TH} text-left`}>Date</th>
                <th className={`${TH} text-left`}>Store</th>
                <th className={`${TH} text-left`}>Order</th>
                <th className={`${TH} text-left`}>Products</th>
                <th className={`${TH} text-left`}>Type</th>
                <th className={`${TH} text-left`}>Reason</th>
                <th className={`${TH} text-right`}>%</th>
                <th className={`${TH} text-right`}>Amount</th>
                <th className={`${TH} text-left`}>Conversation</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <Fragment key={r.id}>
                  <tr style={{ ...ROW_BORDER, cursor: "pointer" }} onClick={() => setOpenId(openId === r.id ? null : r.id)}>
                    <td className={TD} style={{ color: "var(--text)" }}>{fmtDay(r.refund_date)}</td>
                    <td className={`${TD} text-[10px]`} style={{ color: "var(--text-muted)" }}>{r.store}</td>
                    <td className={TD} style={{ color: "var(--text)" }}>{r.order_number}</td>
                    <td className={`${TD} max-w-[240px] truncate`} style={{ color: "var(--text-muted)" }}>
                      {r.items.length ? r.items.map((i) => `${i.qty}× ${i.title}${i.variant ? ` (${i.variant})` : ""}`).join(", ") : "—"}
                    </td>
                    <td className={TD}><Badge tone={r.refund_type === "full" ? "red" : "amber"}>{r.refund_type === "full" ? "Full" : "Partial"}</Badge></td>
                    <td className={TD} style={{ color: "var(--text)" }}>{reasonLabel(r.reason)}</td>
                    <td className={`${TD} text-right tabular-nums`} style={{ color: "var(--text-muted)" }}>{r.percentage != null ? `${r.percentage}%` : "—"}</td>
                    <td className={`${TD} text-right tabular-nums font-medium`} style={{ color: "var(--text)" }}>{money(Number(r.amount), r.currency)}</td>
                    <td className={TD}>
                      {r.conversation_url ? (
                        <a href={r.conversation_url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="underline text-[10px]" style={{ color: "var(--accent)" }}>Open</a>
                      ) : (
                        <span style={{ color: "var(--text-dim)" }}>—</span>
                      )}
                    </td>
                  </tr>
                  {openId === r.id && (
                    <tr>
                      <td colSpan={9} className="px-3 pb-3 text-[10px]" style={{ color: "var(--text-muted)" }}>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                          {r.items.map((i, k) => (
                            <span key={k}>{i.qty}× {i.title}{i.variant ? ` · ${i.variant}` : ""} {i.price ? `@ ${money(i.price, r.currency)}` : ""}</span>
                          ))}
                          {r.order_total != null && <span>Order total {money(Number(r.order_total), r.currency)}</span>}
                          {r.customer_email && <span>{r.customer_email}</span>}
                          {r.logged_by && <span>Logged by {r.logged_by}</span>}
                          {r.reason_note && <span>Note: {r.reason_note}</span>}
                          <Button size="sm" variant="danger" onClick={() => remove(r.id)}>Delete</Button>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </Panel>
      )}
    </PageShell>
  )
}
