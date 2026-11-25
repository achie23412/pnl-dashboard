// Saves competitor scan results (from the browser scan or the daily server
// scan): competitor_products (first_seen kept, last_seen = today),
// own_products (replaced per store) and competitor_scan_state.
import type { Db } from "@/lib/opportunity-db"

export interface ScanProduct {
  id: string | number
  handle: string
  title: string
  image?: string | null
  product_type?: string | null
  vendor?: string | null
  tags?: string[]
  price?: number | null
  compare_at_price?: number | null
  published_at?: string | null
  bestseller_rank?: number | null
}

export interface ScanCompetitor {
  domain: string
  name?: string | null
  markets?: string[]
  currency?: string | null
  currency_assumed?: boolean
  products: ScanProduct[]
}

export interface OwnScan {
  store: string
  products: { id: string | number; handle?: string; title: string; product_type?: string | null }[]
}

export const MAX_PRODUCTS_PER_REQUEST = 3000

export async function ingestScan(db: Db, body: { competitors?: ScanCompetitor[]; own?: OwnScan[] }) {
  const today = new Date().toISOString().slice(0, 10)
  const rows = (body.competitors || []).flatMap((c) =>
    (c.products || []).map((p) => ({
      competitor_domain: String(c.domain).toLowerCase(),
      competitor_name: c.name || null,
      markets: (c.markets || []).map((m) => String(m).toUpperCase()),
      shopify_product_id: String(p.id),
      handle: String(p.handle),
      title: String(p.title).slice(0, 500),
      url: `https://${String(c.domain).toLowerCase()}/products/${p.handle}`,
      image: p.image || null,
      product_type: p.product_type || null,
      vendor: p.vendor || null,
      tags: (p.tags || []).slice(0, 30),
      price: p.price ?? null,
      compare_at_price: p.compare_at_price ?? null,
      currency: c.currency || null,
      currency_assumed: !!c.currency_assumed,
      published_at: p.published_at || null,
      bestseller_rank: p.bestseller_rank ?? null,
      last_seen: today,
    })),
  )
  if (rows.length > MAX_PRODUCTS_PER_REQUEST) throw new Error(`Too many products in one request (${rows.length}); send in batches`)

  // De-duplicate (same product in the feed and the best-seller list: keep the rank).
  const byKey = new Map<string, (typeof rows)[number]>()
  for (const r of rows) {
    const k = `${r.competitor_domain}:${r.shopify_product_id}`
    const prev = byKey.get(k)
    if (!prev || (r.bestseller_rank != null && (prev.bestseller_rank == null || r.bestseller_rank < prev.bestseller_rank))) byKey.set(k, r)
  }
  const unique = Array.from(byKey.values())
  for (let i = 0; i < unique.length; i += 500) {
    const { error } = await db.from("competitor_products").upsert(unique.slice(i, i + 500), { onConflict: "competitor_domain,shopify_product_id" })
    if (error) throw new Error(`competitor_products: ${error.message}`)
  }

  const now = new Date().toISOString()
  const state = (body.competitors || []).map((c) => ({
    domain: String(c.domain).toLowerCase(),
    last_scanned: now,
    last_ok: true,
    last_error: null,
    products_read: (c.products || []).length,
  }))
  if (state.length) await db.from("competitor_scan_state").upsert(state, { onConflict: "domain" })

  let ownRows = 0
  for (const o of body.own || []) {
    if (!o.store || !o.products?.length) continue
    const { error: delErr } = await db.from("own_products").delete().eq("store", o.store)
    if (delErr) throw new Error(`own_products: ${delErr.message}`)
    const list = o.products.map((p) => ({
      store: o.store,
      shopify_product_id: String(p.id),
      handle: p.handle || null,
      title: String(p.title).slice(0, 500),
      product_type: p.product_type || null,
    }))
    for (let i = 0; i < list.length; i += 500) {
      const { error } = await db.from("own_products").upsert(list.slice(i, i + 500), { onConflict: "store,shopify_product_id" })
      if (error) throw new Error(`own_products: ${error.message}`)
    }
    ownRows += list.length
  }
  return { competitor_products: unique.length, own_products: ownRows }
}
