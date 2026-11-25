import { NextResponse } from "next/server"
import { SHOPIFY_STORES } from "@/lib/constants"
import { checkLiveProduct, type LiveIssue } from "@/lib/gmc-check"

export const maxDuration = 60
export const dynamic = "force-dynamic"

// Live = published to the Online Store; read from each store's public products feed (no API key needed).
const GOOGLE_STORES: Record<string, string> = {
  "Walsh & Farley": "walshandfarley.com",
  "Carter & Collins": "carterandcollins.com",
  "Susan & Allen": "susanandallen.com",
}

export type LiveListing = {
  id: number
  store: string
  title: string
  handle: string
  url: string
  adminUrl: string
  image: string | null
  images: number
  productType: string
  price: number
  compareAt: number | null
  variants: number
  inStock: number
  publishedAt: string
  issues: LiveIssue[]
  alsoOn: string[]
}

type RawProduct = {
  id: number
  title: string
  handle: string
  body_html: string | null
  product_type: string
  published_at: string
  images: { src: string }[]
  variants: { price: string; compare_at_price: string | null; available: boolean }[]
}

async function fetchStore(store: string, domain: string): Promise<{ products: RawProduct[]; error?: string }> {
  const products: RawProduct[] = []
  try {
    for (let page = 1; page <= 40; page++) {
      const res = await fetch(`https://${domain}/products.json?limit=250&page=${page}`, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; pnl-dashboard)" },
        next: { revalidate: 900 }, // 15 min cache, keeps us under Shopify's rate limit
      })
      if (!res.ok) return { products, error: `${store}: feed returned ${res.status}` }
      const batch: RawProduct[] = (await res.json()).products || []
      products.push(...batch)
      if (batch.length < 250) break
    }
    return { products }
  } catch (e) {
    return { products, error: `${store}: ${e instanceof Error ? e.message : String(e)}` }
  }
}

const norm = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()

export async function GET() {
  const results = await Promise.all(Object.entries(GOOGLE_STORES).map(async ([store, domain]) => ({ store, domain, ...(await fetchStore(store, domain)) })))

  // Coverage: same handle or same title in another store
  const where = new Map<string, Set<string>>()
  for (const r of results) for (const p of r.products) {
    for (const k of [`h:${p.handle}`, `t:${norm(p.title)}`]) {
      if (!where.has(k)) where.set(k, new Set())
      where.get(k)!.add(r.store)
    }
  }

  const listings: LiveListing[] = []
  for (const r of results) {
    const adminHandle = SHOPIFY_STORES[r.store]?.domain.replace(".myshopify.com", "")
    for (const p of r.products) {
      const variants = (p.variants || []).map((v) => ({
        price: Number(v.price) || 0,
        compareAt: v.compare_at_price ? Number(v.compare_at_price) : null,
        available: !!v.available,
      }))
      const descriptionText = (p.body_html || "").replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim()
      const issues = checkLiveProduct({ title: p.title, descriptionText, productType: p.product_type || "", images: p.images?.length || 0, variants })
      const others = new Set<string>()
      for (const k of [`h:${p.handle}`, `t:${norm(p.title)}`]) where.get(k)?.forEach((s) => { if (s !== r.store) others.add(s) })
      const prices = variants.map((v) => v.price).filter((x) => x > 0)
      const compare = variants.map((v) => v.compareAt).filter((x): x is number => !!x)
      listings.push({
        id: p.id,
        store: r.store,
        title: p.title,
        handle: p.handle,
        url: `https://${r.domain}/products/${p.handle}`,
        adminUrl: `https://admin.shopify.com/store/${adminHandle}/products/${p.id}`,
        image: p.images?.[0]?.src || null,
        images: p.images?.length || 0,
        productType: p.product_type || "",
        price: prices.length ? Math.min(...prices) : 0,
        compareAt: compare.length ? Math.max(...compare) : null,
        variants: variants.length,
        inStock: variants.filter((v) => v.available).length,
        publishedAt: p.published_at,
        issues,
        alsoOn: Array.from(others),
      })
    }
  }

  return NextResponse.json({
    fetchedAt: new Date().toISOString(),
    stores: results.map((r) => ({ store: r.store, domain: r.domain, count: r.products.length, error: r.error || null })),
    listings,
  })
}
