// Kopy-style product import: copy a product from a public Shopify product feed
// (/products/<handle>.json) into one of our stores via the Admin API.
// Always created as DRAFT. Never published here.
import { SHOPIFY_STORES } from "@/lib/constants"
import { getShopifyToken } from "@/lib/shopify-sessions"

const API = "2024-10"

export interface SourceProduct {
  id?: number | string
  title: string
  handle: string
  body_html?: string | null
  product_type?: string | null
  tags?: string | string[] | null
  options?: { name: string; values: string[] }[]
  variants?: {
    title?: string
    price?: string | number | null
    compare_at_price?: string | number | null
    sku?: string | null
    option1?: string | null
    option2?: string | null
    option3?: string | null
    grams?: number | null
  }[]
  images?: { src: string }[]
}

export type PriceRule =
  | { type: "keep" }
  | { type: "multiply"; value: number }
  | { type: "add"; value: number }
  | { type: "fixed"; value: number }

export function applyPriceRule(price: number, rule: PriceRule): number {
  let p = price
  if (rule.type === "multiply") p = price * rule.value
  else if (rule.type === "add") p = price + rule.value
  else if (rule.type === "fixed") p = rule.value
  return Math.max(0, Math.round(p * 100) / 100)
}

export function handleFromUrl(url: string): string | null {
  try {
    const u = new URL(url)
    const parts = u.pathname.split("/").filter(Boolean)
    const i = parts.indexOf("products")
    if (i < 0 || !parts[i + 1]) return null
    return parts[i + 1].replace(/\.json$/, "").replace(/\.js$/, "")
  } catch {
    return null
  }
}

export function adminUrl(store: string, productId: string | number): string | null {
  const cfg = SHOPIFY_STORES[store]
  if (!cfg) return null
  return `https://admin.shopify.com/store/${cfg.domain.replace(".myshopify.com", "")}/products/${productId}`
}

// Build the Admin API payload. Vendor is our store (never the competitor's brand).
export function buildShopifyPayload(src: SourceProduct, store: string, rule: PriceRule, extraTags: string[]) {
  const srcTags = Array.isArray(src.tags) ? src.tags : (src.tags || "").split(",").map((t) => t.trim()).filter(Boolean)
  const options = (src.options || []).filter((o) => o.name && o.name !== "Title").map((o) => ({ name: o.name, values: o.values }))
  const variants = (src.variants || []).map((v) => {
    const price = applyPriceRule(Number(v.price) || 0, rule)
    const cmp = v.compare_at_price != null && Number(v.compare_at_price) > 0 ? applyPriceRule(Number(v.compare_at_price), rule) : null
    return {
      option1: v.option1 ?? undefined,
      option2: v.option2 ?? undefined,
      option3: v.option3 ?? undefined,
      price: price.toFixed(2),
      compare_at_price: cmp != null && cmp > price ? cmp.toFixed(2) : null,
      sku: v.sku || undefined,
      grams: v.grams ?? undefined,
      inventory_management: null,
    }
  })
  return {
    product: {
      title: src.title,
      handle: src.handle,
      body_html: src.body_html || "",
      vendor: store,
      product_type: src.product_type || "",
      tags: Array.from(new Set([...srcTags.filter((t) => !/^(sale|new|bestseller)$/i.test(t)), ...extraTags])).join(", "),
      status: "draft" as const,
      ...(options.length ? { options } : {}),
      variants: variants.length ? variants : [{ price: "0.00" }],
      images: (src.images || []).slice(0, 20).map((i) => ({ src: i.src })),
    },
  }
}

export interface ImportResult {
  productId: string
  adminUrl: string | null
  existed: boolean
}

async function shopifyFetch(domain: string, token: string, path: string, init?: RequestInit) {
  const res = await fetch(`https://${domain}/admin/api/${API}/${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token, ...(init?.headers || {}) },
    cache: "no-store",
    signal: AbortSignal.timeout(25000),
  })
  const text = await res.text()
  let json: unknown = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = null
  }
  return { ok: res.ok, status: res.status, json, text }
}

// Create the draft, unless a product with the same handle already exists in the
// store (e.g. a retry after a timeout, or imported earlier via Kopy): then link it.
export async function importToShopify(store: string, src: SourceProduct, rule: PriceRule, extraTags: string[]): Promise<ImportResult> {
  const cfg = SHOPIFY_STORES[store]
  if (!cfg) throw new Error(`Unknown store "${store}"`)
  const token = await getShopifyToken(cfg.domain, cfg.envKey)
  if (!token) {
    const suffix = cfg.envKey.replace("SHOPIFY_TOKEN_", "")
    throw new Error(
      `No Shopify Admin token for ${store}. Add ${cfg.envKey} (or SHOPIFY_CLIENT_ID_${suffix} + SHOPIFY_CLIENT_SECRET_${suffix}) in Vercel with the write_products scope, or import it in Kopy and use "Mark imported".`,
    )
  }
  const existing = await shopifyFetch(cfg.domain, token, `products.json?handle=${encodeURIComponent(src.handle)}&fields=id,handle,status`)
  if (!existing.ok) throw new Error(`Shopify ${existing.status}: ${existing.text.slice(0, 300)}`)
  const found = ((existing.json as { products?: { id: number }[] })?.products || [])[0]
  if (found) return { productId: String(found.id), adminUrl: adminUrl(store, found.id), existed: true }

  const created = await shopifyFetch(cfg.domain, token, "products.json", {
    method: "POST",
    body: JSON.stringify(buildShopifyPayload(src, store, rule, extraTags)),
  })
  if (!created.ok) throw new Error(`Shopify ${created.status}: ${created.text.slice(0, 300)}`)
  const id = (created.json as { product?: { id: number } })?.product?.id
  if (!id) throw new Error("Shopify did not return a product id")
  return { productId: String(id), adminUrl: adminUrl(store, id), existed: false }
}

// Product id from a Shopify admin URL (admin.shopify.com/store/x/products/123).
export function productIdFromAdminUrl(url: string): string | null {
  const m = url.match(/\/products\/(\d+)/)
  return m ? m[1] : null
}
