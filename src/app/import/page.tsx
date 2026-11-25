"use client"
import { useState } from "react"
import { PageShell } from "@/components/PageShell"
import { Panel, Badge, Button, Notice, Loading, SectionLabel } from "@/components/ui"

interface ScrapedProduct {
  title: string
  description: string
  price: string
  compare_at_price: string
  images: string[]
  variants: { title: string; price: string; sku: string }[]
  vendor: string
  product_type: string
  tags: string[]
}

export default function ImportPage() {
  const [url, setUrl] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [product, setProduct] = useState<ScrapedProduct | null>(null)
  const [importStatus, setImportStatus] = useState<"idle" | "importing" | "done" | "error">("idle")
  const [targetStore, setTargetStore] = useState("")

  async function handleScrape(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setProduct(null)
    setLoading(true)

    try {
      const res = await fetch("/api/import/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      })
      if (!res.ok) {
        const text = await res.text()
        throw new Error(text || `Failed to scrape (${res.status})`)
      }
      const data = await res.json()
      setProduct(data)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to scrape product")
    }
    setLoading(false)
  }

  async function handleImport() {
    if (!product || !targetStore) return
    setImportStatus("importing")
    try {
      const res = await fetch("/api/import/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product, store: targetStore }),
      })
      if (!res.ok) throw new Error(await res.text())
      setImportStatus("done")
    } catch {
      setImportStatus("error")
    }
  }

  const inputStyle = { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", color: "var(--text)" }
  const thumbBorder = { border: "1px solid rgba(255,255,255,0.08)" }

  return (
    <PageShell
      title="Product Import"
      breadcrumb="Front End → Product Import"
      description="Paste a competitor product URL to scrape it and import it to your Shopify store."
    >
      <Panel className="mb-4">
        <form onSubmit={handleScrape} className="flex flex-col sm:flex-row gap-3">
          <input type="url" required placeholder="https://competitor-store.com/products/example"
            value={url} onChange={(e) => setUrl(e.target.value)}
            className="flex-1 px-3 py-1.5 rounded-lg text-[11px] outline-none"
            style={inputStyle} />
          <Button type="submit" variant="primary" disabled={loading}>
            {loading ? "Scraping…" : "Scrape product"}
          </Button>
        </form>
      </Panel>

      {error && <Notice tone="error">Couldn&apos;t scrape the product: {error}</Notice>}

      {loading && <Loading>Loading product…</Loading>}

      {product && (
        <Panel className="mb-4">
          <div className="flex flex-col md:flex-row gap-6">
            {/* Images */}
            {product.images.length > 0 && (
              <div className="flex-shrink-0">
                <div className="w-48 h-48 rounded-lg overflow-hidden" style={thumbBorder}>
                  <img src={product.images[0]} alt={product.title} className="w-full h-full object-cover" />
                </div>
                {product.images.length > 1 && (
                  <div className="flex gap-1 mt-2">
                    {product.images.slice(1, 5).map((img, i) => (
                      <div key={i} className="w-11 h-11 rounded overflow-hidden" style={thumbBorder}>
                        <img src={img} alt="" className="w-full h-full object-cover" />
                      </div>
                    ))}
                    {product.images.length > 5 && (
                      <div className="w-11 h-11 rounded flex items-center justify-center text-[10px]" style={{ background: "rgba(255,255,255,0.04)", color: "var(--text-muted)" }}>
                        +{product.images.length - 5}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Details */}
            <div className="flex-1 space-y-3">
              <h2 className="text-[14px] font-bold" style={{ color: "var(--text)" }}>{product.title}</h2>
              <div className="flex gap-3 text-[12px]">
                <span className="tabular-nums font-bold" style={{ color: "var(--green)" }}>{product.price}</span>
                {product.compare_at_price && (
                  <span className="line-through tabular-nums" style={{ color: "var(--text-dim)" }}>{product.compare_at_price}</span>
                )}
              </div>
              {product.vendor && <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>Vendor: {product.vendor}</div>}
              {product.product_type && <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>Type: {product.product_type}</div>}
              {product.tags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {product.tags.map((t, i) => (
                    <Badge key={i}>{t}</Badge>
                  ))}
                </div>
              )}
              {product.variants.length > 1 && (
                <div>
                  <SectionLabel>{product.variants.length} variants</SectionLabel>
                  <div className="flex flex-wrap gap-1">
                    {product.variants.map((v, i) => (
                      <Badge key={i}>{v.title}: {v.price}</Badge>
                    ))}
                  </div>
                </div>
              )}
              {product.description && (
                <div className="text-[11px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
                  {product.description.slice(0, 300)}{product.description.length > 300 ? "…" : ""}
                </div>
              )}
            </div>
          </div>

          {/* Import action */}
          <div className="mt-5 pt-4 flex flex-col sm:flex-row gap-3 items-start sm:items-center" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
            <input type="text" placeholder="Target store domain (e.g. mystore.myshopify.com)"
              value={targetStore} onChange={(e) => setTargetStore(e.target.value)}
              className="flex-1 w-full px-3 py-1.5 rounded-lg text-[11px] outline-none"
              style={inputStyle} />
            <Button variant="primary" onClick={handleImport} disabled={!targetStore || importStatus === "importing"}>
              {importStatus === "importing" ? "Importing…" : importStatus === "done" ? "Imported" : "Import to Shopify"}
            </Button>
          </div>
          {importStatus === "done" && (
            <div className="mt-3"><Notice tone="success">Product imported. Check it in your Shopify admin.</Notice></div>
          )}
          {importStatus === "error" && (
            <div className="mt-3"><Notice tone="error">Couldn&apos;t import the product. Make sure the store has a Shopify API token set up.</Notice></div>
          )}
        </Panel>
      )}

      {/* How it works */}
      {!product && !loading && (
        <Panel title="How it works">
          <ol className="space-y-2 text-[11px]" style={{ color: "var(--text-muted)" }}>
            <li>1. Paste a product URL from any Shopify store.</li>
            <li>2. We scrape the product data from its /products/handle.json endpoint.</li>
            <li>3. Preview the product: title, images, price and variants.</li>
            <li>4. Import it to your store through the Shopify Admin API.</li>
          </ol>
          <p className="text-[10px] mt-4" style={{ color: "var(--text-dim)" }}>
            Importing needs a Shopify Admin API token for the target store. Set SHOPIFY_TOKEN_storename in your environment variables.
          </p>
        </Panel>
      )}
    </PageShell>
  )
}
