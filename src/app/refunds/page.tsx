"use client"
// Customer Service → Refunds: CS logs every refund here. Pick the store and order
// number, the order's products come from Shopify, tick what's refunded, pick the
// reason and percentage, paste the CommsLayer conversation link, save.
import { Fragment, useCallback, useEffect, useMemo, useState } from "react"
import { PageShell } from "@/components/PageShell"
import { FixBanner } from "@/components/FixBanner"
import { RefundSheetsBar, type SheetSync } from "@/components/RefundSheetsBar"
import { PillSelect, FilterBar } from "@/components/PillSelect"
import { FilterSelect, EMPTY_FILTER, passes, type FilterValue } from "@/components/FilterSelect"
import { SingleDatePicker } from "@/components/SingleDatePicker"
import { Panel, Badge, Button, Notice, Loading, EmptyState, SectionLabel, TH, TD, ROW_BORDER } from "@/components/ui"
import { SHOPIFY_STORES } from "@/lib/constants"
import { STORE_CURRENCY } from "@/lib/currency"
import { REFUND_REASONS, REFUND_TYPES, GOODWILL_LADDER, reasonLabel, money, type CsRefund, type OrderLookup, type OrderItem } from "@/lib/cs-log"
import { RefundDetail } from "@/components/RefundDetail"
import { RiskyBadge } from "@/components/RiskyBadge"
import { useRefundRisk } from "@/lib/use-refund-risk"
import type { RefundLoss } from "@/lib/refund-loss"

type RType = CsRefund["refund_type"]
const isFull = (t: string) => t !== "partial"
const typeLabel = (t: string) => (t === "full_after_return" ? "Full after return" : t === "full" ? "Full" : "Partial")
const APPROVAL = {
  not_needed: null,
  waiting: { tone: "amber", label: "Waiting for Owner" },
  flagged: { tone: "red", label: "Threat: flagged" },
  approved: { tone: "green", label: "Approved" },
  rejected: { tone: "grey", label: "Rejected" },
} as const

// One status per refund, answering one question first: has the money gone back to the customer?
// Shopify is the truth for "refunded": a refund made there by hand counts, also while it still waited
// for the Owner. done = refunded in Shopify; todo = still has to be refunded; check = not known yet.
type Stage = "done" | "partial" | "todo" | "check" | "unknown" | "rejected"
function lifecycle(r: CsRefund): { stage: Stage; tone: "green" | "amber" | "red" | "grey"; label: string; sub?: string } {
  if (r.shopify_status === "refunded")
    return { stage: "done", tone: "green", label: "✓ Refunded", sub: [r.shopify_refunded_at ? fmtDay(r.shopify_refunded_at.slice(0, 10)) : null, r.shopify_refunded != null ? money(Number(r.shopify_refunded), r.currency) : null].filter(Boolean).join(" · ") + " in Shopify" }
  if (r.approval_status === "rejected") return { stage: "rejected", tone: "grey", label: "Rejected", sub: "no refund" }
  if (r.shopify_status === "partial") return { stage: "partial", tone: "amber", label: "◐ Partly refunded", sub: r.shopify_refunded != null ? `only ${money(Number(r.shopify_refunded), r.currency)} in Shopify` : undefined }
  if (r.approval_status === "waiting") return { stage: "todo", tone: "amber", label: "✗ Not refunded yet", sub: "waiting for Owner approval" }
  if (r.shopify_status === "not_refunded") return { stage: "todo", tone: "red", label: "✗ Not refunded yet", sub: "approved: refund it in Shopify" }
  if (r.shopify_status === "no_order") return { stage: "unknown", tone: "grey", label: "? Can't check", sub: "order not found in Shopify: check by hand" }
  return { stage: "check", tone: r.approval_status === "flagged" ? "red" : "grey", label: "… Checking Shopify", sub: r.approval_status === "flagged" ? "threat case: refund in full" : "approved, result within the hour" }
}
const STAGES: { value: Stage; label: string }[] = [
  { value: "done", label: "Refunded" },
  { value: "todo", label: "Not refunded yet" },
  { value: "partial", label: "Partly refunded" },
  { value: "check", label: "Checking Shopify" },
  { value: "unknown", label: "Can't check" },
  { value: "rejected", label: "Rejected" },
]
const agoText = (iso: string) => {
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000)
  if (m < 1) return "just now"
  if (m < 60) return `${m} min ago`
  if (m < 48 * 60) return `${Math.round(m / 60)} h ago`
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" })
}

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
  const [type, setType] = useState<RType>("partial")
  const [threat, setThreat] = useState(false)
  const [role, setRole] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)
  const [sheetSync, setSheetSync] = useState<SheetSync>(null)
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
  const [fStage, setFStage] = useState<FilterValue>(EMPTY_FILTER)
  const [openId, setOpenId] = useState<number | null>(null)
  const [lastSync, setLastSync] = useState<string | null>(null)
  const [loss, setLoss] = useState<Record<number, RefundLoss>>({})
  const [lossError, setLossError] = useState<string | null>(null)
  const { find: findRisk } = useRefundRisk()

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

  const runCheck = useCallback(async () => {
    setChecking(true)
    const res = await fetch("/api/refund-check", { method: "POST" }).catch(() => null)
    const j = res ? await res.json().catch(() => null) : null
    if (j?.sheets) setSheetSync(j.sheets)
    if (j?.last?.ran_at) setLastSync(j.last.ran_at)
    try {
      localStorage.setItem("refunds:checked", String(Date.now()))
    } catch {
      // optional
    }
    setChecking(false)
    load()
  }, [load])

  // Each refund's ShipGoods order: COGS, shipping, net loss
  const loadLoss = useCallback(() => {
    fetch("/api/refund-orders?days=120", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        setLoss(j.byId || {})
        setLossError(j.error || null)
      })
      .catch((e: unknown) => setLossError(e instanceof Error ? e.message : String(e)))
  }, [])

  useEffect(() => {
    load()
    loadLoss()
    fetch("/api/refund-check").then((r) => r.json()).then((j) => j?.last?.ran_at && setLastSync(j.last.ran_at)).catch(() => {})
    fetch("/api/auth/me").then((r) => r.json()).then((j) => setRole(j.role)).catch(() => {})
    try {
      setLoggedBy(localStorage.getItem("cs:name") || "")
      // Compare logged refunds with Shopify at most once an hour (plus a daily job).
      if (Date.now() - Number(localStorage.getItem("refunds:checked") || 0) > 3600000) runCheck()
    } catch {
      runCheck()
    }
  }, [load, loadLoss, runCheck])

  const decide = async (r: CsRefund, action: "approve" | "reject") => {
    const res = await fetch(`/api/cs-log?kind=refund&id=${r.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, by: loggedBy || "Owner" }) })
    const j = await res.json()
    if (!res.ok) return setSaveMsg({ tone: "error", text: j.error || "Couldn't save the decision." })
    setRows((x) => x.map((y) => (y.id === r.id ? j.row : y)))
  }

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
  const base = isFull(type) && order ? order.total : purchase
  const suggested = round2((base * (parseFloat(pct) || 0)) / 100)
  useEffect(() => {
    if (!amountTouched) setAmount(base > 0 ? String(suggested) : "")
  }, [suggested, base, amountTouched])
  useEffect(() => {
    if (isFull(type)) setPct("100")
  }, [type])
  useEffect(() => {
    if (threat && type === "partial") setType("full") // threat = refund in full at once
  }, [threat, type])

  const reset = () => {
    setOrderNo("")
    setOrder(null)
    setItems([])
    setManualItem("")
    setReason("")
    setNote("")
    setPct("100")
    setType("partial")
    setThreat(false)
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
          threat,
        }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`)
      setRows((x) => [j.row, ...x])
      const what = `${money(Number(j.row.amount), j.row.currency)} for ${j.row.order_number}`
      setSaveMsg({
        tone: "success",
        text:
          j.row.approval_status === "waiting"
            ? `Logged ${what}. Above €100: do NOT refund in Shopify yet, it waits for the Owner.`
            : j.row.approval_status === "flagged"
              ? `Logged ${what} as a threat. Refund it in full in Shopify now; the Owner is informed.`
              : `Logged ${what}. Now refund it in Shopify; the dashboard checks it went out.`,
      })
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

  const filtered = rows.filter((r) => passes(fStore, r.store) && passes(fReason, r.reason) && passes(fType, r.refund_type) && passes(fStage, lifecycle(r).stage))
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
        { label: "Full / partial (30d)", value: loading ? "—" : `${last30.filter((r) => isFull(r.refund_type)).length} / ${last30.filter((r) => r.refund_type === "partial").length}` },
        { label: "Top reason (30d)", value: loading ? "—" : topReason ? reasonLabel(topReason[0]) : "—", sub: topReason ? `${topReason[1]} refunds` : undefined },
      ]}
      actions={
        <span className="inline-flex items-center gap-2">
          <span className="text-[10px]" style={{ color: "var(--text-dim)" }} title={lastSync ? new Date(lastSync).toLocaleString("en-GB") : undefined}>
            {lastSync ? `Last synced with Shopify ${agoText(lastSync)}` : "Not synced yet"}
          </span>
          <Button onClick={runCheck} disabled={checking}>{checking ? "Checking Shopify…" : "Check Shopify now"}</Button>
        </span>
      }
    >
      <FixBanner />
      <RefundSheetsBar result={sheetSync} syncing={checking} onSync={runCheck} />
      {loadError && <Notice tone="error">Couldn&apos;t load the refund log: {loadError}</Notice>}

      {(() => {
        const queue = rows.filter((r) => (r.approval_status === "waiting" || r.approval_status === "flagged") && r.shopify_status !== "refunded")
        const missing = rows.filter((r) => r.shopify_status === "not_refunded")
        return (
          <>
            {missing.length > 0 && (
              <Notice tone="error">
                {missing.length} logged refund{missing.length !== 1 ? "s were" : " was"} not refunded in Shopify: {missing.slice(0, 4).map((r) => `${r.order_number} (${r.store})`).join(", ")}
                {missing.length > 4 ? "…" : ""}. Refund {missing.length !== 1 ? "them" : "it"} in the store or fix the log.
              </Notice>
            )}
            {queue.length > 0 && (
              <Panel
                title={`Owner review · ${queue.length}`}
                sub={role === "owner" ? "Refunds above €100 and threat cases. Approve before CS refunds above €100." : "Only the Owner approves or rejects. Above €100: don't refund in Shopify until it's approved."}
                pad={false}
                className="mb-4"
              >
                <table className="w-full">
                  <tbody>
                    {queue.map((r) => {
                      const a = APPROVAL[r.approval_status]
                      return (
                        <tr key={r.id} style={ROW_BORDER}>
                          <td className={TD} style={{ color: "var(--text)" }}>{r.order_number}</td>
                          <td className={`${TD} text-[10px]`} style={{ color: "var(--text-muted)" }}>{r.store}</td>
                          <td className={TD} style={{ color: "var(--text-muted)" }}>{reasonLabel(r.reason)} · {typeLabel(r.refund_type)}</td>
                          <td className={`${TD} text-right tabular-nums font-medium`} style={{ color: "var(--text)" }}>
                            {money(Number(r.amount), r.currency)}{r.amount_eur != null && r.currency !== "EUR" ? ` (€${Number(r.amount_eur).toFixed(0)})` : ""}
                          </td>
                          <td className={TD}>{a && <Badge tone={a.tone}>{a.label}</Badge>}</td>
                          <td className={`${TD} text-[10px]`} style={{ color: "var(--text-dim)" }}>{r.logged_by || ""}</td>
                          <td className={`${TD} text-right whitespace-nowrap`}>
                            {role === "owner" ? (
                              <span className="inline-flex gap-1">
                                <Button size="sm" variant="primary" onClick={() => decide(r, "approve")}>{r.approval_status === "flagged" ? "OK" : "Approve"}</Button>
                                {r.approval_status === "waiting" && <Button size="sm" variant="danger" onClick={() => decide(r, "reject")}>Reject</Button>}
                              </span>
                            ) : (
                              <span className="text-[10px]" style={{ color: "var(--text-dim)" }}>{role ? "Owner decides" : "Log in again as Owner to decide"}</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </Panel>
            )}
          </>
        )
      })()}

      <Panel title="Log a refund" sub="Up to €100: log it, then refund it in Shopify. Above €100: log it and wait for the Owner's approval." className="mb-4">
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
            <PillSelect fullWidth value={type} onChange={(v) => setType(v as RType)} options={REFUND_TYPES.map((t) => ({ value: t.value, label: t.label }))} />
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
          <Field label={`Refund amount (${currency})`} hint={base > 0 ? `${pct || 0}% of ${money(base, currency)} ${isFull(type) ? "order total" : "purchase price"}` : "Find the order to calculate this, or type it."}>
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
        <label className="flex items-start gap-2 mt-3 text-[11px]" style={{ color: "var(--text)" }}>
          <input type="checkbox" className="mt-0.5" checked={threat} onChange={(e) => setThreat(e.target.checked)} />
          <span>
            Customer threatens a chargeback, bank dispute or lawyer
            <span className="block text-[10px]" style={{ color: "var(--text-dim)" }}>Then the refund is made in full at once (no waiting for approval) and the Owner is informed. Only tick it for a real threat.</span>
          </span>
        </label>
        {order && order.open_disputes?.length > 0 && (
          <div className="mt-2">
            <Notice tone="error">
              This order has an open bank dispute ({order.open_disputes.map((d) => d.status.toLowerCase().replace(/_/g, " ")).join(", ")}). Never refund it: the customer would be paid twice. Handle it on Disputes / Chargebacks.
            </Notice>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2 mt-3">
          <Button variant="primary" onClick={save} disabled={saving || !!order?.open_disputes?.length}>{saving ? "Saving…" : "Log refund"}</Button>
          <Button variant="ghost" onClick={reset}>Clear</Button>
          {saveMsg && <span className="text-[11px]" style={{ color: saveMsg.tone === "success" ? "var(--green)" : "var(--red)" }}>{saveMsg.text}</span>}
        </div>
      </Panel>

      <FilterBar
        right={(() => {
          const n = (st: Stage) => filtered.filter((r) => lifecycle(r).stage === st).length
          const parts: [string, number, string][] = [
            ["refunded", n("done"), "var(--green)"],
            ["not refunded yet", n("todo") + n("partial"), "var(--red)"],
            ["checking", n("check"), "var(--text-muted)"],
            ["can't check", n("unknown"), "var(--text-muted)"],
          ]
          return (
            <span className="text-[10px] flex flex-wrap gap-x-2" style={{ color: "var(--text-dim)" }}>
              <span>{filtered.length} refunds</span>
              {parts.filter(([, c]) => c > 0).map(([l, c, col]) => <span key={l}>· <b style={{ color: col }}>{c}</b> {l}</span>)}
            </span>
          )
        })()}
      >
        <FilterSelect label="Store" options={STORES} value={fStore} onChange={setFStore} />
        <FilterSelect label="Reason" options={REFUND_REASONS.map((r) => ({ value: r.value, label: r.label }))} value={fReason} onChange={setFReason} />
        <FilterSelect label="Type" options={REFUND_TYPES.map((t) => ({ value: t.value, label: t.label }))} value={fType} onChange={setFType} />
        <FilterSelect label="Refunded?" options={STAGES} value={fStage} onChange={setFStage} />
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
                <th className={`${TH} text-right`} title="What ShipGoods charged for the order (products + shipping), in EUR">COGS</th>
                <th className={`${TH} text-right`} title="Full refund: refund + COGS not recovered. Partial refund: the refund itself.">Net loss</th>
                <th className={`${TH} text-left`}>Status</th>
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
                      {r.items.length ? r.items.map((i) => `${i.qty}× ${i.title}${i.variant ? ` (${i.variant})` : ""}`).join(", ") : loss[r.id]?.items.length ? loss[r.id].items.map((i) => `${i.qty}× ${i.title}`).join(", ") : "—"}
                      {(() => {
                        const risk = r.items.map((i) => findRisk(r.store, [i.product_id], i.title)).find(Boolean) || null
                        return <RiskyBadge risk={risk} />
                      })()}
                    </td>
                    <td className={TD}><Badge tone={isFull(r.refund_type) ? "red" : "amber"}>{typeLabel(r.refund_type)}</Badge></td>
                    <td className={TD} style={{ color: "var(--text)" }}>{reasonLabel(r.reason)}</td>
                    <td className={`${TD} text-right tabular-nums`} style={{ color: "var(--text-muted)" }}>{r.percentage != null ? `${r.percentage}%` : "—"}</td>
                    <td className={`${TD} text-right tabular-nums font-medium`} style={{ color: "var(--text)" }}>
                      {money(Number(r.amount), r.currency)}
                      {r.amount_eur != null && r.currency !== "EUR" && <span className="block text-[9px] font-normal" style={{ color: "var(--text-dim)" }}>€{Number(r.amount_eur).toFixed(2)}</span>}
                    </td>
                    <td className={`${TD} text-right tabular-nums`} style={{ color: "var(--text-muted)" }}>
                      {loss[r.id]?.matched ? `€${loss[r.id].cogs_eur.toFixed(2)}` : <span className="text-[9px]" style={{ color: "var(--text-dim)" }}>{loss[r.id] ? "not in ShipGoods" : "—"}</span>}
                    </td>
                    <td className={`${TD} text-right tabular-nums font-medium`} style={{ color: loss[r.id] ? "var(--red)" : "var(--text-dim)" }}>
                      {loss[r.id] ? `€${loss[r.id].net_loss_eur.toFixed(2)}` : "—"}
                    </td>
                    <td className={TD}>
                      {(() => {
                        const st = lifecycle(r)
                        return (
                          <>
                            <Badge tone={st.tone}>{st.label}</Badge>
                            {st.sub && <span className="block text-[9px] mt-0.5" style={{ color: st.stage === "todo" ? (st.tone === "red" ? "var(--red)" : "var(--amber, #f59e0b)") : "var(--text-dim)" }}>{st.sub}</span>}
                          </>
                        )
                      })()}
                    </td>
                  </tr>
                  {openId === r.id && (
                    <tr>
                      <td colSpan={11} className="px-3 pb-3" style={{ background: "rgba(255,255,255,0.015)" }}>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] pt-2" style={{ color: "var(--text-muted)" }}>
                          {r.items.map((i, k) => (
                            <span key={k}>{i.qty}× {i.title}{i.variant ? ` · ${i.variant}` : ""} {i.price ? `@ ${money(i.price, r.currency)}` : ""}</span>
                          ))}
                          {r.order_total != null && <span>Order total {money(Number(r.order_total), r.currency)}</span>}
                          {r.customer_email && <span>{r.customer_email}</span>}
                          {r.logged_by && <span>Logged by {r.logged_by}</span>}
                          {r.conversation_url && <a href={r.conversation_url} target="_blank" rel="noreferrer" className="underline" style={{ color: "var(--accent)" }}>Conversation</a>}
                        </div>
                        {loss[r.id] && (
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] pt-1.5" style={{ color: "var(--text-muted)" }}>
                            {loss[r.id].matched ? (
                              <>
                                <span style={{ color: "var(--text-dim)" }}>ShipGoods order:</span>
                                {loss[r.id].items.map((i, k) => (
                                  <span key={k}>{i.qty}× {i.title} (${i.cost_usd.toFixed(2)})</span>
                                ))}
                                <span>COGS ${loss[r.id].cogs_usd.toFixed(2)} = €{loss[r.id].cogs_eur.toFixed(2)}</span>
                                <span>Shipping ${loss[r.id].shipping_usd.toFixed(2)} = €{loss[r.id].shipping_eur.toFixed(2)}</span>
                                {loss[r.id].recovered_usd > 0 && <span>Recovered from ShipGoods ${loss[r.id].recovered_usd.toFixed(2)}</span>}
                              </>
                            ) : (
                              <span style={{ color: "var(--text-dim)" }}>No ShipGoods order for this refund (not shipped, or not synced yet)</span>
                            )}
                            <span className="font-medium" style={{ color: "var(--red)" }}>
                              Net loss €{loss[r.id].net_loss_eur.toFixed(2)}
                              <span className="font-normal" style={{ color: "var(--text-dim)" }}>
                                {" "}= refund €{loss[r.id].refund_eur.toFixed(2)}
                                {loss[r.id].cogs_counted ? ` + COGS not recovered` : isFull(r.refund_type) ? " (COGS counted on another refund of this order)" : " (partial: customer keeps the item, COGS not counted)"}
                              </span>
                            </span>
                          </div>
                        )}
                        <RefundDetail
                          row={r}
                          by={loggedBy}
                          onChange={(nr) => setRows((x) => x.map((y) => (y.id === nr.id ? nr : y)))}
                          onDelete={() => remove(r.id)}
                        />
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
