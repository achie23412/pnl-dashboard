"use client"
// Evidence pack for one chargeback: what Shopify proves (payment checks, delivery, customer history),
// the draft texts to edit, and "Save to Shopify", which fills the evidence form without submitting.
import { useState } from "react"
import { Badge, Button, Notice } from "@/components/ui"
import type { EvidencePack } from "@/lib/dispute-evidence"

const FIELD_LABELS: { key: "uncategorizedText" | "accessActivityLog" | "refundRefusalExplanation" | "refundPolicyDisclosure"; label: string; rows: number }[] = [
  { key: "uncategorizedText", label: "Rebuttal letter (main evidence text)", rows: 12 },
  { key: "accessActivityLog", label: "Activity log (order, payment, shipping scans)", rows: 7 },
  { key: "refundRefusalExplanation", label: "Why no refund was given", rows: 2 },
  { key: "refundPolicyDisclosure", label: "Refund policy disclosure", rows: 2 },
]
const box = { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", color: "var(--text)" }

export function DisputeEvidence({ store, disputeId }: { store: string; disputeId: string }) {
  const [pack, setPack] = useState<EvidencePack | null>(null)
  const [fields, setFields] = useState<EvidencePack["fields"] | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ tone: "error" | "success" | "info"; text: string } | null>(null)

  const build = async () => {
    setBusy(true); setMsg(null)
    try {
      const r = await fetch(`/api/disputes/evidence?store=${encodeURIComponent(store)}&id=${encodeURIComponent(disputeId)}`, { cache: "no-store" })
      const j = await r.json()
      if (!r.ok || j.error) throw new Error(j.error || `HTTP ${r.status}`)
      setPack(j); setFields(j.fields)
    } catch (e) { setMsg({ tone: "error", text: e instanceof Error ? e.message : String(e) }) }
    setBusy(false)
  }
  const save = async () => {
    if (!pack || !fields) return
    setBusy(true); setMsg(null)
    const r = await fetch("/api/disputes/evidence", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ store, id: pack.disputeId, fields }) })
    const j = await r.json().catch(() => ({}))
    setMsg(j.ok ? { tone: "success", text: "Saved in Shopify's evidence form. Open the order in Shopify, check it and click Submit response before the deadline." } : { tone: "error", text: j.error || `HTTP ${r.status}` })
    setBusy(false)
  }
  const copyAll = () => {
    if (!fields) return
    navigator.clipboard?.writeText(FIELD_LABELS.map((f) => `${f.label}\n${fields[f.key]}`).join("\n\n"))
    setMsg({ tone: "info", text: "Copied. Paste it into the evidence fields in Shopify." })
  }

  if (!pack || !fields) return (
    <div className="mb-2">
      <Button size="sm" variant="primary" onClick={build} disabled={busy}>{busy ? "Collecting evidence…" : "Build evidence pack"}</Button>
      <span className="ml-2 text-[10px]" style={{ color: "var(--text-dim)" }}>Pulls the payment checks, addresses, tracking, delivery scans and customer history from Shopify and writes the rebuttal.</span>
      {msg && <div className="mt-2"><Notice tone={msg.tone}>{msg.text}</Notice></div>}
    </div>
  )

  const placeholders = Object.values(fields).filter((v) => typeof v === "string" && v.includes("[CS:")).length
  return (
    <div className="mb-3 rounded-lg p-3" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <span className="font-semibold" style={{ color: "var(--text)" }}>Evidence pack</span>
        <Badge tone={pack.strength === "strong" ? "green" : pack.strength === "medium" ? "amber" : "red"}>{pack.strength === "strong" ? "Strong case" : pack.strength === "medium" ? "Medium case" : "Weak case"}</Badge>
        {pack.reason && <span className="text-[10px]">Reason: {pack.reason.replace(/_/g, " ").toLowerCase()}</span>}
        {pack.shopifyEvidence?.submitted && <Badge tone="blue">Already submitted in Shopify</Badge>}
      </div>
      {!pack.open && <Notice tone="info">This dispute is {String(pack.status || "closed").replace(/_/g, " ").toLowerCase()}, so evidence can&apos;t be sent anymore. The pack is shown for reference.</Notice>}
      {pack.missing.length > 0 && <Notice tone="warning">Not readable: {pack.missing.join("; ")}.</Notice>}

      <div className="grid sm:grid-cols-2 gap-x-4 gap-y-1 my-2">
        {pack.checks.map((c) => (
          <div key={c.label} className="flex gap-1.5 text-[11px]">
            <span style={{ color: c.ok === true ? "var(--green)" : c.ok === false ? "var(--red)" : "var(--text-dim)" }}>{c.ok === true ? "✓" : c.ok === false ? "✗" : "–"}</span>
            <span><span style={{ color: "var(--text)" }}>{c.label}:</span> {c.detail}</span>
          </div>
        ))}
      </div>

      {FIELD_LABELS.map((f) => (
        <label key={f.key} className="block mb-2">
          <span className="block text-[10px] mb-0.5" style={{ color: "var(--text-dim)" }}>{f.label}</span>
          <textarea value={fields[f.key]} rows={f.rows} onChange={(e) => setFields({ ...fields, [f.key]: e.target.value })} className="w-full px-2 py-1.5 rounded-md text-[11px] font-mono" style={box} />
        </label>
      ))}
      <div className="text-[10px] mb-2" style={{ color: "var(--text-dim)" }}>
        Also attach in Shopify: screenshots of the customer conversation (CommsLayer), the carrier&apos;s proof of delivery and the product page as it looked at the time. Files can only be added in Shopify admin.
      </div>
      {placeholders > 0 && <Notice tone="warning">{placeholders} field{placeholders > 1 ? "s" : ""} still contain a [CS: …] line. Fill it in with what really happened, or delete it, before saving.</Notice>}
      <div className="flex flex-wrap items-center gap-2 mt-2">
        {pack.canSave && <Button size="sm" variant="primary" onClick={save} disabled={busy || placeholders > 0}>{busy ? "Saving…" : "Save to Shopify (doesn't submit)"}</Button>}
        <Button size="sm" onClick={copyAll}>Copy texts</Button>
        <Button size="sm" variant="ghost" onClick={build} disabled={busy}>Rebuild</Button>
        {pack.adminDisputeUrl && <a href={pack.adminDisputeUrl} target="_blank" rel="noreferrer" className="underline text-[10px]" style={{ color: "#a5b4fc" }}>Open order in Shopify to submit</a>}
        {pack.open && !pack.shopifyEvidence && <span className="text-[10px]" style={{ color: "var(--text-dim)" }}>Shopify&apos;s evidence form couldn&apos;t be read for this dispute (see the note above), so copy the texts into Shopify.</span>}
      </div>
      {msg && <div className="mt-2"><Notice tone={msg.tone}>{msg.text}</Notice></div>}
    </div>
  )
}
