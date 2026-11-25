// Daily automatic competitor scan (server side). Works through tracked
// competitors oldest-scanned first within a time budget, so every store is
// refreshed every few days without anyone pressing a button. Also refreshes
// our own Google stores' catalogues (once a day) and rebuilds opportunities so
// season timing and scores move with the date.
import { SHOPIFY_STORES } from "@/lib/constants"
import { currencyForMarkets } from "@/lib/opportunity-engine"
import { recomputeOpportunities, selectAll, type Db } from "@/lib/opportunity-db"
import { ingestScan, type ScanCompetitor, type OwnScan, type ScanProduct } from "@/lib/opportunity-ingest"

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"
const NEWEST_LIMIT = 60
const BESTSELLER_LIMIT = 30
const BESTSELLER_HANDLES = ["best-sellers", "bestsellers"]
const CONCURRENCY = 6
const OWN_STORES = ["Walsh & Farley", "Carter & Collins", "Susan & Allen"]

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

async function getJson<T>(url: string): Promise<{ data: T | null; status: number }> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(8000) })
    if (!res.ok) return { data: null, status: res.status }
    return { data: (await res.json()) as T, status: res.status }
  } catch {
    return { data: null, status: 0 }
  }
}

function toScanProduct(p: FeedProduct, rank: number | null): ScanProduct {
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

interface CompetitorRow {
  domain: string | null
  store_name: string | null
  store_url: string | null
  markets: string[] | null
  status: string | null
}

function hostOf(c: CompetitorRow): string | null {
  const raw = c.domain || c.store_url || ""
  try {
    return new URL(raw.startsWith("http") ? raw : `https://${raw}`).hostname.replace(/^www\./, "")
  } catch {
    return null
  }
}

export interface AutoScanResult {
  scanned: number
  products: number
  failed: { domain: string; status: number }[]
  blocked: number // failures with HTTP 429/403 (Shopify bot protection)
  remaining: number // competitors not scanned in the last 24h
  own: string[]
  recompute: { created: number; updated: number; resurfaced: number; removed: number; total: number } | null
  error?: string
}

export async function runAutoScan(db: Db, opts: { budgetMs?: number; recompute?: boolean } = {}): Promise<AutoScanResult> {
  const started = Date.now()
  const budget = opts.budgetMs ?? 38000
  const [comps, states] = await Promise.all([
    selectAll<CompetitorRow>(db, "competitors", "domain,store_name,store_url,markets,status"),
    selectAll<{ domain: string; last_scanned: string | null }>(db, "competitor_scan_state", "domain,last_scanned"),
  ])
  const lastScan = new Map(states.map((s) => [s.domain, s.last_scanned || ""]))
  const queue = Array.from(
    new Map(comps.filter((c) => c.status !== "dead").map((c) => [hostOf(c), c])).entries(),
  )
    .filter(([h]) => !!h)
    .map(([h, c]) => ({ host: h as string, c }))
    .sort((a, b) => (lastScan.get(a.host) || "").localeCompare(lastScan.get(b.host) || ""))

  const results: ScanCompetitor[] = []
  const failed: { domain: string; status: number }[] = []
  let next = 0
  const worker = async () => {
    while (next < queue.length && Date.now() - started < budget) {
      const { host, c } = queue[next++]
      const feed = await getJson<{ products: FeedProduct[] }>(`https://${host}/products.json?limit=${NEWEST_LIMIT}`)
      if (!feed.data) {
        failed.push({ domain: host, status: feed.status })
        continue
      }
      let best: FeedProduct[] = []
      for (const h of BESTSELLER_HANDLES) {
        const r = await getJson<{ products: FeedProduct[] }>(`https://${host}/collections/${h}/products.json?limit=${BESTSELLER_LIMIT}`)
        if (r.data?.products?.length) {
          best = r.data.products
          break
        }
      }
      const markets = (c.markets || []).map((m) => m.toUpperCase())
      results.push({
        domain: host,
        name: c.store_name || host,
        markets,
        currency: currencyForMarkets(markets),
        currency_assumed: true,
        products: [...best.map((p, i) => toScanProduct(p, i + 1)), ...(feed.data.products || []).map((p) => toScanProduct(p, null))],
      })
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker))

  // Save in batches of ~8 stores (keeps each upsert small).
  for (let i = 0; i < results.length; i += 8) await ingestScan(db, { competitors: results.slice(i, i + 8) })
  if (failed.length) {
    const now = new Date().toISOString()
    await db.from("competitor_scan_state").upsert(
      failed.map((f) => ({ domain: f.domain, last_scanned: now, last_ok: false, last_error: f.status ? `HTTP ${f.status}` : "timeout / network", products_read: 0 })),
      { onConflict: "domain" },
    )
  }

  // Own catalogues once a day.
  const own: string[] = []
  const { data: lastOwn } = await db.from("own_products").select("scanned_at").order("scanned_at", { ascending: false }).limit(1)
  const ownAge = lastOwn?.[0]?.scanned_at ? Date.now() - new Date(lastOwn[0].scanned_at).getTime() : Infinity
  if (ownAge > 20 * 3600 * 1000 && Date.now() - started < budget + 5000) {
    const scans: OwnScan[] = []
    for (const store of OWN_STORES) {
      const cfg = SHOPIFY_STORES[store]
      if (!cfg) continue
      const products: OwnScan["products"] = []
      for (let page = 1; page <= 4; page++) {
        const r = await getJson<{ products: FeedProduct[] }>(`https://${cfg.domain}/products.json?limit=250&page=${page}`)
        if (!r.data?.products?.length) break
        products.push(...r.data.products.map((p) => ({ id: p.id, handle: p.handle, title: p.title, product_type: p.product_type || null })))
        if (r.data.products.length < 250) break
      }
      if (products.length) scans.push({ store, products })
      own.push(`${store}: ${products.length}`)
    }
    if (scans.length) await ingestScan(db, { own: scans })
  }

  const recompute = opts.recompute === false ? null : await recomputeOpportunities(db)

  const dayAgo = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
  const scannedNow = new Set([...results.map((r) => r.domain), ...failed.map((f) => f.domain)])
  const remaining = queue.filter((q) => !scannedNow.has(q.host) && (lastScan.get(q.host) || "") < dayAgo).length
  return {
    scanned: results.length,
    products: results.reduce((a, r) => a + r.products.length, 0),
    failed,
    blocked: failed.filter((f) => f.status === 429 || f.status === 403).length,
    remaining,
    own,
    recompute,
  }
}
