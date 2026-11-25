"use client"
import { useState, useCallback, useEffect } from "react"
import Link from "next/link"
import { PageShell } from "@/components/PageShell"
import { PillSelect } from "@/components/PillSelect"
import { ListingWorkflow, type WorkflowStats } from "@/components/ListingWorkflow"
import { KopyImporter } from "@/components/KopyImporter"

interface ParsedListing {
  title: string
  description: string
  features: string[]
  fileNames: string[]
}

const TABS = [
  { key: "listings", label: "New Listings", desc: "Paste links → AI listing → GMC check → Shopify" },
  { key: "import", label: "Quick Import", desc: "Bulk import products as drafts (Kopy-style)" },
  { key: "ai", label: "AI Listing Tool", desc: "Generate a listing from product details" },
] as const
type Tab = typeof TABS[number]["key"]

export default function ProductImporterPage() {
  const [tab, setTab] = useState<Tab>("listings")
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
        setTab("ai")
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
      description="Import and list products across your stores."
      stats={[
        { label: "Ready to check", value: stats ? String(stats.review) : "—" },
        { label: "Approved", value: stats ? String(stats.approved) : "—" },
        { label: "Draft in Shopify", value: stats ? String(stats.inShopify) : "—" },
        { label: "Published today", value: stats ? String(stats.publishedToday) : "—" },
      ]}
    >
      {/* Tab bar */}
      <div className="flex gap-1 mb-4 p-1 rounded-xl" style={{ background: "rgba(255,255,255,0.03)" }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className="flex-1 px-4 py-2.5 rounded-lg text-[11px] font-medium transition-all"
            style={{
              background: tab === t.key ? "rgba(99,102,241,0.15)" : "transparent",
              color: tab === t.key ? "#c7d2fe" : "var(--text-muted)",
              border: tab === t.key ? "1px solid rgba(99,102,241,0.3)" : "1px solid transparent",
            }}
          >
            <div>{t.label}</div>
            <div className="text-[9px] font-normal mt-0.5" style={{ color: tab === t.key ? "rgba(199,210,254,0.6)" : "var(--text-dim)" }}>{t.desc}</div>
          </button>
        ))}
      </div>

      {/* New Listings tab */}
      {tab === "listings" && <ListingWorkflow onStats={setStats} />}

      {/* Quick Import tab */}
      {tab === "import" && <KopyImporter />}

      {/* AI Listing Tool tab */}
      {tab === "ai" && (
        <>
          <div id="redo-listing" className="glass rounded-xl p-4 mb-4">
            {fromOpportunity && (
              <div className="rounded-lg px-3 py-2 mb-3 text-[10px]" style={{ background: "rgba(99,102,241,0.12)", color: "var(--text)" }}>
                Adapting <b>{fromOpportunity.title}</b> (opportunity #{fromOpportunity.id}).
                {fromOpportunity.adminUrl && <> Draft: <a href={fromOpportunity.adminUrl} target="_blank" rel="noreferrer" className="underline">open in Shopify</a>.</>}{" "}
                Paste the results into the draft, then tick the listing checks on <Link href="/opportunities" className="underline">Product Opportunities</Link>.
              </div>
            )}
            <div className="flex items-center gap-2 mb-3">
              <div className="text-[12px] font-semibold" style={{ color: "var(--text)" }}>Generate Listing — Ascend SOP</div>
              <span className="text-[9px] px-2 py-0.5 rounded-full font-medium" style={{ background: "rgba(139,92,246,0.15)", color: "#a78bfa" }}>AI</span>
            </div>
            <p className="text-[10px] mb-3" style={{ color: "var(--text-muted)" }}>
              Generate a GMC-compliant listing for freshly imported products. Paste the product details below.
            </p>
            <div className="space-y-3 mb-3">
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
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
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
                  <PillSelect fullWidth value={store} onChange={setStore} options={["Walsh & Farley", "Carter & Collins", "Susan & Allen"]} />
                </div>
              </div>
            </div>
            <button
              className="px-4 py-2 rounded-lg text-[11px] font-medium disabled:opacity-50"
              style={{ background: "linear-gradient(135deg, #7c3aed, #a78bfa)", color: "#fff" }}
              onClick={handleRedo}
              disabled={loading || (!productInfo && !competitorUrl && !imageDesc)}
            >
              {loading ? "Generating..." : "Generate Listing"}
            </button>

            {error && (
              <div className="mt-3 text-[11px] px-3 py-2 rounded-lg" style={{ background: "rgba(239,68,68,0.1)", color: "#f87171" }}>
                {error}
              </div>
            )}
          </div>

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
        </>
      )}
    </PageShell>
  )
}
