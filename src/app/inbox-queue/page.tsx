"use client"
// Inbox Queue: live CommsLayer conversations across the stores, with the CS playbook's urgency
// (P1/P2/P3) and the 2-hour first-reply target. CS adds notes per ticket (order, scenario, owner,
// product complaint) that feed Quality Checks and Risky Products.
import { Fragment, useCallback, useEffect, useMemo, useState } from "react"
import { PageShell } from "@/components/PageShell"
import { FilterBar, PillSelect } from "@/components/PillSelect"
import { FilterSelect, EMPTY_FILTER, passes, type FilterValue } from "@/components/FilterSelect"
import { Panel, Badge, Button, Notice, Loading, EmptyState, TH, TD, ROW_BORDER } from "@/components/ui"
import { withDetails, sortInbox, type InboxRow, type ConvDetails } from "@/lib/commslayer"

type Data = { configured: boolean; rows?: InboxRow[]; resolvedToday?: number; slaHours?: number; errors?: string[]; fetchedAt?: string; pending?: number; contactsPending?: number; retryAfter?: number | null; rateLimited?: boolean; error?: string }
type Contact = { name: string | null; email: string | null }

// Message details and contacts cached in this browser, so a revisit only reads conversations that
// changed (CommsLayer allows 60 calls a minute and each conversation needs its own call).
const LS_MSG = "inbox-queue:details:v1"
const LS_CONTACT = "inbox-queue:contacts:v1"
function readLS<T>(k: string): Record<string, T> {
  try { return JSON.parse(localStorage.getItem(k) || "{}") } catch { return {} }
}
function writeLS(k: string, v: unknown) {
  try { localStorage.setItem(k, JSON.stringify(v)) } catch { /* storage full or blocked: works without it */ }
}
const STORES = ["Susan & Allen", "Carter & Collins", "Walsh & Farley", "LUMEGLASSES", "Blinky"]
const field = { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", color: "var(--text)" }

function ago(iso: string | null) {
  if (!iso) return "—"
  const m = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000))
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 48) return `${h}h ${m % 60}m`
  return `${Math.floor(h / 24)}d`
}
const P_TONE = { P1: "red", P2: "amber", P3: "grey" } as const

export default function InboxQueuePage() {
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [fStore, setFStore] = useState<FilterValue>(EMPTY_FILTER)
  const [fPrio, setFPrio] = useState<FilterValue>(EMPTY_FILTER)
  const [fState, setFState] = useState<FilterValue>({ mode: "include", values: ["waiting"] })
  const [q, setQ] = useState("")
  const [open, setOpen] = useState<string | null>(null)
  const [form, setForm] = useState<Partial<InboxRow>>({})
  const [saving, setSaving] = useState(false)
  const [nextAt, setNextAt] = useState<number | null>(null)
  const [, tick] = useState(0)

  const load = useCallback(async (fresh = false) => {
    setLoading(true)
    setError(null)
    setNextAt(null)
    try {
      const msgCache = readLS<ConvDetails>(LS_MSG)
      const contactCache = readLS<Contact>(LS_CONTACT)
      const known = Object.fromEntries(Object.entries(msgCache).map(([k, v]) => [k, v.at]))
      const r = await fetch("/api/inbox", { method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store", body: JSON.stringify({ fresh, known, knownContacts: Object.keys(contactCache).map(Number) }) })
      const d: Data = await r.json()
      if (d.rateLimited) {
        setError(d.error || "CommsLayer rate limit")
        setNextAt(Date.now() + (d.retryAfter || 60) * 1000)
      } else if (!r.ok) {
        throw new Error(d.error || `HTTP ${r.status}`)
      } else {
        const keep: Record<string, ConvDetails> = {}
        const keepContacts: Record<string, Contact> = {}
        const rows = (d.rows || []).map((row) => {
          if (row.msg) keep[row.key] = row.msg
          else if (row.details === "known" && msgCache[row.key]) keep[row.key] = msgCache[row.key]
          if (row.contact_loaded) keepContacts[row.contact_id] = { name: row.customer, email: row.email }
          else if (contactCache[row.contact_id]) keepContacts[row.contact_id] = contactCache[row.contact_id]
          const cached = row.details === "known" ? msgCache[row.key] || null : null
          return withDetails(row, cached, row.contact_loaded ? null : contactCache[row.contact_id])
        })
        writeLS(LS_MSG, keep)
        writeLS(LS_CONTACT, keepContacts)
        setData({ ...d, rows: sortInbox(rows) })
        if ((d.pending || d.contactsPending) && d.retryAfter) setNextAt(Date.now() + d.retryAfter * 1000 + 1000)
      }
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])
  // Next batch once CommsLayer's minute is up; a 1s tick keeps the countdown current
  useEffect(() => {
    if (!nextAt) return
    const t = setTimeout(() => load(), Math.max(0, nextAt - Date.now()))
    const i = setInterval(() => tick((n) => n + 1), 1000)
    return () => { clearTimeout(t); clearInterval(i) }
  }, [nextAt, load])

  const rows = useMemo(() => data?.rows || [], [data])
  const stateOf = (r: InboxRow) => (r.waiting_on_us ? "waiting" : r.status !== "open" ? "pending" : r.details === "pending" ? "unchecked" : "replied")
  const shown = rows.filter((r) =>
    passes(fStore, r.store || "Unknown") && passes(fPrio, r.priority) && passes(fState, stateOf(r)) &&
    (!q || [r.subject, r.customer, r.email, r.order_number, String(r.display_id)].some((x) => x?.toLowerCase().includes(q.toLowerCase()))))
  const waiting = rows.filter((r) => r.waiting_on_us)
  const breached = rows.filter((r) => r.sla_breached)
  const p1 = rows.filter((r) => r.priority === "P1" && r.status !== "resolved")
  const waits = waiting.map((r) => Date.now() - Date.parse(r.waiting_since!)).sort((a, b) => a - b)
  const medianWait = waits.length ? waits[Math.floor(waits.length / 2)] : null

  const openRow = (r: InboxRow) => {
    setOpen(open === r.key ? null : r.key)
    setForm({ store: r.store, order_number: r.order_number, scenario: r.scenario, priority: r.priority_source === "manual" ? r.priority : undefined, owner: r.owner, product_title: r.product_title, complaint: r.complaint, note: r.note })
  }
  const save = async (r: InboxRow) => {
    setSaving(true)
    await fetch("/api/inbox", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ account_id: r.account_id, conversation_id: r.id, display_id: r.display_id, ...form }) })
    setSaving(false)
    setOpen(null)
    load(true)
  }

  if (data && !data.configured) {
    return (
      <PageShell title="Inbox Queue" breadcrumb="Customer Service → Inbox Queue" description="Live CommsLayer conversations across the stores, with urgency and the 2-hour first-reply target.">
        <Panel title="Connect CommsLayer" sub="One-time setup. The page fills in by itself once the token is saved.">
          <ol className="list-decimal pl-5 space-y-1.5 text-[11px]" style={{ color: "var(--text-muted)" }}>
            <li>In CommsLayer go to <b>Settings → Integration tokens</b> and create a token named &quot;pnl-dashboard&quot;. (The API is on the Plus plan.)</li>
            <li>Give it these read scopes: <b>conversations:read, messages:read, contacts:read, reports:read</b>. Nothing with &quot;write&quot;.</li>
            <li>Copy the token. In Vercel → pnl-dashboard → Settings → Environment Variables, add <b>COMMSLAYER_TOKEN</b> with the token as value (Production), save and redeploy.</li>
            <li>Several CommsLayer accounts (one per store)? Add one variable per account: COMMSLAYER_TOKEN_SA, COMMSLAYER_TOKEN_CC, COMMSLAYER_TOKEN_WF…</li>
          </ol>
          <div className="mt-3 text-[10px]" style={{ color: "var(--text-dim)" }}>The dashboard only reads conversations; it never sends or changes anything in CommsLayer.</div>
        </Panel>
      </PageShell>
    )
  }

  return (
    <PageShell
      title="Inbox Queue"
      breadcrumb="Customer Service → Inbox Queue"
      description={`Live CommsLayer conversations across the stores. Waiting = the customer wrote last and we haven't replied. Target: first reply within ${data?.slaHours ?? 2} hours (CS playbook internal standard; the websites say 24 hours). P1/P2/P3 follow the playbook's urgency rules.`}
      actions={<Button onClick={() => load(true)} disabled={loading}>{loading ? "Refreshing…" : "Refresh"}</Button>}
      stats={[
        { label: "Open tickets", value: data ? String(rows.filter((r) => r.status === "open").length) : "—", sub: `${rows.filter((r) => r.status !== "open").length} pending` },
        { label: "Waiting on us", value: data ? String(waiting.length) : "—", sub: medianWait != null ? `median wait ${ago(new Date(Date.now() - medianWait).toISOString())}` : "" },
        { label: "SLA breached", value: data ? String(breached.length) : "—", sub: `waiting over ${data?.slaHours ?? 2}h`, color: breached.length ? "var(--red)" : undefined },
        { label: "P1 open", value: data ? String(p1.length) : "—", sub: "dispute, legal, AMEX", color: p1.length ? "var(--red)" : undefined },
        { label: "Resolved today", value: data ? String(data.resolvedToday ?? 0) : "—" },
      ]}
    >
      {error && <Notice tone="error">Couldn&apos;t load the inbox: {error}.</Notice>}
      {data?.errors?.length ? <Notice tone="warning">Some data is missing: {data.errors.join(" · ")}</Notice> : null}
      {data?.configured && (data.pending || data.contactsPending) ? (
        <Notice tone="info">
          Reading messages: {data.pending ? `${data.pending} of ${rows.length} conversations not checked yet` : "all conversations checked"}{data.contactsPending ? `, ${data.contactsPending} customer names to load` : ""}. CommsLayer allows 60 calls a minute, so the rest loads in batches{nextAt ? `; next batch in ${Math.max(0, Math.ceil((nextAt - Date.now()) / 1000))}s` : ""}. &quot;Waiting on us&quot; counts only checked conversations until then. This browser remembers them, so next time only changed conversations are read.
        </Notice>
      ) : null}

      <FilterBar right={<input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search customer, order, subject…" className="px-2.5 py-1 rounded-lg text-[10px] w-56 outline-none" style={field} />}>
        <FilterSelect label="Store" options={Array.from(new Set(rows.map((r) => r.store || "Unknown"))).map((s) => ({ value: s, count: rows.filter((r) => (r.store || "Unknown") === s).length }))} value={fStore} onChange={setFStore} />
        <FilterSelect label="Priority" options={(["P1", "P2", "P3"] as const).map((p) => ({ value: p, count: rows.filter((r) => r.priority === p).length }))} value={fPrio} onChange={setFPrio} />
        <FilterSelect label="State" options={[
          { value: "waiting", label: "Waiting on us", count: waiting.length },
          { value: "replied", label: "Replied, open", count: rows.filter((r) => stateOf(r) === "replied").length },
          { value: "pending", label: "Pending / snoozed", count: rows.filter((r) => stateOf(r) === "pending").length },
          ...(rows.some((r) => stateOf(r) === "unchecked") ? [{ value: "unchecked", label: "Not checked yet", count: rows.filter((r) => stateOf(r) === "unchecked").length }] : []),
        ]} value={fState} onChange={setFState} />
      </FilterBar>

      {!data && !error && <Loading>Loading CommsLayer conversations…</Loading>}
      {data && shown.length === 0 && <EmptyState title={rows.length ? "Nothing in this view" : "Inbox zero"}>{rows.length ? "Change the filters to see other tickets." : "No open or pending conversations in CommsLayer."}</EmptyState>}
      {data && shown.length > 0 && (
        <Panel pad={false} className="mb-4">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead><tr style={{ color: "var(--text-dim)" }}>
                <th className={`${TH} text-left`}>#</th><th className={`${TH} text-left`}>Customer</th><th className={`${TH} text-left`}>Subject</th><th className={`${TH} text-left`}>Store</th><th className={`${TH} text-left`}>Priority</th><th className={`${TH} text-right`}>Waiting</th><th className={`${TH} text-left`}>Owner</th>
              </tr></thead>
              <tbody>
                {shown.map((r) => (
                  <Fragment key={r.key}>
                    <tr style={ROW_BORDER} className="cursor-pointer hover:bg-white/[0.02]" onClick={() => openRow(r)}>
                      <td className={`${TD} whitespace-nowrap`}><a href={r.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="underline" style={{ color: "#a5b4fc" }}>#{r.display_id}</a></td>
                      <td className={TD}><div style={{ color: "var(--text)" }}>{r.customer || "—"}</div><div className="text-[9px]" style={{ color: "var(--text-dim)" }}>{r.email}</div></td>
                      <td className={TD}>
                        <div className="max-w-[360px] truncate" style={{ color: "var(--text)" }} title={r.last_customer_message}>{r.subject}</div>
                        <div className="flex flex-wrap gap-1 mt-0.5">
                          {r.reason && <Badge tone="blue">{r.reason}</Badge>}
                          {r.labels.slice(0, 3).map((l) => <Badge key={l}>{l}</Badge>)}
                          {r.order_number && <Badge tone="accent">{r.order_number}</Badge>}
                          {r.complaint && <Badge tone="red">Product complaint</Badge>}
                        </div>
                      </td>
                      <td className={`${TD} text-[10px] whitespace-nowrap`} style={{ color: "var(--text-muted)" }}>{r.store || r.inbox}</td>
                      <td className={TD}><Badge tone={P_TONE[r.priority]}>{r.priority}{r.priority_source === "manual" ? " ·set" : ""}</Badge></td>
                      <td className={`${TD} text-right tabular-nums whitespace-nowrap`} style={{ color: r.sla_breached ? "var(--red)" : r.waiting_on_us ? "#fbbf24" : "var(--text-dim)" }}>{r.waiting_on_us ? ago(r.waiting_since) : r.details === "pending" ? "checking…" : r.status === "open" ? "replied" : r.status}</td>
                      <td className={`${TD} text-[10px]`} style={{ color: "var(--text-muted)" }}>{r.owner || "—"}</td>
                    </tr>
                    {open === r.key && (
                      <tr><td colSpan={7} className="px-3 pb-3 text-[11px]" style={{ color: "var(--text-muted)" }}>
                        {r.last_customer_message && <div className="mb-2 p-2 rounded-lg text-[11px]" style={{ background: "rgba(255,255,255,0.03)" }}>Customer: “{r.last_customer_message}”</div>}
                        <div className="grid gap-2 sm:grid-cols-3 mb-2">
                          <PillSelect label="Store" value={form.store || ""} onChange={(v) => setForm({ ...form, store: v || null })} options={[{ value: "", label: "auto" }, ...STORES.map((s) => ({ value: s }))]} fullWidth />
                          <PillSelect label="Priority" value={form.priority || ""} onChange={(v) => setForm({ ...form, priority: (v || undefined) as InboxRow["priority"] })} options={[{ value: "", label: `auto (${r.priority_source === "rule" ? r.priority : "rule"})` }, { value: "P1", label: "P1 now" }, { value: "P2", label: "P2 same shift" }, { value: "P3", label: "P3" }]} fullWidth />
                          <input value={form.owner || ""} onChange={(e) => setForm({ ...form, owner: e.target.value })} placeholder="Owner" className="px-2 py-1 rounded-md text-[11px]" style={field} />
                          <input value={form.order_number || ""} onChange={(e) => setForm({ ...form, order_number: e.target.value })} placeholder="Order number (#1042)" className="px-2 py-1 rounded-md text-[11px]" style={field} />
                          <input value={form.scenario || ""} onChange={(e) => setForm({ ...form, scenario: e.target.value })} placeholder="Playbook scenario (e.g. D6, E4)" className="px-2 py-1 rounded-md text-[11px]" style={field} />
                          <input value={form.product_title || ""} onChange={(e) => setForm({ ...form, product_title: e.target.value })} placeholder="Product (as on the order)" className="px-2 py-1 rounded-md text-[11px]" style={field} />
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <label className="flex items-center gap-1.5 text-[11px]"><input type="checkbox" checked={!!form.complaint} onChange={(e) => setForm({ ...form, complaint: e.target.checked })} /> Product complaint (counts for Risky Products / Quality Checks)</label>
                          <input value={form.note || ""} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Note" className="px-2 py-1 rounded-md text-[11px] flex-1 min-w-[200px]" style={field} />
                          <Button size="sm" variant="primary" disabled={saving || (!!form.complaint && (!form.product_title || !(form.store || r.store)))} onClick={() => save(r)}>{saving ? "Saving…" : "Save"}</Button>
                          <Button size="sm" variant="ghost" onClick={() => setOpen(null)}>Close</Button>
                        </div>
                        {r.priority === "P1" && <div className="mt-2 text-[10px]" style={{ color: "var(--red)" }}>P1: check Disputes / Chargebacks first. Never refund while a chargeback is open; the CS Manager owns it (playbook 1.5 / E4–E5).</div>}
                      </td></tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
      {data?.fetchedAt && <div className="text-[10px]" style={{ color: "var(--text-dim)" }}>From CommsLayer, {new Date(data.fetchedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}. Priority by rule: P1 = chargeback, dispute, bank, legal or AMEX; P2 = cancel/address change, not received, wrong, missing or defective item; P3 = the rest (CS playbook section 2). Set it by hand per ticket when the rule is wrong.</div>}
    </PageShell>
  )
}
