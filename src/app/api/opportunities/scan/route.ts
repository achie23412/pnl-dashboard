import { NextRequest, NextResponse } from "next/server"
import { getServiceClient } from "@/lib/supabase"

export const maxDuration = 60

// Receives the results of a competitor scan run in the dashboard (the browser
// reads competitors' public Shopify product feeds; Shopify blocks those from
// servers). Upserts competitor_products: first_seen is kept, last_seen = today.

interface ScanProduct {
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

interface ScanCompetitor {
  domain: string
  name?: string | null
  markets?: string[]
  currency?: string | null
  currency_assumed?: boolean
  products: ScanProduct[]
}

interface OwnScan {
  store: string
  products: { id: string | number; handle?: string; title: string; product_type?: string | null }[]
}

const MAX_PRODUCTS_PER_REQUEST = 3000

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { competitors?: ScanCompetitor[]; own?: OwnScan[] } | null
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  const db = getServiceClient()
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
  if (rows.length > MAX_PRODUCTS_PER_REQUEST) {
    return NextResponse.json({ error: `Too many products in one request (${rows.length}); send in batches` }, { status: 413 })
  }
  // De-duplicate within the batch (same product from feed + best-seller list).
  const byKey = new Map<string, (typeof rows)[number]>()
  for (const r of rows) {
    const k = `${r.competitor_domain}:${r.shopify_product_id}`
    const prev = byKey.get(k)
    if (!prev || (r.bestseller_rank != null && (prev.bestseller_rank == null || r.bestseller_rank < prev.bestseller_rank))) byKey.set(k, r)
  }
  const unique = Array.from(byKey.values())
  for (let i = 0; i < unique.length; i += 500) {
    const { error } = await db.from("competitor_products").upsert(unique.slice(i, i + 500), { onConflict: "competitor_domain,shopify_product_id" })
    if (error) return NextResponse.json({ error: `competitor_products: ${error.message}` }, { status: 500 })
  }

  // Own catalogue: replace per store.
  let ownRows = 0
  for (const o of body.own || []) {
    if (!o.store) continue
    const { error: delErr } = await db.from("own_products").delete().eq("store", o.store)
    if (delErr) return NextResponse.json({ error: `own_products: ${delErr.message}` }, { status: 500 })
    const list = (o.products || []).map((p) => ({
      store: o.store,
      shopify_product_id: String(p.id),
      handle: p.handle || null,
      title: String(p.title).slice(0, 500),
      product_type: p.product_type || null,
    }))
    for (let i = 0; i < list.length; i += 500) {
      const { error } = await db.from("own_products").upsert(list.slice(i, i + 500), { onConflict: "store,shopify_product_id" })
      if (error) return NextResponse.json({ error: `own_products: ${error.message}` }, { status: 500 })
    }
    ownRows += list.length
  }

  return NextResponse.json({ ok: true, competitor_products: unique.length, own_products: ownRows })
}
