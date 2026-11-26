"use client"
// Customer Service → Store Credit: a log of store credits given instead of a refund.
// Issue the credit (gift card / code) in Shopify, then log it here.
import { useCallback, useEffect, useRef, useState } from "react"
import { PageShell } from "@/components/PageShell"
import { RefundSheetsBar, type SheetSync } from "@/components/RefundSheetsBar"
import { PillSelect, FilterBar } from "@/components/PillSelect"
import { FilterSelect, EMPTY_FILTER, passes, type FilterValue } from "@/components/FilterSelect"
import { SingleDatePicker } from "@/components/SingleDatePicker"
import { Panel, Button, Notice, Loading, EmptyState, TH, TD, ROW_BORDER } from "@/components/ui"
import { SHOPIFY_STORES } from "@/lib/constants"
import { STORE_CURRENCY } from "@/lib/currency"
import { REFUND_REASONS, GOODWILL_LADDER, reasonLabel, money, type CsStoreCredit } from "@/lib/cs-log"

const STORES = Object.keys(SHOPIFY_STORES)
const inputCls = "w-full rounded-lg px-3 py-1.5 text-[11px] outline-none"
const inputStyle = { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", color: "var(--text)" }
const today = () => new Date().toISOString().slice(0, 10)
const fmtDay = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div>
      <span className="block text-[10px] mb-1" style={{ color: "var(--text-dim)" }}>{label}</span>
      {children}
      {hint && <span className="block text-[9px] mt-1" style={{ color: "var(--text-dim)" }}>{hint}</span>}
    </div>
  )
}

export default function StoreCreditPage() {
  // Store credits CS writes in the refund sheets (reason "Store credit") come in with the sheet sync
  const [sheetSync, setSheetSync] = useState<SheetSync>(null)
  const [syncing, setSyncing] = useState(false)
  const syncSheets = async () => {
    setSyncing(true)
    const res = await fetch("/api/refund-check", { method: "POST" }).catch(() => null)
    const j = res ? await res.json().catch(() => null) : null
    if (j?.sheets) setSheetSync(j.sheets)
    setSyncing(false)
    reloadRef.current?.()
  }
  const reloadRef = useRef<(() => void) | null>(null)
  const [rows, setRows] = useState<CsStoreCredit[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [store, setStore] = useState("")
  const [date, setDate] = useState(today())
  const [orderNo, setOrderNo] = useState("")
  const [email, setEmail] = useState("")
  const [amount, setAmount] = useState("")
  const [pct, setPct] = useState("")
  const [reason, setReason] = useState("goodwill")
  const [note, setNote] = useState("")
  const [code, setCode] = useState("")
  const [convo, setConvo] = useState("")
  const [loggedBy, setLoggedBy] = useState("")
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState<{ tone: "success" | "error"; text: string } | null>(null)

  const [fStore, setFStore] = useState<FilterValue>(EMPTY_FILTER)
  const [fStatus, setFStatus] = useState<FilterValue>(EMPTY_FILTER)

  const currency = (store && STORE_CURRENCY[store]) || "EUR"

  const load = useCallback(() => {
    setLoading(true)
    fetch("/api/cs-log?kind=credit", { cache: "no-store" })
      .then(async (r) => {
        const j = await r.json()
        if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`)
        setRows(j.rows)
        setLoadError(null)
      })
      .catch((e: unknown) => setLoadError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false))
  }, [])
  reloadRef.current = load

  useEffect(() => {
    load()
    try {
      setLoggedBy(localStorage.getItem("cs:name") || "")
    } catch {
      // optional
    }
  }, [load])

  const reset = () => {
    setOrderNo("")
    setEmail("")
    setAmount("")
    setPct("")
    setReason("goodwill")
    setNote("")
    setCode("")
    setConvo("")
    setDate(today())
  }

  const save = async () => {
    setSaveMsg(null)
    setSaving(true)
    try {
      try {
        localStorage.setItem("cs:name", loggedBy)
      } catch {
        // optional
      }
      const r = await fetch("/api/cs-log?kind=credit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ store, issue_date: date, order_number: orderNo, customer_email: email, amount, currency, percentage: pct, reason, reason_note: note, code, conversation_url: convo, logged_by: loggedBy }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`)
      setRows((x) => [j.row, ...x])
      setSaveMsg({ tone: "success", text: `Logged ${money(Number(j.row.amount), j.row.currency)} store credit${j.row.order_number ? ` for ${j.row.order_number}` : ""}.` })
      reset()
    } catch (e: unknown) {
      setSaveMsg({ tone: "error", text: `Couldn't save the store credit: ${e instanceof Error ? e.message : String(e)}` })
    } finally {
      setSaving(false)
    }
  }

  const setStatus = async (id: number, status: CsStoreCredit["status"]) => {
    const r = await fetch(`/api/cs-log?kind=credit&id=${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) })
    const j = await r.json()
    if (r.ok) setRows((x) => x.map((y) => (y.id === id ? j.row : y)))
  }
  const remove = async (id: number) => {
    const r = await fetch(`/api/cs-log?kind=credit&id=${id}`, { method: "DELETE" })
    if (r.ok) setRows((x) => x.filter((y) => y.id !== id))
  }

  const filtered = rows.filter((r) => passes(fStore, r.store) && passes(fStatus, r.status))
  const since = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)
  const sumBy = (list: CsStoreCredit[]) =>
    Object.entries(list.reduce<Record<string, number>>((a, r) => ({ ...a, [r.currency]: (a[r.currency] || 0) + Number(r.amount) }), {}))
      .map(([c, v]) => money(v, c))
      .join(" · ") || "—"
  const open = rows.filter((r) => r.status === "issued")

  return (
    <PageShell
      title="Store Credit"
      breadcrumb="Customer Service → Store Credit"
      description="A log of store credits given instead of a refund. Create the credit in Shopify, then log it here."
      stats={[
        { label: "Logged (30d)", value: loading ? "—" : String(rows.filter((r) => r.issue_date >= since).length) },
        { label: "Value issued (30d)", value: loading ? "—" : sumBy(rows.filter((r) => r.issue_date >= since)) },
        { label: "Not used yet", value: loading ? "—" : String(open.length), sub: loading ? undefined : sumBy(open) },
        { label: "Used", value: loading ? "—" : String(rows.filter((r) => r.status === "used").length) },
      ]}
    >
      <RefundSheetsBar result={sheetSync} syncing={syncing} onSync={syncSheets} />
      {loadError && <Notice tone="error">Couldn&apos;t load the store credit log: {loadError}</Notice>}

      <Panel title="Log a store credit" sub="Goodwill ladder: 60% → 80% → 100% store credit (or 10 / 20 / 30% refund). The customer picks one per stage." className="mb-4">
        <div className="grid gap-3 md:grid-cols-4 mb-3">
          <Field label="Store">
            <PillSelect fullWidth value={store} onChange={setStore} options={STORES} placeholder="Pick store" />
          </Field>
          <Field label="Date">
            <SingleDatePicker value={date} onChange={setDate} allowEmpty={false} fullWidth align="left" />
          </Field>
          <Field label="Order number">
            <input value={orderNo} onChange={(e) => setOrderNo(e.target.value)} className={inputCls} style={inputStyle} placeholder="#1042" />
          </Field>
          <Field label="Customer email">
            <input value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} style={inputStyle} placeholder="name@email.com" />
          </Field>
        </div>
        <div className="grid gap-3 md:grid-cols-4 mb-3">
          <Field label="Reason">
            <PillSelect fullWidth value={reason} onChange={setReason} options={REFUND_REASONS.map((r) => ({ value: r.value, label: r.label }))} />
          </Field>
          <Field label="Percentage of purchase">
            <div className="flex gap-1.5">
              <input value={pct} onChange={(e) => setPct(e.target.value)} className={inputCls} style={inputStyle} inputMode="decimal" placeholder="%" />
              {GOODWILL_LADDER.map((g) => (
                <Button key={g.stage} size="sm" variant={pct === String(g.creditPct) ? "primary" : "secondary"} onClick={() => setPct(String(g.creditPct))}>
                  {g.creditPct}%
                </Button>
              ))}
            </div>
          </Field>
          <Field label={`Credit amount (${currency})`}>
            <input value={amount} onChange={(e) => setAmount(e.target.value)} className={inputCls} style={inputStyle} inputMode="decimal" />
          </Field>
          <Field label="Gift card / code">
            <input value={code} onChange={(e) => setCode(e.target.value)} className={inputCls} style={inputStyle} placeholder="Optional" />
          </Field>
        </div>
        <div className="grid gap-3 md:grid-cols-4">
          <div className="md:col-span-2">
            <Field label="CommsLayer conversation">
              <input value={convo} onChange={(e) => setConvo(e.target.value)} className={inputCls} style={inputStyle} placeholder="Paste the conversation link" />
            </Field>
          </div>
          <Field label="Note (optional)">
            <input value={note} onChange={(e) => setNote(e.target.value)} className={inputCls} style={inputStyle} />
          </Field>
          <Field label="Logged by">
            <input value={loggedBy} onChange={(e) => setLoggedBy(e.target.value)} className={inputCls} style={inputStyle} placeholder="Your name" />
          </Field>
        </div>
        <div className="flex flex-wrap items-center gap-2 mt-3">
          <Button variant="primary" onClick={save} disabled={saving}>{saving ? "Saving…" : "Log store credit"}</Button>
          <Button variant="ghost" onClick={reset}>Clear</Button>
          {saveMsg && <span className="text-[11px]" style={{ color: saveMsg.tone === "success" ? "var(--green)" : "var(--red)" }}>{saveMsg.text}</span>}
        </div>
      </Panel>

      <FilterBar right={<span className="text-[10px]" style={{ color: "var(--text-dim)" }}>{filtered.length} credits</span>}>
        <FilterSelect label="Store" options={STORES} value={fStore} onChange={setFStore} />
        <FilterSelect label="Status" options={[{ value: "issued", label: "Not used yet" }, { value: "used", label: "Used" }, { value: "expired", label: "Expired" }]} value={fStatus} onChange={setFStatus} />
      </FilterBar>

      {loading && rows.length === 0 ? (
        <Loading>Loading store credits…</Loading>
      ) : filtered.length === 0 ? (
        <EmptyState title={rows.length ? "No store credits match these filters" : "No store credits logged yet"}>
          {rows.length ? "Clear a filter to see more." : "Log the first one with the form above."}
        </EmptyState>
      ) : (
        <Panel pad={false}>
          <table className="w-full">
            <thead>
              <tr style={{ color: "var(--text-dim)" }}>
                <th className={`${TH} text-left`}>Date</th>
                <th className={`${TH} text-left`}>Store</th>
                <th className={`${TH} text-left`}>Order</th>
                <th className={`${TH} text-left`}>Customer</th>
                <th className={`${TH} text-left`}>Reason</th>
                <th className={`${TH} text-right`}>%</th>
                <th className={`${TH} text-right`}>Amount</th>
                <th className={`${TH} text-left`}>Code</th>
                <th className={`${TH} text-left`}>Status</th>
                <th className={`${TH} text-right`}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} style={ROW_BORDER}>
                  <td className={TD} style={{ color: "var(--text)" }}>{fmtDay(r.issue_date)}</td>
                  <td className={`${TD} text-[10px]`} style={{ color: "var(--text-muted)" }}>{r.store}</td>
                  <td className={TD} style={{ color: "var(--text)" }}>{r.order_number || "—"}</td>
                  <td className={`${TD} text-[10px]`} style={{ color: "var(--text-muted)" }}>{r.customer_email || "—"}</td>
                  <td className={TD} style={{ color: "var(--text)" }} title={r.reason_note || undefined}>{reasonLabel(r.reason)}</td>
                  <td className={`${TD} text-right tabular-nums`} style={{ color: "var(--text-muted)" }}>{r.percentage != null ? `${r.percentage}%` : "—"}</td>
                  <td className={`${TD} text-right tabular-nums font-medium`} style={{ color: "var(--text)" }}>{money(Number(r.amount), r.currency)}</td>
                  <td className={`${TD} text-[10px]`} style={{ color: "var(--text-muted)" }}>{r.code || "—"}</td>
                  <td className={TD}>
                    <PillSelect
                      value={r.status}
                      onChange={(v) => setStatus(r.id, v as CsStoreCredit["status"])}
                      options={[{ value: "issued", label: "Not used yet" }, { value: "used", label: "Used" }, { value: "expired", label: "Expired" }]}
                    />
                  </td>
                  <td className={`${TD} text-right whitespace-nowrap`}>
                    {r.conversation_url && (
                      <a href={r.conversation_url} target="_blank" rel="noreferrer" className="underline text-[10px] mr-2" style={{ color: "var(--accent)" }}>Conversation</a>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => remove(r.id)}>Delete</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}
    </PageShell>
  )
}
