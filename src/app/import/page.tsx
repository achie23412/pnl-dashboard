"use client"
import { useState } from "react"

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

  return (
    <main className="min-h-screen p-4 md:p-8 max-w-7xl mx-auto">
      <h1 className="text-xl font-bold mb-2">Product Import</h1>
      <p className="text-sm mb-6" style={{ color: "var(--text-muted)" }}>
        Paste a competitor product URL to scrape and import it to your Shopify store.
      </p>

      <form onSubmit={handleScrape}
        className="rounded-xl p-4 border mb-6 flex flex-col sm:flex-row gap-3"
        style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
        <input type="url" required placeholder="https://competitor-store.com/products/example"
          value={url} onChange={(e) => setUrl(e.target.value)}
          className="flex-1 px-3 py-2 rounded-lg border text-sm"
          style={{ background: "var(--bg)", borderColor: "var(--border)", color: "var(--text)" }} />
        <button type="submit" disabled={loading}
          className="px-6 py-2 rounded-lg text-sm font-medium whitespace-nowrap"
          style={{ background: loading ? "var(--border)" : "#4E6AA7", color: "#fff" }}>
          {loading ? "Scraping..." : "Scrape product"}
        </button>
      </form>

      {error && (
        <div className="rounded-xl p-4 border mb-6" style={{ background: "#f8717122", borderColor: "var(--border)" }}>
          <p className="text-sm" style={{ color: "var(--red)" }}>{error}</p>
        </div>
      )}

      {product && (
        <div className="rounded-xl p-5 border mb-6" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
          <div className="flex flex-col md:flex-row gap-6">
            {/* Images */}
            {product.images.length > 0 && (
              <div className="flex-shrink-0">
                <div className="w-48 h-48 rounded-lg overflow-hidden border" style={{ borderColor: "var(--border)" }}>
                  <img src={product.images[0]} alt={product.title} className="w-full h-full object-cover" />
                </div>
                {product.images.length > 1 && (
                  <div className="flex gap-1 mt-2">
                    {product.images.slice(1, 5).map((img, i) => (
                      <div key={i} className="w-11 h-11 rounded overflow-hidden border" style={{ borderColor: "var(--border)" }}>
                        <img src={img} alt="" className="w-full h-full object-cover" />
                      </div>
                    ))}
                    {product.images.length > 5 && (
                      <div className="w-11 h-11 rounded flex items-center justify-center text-xs" style={{ background: "var(--bg)", color: "var(--text-muted)" }}>
                        +{product.images.length - 5}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Details */}
            <div className="flex-1 space-y-3">
              <h2 className="text-lg font-bold">{product.title}</h2>
              <div className="flex gap-3 text-sm">
                <span className="font-mono font-bold" style={{ color: "var(--green)" }}>{product.price}</span>
                {product.compare_at_price && (
                  <span className="line-through" style={{ color: "var(--text-muted)" }}>{product.compare_at_price}</span>
                )}
              </div>
              {product.vendor && <div className="text-xs" style={{ color: "var(--text-muted)" }}>Vendor: {product.vendor}</div>}
              {product.product_type && <div className="text-xs" style={{ color: "var(--text-muted)" }}>Type: {product.product_type}</div>}
              {product.tags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {product.tags.map((t, i) => (
                    <span key={i} className="px-2 py-0.5 rounded text-xs" style={{ background: "var(--bg)", color: "var(--text-muted)" }}>{t}</span>
                  ))}
                </div>
              )}
              {product.variants.length > 1 && (
                <div>
                  <div className="text-xs font-medium mb-1" style={{ color: "var(--text-muted)" }}>Variants ({product.variants.length})</div>
                  <div className="flex flex-wrap gap-1">
                    {product.variants.map((v, i) => (
                      <span key={i} className="px-2 py-0.5 rounded text-xs border" style={{ borderColor: "var(--border)" }}>{v.title} — {v.price}</span>
                    ))}
                  </div>
                </div>
              )}
              {product.description && (
                <div className="text-xs leading-relaxed" style={{ color: "var(--text-muted)" }}>
                  {product.description.slice(0, 300)}{product.description.length > 300 ? "..." : ""}
                </div>
              )}
            </div>
          </div>

          {/* Import action */}
          <div className="mt-5 pt-4 flex flex-col sm:flex-row gap-3 items-start sm:items-center" style={{ borderTop: "1px solid var(--border)" }}>
            <input type="text" placeholder="Target store domain (e.g. mystore.myshopify.com)"
              value={targetStore} onChange={(e) => setTargetStore(e.target.value)}
              className="flex-1 px-3 py-2 rounded-lg border text-sm"
              style={{ background: "var(--bg)", borderColor: "var(--border)", color: "var(--text)" }} />
            <button onClick={handleImport} disabled={!targetStore || importStatus === "importing"}
              className="px-6 py-2 rounded-lg text-sm font-medium whitespace-nowrap"
              style={{ background: !targetStore ? "var(--border)" : "#34d399", color: "#fff" }}>
              {importStatus === "importing" ? "Importing..." : importStatus === "done" ? "Imported!" : "Import to Shopify"}
            </button>
          </div>
          {importStatus === "done" && (
            <p className="text-xs mt-2" style={{ color: "var(--green)" }}>Product imported successfully! Check your Shopify admin.</p>
          )}
          {importStatus === "error" && (
            <p className="text-xs mt-2" style={{ color: "var(--red)" }}>Import failed. Make sure the store has a Shopify API token configured.</p>
          )}
        </div>
      )}

      {/* How it works */}
      {!product && !loading && (
        <div className="rounded-xl p-5 border" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
          <div className="text-sm font-medium mb-3">How it works</div>
          <ol className="space-y-2 text-sm" style={{ color: "var(--text-muted)" }}>
            <li>1. Paste a product URL from any Shopify store</li>
            <li>2. We scrape the product data via their /products/handle.json endpoint</li>
            <li>3. Preview the product — title, images, price, variants</li>
            <li>4. Import it to your store via the Shopify Admin API</li>
          </ol>
          <p className="text-xs mt-4" style={{ color: "var(--text-muted)" }}>
            Note: Importing requires a Shopify Admin API token for the target store.
            Set SHOPIFY_TOKEN_storename in your environment variables.
          </p>
        </div>
      )}
    </main>
  )
}
