"use client"
// GMC Pre-Launch Scanner: check one product against Google Merchant Center rules
// before it goes in a Google store. Paste a Shopify product link (ours, a
// supplier's or a competitor's) or type the listing in by hand.
import { useMemo, useState } from "react"
import Link from "next/link"
import { PageShell } from "@/components/PageShell"
import { checkLiveProduct, type LiveIssue, type LiveProductInput } from "@/lib/gmc-check"

const inputStyle = { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", color: "var(--text)" }
const stripHtml = (h: string) => h.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim()

type Scanned = { input: LiveProductInput; url: string | null; image: string | null; issues: LiveIssue[] }

// https://shop.com/products/handle?variant=1 -> https://shop.com/products/handle.json
function productJsonUrl(raw: string): string | null {
  try {
    const u = new URL(raw.trim().startsWith("http") ? raw.trim() : `https://${raw.trim()}`)
    const m = u.pathname.match(/\/products\/([^/?#]+)/)
    if (!m) return null
    return `${u.origin}/products/${m[1].replace(/\.json$/, "")}.json`
  } catch {
    return null
  }
}

export default function GMCScannerPage() {
  const [url, setUrl] = useState("")
  const [manual, setManual] = useState({ title: "", description: "", price: "", images: "1", productType: "" })
  const [mode, setMode] = useState<"link" | "manual">("link")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [results, setResults] = useState<Scanned[]>([])

  const scanLink = async () => {
    setError(null)
    const jsonUrl = productJsonUrl(url)
    if (!jsonUrl) return setError("That isn't a product link. It should contain /products/… (a Shopify product page).")
    setBusy(true)
    try {
      const res = await fetch(jsonUrl)
      if (!res.ok) throw new Error(`The store answered ${res.status}. Only Shopify stores work here; for others, use "Type it in".`)
      const { product: p } = await res.json()
      const input: LiveProductInput = {
        title: p.title || "",
        descriptionText: stripHtml(p.body_html || ""),
        productType: p.product_type || "",
        images: p.images?.length || 0,
        variants: (p.variants || []).map((v: { price: string; compare_at_price: string | null; available?: boolean }) => ({
          price: parseFloat(v.price) || 0,
          compareAt: v.compare_at_price ? parseFloat(v.compare_at_price) : null,
          available: v.available !== false,
        })),
      }
      setResults((r) => [{ input, url: url.trim(), image: p.images?.[0]?.src || null, issues: checkLiveProduct(input) }, ...r])
      setUrl("")
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const scanManual = () => {
    setError(null)
    if (!manual.title.trim()) return setError("Add at least a title.")
    const input: LiveProductInput = {
      title: manual.title,
      descriptionText: manual.description,
      productType: manual.productType,
      images: parseInt(manual.images) || 0,
      variants: [{ price: parseFloat(manual.price.replace(",", ".")) || 0, compareAt: null, available: true }],
    }
    setResults((r) => [{ input, url: null, image: null, issues: checkLiveProduct(input) }, ...r])
  }

  const stats = useMemo(() => {
    const critical = results.reduce((a, r) => a + r.issues.filter((i) => i.level === "critical").length, 0)
    const issues = results.reduce((a, r) => a + r.issues.length, 0)
    const ready = results.filter((r) => !r.issues.some((i) => i.level === "critical")).length
    return { critical, issues, ready }
  }, [results])

  const tab = (m: "link" | "manual", label: string) => (
    <button
      type="button"
      onClick={() => setMode(m)}
      className="px-3 py-1 rounded-md text-[10px] font-semibold"
      style={{ background: mode === m ? "rgba(99,102,241,0.22)" : "transparent", color: mode === m ? "#c7d2fe" : "var(--text-dim)" }}
    >
      {label}
    </button>
  )

  return (
    <PageShell
      title="GMC Pre-Launch Scanner"
      breadcrumb="Front End → GMC Pre-Launch Scanner"
      description="Check a product against Google Merchant Center rules before you list it. Every issue says how to fix it."
      stats={[
        { label: "Products checked", value: String(results.length) },
        { label: "Issues found", value: String(stats.issues) },
        { label: "Must fix", value: String(stats.critical) },
        { label: "Ready to list", value: String(stats.ready) },
      ]}
    >
      <div className="glass rounded-xl p-4 mb-4">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div className="inline-flex gap-1 p-0.5 rounded-lg" style={{ background: "rgba(255,255,255,0.04)" }}>
            {tab("link", "Paste a product link")}
            {tab("manual", "Type it in")}
          </div>
          <div className="text-[10px]" style={{ color: "var(--text-dim)" }}>
            New listing? The <Link href="/product-importer" className="underline">Product Importer</Link> runs this check for you. Already live? See{" "}
            <Link href="/listings" className="underline">Listings</Link>.
          </div>
        </div>

        {mode === "link" ? (
          <div className="flex gap-2">
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && scanLink()}
              className="flex-1 rounded-lg px-3 py-2 text-[11px] outline-none"
              style={inputStyle}
              placeholder="https://store.com/products/product-name"
            />
            <button onClick={scanLink} disabled={busy || !url.trim()} className="px-4 py-2 rounded-lg text-[11px] font-medium" style={{ background: "var(--accent)", color: "#fff", opacity: busy || !url.trim() ? 0.5 : 1 }}>
              {busy ? "Checking…" : "Check"}
            </button>
          </div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-4">
            <input value={manual.title} onChange={(e) => setManual({ ...manual, title: e.target.value })} className="sm:col-span-4 rounded-lg px-3 py-2 text-[11px] outline-none" style={inputStyle} placeholder="Title" />
            <textarea value={manual.description} onChange={(e) => setManual({ ...manual, description: e.target.value })} rows={3} className="sm:col-span-4 rounded-lg px-3 py-2 text-[11px] outline-none" style={inputStyle} placeholder="Description" />
            <input value={manual.price} onChange={(e) => setManual({ ...manual, price: e.target.value })} className="rounded-lg px-3 py-2 text-[11px] outline-none" style={inputStyle} placeholder="Price" />
            <input value={manual.images} onChange={(e) => setManual({ ...manual, images: e.target.value })} className="rounded-lg px-3 py-2 text-[11px] outline-none" style={inputStyle} placeholder="Number of images" />
            <input value={manual.productType} onChange={(e) => setManual({ ...manual, productType: e.target.value })} className="rounded-lg px-3 py-2 text-[11px] outline-none" style={inputStyle} placeholder="Product type (e.g. Dresses)" />
            <button onClick={scanManual} className="rounded-lg text-[11px] font-medium" style={{ background: "var(--accent)", color: "#fff" }}>
              Check
            </button>
          </div>
        )}
        {error && <div className="text-[11px] mt-2" style={{ color: "var(--red)" }}>{error}</div>}
      </div>

      {results.length === 0 ? (
        <div className="glass rounded-xl p-6 text-[11px] text-center" style={{ color: "var(--text-dim)" }}>
          Paste a product link above to see what Google would flag.
        </div>
      ) : (
        <div className="space-y-3">
          {results.map((r, i) => {
            const critical = r.issues.filter((x) => x.level === "critical")
            const tips = r.issues.filter((x) => x.level === "warning")
            return (
              <div key={i} className="glass rounded-xl p-4">
                <div className="flex items-start gap-3 mb-2">
                  {r.image && <img src={r.image} alt="" className="w-12 h-12 rounded-lg object-cover flex-shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] font-semibold truncate" style={{ color: "var(--text)" }}>{r.input.title}</div>
                    <div className="text-[10px]" style={{ color: "var(--text-dim)" }}>
                      {r.input.title.length} characters · {r.input.images} images · {r.input.variants.length} variants
                      {r.url && (
                        <>
                          {" · "}
                          <a href={r.url} target="_blank" rel="noreferrer" className="underline">open</a>
                        </>
                      )}
                    </div>
                  </div>
                  <span
                    className="px-2 py-0.5 rounded-full text-[9px] font-medium whitespace-nowrap"
                    style={critical.length ? { background: "rgba(239,68,68,0.12)", color: "#f87171" } : { background: "rgba(74,222,128,0.12)", color: "#4ade80" }}
                  >
                    {critical.length ? `${critical.length} must fix` : "Ready to list"}
                  </span>
                </div>
                {r.issues.length === 0 && <div className="text-[11px]" style={{ color: "#4ade80" }}>No issues found.</div>}
                {[...critical, ...tips].map((x, j) => (
                  <div key={j} className="flex gap-2 py-1.5 text-[11px]" style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                    <span className="w-14 flex-shrink-0 text-[9px] font-semibold uppercase pt-0.5" style={{ color: x.level === "critical" ? "#f87171" : "#fbbf24" }}>
                      {x.level === "critical" ? "Must fix" : "Tip"}
                    </span>
                    <div className="flex-1">
                      <div style={{ color: "var(--text)" }}>
                        <span style={{ color: "var(--text-dim)" }}>{x.field}: </span>
                        {x.message}
                      </div>
                      <div style={{ color: "var(--text-muted)" }}>Fix: {x.fix}</div>
                      <div className="text-[9px]" style={{ color: "var(--text-dim)" }}>Source: {x.source}</div>
                    </div>
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      )}
    </PageShell>
  )
}
