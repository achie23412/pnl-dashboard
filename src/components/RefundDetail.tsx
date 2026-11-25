"use client"
// One logged refund opened: edit it (every change is kept with who did it),
// see the history, and add photos or a PDF as evidence.
import { useEffect, useState } from "react"
import { PillSelect } from "@/components/PillSelect"
import { Badge, Button, SectionLabel } from "@/components/ui"
import { REFUND_REASONS, REFUND_TYPES, reasonLabel, money, type CsRefund, type RefundHistory } from "@/lib/cs-log"

const inputCls = "w-full rounded-lg px-3 py-1.5 text-[11px] outline-none"
const inputStyle = { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", color: "var(--text)" }
const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
const FIELD_LABEL: Record<string, string> = {
  refund_date: "date",
  refund_type: "type",
  reason: "reason",
  reason_note: "note",
  percentage: "%",
  amount: "amount",
  conversation_url: "conversation",
  threat: "threat",
  approval_status: "approval",
}
const show = (k: string, v: unknown) => (v == null || v === "" ? "—" : k === "reason" ? reasonLabel(String(v)) : String(v))

export function RefundDetail({ row, by, onChange, onDelete }: { row: CsRefund; by: string; onChange: (r: CsRefund) => void; onDelete: () => void }) {
  const [form, setForm] = useState({
    refund_date: row.refund_date,
    refund_type: row.refund_type,
    reason: row.reason,
    reason_note: row.reason_note || "",
    percentage: row.percentage != null ? String(row.percentage) : "",
    amount: String(row.amount),
    conversation_url: row.conversation_url || "",
    threat: row.threat,
  })
  const [history, setHistory] = useState<RefundHistory[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const loadHistory = () =>
    fetch(`/api/cs-log?kind=refund&history=${row.id}`)
      .then((r) => r.json())
      .then((j) => setHistory(j.history || []))
      .catch(() => setHistory([]))
  useEffect(() => {
    loadHistory()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row.id])

  const save = async () => {
    setBusy(true)
    setMsg(null)
    const r = await fetch(`/api/cs-log?kind=refund&id=${row.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "edit", by, ...form }),
    })
    const j = await r.json()
    setBusy(false)
    if (!r.ok) return setMsg({ ok: false, text: j.error || "Couldn't save." })
    onChange(j.row)
    setMsg({ ok: true, text: j.row.approval_status === "waiting" && row.approval_status !== "waiting" ? "Saved. Above €100 now: wait for the Owner before refunding more." : "Saved." })
    loadHistory()
  }

  const upload = async (file: File) => {
    setBusy(true)
    setMsg(null)
    const fd = new FormData()
    fd.set("refund_id", String(row.id))
    fd.set("file", file)
    fd.set("by", by)
    const r = await fetch("/api/cs-evidence", { method: "POST", body: fd })
    const j = await r.json()
    setBusy(false)
    if (!r.ok) return setMsg({ ok: false, text: j.error || "Upload failed." })
    onChange(j.row)
    loadHistory()
  }

  const removeFile = async (path: string) => {
    const r = await fetch(`/api/cs-evidence?refund_id=${row.id}&path=${encodeURIComponent(path)}&by=${encodeURIComponent(by)}`, { method: "DELETE" })
    const j = await r.json()
    if (r.ok && j.row) onChange(j.row)
    loadHistory()
  }

  return (
    <div className="grid gap-4 lg:grid-cols-3 py-2">
      <div className="lg:col-span-2">
        <SectionLabel>Edit</SectionLabel>
        <div className="grid gap-2 md:grid-cols-4">
          <input type="date" value={form.refund_date} onChange={(e) => setForm({ ...form, refund_date: e.target.value })} className={inputCls} style={inputStyle} />
          <PillSelect fullWidth value={form.refund_type} onChange={(v) => setForm({ ...form, refund_type: v as CsRefund["refund_type"] })} options={REFUND_TYPES.map((t) => ({ value: t.value, label: t.label }))} />
          <PillSelect fullWidth value={form.reason} onChange={(v) => setForm({ ...form, reason: v })} options={REFUND_REASONS.map((r) => ({ value: r.value, label: r.label }))} />
          <div className="flex gap-1.5">
            <input value={form.percentage} onChange={(e) => setForm({ ...form, percentage: e.target.value })} className={inputCls} style={inputStyle} placeholder="%" inputMode="decimal" />
            <input value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className={inputCls} style={inputStyle} placeholder={row.currency} inputMode="decimal" />
          </div>
          <input value={form.conversation_url} onChange={(e) => setForm({ ...form, conversation_url: e.target.value })} className={`${inputCls} md:col-span-2`} style={inputStyle} placeholder="CommsLayer conversation link" />
          <input value={form.reason_note} onChange={(e) => setForm({ ...form, reason_note: e.target.value })} className={`${inputCls} md:col-span-2`} style={inputStyle} placeholder="Note" />
        </div>
        <label className="flex items-center gap-2 mt-2 text-[10px]" style={{ color: "var(--text-muted)" }}>
          <input type="checkbox" checked={form.threat} onChange={(e) => setForm({ ...form, threat: e.target.checked })} />
          Customer threatens a chargeback, bank dispute or lawyer
        </label>
        <div className="flex flex-wrap items-center gap-2 mt-3">
          <Button variant="primary" size="sm" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save changes"}</Button>
          <Button variant="danger" size="sm" onClick={onDelete}>Delete</Button>
          {msg && <span className="text-[10px]" style={{ color: msg.ok ? "var(--green)" : "var(--red)" }}>{msg.text}</span>}
        </div>

        <div className="mt-4">
          <SectionLabel>Evidence</SectionLabel>
          <div className="flex flex-wrap items-center gap-2">
            {row.attachments.map((a) => (
              <span key={a.path} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[10px]" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                <a href={`/api/cs-evidence?path=${encodeURIComponent(a.path)}`} target="_blank" rel="noreferrer" className="underline" style={{ color: "var(--accent)" }}>{a.name}</a>
                <span style={{ color: "var(--text-dim)" }}>{Math.round(a.size / 1024)} KB</span>
                <button type="button" onClick={() => removeFile(a.path)} style={{ color: "var(--text-dim)" }} title="Remove">×</button>
              </span>
            ))}
            <label className="text-[10px] underline cursor-pointer" style={{ color: "var(--text-muted)" }}>
              + Add photo or PDF (max 4 MB)
              <input type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
            </label>
          </div>
        </div>
      </div>

      <div>
        <SectionLabel>Shopify</SectionLabel>
        <div className="text-[10px] space-y-0.5 mb-3" style={{ color: "var(--text-muted)" }}>
          <div>Logged: {money(Number(row.amount), row.currency)}{row.amount_eur != null && row.currency !== "EUR" ? ` (€${Number(row.amount_eur).toFixed(2)})` : ""}</div>
          <div>Refunded in Shopify: {row.shopify_refunded != null ? money(Number(row.shopify_refunded), row.currency) : "not checked yet"}{row.shopify_refunded_at ? ` · ${when(row.shopify_refunded_at)}` : ""}</div>
          {row.shopify_checked_at && <div style={{ color: "var(--text-dim)" }}>Last checked {when(row.shopify_checked_at)}</div>}
          {row.approved_by && <div>{row.approval_status === "rejected" ? "Rejected" : "Approved"} by {row.approved_by}{row.approved_at ? ` · ${when(row.approved_at)}` : ""}</div>}
        </div>
        <SectionLabel>History</SectionLabel>
        {history == null ? (
          <div className="text-[10px]" style={{ color: "var(--text-dim)" }}>Loading…</div>
        ) : history.length === 0 ? (
          <div className="text-[10px]" style={{ color: "var(--text-dim)" }}>No changes yet.</div>
        ) : (
          <div className="space-y-1.5 max-h-[220px] overflow-y-auto">
            {history.map((h) => (
              <div key={h.id} className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                <span style={{ color: "var(--text)" }}>{h.changed_by || "someone"}</span> · {h.action.replace(/_/g, " ")} · <span style={{ color: "var(--text-dim)" }}>{when(h.changed_at)}</span>
                {h.action === "edited" && (
                  <div style={{ color: "var(--text-dim)" }}>
                    {Object.entries(h.changes as Record<string, { from: unknown; to: unknown }>).map(([k, v]) => (
                      <div key={k}>{FIELD_LABEL[k] || k}: {show(k, v?.from)} → {show(k, v?.to)}</div>
                    ))}
                  </div>
                )}
                {(h.action === "evidence_added" || h.action === "evidence_removed") && <div style={{ color: "var(--text-dim)" }}>{String((h.changes as { file?: string }).file || "")}</div>}
              </div>
            ))}
          </div>
        )}
        {row.threat && <div className="mt-2"><Badge tone="red">Threat: refunded in full at once</Badge></div>}
      </div>
    </div>
  )
}
