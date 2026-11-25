"use client"
import { useState, useCallback, useEffect } from "react"
import Link from "next/link"
import { PageShell } from "@/components/PageShell"
import { ListingWorkflow, type WorkflowStats } from "@/components/ListingWorkflow"
import { KopyImporter } from "@/components/KopyImporter"

interface ParsedListing {
  title: string
  description: string
  features: string[]
  fileNames: string[]
}

export default function ProductImporterPage() {
  const [productInfo, setProductInfo] = useState("")
  const [competitorUrl, setCompetitorUrl] = useState("")
  const [imageDesc, setImageDesc] = useState("")
  const [store, setStore] = useState("Walsh & Farley")
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ParsedListing | null>(null)
  const [rawResult, setRawResult] = useState("")
  const [error, setError] = useState("")
  const [copied, setCopied] = useState("")
  const [stats, setStats] = useState<WorkflowStats | null>(null)
  const [fromOpportunity, setFromOpportunity] = useState<{ id: number; title: string; adminUrl: string | null } | null>(null)

  // Arriving from Product Opportunities (?opportunity=<id>): prefill Redo Listing
  // with the imported product's source data, URL and store.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("opportunity")
    if (!id) return
    fetch(`/api/opportunities/${encodeURIComponent(id)}`)
      .then((r) => r.json())
      .then((j) => {
        const o = j.opportunity
        if (!o) return
        const job = (j.jobs || []).find((x: { status: string }) => x.status === "imported") || (j.jobs || [])[0]
        const snap = job?.source_snapshot
        const lines = [
          `Title: ${snap?.title || o.title}`,
          o.category ? `Category: ${[o.gender, o.category].filter(Boolean).join(" ")}` : "",
          snap?.options?.length ? `Options: ${snap.options.map((x: { name: string; values: string[] }) => `${x.name}: ${x.values.join(", ")}`).join(" | ")}` : "",
          snap?.body_text ? `Source description (rewrite, do not copy): ${snap.body_text}` : "",
        ].filter(Boolean)
        setProductInfo(lines.join("\n"))
        setCompetitorUrl(job?.source_url || o.source_url || o.evidence?.[0]?.url || "")
        if (o.target_store) setStore(o.target_store)
        setFromOpportunity({ id: o.id, title: o.title, adminUrl: job?.admin_url || null })
        setTimeout(() => document.getElementById("redo-listing")?.scrollIntoView({ behavior: "smooth" }), 300)
      })
      .catch(() => {})
  }, [])

  const handleRedo = useCallback(async () => {
    if (!productInfo && !competitorUrl && !imageDesc) return
    setLoading(true)
    setError("")
    setResult(null)
    setRawResult("")
    try {
      const res = await fetch("/api/redo-listing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productInfo: productInfo || undefined,
          competitorUrl: competitorUrl || undefined,
          imageDescription: imageDesc || undefined,
          store,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed")
      setResult(data.parsed)
      setRawResult(data.raw)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [productInfo, competitorUrl, imageDesc, store])

  const copyToClipboard = useCallback((text: string, label: string) => {
    navigator.clipboard.writeText(text)
    setCopied(label)
    setTimeout(() => setCopied(""), 2000)
  }, [])

  return (
    <PageShell
      title="Product Importer"
      breadcrumb="Front End → Product Importer"
      description="One workflow: paste product links → new listing with the Ascend SOP → GMC pre-launch check → you check before / after → Shopify draft → publish."
      stats={[
        { label: "Ready to check", value: stats ? String(stats.review) : "—" },
        { label: "Approved", value: stats ? String(stats.approved) : "—" },
        { label: "Draft in Shopify", value: stats ? String(stats.inShopify) : "—" },
        { label: "Published today", value: stats ? String(stats.publishedToday) : "—" },
      ]}
    >
      <ListingWorkflow onStats={setStats} />

      <div className="text-[10px] font-semibold uppercase tracking-wider mt-6 mb-2" style={{ color: "var(--text-dim)" }}>
        Approved Product Opportunities · import queue and Kopy-style import
      </div>
      <KopyImporter />

      <div className="text-[10px] font-semibold uppercase tracking-wider mt-6 mb-2" style={{ color: "var(--text-dim)" }}>
        Manual tool · no product link? Paste the details instead
      </div>

      {/* Redo Listing (SOP) */}
      <div id="redo-listing" className="glass rounded-xl p-4 mb-4">
        {fromOpportunity && (
          <div className="rounded-lg px-3 py-2 mb-3 text-[10px]" style={{ background: "rgba(99,102,241,0.12)", color: "var(--text)" }}>
            Adapting <b>{fromOpportunity.title}</b> (opportunity #{fromOpportunity.id}).
            {fromOpportunity.adminUrl && <> Draft: <a href={fromOpportunity.adminUrl} target="_blank" rel="noreferrer" className="underline">open in Shopify</a>.</>}{" "}
            Paste the results into the draft, then tick the listing checks on <Link href="/opportunities" className="underline">Product Opportunities</Link>.
          </div>
        )}
        <div className="flex items-center gap-2 mb-2">
          <div className="text-[12px] font-semibold" style={{ color: "var(--text)" }}>Redo Listing — Ascend SOP</div>
          <span className="text-[9px] px-2 py-0.5 rounded-full font-medium" style={{ background: "rgba(139,92,246,0.15)", color: "#a78bfa" }}>AI</span>
          <span className="text-[9px] px-2 py-0.5 rounded-full font-medium" style={{ background: "rgba(234,179,8,0.12)", color: "#facc15" }}>New imports only</span>
        </div>
        <p className="text-[10px] mb-3" style={{ color: "var(--text-muted)" }}>
          Generate a GMC-compliant listing for <strong style={{ color: "var(--text)" }}>freshly imported products only</strong>. Paste the new product details below — do not use this on existing live listings.
        </p>
        <div className="grid grid-cols-1 gap-3 mb-3">
          <div>
            <label className="text-[10px] font-medium block mb-1" style={{ color: "var(--text-muted)" }}>Product info / existing listing</label>
            <textarea
              className="w-full bg-transparent border rounded-lg px-3 py-2 text-[11px] resize-none"
              style={{ borderColor: "rgba(255,255,255,0.08)", color: "var(--text)" }}
              rows={3}
              placeholder="Paste existing product title, description, or any product details..."
              value={productInfo}
              onChange={(e) => setProductInfo(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-[10px] font-medium block mb-1" style={{ color: "var(--text-muted)" }}>Competitor URL (optional)</label>
              <input
                className="w-full bg-transparent border rounded-lg px-3 py-2 text-[11px]"
                style={{ borderColor: "rgba(255,255,255,0.08)", color: "var(--text)" }}
                placeholder="https://competitor.com/product..."
                value={competitorUrl}
                onChange={(e) => setCompetitorUrl(e.target.value)}
              />
            </div>
            <div>
              <label className="text-[10px] font-medium block mb-1" style={{ color: "var(--text-muted)" }}>Image description (optional)</label>
              <input
                className="w-full bg-transparent border rounded-lg px-3 py-2 text-[11px]"
                style={{ borderColor: "rgba(255,255,255,0.08)", color: "var(--text)" }}
                placeholder="Describe what the product looks like..."
                value={imageDesc}
                onChange={(e) => setImageDesc(e.target.value)}
              />
            </div>
            <div>
              <label className="text-[10px] font-medium block mb-1" style={{ color: "var(--text-muted)" }}>Target store</label>
              <select
                className="w-full bg-transparent border rounded-lg px-3 py-2 text-[11px]"
                style={{ borderColor: "rgba(255,255,255,0.08)", color: "var(--text)" }}
                value={store}
                onChange={(e) => setStore(e.target.value)}
              >
                <option>Walsh & Farley</option>
                <option>Carter & Collins</option>
                <option>Susan & Allen</option>
              </select>
            </div>
          </div>
        </div>
        <button
          className="px-4 py-2 rounded-lg text-[11px] font-medium disabled:opacity-50"
          style={{ background: "linear-gradient(135deg, #7c3aed, #a78bfa)", color: "#fff" }}
          onClick={handleRedo}
          disabled={loading || (!productInfo && !competitorUrl && !imageDesc)}
        >
          {loading ? "Generating..." : "Redo Listing"}
        </button>

        {error && (
          <div className="mt-3 text-[11px] px-3 py-2 rounded-lg" style={{ background: "rgba(239,68,68,0.1)", color: "#f87171" }}>
            {error}
          </div>
        )}
      </div>

      {/* SOP Result */}
      {result && (
        <div className="glass rounded-xl p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <div className="text-[12px] font-semibold" style={{ color: "var(--text)" }}>Generated Listing</div>
            <button
              className="text-[10px] px-3 py-1 rounded-lg font-medium"
              style={{ background: "rgba(255,255,255,0.06)", color: "var(--text-muted)" }}
              onClick={() => copyToClipboard(rawResult, "all")}
            >
              {copied === "all" ? "Copied!" : "Copy all"}
            </button>
          </div>

          {/* Title */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-1">
              <div className="text-[10px] font-medium" style={{ color: "var(--text-muted)" }}>Title</div>
              <button
                className="text-[9px] px-2 py-0.5 rounded"
                style={{ background: "rgba(255,255,255,0.04)", color: "var(--text-dim)" }}
                onClick={() => copyToClipboard(result.title, "title")}
              >
                {copied === "title" ? "Copied!" : "Copy"}
              </button>
            </div>
            <div className="text-[12px] font-medium px-3 py-2 rounded-lg" style={{ background: "rgba(255,255,255,0.03)", color: "var(--text)" }}>
              {result.title}
            </div>
            <div className="text-[9px] mt-1" style={{ color: "var(--text-dim)" }}>{result.title.length} characters</div>
          </div>

          {/* Description */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-1">
              <div className="text-[10px] font-medium" style={{ color: "var(--text-muted)" }}>Description</div>
              <button
                className="text-[9px] px-2 py-0.5 rounded"
                style={{ background: "rgba(255,255,255,0.04)", color: "var(--text-dim)" }}
                onClick={() => copyToClipboard(result.description, "desc")}
              >
                {copied === "desc" ? "Copied!" : "Copy"}
              </button>
            </div>
            <div className="text-[11px] px-3 py-2 rounded-lg leading-relaxed" style={{ background: "rgba(255,255,255,0.03)", color: "var(--text)" }}>
              {result.description}
            </div>
          </div>

          {/* Key Features */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-1">
              <div className="text-[10px] font-medium" style={{ color: "var(--text-muted)" }}>Key Features</div>
              <button
                className="text-[9px] px-2 py-0.5 rounded"
                style={{ background: "rgba(255,255,255,0.04)", color: "var(--text-dim)" }}
                onClick={() => copyToClipboard(result.features.join("\n"), "feat")}
              >
                {copied === "feat" ? "Copied!" : "Copy"}
              </button>
            </div>
            <div className="space-y-1">
              {result.features.map((f, i) => (
                <div key={i} className="text-[11px] px-3 py-1.5 rounded-lg" style={{ background: "rgba(255,255,255,0.03)", color: "var(--text)" }}>
                  {f}
                </div>
              ))}
            </div>
          </div>

          {/* File Names */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <div className="text-[10px] font-medium" style={{ color: "var(--text-muted)" }}>File Names ({result.fileNames.length})</div>
              <button
                className="text-[9px] px-2 py-0.5 rounded"
                style={{ background: "rgba(255,255,255,0.04)", color: "var(--text-dim)" }}
                onClick={() => copyToClipboard(result.fileNames.join("\n"), "files")}
              >
                {copied === "files" ? "Copied!" : "Copy"}
              </button>
            </div>
            <div className="max-h-[160px] overflow-y-auto rounded-lg px-3 py-2" style={{ background: "rgba(255,255,255,0.03)" }}>
              {result.fileNames.map((f, i) => (
                <div key={i} className="text-[10px] font-mono py-0.5" style={{ color: "var(--text-dim)" }}>
                  {f}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </PageShell>
  )
}
