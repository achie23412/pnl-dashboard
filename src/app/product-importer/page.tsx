"use client"
import { useState, useCallback, useEffect } from "react"
import Link from "next/link"
import { PageShell } from "@/components/PageShell"
import { PillSelect } from "@/components/PillSelect"
import { ListingWorkflow, type WorkflowStats } from "@/components/ListingWorkflow"
import { KopyImporter } from "@/components/KopyImporter"
import { GmcScanner } from "@/components/GmcScanner"
import { Panel, Badge, Button, Notice } from "@/components/ui"

interface ParsedListing {
  title: string
  description: string
  features: string[]
  fileNames: string[]
}

const TABS = [
  { key: "listings", label: "New listings", desc: "Paste links → AI listing → GMC check → Shopify" },
  { key: "import", label: "Quick import", desc: "Bulk import products as drafts (Kopy-style)" },
  { key: "ai", label: "AI listing tool", desc: "Generate a listing from product details" },
  { key: "gmc", label: "GMC check", desc: "Check any product link against Google's rules" },
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
    const t = new URLSearchParams(window.location.search).get("tab")
    if (t && TABS.some((x) => x.key === t)) setTab(t as Tab)
  }, [])

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
      description="Import products, write the listing, check it against Google Merchant Center rules, then send it to Shopify."
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

      {/* GMC check tab */}
      {tab === "gmc" && <GmcScanner />}

      {/* Quick Import tab */}
      {tab === "import" && <KopyImporter />}

      {/* AI Listing Tool tab */}
      {tab === "ai" && (
        <>
          <div id="redo-listing">
          <Panel title="Generate listing (Ascend SOP)" right={<Badge tone="accent">AI</Badge>} className="mb-4">
            {fromOpportunity && (
              <div className="rounded-lg px-3 py-2 mb-3 text-[10px]" style={{ background: "rgba(99,102,241,0.12)", color: "var(--text)" }}>
                Adapting <b>{fromOpportunity.title}</b> (opportunity #{fromOpportunity.id}).
                {fromOpportunity.adminUrl && <> Draft: <a href={fromOpportunity.adminUrl} target="_blank" rel="noreferrer" className="underline">open in Shopify</a>.</>}{" "}
                Paste the results into the draft, then tick the listing checks on <Link href="/opportunities" className="underline">Product opportunities</Link>.
              </div>
            )}
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
                  placeholder="Paste the existing title, description or any product details…"
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
                    placeholder="https://competitor.com/product…"
                    value={competitorUrl}
                    onChange={(e) => setCompetitorUrl(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-[10px] font-medium block mb-1" style={{ color: "var(--text-muted)" }}>Image description (optional)</label>
                  <input
                    className="w-full bg-transparent border rounded-lg px-3 py-2 text-[11px]"
                    style={{ borderColor: "rgba(255,255,255,0.08)", color: "var(--text)" }}
                    placeholder="Describe what the product looks like…"
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
            <Button
              variant="primary"
              onClick={handleRedo}
              disabled={loading || (!productInfo && !competitorUrl && !imageDesc)}
            >
              {loading ? "Generating…" : "Generate listing"}
            </Button>

            {error && (
              <div className="mt-3 -mb-4">
                <Notice tone="error">Couldn&apos;t generate the listing: {error}.</Notice>
              </div>
            )}
          </Panel>
          </div>

          {result && (
            <Panel
              title="Generated listing"
              className="mb-4"
              right={
                <Button size="sm" onClick={() => copyToClipboard(rawResult, "all")}>
                  {copied === "all" ? "Copied" : "Copy all"}
                </Button>
              }
            >

              <div className="mb-4">
                <div className="flex items-center justify-between mb-1">
                  <div className="text-[10px] font-medium" style={{ color: "var(--text-muted)" }}>Title</div>
                  <Button size="sm" variant="ghost" onClick={() => copyToClipboard(result.title, "title")}>
                    {copied === "title" ? "Copied" : "Copy"}
                  </Button>
                </div>
                <div className="text-[12px] font-medium px-3 py-2 rounded-lg" style={{ background: "rgba(255,255,255,0.03)", color: "var(--text)" }}>
                  {result.title}
                </div>
                <div className="text-[9px] mt-1" style={{ color: "var(--text-dim)" }}>{result.title.length} characters</div>
              </div>

              <div className="mb-4">
                <div className="flex items-center justify-between mb-1">
                  <div className="text-[10px] font-medium" style={{ color: "var(--text-muted)" }}>Description</div>
                  <Button size="sm" variant="ghost" onClick={() => copyToClipboard(result.description, "desc")}>
                    {copied === "desc" ? "Copied" : "Copy"}
                  </Button>
                </div>
                <div className="text-[11px] px-3 py-2 rounded-lg leading-relaxed" style={{ background: "rgba(255,255,255,0.03)", color: "var(--text)" }}>
                  {result.description}
                </div>
              </div>

              <div className="mb-4">
                <div className="flex items-center justify-between mb-1">
                  <div className="text-[10px] font-medium" style={{ color: "var(--text-muted)" }}>Key features</div>
                  <Button size="sm" variant="ghost" onClick={() => copyToClipboard(result.features.join("\n"), "feat")}>
                    {copied === "feat" ? "Copied" : "Copy"}
                  </Button>
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
                  <div className="text-[10px] font-medium" style={{ color: "var(--text-muted)" }}>File names ({result.fileNames.length})</div>
                  <Button size="sm" variant="ghost" onClick={() => copyToClipboard(result.fileNames.join("\n"), "files")}>
                    {copied === "files" ? "Copied" : "Copy"}
                  </Button>
                </div>
                <div className="max-h-[160px] overflow-y-auto rounded-lg px-3 py-2" style={{ background: "rgba(255,255,255,0.03)" }}>
                  {result.fileNames.map((f, i) => (
                    <div key={i} className="text-[10px] font-mono py-0.5" style={{ color: "var(--text-dim)" }}>
                      {f}
                    </div>
                  ))}
                </div>
              </div>
            </Panel>
          )}
        </>
      )}
    </PageShell>
  )
}
