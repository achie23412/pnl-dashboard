"use client"
import { useState, useCallback } from "react"
import { PageShell } from "@/components/PageShell"

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
      description="Import products from your saved list. Single or batch import with keyword advice and competitor pricing."
      stats={[
        { label: "Saved products", value: "—" },
        { label: "Imported this week", value: "—" },
        { label: "Pending review", value: "—" },
        { label: "Success rate", value: "—" },
      ]}
    >
      {/* Add new product */}
      <div className="glass rounded-xl p-4 mb-4">
        <div className="text-[12px] font-semibold mb-3" style={{ color: "var(--text)" }}>Add new product</div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="text-[10px] font-medium block mb-1" style={{ color: "var(--text-muted)" }}>Product URL</label>
            <input className="w-full bg-transparent border rounded-lg px-3 py-2 text-[11px]" style={{ borderColor: "rgba(255,255,255,0.08)", color: "var(--text)" }} placeholder="https://supplier.com/product..." />
          </div>
          <div>
            <label className="text-[10px] font-medium block mb-1" style={{ color: "var(--text-muted)" }}>Target store</label>
            <select className="w-full bg-transparent border rounded-lg px-3 py-2 text-[11px]" style={{ borderColor: "rgba(255,255,255,0.08)", color: "var(--text)" }}>
              <option>Walsh & Farley</option>
              <option>Carter & Collins</option>
              <option>Susan & Allen</option>
            </select>
          </div>
          <div className="flex items-end">
            <button className="px-4 py-2 rounded-lg text-[11px] font-medium" style={{ background: "var(--accent)", color: "#fff" }}>Import</button>
          </div>
        </div>
      </div>

      {/* Saved list */}
      <div className="glass rounded-xl p-4 mb-4">
        <div className="text-[12px] font-semibold mb-2" style={{ color: "var(--text)" }}>Saved list</div>
        <div className="text-[11px]" style={{ color: "var(--text-dim)" }}>No saved products yet. Add a product URL above to get started.</div>
      </div>

      {/* Redo Listing (SOP) */}
      <div className="glass rounded-xl p-4 mb-4">
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
