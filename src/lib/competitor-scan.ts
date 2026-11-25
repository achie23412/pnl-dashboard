// Browser-side competitor scan. Shopify blocks its public product feeds for
// server/bot traffic, but allows them (with CORS) from a normal browser, so the
// scan runs in the dashboard tab and posts the results to /api/opportunities/scan.
// Polite: a few stores at a time, small pages, nothing but public JSON.
"use client"

import { db } from "@/lib/db-client"
import { SHOPIFY_STORES } from "@/lib/constants"
import { currencyForMarkets } from "@/lib/opportunity-engine"
import type { SourceProduct } from "@/lib/shopify-import"

const NEWEST_LIMIT = 60
const BESTSELLER_LIMIT = 30
const BESTSELLER_HANDLES = ["best-sellers", "bestsellers", "best-seller", "bestseller", "best-selling"]
const CONCURRENCY = 3
const OWN_PAGES = 4

interface FeedProduct {
  id: number
  handle: string
  title: string
  product_type?: string
  vendor?: string
  tags?: string[] | string
  published_at?: string
  images?: { src: string }[]
  variants?: { price?: string; compare_at_price?: string | null }[]
}

export interface ScanProgress {
  done: number
  total: number
  current: string
  products: number
  failed: string[]
}

interface CompetitorRow {
  domain: string | null
  store_name: string | null
  store_url: string | null
  markets: string[] | null
  status: string | null
  niche: string | null
}

function hostOf(c: CompetitorRow): string | null {
  const raw = c.domain || c.store_url || ""
  try {
    return new URL(raw.startsWith("http") ? raw : `https://${raw}`).hostname.replace(/^www\./, "")
  } catch {
    return null
  }
}

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(15000) })
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    return null
  }
}

function toScanProduct(p: FeedProduct, rank: number | null) {
  const prices = (p.variants || []).map((v) => Number(v.price)).filter((n) => n > 0)
  const cmps = (p.variants || []).map((v) => Number(v.compare_at_price)).filter((n) => n > 0)
  const tags = Array.isArray(p.tags) ? p.tags : (p.tags || "").split(",").map((t) => t.trim()).filter(Boolean)
  return {
    id: p.id,
    handle: p.handle,
    title: p.title,
    image: p.images?.[0]?.src || null,
    product_type: p.product_type || null,
    vendor: p.vendor || null,
    tags,
    price: prices.length ? Math.min(...prices) : null,
    compare_at_price: cmps.length ? Math.max(...cmps) : null,
    published_at: p.published_at || null,
    bestseller_rank: rank,
  }
}

async function scanCompetitor(c: CompetitorRow, host: string) {
  const newest = await getJson<{ products: FeedProduct[] }>(`https://${host}/products.json?limit=${NEWEST_LIMIT}`)
  if (!newest) return null
  let best: FeedProduct[] = []
  for (const h of BESTSELLER_HANDLES) {
    const r = await getJson<{ products: FeedProduct[] }>(`https://${host}/collections/${h}/products.json?limit=${BESTSELLER_LIMIT}`)
    if (r?.products?.length) {
      best = r.products
      break
    }
  }
  // The product feed has no currency and /cart.js is blocked cross-origin, so
  // currency is taken from the competitor's market and marked as assumed.
  const markets = (c.markets || []).map((m) => m.toUpperCase())
  const currency = currencyForMarkets(markets)
  const products = [
    ...best.map((p, i) => toScanProduct(p, i + 1)),
    ...(newest.products || []).map((p) => toScanProduct(p, null)),
  ]
  return {
    domain: host,
    name: c.store_name || host,
    markets,
    currency,
    currency_assumed: true,
    products,
  }
}

async function scanOwnStore(store: string, domain: string) {
  const products: { id: number; handle: string; title: string; product_type: string | null }[] = []
  for (let page = 1; page <= OWN_PAGES; page++) {
    const r = await getJson<{ products: FeedProduct[] }>(`https://${domain}/products.json?limit=250&page=${page}`)
    if (!r?.products?.length) break
    products.push(...r.products.map((p) => ({ id: p.id, handle: p.handle, title: p.title, product_type: p.product_type || null })))
    if (r.products.length < 250) break
  }
  return { store, products }
}

async function post(body: unknown) {
  const res = await fetch("/api/opportunities/scan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.error || `Scan upload failed (${res.status})`)
  return json
}

// Scans every non-dead competitor plus our Google stores, then rebuilds opportunities.
export async function runCompetitorScan(onProgress: (p: ScanProgress) => void, opts: { onlyStatuses?: string[] } = {}) {
  const { data, error } = await db.from("competitors").select("domain,store_name,store_url,markets,status,niche")
  if (error) throw new Error(`Competitor tracker: ${error.message}`)
  const competitors = ((data || []) as CompetitorRow[])
    .filter((c) => c.status !== "dead")
    .filter((c) => !opts.onlyStatuses || opts.onlyStatuses.includes(c.status || ""))
  const hosts = Array.from(new Map(competitors.map((c) => [hostOf(c), c])).entries()).filter(([h]) => !!h) as [string, CompetitorRow][]

  const progress: ScanProgress = { done: 0, total: hosts.length + 1, current: "", products: 0, failed: [] }
  const batch: unknown[] = []
  const flush = async () => {
    if (!batch.length) return
    const competitorsBatch = batch.splice(0, batch.length)
    await post({ competitors: competitorsBatch })
  }

  let next = 0
  const worker = async () => {
    while (next < hosts.length) {
      const [host, c] = hosts[next++]
      progress.current = host
      onProgress({ ...progress })
      const result = await scanCompetitor(c, host)
      if (result) {
        batch.push(result)
        progress.products += result.products.length
        if (batch.length >= 8) await flush()
      } else {
        progress.failed.push(host)
      }
      progress.done++
      onProgress({ ...progress })
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker))
  await flush()

  // Our own Google stores' catalogues (duplicate / gap checks).
  progress.current = "our stores"
  onProgress({ ...progress })
  const own = []
  for (const name of ["Walsh & Farley", "Carter & Collins", "Susan & Allen"]) {
    const cfg = SHOPIFY_STORES[name]
    if (cfg) own.push(await scanOwnStore(name, cfg.domain))
  }
  await post({ own: own.filter((o) => o.products.length > 0) })
  progress.done++
  onProgress({ ...progress, current: "rebuilding opportunities" })

  const res = await fetch("/api/opportunities", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "recompute" }) })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.error || "Rebuilding opportunities failed")
  return { ...json, failed: progress.failed, own_scanned: own.map((o) => `${o.store}: ${o.products.length}`) }
}

// Source product for a Kopy-style import (public JSON, read in the browser).
export async function fetchSourceProduct(url: string): Promise<SourceProduct> {
  const u = new URL(url)
  const parts = u.pathname.split("/").filter(Boolean)
  const i = parts.indexOf("products")
  if (i < 0 || !parts[i + 1]) throw new Error("Not a product URL (needs /products/<handle>)")
  const handle = parts[i + 1].replace(/\.(json|js)$/, "")
  const r = await getJson<{ product: SourceProduct }>(`${u.origin}/products/${handle}.json`)
  if (!r?.product) throw new Error(`Couldn't read ${u.origin}/products/${handle}.json (store blocks it or product removed)`)
  return { ...r.product, handle }
}

// All product URLs of a store or collection (Kopy "Store or Collection" import).
export async function listCollectionProducts(url: string, max = 250): Promise<{ url: string; title: string; image: string | null; price: number | null }[]> {
  const u = new URL(url)
  const parts = u.pathname.split("/").filter(Boolean)
  const ci = parts.indexOf("collections")
  const base = ci >= 0 && parts[ci + 1] ? `${u.origin}/collections/${parts[ci + 1]}` : u.origin
  const out: { url: string; title: string; image: string | null; price: number | null }[] = []
  for (let page = 1; out.length < max && page <= 10; page++) {
    const r = await getJson<{ products: FeedProduct[] }>(`${base}/products.json?limit=250&page=${page}`)
    if (!r?.products?.length) break
    for (const p of r.products) {
      const prices = (p.variants || []).map((v) => Number(v.price)).filter((n) => n > 0)
      out.push({ url: `${u.origin}/products/${p.handle}`, title: p.title, image: p.images?.[0]?.src || null, price: prices.length ? Math.min(...prices) : null })
      if (out.length >= max) break
    }
    if (r.products.length < 250) break
  }
  return out
}
