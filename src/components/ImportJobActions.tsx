"use client"
// Actions for one queued / failed import job: Kopy-style API import (as draft)
// or "imported in the Kopy app" with the Shopify admin link.
import { useState } from "react"
import { fetchSourceProduct } from "@/lib/competitor-scan"

export interface ImportJob {
  id: number
  opportunity_id: number | null
  source_url: string
  store: string
  status: "queued" | "importing" | "imported" | "failed"
  method: "api" | "kopy"
  shopify_product_id: string | null
  admin_url: string | null
  error: string | null
  attempts: number
  updated_at: string
}

type Rule = "keep" | "multiply" | "fixed"

export function ImportJobActions({ job, onDone }: { job: ImportJob; onDone: (message: string) => void }) {
  const [busy, setBusy] = useState(false)
  const [rule, setRule] = useState<Rule>("keep")
  const [value, setValue] = useState("1")
  const [adminUrl, setAdminUrl] = useState("")
  const [msg, setMsg] = useState<string | null>(null)

  if (job.status === "imported") {
    return (
      <div className="text-[10px]" style={{ color: "var(--green)" }}>
        Imported as draft{job.method === "kopy" ? " (via Kopy)" : ""} ·{" "}
        {job.admin_url ? <a href={job.admin_url} target="_blank" rel="noreferrer" className="underline">open in Shopify</a> : job.shopify_product_id}
      </div>
    )
  }

  const runImport = async () => {
    setBusy(true)
    setMsg(null)
    try {
      const product = await fetchSourceProduct(job.source_url)
      const price_rule =
        rule === "keep" ? { type: "keep" } : { type: rule, value: Number(value) }
      if (rule !== "keep" && !(Number(value) > 0)) throw new Error("Enter a price value above 0")
      const res = await fetch("/api/import-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "run", job_id: job.id, product, price_rule }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`)
      onDone(json.existed ? "Already in the store: linked, nothing duplicated." : json.already_imported ? "Already imported." : "Imported as a draft.")
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : String(e))
      onDone("")
    } finally {
      setBusy(false)
    }
  }

  const markKopy = async () => {
    setBusy(true)
    setMsg(null)
    try {
      const res = await fetch("/api/import-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "manual", job_id: job.id, admin_url: adminUrl.trim() }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`)
      onDone("Marked imported via Kopy.")
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const field = "bg-transparent border rounded-md px-2 py-1 text-[10px]"
  const border = { borderColor: "rgba(255,255,255,0.1)", color: "var(--text)" }
  return (
    <div className="space-y-2">
      {job.status === "failed" && job.error && (
        <div className="text-[10px] rounded-md px-2 py-1" style={{ background: "rgba(248,113,113,0.1)", color: "var(--red)" }}>
          Last attempt failed ({job.attempts}×): {job.error}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px]" style={{ color: "var(--text-dim)" }}>Price:</span>
        <select className={field} style={border} value={rule} onChange={(e) => setRule(e.target.value as Rule)}>
          <option value="keep">keep competitor price</option>
          <option value="multiply">× multiplier</option>
          <option value="fixed">fixed price</option>
        </select>
        {rule !== "keep" && <input className={`${field} w-16`} style={border} value={value} onChange={(e) => setValue(e.target.value)} />}
        <button disabled={busy} onClick={runImport} className="px-2.5 py-1 rounded-md text-[10px] font-semibold" style={{ background: "var(--accent)", color: "#fff", opacity: busy ? 0.5 : 1 }}>
          {busy ? "Working…" : job.status === "failed" ? "Retry import (draft)" : "Import now (draft)"}
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <a href="https://app.kopy.app/" target="_blank" rel="noreferrer" className="text-[10px] underline" style={{ color: "var(--text-muted)" }}>
          or import in Kopy
        </a>
        <input className={`${field} flex-1 min-w-[200px]`} style={border} placeholder="then paste the Shopify admin product link" value={adminUrl} onChange={(e) => setAdminUrl(e.target.value)} />
        <button disabled={busy || !adminUrl.trim()} onClick={markKopy} className="px-2.5 py-1 rounded-md text-[10px] font-medium" style={{ background: "rgba(255,255,255,0.08)", color: "var(--text)", opacity: busy || !adminUrl.trim() ? 0.5 : 1 }}>
          Mark imported
        </button>
      </div>
      {msg && <div className="text-[10px]" style={{ color: "var(--red)" }}>{msg}</div>}
    </div>
  )
}
