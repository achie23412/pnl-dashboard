"use client"
// Kopy-style importer: single product, multiple product links, or a whole
// store/collection -> chosen store, always as DRAFT. Plus the import queue fed
// by approved Product Opportunities.
import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { fetchSourceProduct, listCollectionProducts } from "@/lib/competitor-scan"
import { ImportJobActions, type ImportJob } from "@/components/ImportJobActions"
import { PillSelect } from "@/components/PillSelect"

const STORES = ["Walsh & Farley", "Carter & Collins", "Susan & Allen", "LUMEGLASSES"]
type Mode = "single" | "multiple" | "collection"
type Rule = "keep" | "multiply" | "fixed"

interface Row {
  url: string
  title?: string
  image?: string | null
  price?: number | null
  selected: boolean
  state: "idle" | "working" | "done" | "error"
  message?: string
}

const field = "bg-transparent border rounded-lg px-3 py-2 text-[11px]"
const border = { borderColor: "rgba(255,255,255,0.08)", color: "var(--text)" }
const btn = "px-3 py-1.5 rounded-lg text-[11px] font-medium"

export function KopyImporter() {
  const [mode, setMode] = useState<Mode>("single")
  const [store, setStore] = useState(STORES[0])
  const [rule, setRule] = useState<Rule>("keep")
  const [ruleValue, setRuleValue] = useState("1")
  const [input, setInput] = useState("")
  const [rows, setRows] = useState<Row[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [jobs, setJobs] = useState<ImportJob[]>([])

  const loadJobs = useCallback(async () => {
    const res = await fetch("/api/import-jobs", { cache: "no-store" })
    const json = await res.json().catch(() => ({}))
    if (res.ok) setJobs(json.jobs || [])
  }, [])
  useEffect(() => {
    loadJobs()
  }, [loadJobs])

  const priceRule = () => (rule === "keep" ? { type: "keep" } : { type: rule, value: Number(ruleValue) })

  const load = async () => {
    setError(null)
    setBusy(true)
    try {
      if (mode === "collection") {
        const list = await listCollectionProducts(input.trim())
        if (!list.length) throw new Error("No products found at that store/collection URL")
        setRows(list.map((p) => ({ ...p, selected: false, state: "idle" })))
      } else {
        const urls = (mode === "single" ? [input.trim()] : input.split(/\s+/)).map((u) => u.trim()).filter((u) => /^https?:\/\//.test(u))
        if (!urls.length) throw new Error("Paste at least one product URL")
        const out: Row[] = []
        for (const url of Array.from(new Set(urls))) {
          try {
            const p = await fetchSourceProduct(url)
            const prices = (p.variants || []).map((v) => Number(v.price)).filter((n) => n > 0)
            out.push({ url, title: p.title, image: p.images?.[0]?.src || null, price: prices.length ? Math.min(...prices) : null, selected: true, state: "idle" })
          } catch (e: unknown) {
            out.push({ url, selected: false, state: "error", message: e instanceof Error ? e.message : String(e) })
          }
        }
        setRows(out)
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const importSelected = async () => {
    if (rule !== "keep" && !(Number(ruleValue) > 0)) {
      setError("Enter a price value above 0")
      return
    }
    setBusy(true)
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]
      if (!r.selected || r.state === "done") continue
      setRows((rs) => rs.map((x, j) => (j === i ? { ...x, state: "working", message: undefined } : x)))
      try {
        const product = await fetchSourceProduct(r.url)
        const res = await fetch("/api/import-jobs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "run", source_url: r.url, store, product, price_rule: priceRule() }),
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`)
        const msg = json.already_imported ? "already imported" : json.existed ? "already in store (linked)" : "imported as draft"
        setRows((rs) => rs.map((x, j) => (j === i ? { ...x, state: "done", message: msg } : x)))
      } catch (e: unknown) {
        setRows((rs) => rs.map((x, j) => (j === i ? { ...x, state: "error", message: e instanceof Error ? e.message : String(e) } : x)))
      }
    }
    setBusy(false)
    loadJobs()
  }

  const queued = jobs.filter((j) => j.status !== "imported")
  const kopyLists = useMemo(() => {
    const m = new Map<string, string[]>()
    for (const j of queued) m.set(j.store, [...(m.get(j.store) || []), j.source_url])
    return Array.from(m.entries())
  }, [queued])
  const selectedCount = rows.filter((r) => r.selected && r.state !== "done").length

  return (
    <>
      <div className="glass rounded-xl p-4 mb-4">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div className="text-[12px] font-semibold" style={{ color: "var(--text)" }}>Import products (Kopy-style)</div>
          <div className="text-[10px]" style={{ color: "var(--text-dim)" }}>Always imported as <b>draft</b>. Publishing stays manual in Shopify.</div>
        </div>
        <div className="flex flex-wrap gap-1 mb-3">
          {([["single", "Single product"], ["multiple", "Multiple product links"], ["collection", "Store or collection"]] as [Mode, string][]).map(([m, label]) => (
            <button key={m} onClick={() => { setMode(m); setRows([]); setError(null) }} className="px-3 py-1.5 rounded-lg text-[11px] font-semibold" style={{ background: mode === m ? "rgba(255,255,255,0.08)" : "transparent", color: mode === m ? "#fff" : "var(--text-dim)" }}>
              {label}
            </button>
          ))}
        </div>
        <div className="grid md:grid-cols-[1fr_200px_auto] gap-3 items-end">
          <div>
            <label className="text-[10px] font-medium block mb-1" style={{ color: "var(--text-muted)" }}>
              {mode === "single" ? "Product URL" : mode === "multiple" ? "Product URLs (one per line)" : "Store or collection URL"}
            </label>
            {mode === "multiple" ? (
              <textarea className={`w-full ${field}`} style={border} rows={4} value={input} onChange={(e) => setInput(e.target.value)} placeholder={"https://store.com/products/a\nhttps://store.com/products/b"} />
            ) : (
              <input className={`w-full ${field}`} style={border} value={input} onChange={(e) => setInput(e.target.value)} placeholder={mode === "single" ? "https://store.com/products/handle" : "https://store.com/collections/dresses"} />
            )}
          </div>
          <div>
            <label className="text-[10px] font-medium block mb-1" style={{ color: "var(--text-muted)" }}>Into store</label>
            <PillSelect fullWidth value={store} onChange={setStore} options={STORES} />
          </div>
          <button disabled={busy || !input.trim()} onClick={load} className={btn} style={{ background: "rgba(255,255,255,0.08)", color: "var(--text)", opacity: busy || !input.trim() ? 0.5 : 1 }}>
            {busy && rows.length === 0 ? "Loading…" : "Load products"}
          </button>
        </div>
        {error && <div className="text-[11px] mt-2" style={{ color: "var(--red)" }}>{error}</div>}

        {rows.length > 0 && (
          <div className="mt-3">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className="text-[10px]" style={{ color: "var(--text-dim)" }}>Price:</span>
              <PillSelect
                value={rule}
                onChange={(v) => setRule(v as Rule)}
                options={[
                  { value: "keep", label: "keep competitor price" },
                  { value: "multiply", label: "× multiplier" },
                  { value: "fixed", label: "fixed price" },
                ]}
              />
              {rule !== "keep" && <input className={`${field} w-20`} style={border} value={ruleValue} onChange={(e) => setRuleValue(e.target.value)} />}
              {mode === "collection" && (
                <button className="text-[10px] underline" style={{ color: "var(--text-muted)" }} onClick={() => setRows((rs) => rs.map((r) => ({ ...r, selected: !rs.every((x) => x.selected) })))}>select all / none</button>
              )}
              <button disabled={busy || selectedCount === 0} onClick={importSelected} className={btn} style={{ background: "var(--accent)", color: "#fff", opacity: busy || selectedCount === 0 ? 0.5 : 1 }}>
                {busy ? "Importing…" : `Import ${selectedCount} as draft into ${store}`}
              </button>
            </div>
            <div className="max-h-[360px] overflow-y-auto space-y-1">
              {rows.map((r, i) => (
                <label key={r.url} className="flex items-center gap-2 text-[10px] py-1" style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                  <input type="checkbox" checked={r.selected} disabled={r.state === "done" || (!r.title && r.state === "error")} onChange={(e) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, selected: e.target.checked } : x)))} />
                  {r.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={r.image} alt="" className="w-8 h-8 rounded object-cover" />
                  ) : <div className="w-8 h-8 rounded" style={{ background: "rgba(255,255,255,0.04)" }} />}
                  <a href={r.url} target="_blank" rel="noreferrer" className="flex-1 truncate underline" style={{ color: "var(--text)" }}>{r.title || r.url}</a>
                  <span className="tabular-nums" style={{ color: "var(--text-muted)" }}>{r.price != null ? r.price.toFixed(2) : ""}</span>
                  <span style={{ color: r.state === "done" ? "var(--green)" : r.state === "error" ? "var(--red)" : "var(--text-dim)" }}>
                    {r.state === "working" ? "importing…" : r.message || ""}
                  </span>
                </label>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="glass rounded-xl p-4 mb-4">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <div className="text-[12px] font-semibold" style={{ color: "var(--text)" }}>Import queue <span className="font-normal" style={{ color: "var(--text-dim)" }}>(approved on Product Opportunities)</span></div>
          <div className="flex flex-wrap gap-2">
            {kopyLists.map(([s, urls]) => (
              <button key={s} className="text-[10px] underline" style={{ color: "var(--text-muted)" }} onClick={() => navigator.clipboard.writeText(urls.join("\n"))}>
                Copy {urls.length} URL{urls.length === 1 ? "" : "s"} for Kopy ({s})
              </button>
            ))}
          </div>
        </div>
        {queued.length === 0 ? (
          <div className="text-[11px]" style={{ color: "var(--text-dim)" }}>
            Nothing waiting. Approve products on <Link href="/opportunities" className="underline">Product Opportunities</Link> and send them here.
          </div>
        ) : (
          <div className="space-y-3">
            {queued.map((j) => (
              <div key={j.id} className="pt-2" style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                <div className="text-[10px] mb-1" style={{ color: "var(--text-muted)" }}>
                  <b style={{ color: "var(--text)" }}>{j.store}</b> ·{" "}
                  <a href={j.source_url} target="_blank" rel="noreferrer" className="underline">{j.source_url}</a>
                  {j.opportunity_id && <> · <Link href="/opportunities" className="underline">opportunity #{j.opportunity_id}</Link></>}
                  {" · "}{j.status}
                </div>
                <ImportJobActions job={j} onDone={() => loadJobs()} />
              </div>
            ))}
          </div>
        )}
        {jobs.some((j) => j.status === "imported") && (
          <details className="mt-3">
            <summary className="text-[10px] cursor-pointer" style={{ color: "var(--text-dim)" }}>Recently imported ({jobs.filter((j) => j.status === "imported").length})</summary>
            <div className="mt-1 space-y-0.5">
              {jobs.filter((j) => j.status === "imported").slice(0, 50).map((j) => (
                <div key={j.id} className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                  {j.store} · {j.admin_url ? <a href={j.admin_url} target="_blank" rel="noreferrer" className="underline">draft {j.shopify_product_id}</a> : j.shopify_product_id} · from {j.source_url}
                  {j.opportunity_id && <> · <Link href={`/product-importer?opportunity=${j.opportunity_id}`} className="underline">redo listing</Link></>}
                </div>
              ))}
            </div>
          </details>
        )}
      </div>
    </>
  )
}
