import { NextResponse } from "next/server"
import { COGS_SHEET_ID, STORE_SHEET_TAB, SHOPIFY_STORES, WINDSOR_ACCOUNT_MAP, TRANSACTION_FEE_RATE, MEDIA_BUYER_FEE_RATE, breakEvenRoas } from "@/lib/constants"
import { getShopifyToken } from "@/lib/shopify-sessions"
import { fetchShopifyOrderTotals, fetchGoogleProductSpend } from "@/lib/windsor"
import type { GoogleProductSpend } from "@/lib/windsor"
import { STORE_CURRENCY, fetchLatestEurRates } from "@/lib/currency"
import type { Currency } from "@/lib/currency"
import { getServiceClient } from "@/lib/supabase"

export const maxDuration = 60

interface ShopifyLineItem {
  product_id?: number | null
  title: string
  quantity: number
  price: string
}

interface ShopifyOrder {
  id: number
  created_at: string
  line_items: ShopifyLineItem[]
  cancelled_at: string | null
  financial_status: string
}

function parseCsvRow(row: string): string[] {
  const fields: string[] = []
  let current = ""
  let inQuotes = false
  for (let i = 0; i < row.length; i++) {
    const ch = row[i]
    if (ch === '"') {
      if (inQuotes && row[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (ch === "," && !inQuotes) {
      fields.push(current)
      current = ""
    } else {
      current += ch
    }
  }
  fields.push(current)
  return fields
}

function parseNumber(val: string): number {
  const cleaned = val.replace(/[£$€]/g, "").replace(/\./g, "").replace(",", ".")
  return parseFloat(cleaned) || 0
}

interface CogsRow {
  product_name: string
  cogs_usd: number
  retail_price: string
  cog_pct: string
  category: string
}

async function fetchCogsProducts(store: string): Promise<CogsRow[]> {
  const tab = STORE_SHEET_TAB[store]
  if (!tab) return []

  try {
    const url = `https://docs.google.com/spreadsheets/d/${COGS_SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tab)}&range=A3:O600`
    const resp = await fetch(url, { next: { revalidate: 300 }, signal: AbortSignal.timeout(5000) })
    if (!resp.ok) return []

    const csv = await resp.text()
    const rows = csv.split("\n").filter((r) => r.trim())
    if (rows.length < 2) return []

    const products: CogsRow[] = []
    for (let i = 1; i < rows.length; i++) {
      const cols = parseCsvRow(rows[i])
      const name = (cols[1] || "").trim()
      const cogsStr = (cols[9] || "").trim()
      if (!name || !cogsStr) continue

      const cogsUsd = parseNumber(cogsStr)
      if (cogsUsd <= 0) continue

      products.push({
        product_name: name,
        cogs_usd: cogsUsd,
        retail_price: (cols[8] || "").trim(),
        cog_pct: (cols[13] || "").trim(),
        category: (cols[3] || "").trim(),
      })
    }
    return products
  } catch {
    return []
  }
}

interface ShipgoodsItem {
  product_id?: string
  title: string
  unit_cost: number
  quantity: number
  product_cost: number
  sold_price: number
}

interface ShipgoodsOrder {
  row_type?: string
  store_name?: string
  order_id?: string
  items: ShipgoodsItem[] | null
}

interface ShipgoodsResponse {
  code: number
  data: {
    list: ShipgoodsOrder[]
    pagination: { total_pages: number; page: number }
  }
}

type SgCogsMap = Map<string, { avgCogs: number; totalQty: number }>
type SalesMap = Map<string, { qty: number; revenue: number; productIds: string[] }>

interface ShipgoodsData {
  // keyed by ShipGoods store_name (= the *.myshopify.com prefix, e.g. "xq9pn7-dw")
  cogsByStore: Map<string, SgCogsMap>
  salesByStore: Map<string, SalesMap>
  error: string | null
}

// Store name in ShipGoods = the myshopify domain prefix of the store.
function shipgoodsStoreKey(store: string): string | null {
  const cfg = SHOPIFY_STORES[store]
  return cfg ? cfg.domain.replace(".myshopify.com", "") : null
}

const SG_TIMEOUT_MS = 25000
const SG_MAX_PAGES = 30

// One pass over ShipGoods order-cost-items for the last 30 days, split per store.
// Page 1 tells us total_pages; the remaining pages are fetched in parallel
// (one page takes ~7s, so sequential reads would hit the 60s function limit).
async function fetchShipgoodsData(dateFrom: string, dateTo: string): Promise<ShipgoodsData> {
  const token = process.env.SHIPGOODS_TOKEN
  const base = process.env.SHIPGOODS_BASE || "https://dashboard.shipgoods.eu"
  const empty: ShipgoodsData = { cogsByStore: new Map(), salesByStore: new Map(), error: null }
  if (!token) return { ...empty, error: "ShipGoods: SHIPGOODS_TOKEN not set" }

  const fetchPage = async (page: number): Promise<ShipgoodsResponse> => {
    const url = `${base}/api/v1/shop/analytics/order-cost-items?date_from=${dateFrom}&date_to=${dateTo}&per_page=100&page=${page}`
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      signal: AbortSignal.timeout(SG_TIMEOUT_MS),
      next: { revalidate: 3600 }, // ShipGoods is slow (~7s/page); cache each page for 1h
    })
    if (!res.ok) throw new Error(`page ${page}: HTTP ${res.status}`)
    const json: ShipgoodsResponse = await res.json()
    if (!json.data?.list) throw new Error(`page ${page}: unexpected response`)
    return json
  }

  // sold_price on ShipGoods items is the LIST price per unit, before order-level
  // discounts (bundles etc.). Scale each order's items to the real Shopify order
  // total (Windsor, matched on order id) so product revenue matches what was paid.
  // Started now, awaited after the ShipGoods pages, so both run in parallel.
  const errors: string[] = []
  const orderTotalsPromise = fetchShopifyOrderTotals(dateFrom, dateTo).catch((e: unknown) => {
    errors.push(`Windsor order totals (product revenue shown at list price): ${e instanceof Error ? e.message : String(e)}`)
    return new Map<string, number>()
  })
  let orderTotals = new Map<string, number>()

  const costAcc = new Map<string, Map<string, { totalCost: number; totalQty: number }>>()
  const salesByStore = new Map<string, SalesMap>()
  const seenOrders = new Set<string>()
  const addPage = (json: ShipgoodsResponse) => {
    for (const order of json.data.list) {
      if (order.row_type && order.row_type !== "order_charge") continue
      if (!order.items) continue
      if (order.order_id) {
        if (seenOrders.has(order.order_id)) continue
        seenOrders.add(order.order_id)
      }
      const listTotal = order.items.reduce((a, i) => a + (Number(i.sold_price) || 0) * (Number(i.quantity) || 0), 0)
      const paid = order.order_id ? orderTotals.get(order.order_id) : undefined
      const scale = paid != null && listTotal > 0 ? paid / listTotal : 1
      const storeKey = order.store_name || "unknown"
      if (!costAcc.has(storeKey)) costAcc.set(storeKey, new Map())
      if (!salesByStore.has(storeKey)) salesByStore.set(storeKey, new Map())
      const costs = costAcc.get(storeKey)!
      const sales = salesByStore.get(storeKey)!
      for (const item of order.items) {
        if (!item.title) continue
        const qty = Number(item.quantity) || 0
        const c = costs.get(item.title) || { totalCost: 0, totalQty: 0 }
        c.totalCost += (Number(item.unit_cost) || 0) * qty
        c.totalQty += qty
        costs.set(item.title, c)
        const s = sales.get(item.title) || { qty: 0, revenue: 0, productIds: [] }
        s.qty += qty
        s.revenue += (Number(item.sold_price) || 0) * qty * scale
        if (item.product_id && s.productIds.indexOf(String(item.product_id)) < 0) s.productIds.push(String(item.product_id))
        sales.set(item.title, s)
      }
    }
  }

  const pages: ShipgoodsResponse[] = []
  try {
    const first = await fetchPage(1)
    pages.push(first)
    const totalPages = Math.min(first.data.pagination?.total_pages || 1, SG_MAX_PAGES)
    const rest = await Promise.allSettled(
      Array.from({ length: Math.max(totalPages - 1, 0) }, (_, i) => fetchPage(i + 2)),
    )
    for (const r of rest) {
      if (r.status === "fulfilled") pages.push(r.value)
      else errors.push(`ShipGoods ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`)
    }
  } catch (e: unknown) {
    errors.push(`ShipGoods ${e instanceof Error ? e.message : String(e)}`)
  }
  orderTotals = await orderTotalsPromise
  for (const p of pages) addPage(p)

  const cogsByStore = new Map<string, SgCogsMap>()
  costAcc.forEach((products, storeKey) => {
    const m: SgCogsMap = new Map()
    products.forEach((data, title) => {
      m.set(title, {
        avgCogs: data.totalQty > 0 ? Math.round((data.totalCost / data.totalQty) * 100) / 100 : 0,
        totalQty: data.totalQty,
      })
    })
    cogsByStore.set(storeKey, m)
  })

  return { cogsByStore, salesByStore, error: errors.length > 0 ? errors.join("; ") : null }
}

async function fetchShopifySales(domain: string, token: string, dateFrom: string, dateTo: string): Promise<SalesMap> {
  const sales: SalesMap = new Map()

  let url: string | null = `https://${domain}/admin/api/2024-10/orders.json?status=any&created_at_min=${dateFrom}T00:00:00Z&created_at_max=${dateTo}T23:59:59Z&limit=250&fields=id,created_at,line_items,cancelled_at,financial_status`
  let pages = 0

  while (url && pages < 10) {
    pages++
    const res: Response = await fetch(url, {
      headers: { "X-Shopify-Access-Token": token },
      signal: AbortSignal.timeout(15000),
    })

    if (!res.ok) throw new Error(`Shopify orders HTTP ${res.status}`)

    const data = await res.json()
    const orders: ShopifyOrder[] = data.orders || []

    for (const order of orders) {
      if (order.cancelled_at) continue
      for (const item of order.line_items) {
        const title = item.title
        const existing = sales.get(title) || { qty: 0, revenue: 0, productIds: [] }
        existing.qty += item.quantity
        existing.revenue += parseFloat(item.price) * item.quantity
        if (item.product_id && existing.productIds.indexOf(String(item.product_id)) < 0) existing.productIds.push(String(item.product_id))
        sales.set(title, existing)
      }
    }

    const linkHeader = res.headers.get("link")
    const nextMatch = linkHeader?.match(/<([^>]+)>;\s*rel="next"/)
    url = nextMatch ? nextMatch[1] : null
  }

  return sales
}

interface CatalogProduct {
  product_name: string
  store: string
  cogs_usd: number | null
  retail_price: string
  cog_pct: string
  category: string
  units_sold: number
  sales_revenue: number
  cogs_source: "shipgoods" | "sheet" | "none"
  // Ad spend attributed to this product (Google Shopping, matched on Shopify
  // product id). null = no per-product spend for this store (Meta/TikTok).
  ad_spend: number | null
  roas: number | null
  // Breakeven ROAS = 1 / (1 - COGS% - transaction fee %), from this product's
  // COGS per unit (converted to store currency) and its average selling price.
  be_roas: number | null
  // Shopify product ids in the store (empty when unknown)
  product_ids: string[]
  // Net profit in store currency, profit-sheet style: revenue − COGS − ad spend
  // − media buyer fee − transaction fee. Without per-product spend (Meta stores)
  // it is the profit before ads. null when COGS is unknown or there are no sales.
  profit: number | null
  margin: number | null // profit ÷ revenue × 100
  margin_basis: "net" | "before_ads" | null
}

interface StoreContext {
  // Shopify product id -> spend, for stores with per-product (Google) spend
  productSpend: Map<string, number> | null
  // multiply a USD COGS amount by this to get store currency
  usdToStore: number
  txnRate: number
  // media buyer fee as a share of ad spend (profit sheet: 10% on Google stores)
  mbRate: number
}

function beRoas(cogsUsdPerUnit: number | null, units: number, revenue: number, ctx: StoreContext): number | null {
  if (cogsUsdPerUnit == null || units <= 0 || revenue <= 0) return null
  const cogsPct = (cogsUsdPerUnit * ctx.usdToStore * units) / revenue
  const be = breakEvenRoas(cogsPct, ctx.txnRate, ctx.mbRate)
  return Number.isFinite(be) ? be : null
}

function netMargin(cogsUsdPerUnit: number | null, units: number, revenue: number, adSpend: number | null, ctx: StoreContext) {
  if (cogsUsdPerUnit == null || units <= 0 || revenue <= 0) return { profit: null, margin: null, margin_basis: null }
  const cogs = cogsUsdPerUnit * ctx.usdToStore * units
  const ads = adSpend ?? 0
  const profit = revenue - cogs - ads - ads * ctx.mbRate - revenue * ctx.txnRate
  return {
    profit: Math.round(profit * 100) / 100,
    margin: Math.round((profit / revenue) * 1000) / 10,
    margin_basis: (adSpend == null ? "before_ads" : "net") as "net" | "before_ads",
  }
}

function findShipgoodsCogs(
  productName: string,
  sgCogs: Map<string, { avgCogs: number; totalQty: number }>
): { avgCogs: number; totalQty: number } | undefined {
  const direct = sgCogs.get(productName)
  if (direct) return direct

  const normalizedName = productName.toLowerCase().trim()
  const entries = Array.from(sgCogs.entries())
  for (let i = 0; i < entries.length; i++) {
    const [title, data] = entries[i]
    if (title.toLowerCase().trim() === normalizedName) return data
    if (
      title.toLowerCase().includes(normalizedName.slice(0, 25)) ||
      normalizedName.includes(title.toLowerCase().slice(0, 25))
    ) {
      return data
    }
  }
  return undefined
}

interface StoreBuildResult {
  products: CatalogProduct[]
  salesSource: "shopify" | "shipgoods" | "none"
  errors: string[]
}

async function buildStoreProducts(store: string, sg: ShipgoodsData, ctx: StoreContext, dateFrom: string, dateTo: string): Promise<StoreBuildResult> {
  const errors: string[] = []
  const cogsProducts = await fetchCogsProducts(store)
  const sgKey = shipgoodsStoreKey(store)
  const sgCogs: SgCogsMap = (sgKey && sg.cogsByStore.get(sgKey)) || new Map()

  // Sales: Shopify orders API first (direct token or client credentials, same
  // as sessions). If that is unavailable or fails, fall back to ShipGoods
  // order items (units + sold price per product, fulfilled orders only).
  let sales: SalesMap = new Map()
  let salesSource: StoreBuildResult["salesSource"] = "none"
  const shopifyConfig = SHOPIFY_STORES[store]
  if (shopifyConfig) {
    try {
      const token = await getShopifyToken(shopifyConfig.domain, shopifyConfig.envKey)
      if (token) {
        sales = await fetchShopifySales(shopifyConfig.domain, token, dateFrom, dateTo)
        salesSource = "shopify"
      } else {
        errors.push(`${store}: no Shopify token (${shopifyConfig.envKey} or client credentials)`)
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      // 403 = the store's app token has no read_orders scope (it was made for
      // sessions / read_reports). Not an outage: ShipGoods sales below cover it,
      // scaled to the real paid order totals, so don't show it as an error.
      if (!/HTTP 403/.test(msg)) errors.push(`${store}: ${msg}`)
    }
  }
  if (sales.size === 0) {
    const sgSales = sgKey ? sg.salesByStore.get(sgKey) : undefined
    if (sgSales && sgSales.size > 0) {
      sales = sgSales
      salesSource = "shipgoods"
    }
  }

  const catalog: CatalogProduct[] = []
  const matchedTitles = new Set<string>()
  const usedSheetNames = new Set<string>()

  // First pass: products from Shopify sales — try ShipGoods COGS first, then sheet
  const salesEntries = Array.from(sales.entries())
  for (let i = 0; i < salesEntries.length; i++) {
    const [title, s] = salesEntries[i]
    matchedTitles.add(title)

    const sgMatch = findShipgoodsCogs(title, sgCogs)
    let cogsUsd: number | null = null
    let cogsSource: "shipgoods" | "sheet" | "none" = "none"
    let retailPrice = ""
    let cogPct = ""
    let category = ""

    if (sgMatch) {
      cogsUsd = sgMatch.avgCogs
      cogsSource = "shipgoods"
    }

    // Try sheet fallback
    const normalizedTitle = title.toLowerCase().trim()
    for (const cp of cogsProducts) {
      const normalizedCp = cp.product_name.toLowerCase().trim()
      if (
        normalizedCp === normalizedTitle ||
        normalizedCp.includes(normalizedTitle.slice(0, 30)) ||
        normalizedTitle.includes(normalizedCp.slice(0, 30))
      ) {
        usedSheetNames.add(cp.product_name)
        if (!sgMatch) {
          cogsUsd = cp.cogs_usd
          cogsSource = "sheet"
        }
        retailPrice = cp.retail_price
        cogPct = cp.cog_pct
        category = cp.category
        break
      }
    }

    let adSpend: number | null = null
    if (ctx.productSpend) {
      adSpend = 0
      for (const id of s.productIds) adSpend += ctx.productSpend.get(id) || 0
      for (const id of s.productIds) ctx.productSpend.delete(id) // count each product's spend once
    }
    catalog.push({
      product_name: title,
      store,
      cogs_usd: cogsUsd,
      retail_price: retailPrice,
      cog_pct: cogPct,
      category,
      units_sold: s.qty,
      sales_revenue: s.revenue,
      cogs_source: cogsSource,
      ad_spend: adSpend,
      roas: adSpend != null && adSpend > 0 ? s.revenue / adSpend : null,
      be_roas: beRoas(cogsUsd, s.qty, s.revenue, ctx),
      product_ids: s.productIds,
      ...netMargin(cogsUsd, s.qty, s.revenue, adSpend, ctx),
    })
  }

  // Second pass: sheet products that weren't matched to any Shopify sale
  for (const cp of cogsProducts) {
    if (usedSheetNames.has(cp.product_name)) continue

    const normalizedName = cp.product_name.toLowerCase().trim()
    let alreadyMatched = false
    for (let i = 0; i < salesEntries.length; i++) {
      const [title] = salesEntries[i]
      if (
        title.toLowerCase().trim() === normalizedName ||
        title.toLowerCase().includes(normalizedName.slice(0, 30)) ||
        normalizedName.includes(title.toLowerCase().slice(0, 30))
      ) {
        alreadyMatched = true
        break
      }
    }
    if (alreadyMatched) continue

    const sgMatch = findShipgoodsCogs(cp.product_name, sgCogs)

    catalog.push({
      product_name: cp.product_name,
      store,
      cogs_usd: sgMatch ? sgMatch.avgCogs : cp.cogs_usd,
      retail_price: cp.retail_price,
      cog_pct: cp.cog_pct,
      category: cp.category,
      units_sold: 0,
      sales_revenue: 0,
      cogs_source: sgMatch ? "shipgoods" : "sheet",
      ad_spend: null,
      roas: null,
      be_roas: null,
      product_ids: [],
      profit: null,
      margin: null,
      margin_basis: null,
    })
  }

  // Third pass: ShipGoods products not in sales or sheet (for stores like LUMEGLASSES with no sheet)
  if (!STORE_SHEET_TAB[store]) {
    const sgEntries = Array.from(sgCogs.entries())
    for (let i = 0; i < sgEntries.length; i++) {
      const [title, cogs] = sgEntries[i]
      if (matchedTitles.has(title)) continue
      // Check fuzzy match
      const normalizedTitle = title.toLowerCase().trim()
      let found = false
      for (let j = 0; j < salesEntries.length; j++) {
        const [sTitle] = salesEntries[j]
        if (
          sTitle.toLowerCase().trim() === normalizedTitle ||
          sTitle.toLowerCase().includes(normalizedTitle.slice(0, 25))
        ) {
          found = true
          break
        }
      }
      if (found) continue

      catalog.push({
        product_name: title,
        store,
        cogs_usd: cogs.avgCogs,
        retail_price: "",
        cog_pct: "",
        category: store === "LUMEGLASSES" ? "Eyewear" : "",
        units_sold: 0,
        sales_revenue: 0,
        cogs_source: "shipgoods",
        ad_spend: null,
        roas: null,
        be_roas: null,
        product_ids: [],
        profit: null,
        margin: null,
        margin_basis: null,
      })
    }
  }

  return { products: catalog, salesSource, errors }
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

type DbRow = { store: string; revenue?: number | string; spend?: number | string }

// Supabase returns at most 1000 rows per request, so page through long ranges.
async function selectAllInRange(
  db: ReturnType<typeof getServiceClient>,
  table: string,
  columns: string,
  dateFrom: string,
  dateTo: string,
): Promise<{ data: DbRow[]; error: { message: string } | null }> {
  const out: DbRow[] = []
  const PAGE = 1000
  for (let offset = 0; offset < 50000; offset += PAGE) {
    const { data, error } = await db.from(table).select(columns).gte("date", dateFrom).lte("date", dateTo).order("date").range(offset, offset + PAGE - 1)
    if (error) return { data: out, error: { message: error.message } }
    const rows = (data || []) as unknown as DbRow[]
    out.push(...rows)
    if (rows.length < PAGE) break
  }
  return { data: out, error: null }
}

interface StoreSummary {
  store: string
  revenue: number // Shopify revenue (daily_revenue, same source as Main Hub), store currency
  ad_spend: number // all channels (daily_spend), same as Main Hub
  roas: number | null
  be_roas: number | null // from product COGS% in this period + transaction fees
  product_level_spend: boolean // true when per-product spend exists (Google)
  spend_threshold: number // drafting SOP threshold: €30 in store currency
  currency: string
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const store = searchParams.get("store")

  if (!store) {
    return NextResponse.json({ error: "store param required" }, { status: 400 })
  }

  const today = new Date().toISOString().slice(0, 10)
  const defFrom = new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10)
  const qFrom = searchParams.get("from") || ""
  const qTo = searchParams.get("to") || ""
  const dateFrom = ISO_DATE.test(qFrom) ? qFrom : defFrom
  const dateTo = ISO_DATE.test(qTo) ? qTo : today

  const errors: string[] = []
  const storeNames = store === "all" ? Object.keys(SHOPIFY_STORES) : [store]

  // ShipGoods (COGS + sales fallback), Google per-product spend, FX and the
  // store totals from Supabase all load in parallel.
  const db = getServiceClient()
  const [sg, googleSpend, fx, revRes, spendRes] = await Promise.all([
    fetchShipgoodsData(dateFrom, dateTo),
    fetchGoogleProductSpend(dateFrom, dateTo).catch((e: unknown) => {
      errors.push(`Google product spend: ${e instanceof Error ? e.message : String(e)}`)
      return [] as GoogleProductSpend[]
    }),
    fetchLatestEurRates(),
    selectAllInRange(db, "daily_revenue", "date,store,revenue", dateFrom, dateTo),
    selectAllInRange(db, "daily_spend", "date,store,channel,spend", dateFrom, dateTo),
  ])
  if (sg.error) errors.push(sg.error)
  if (revRes.error) errors.push(`Store revenue: ${revRes.error.message}`)
  if (spendRes.error) errors.push(`Store ad spend: ${spendRes.error.message}`)

  const perEur = (cur: Currency) => (cur === "EUR" ? 1 : fx[cur])
  const ctxFor = (s: string): StoreContext => {
    const cur = STORE_CURRENCY[s] || "EUR"
    const isGoogle = Object.values(WINDSOR_ACCOUNT_MAP).some((m) => m.store === s && m.channel === "Google")
    let productSpend: Map<string, number> | null = null
    if (isGoogle) {
      productSpend = new Map()
      for (const g of googleSpend) if (g.store === s) productSpend.set(g.productId, g.spend * perEur(cur)) // Windsor spend is EUR → store currency
    }
    return { productSpend, usdToStore: perEur(cur) / perEur("USD"), txnRate: TRANSACTION_FEE_RATE[s] ?? 0.035, mbRate: MEDIA_BUYER_FEE_RATE[s] ?? 0 }
  }

  let allProducts: CatalogProduct[] = []
  const salesSources: Record<string, StoreBuildResult["salesSource"]> = {}
  const stores: StoreSummary[] = []

  const contexts = storeNames.map(ctxFor)
  const results = await Promise.allSettled(storeNames.map((s, i) => buildStoreProducts(s, sg, contexts[i], dateFrom, dateTo)))
  results.forEach((r, i) => {
    const s = storeNames[i]
    const ctx = contexts[i]
    if (r.status !== "fulfilled") {
      errors.push(`${s}: ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`)
      return
    }
    const products = r.value.products
    errors.push(...r.value.errors)
    salesSources[s] = r.value.salesSource

    // Google spend on products that had no sales in this period (ROAS 0)
    if (ctx.productSpend) {
      ctx.productSpend.forEach((spend, productId) => {
        if (spend <= 0) return
        const g = googleSpend.find((x) => x.store === s && x.productId === productId)
        products.push({
          product_name: g?.title || `Product ${productId}`,
          store: s,
          cogs_usd: null,
          retail_price: "",
          cog_pct: "",
          category: "",
          units_sold: 0,
          sales_revenue: 0,
          cogs_source: "none",
          ad_spend: spend,
          roas: 0,
          be_roas: null,
          product_ids: [productId],
          profit: -Math.round(spend * (1 + ctx.mbRate) * 100) / 100,
          margin: null,
          margin_basis: null,
        })
      })
    }
    allProducts = allProducts.concat(products)

    // Store totals: revenue + spend exactly as the Main Hub (Supabase), BE ROAS
    // from the COGS% of this store's products with known COGS.
    const revenue = (revRes.data || []).filter((x) => x.store === s).reduce((a, x) => a + (Number(x.revenue) || 0), 0)
    const adSpend = (spendRes.data || []).filter((x) => x.store === s).reduce((a, x) => a + (Number(x.spend) || 0), 0)
    let cogsRev = 0
    let cogsAmt = 0
    for (const p of products) {
      if (p.cogs_usd != null && p.units_sold > 0) {
        cogsRev += p.sales_revenue
        cogsAmt += p.cogs_usd * ctx.usdToStore * p.units_sold
      }
    }
    const margin = cogsRev > 0 ? 1 - cogsAmt / cogsRev - ctx.txnRate : null
    stores.push({
      store: s,
      revenue: Math.round(revenue * 100) / 100,
      ad_spend: Math.round(adSpend * 100) / 100,
      roas: adSpend > 0 ? revenue / adSpend : null,
      be_roas: margin != null && margin > 0 ? 1 / margin : null,
      product_level_spend: ctx.productSpend != null,
      spend_threshold: Math.round(30 * perEur(STORE_CURRENCY[s] || "EUR") * 100) / 100,
      currency: STORE_CURRENCY[s] || "EUR",
    })
  })

  allProducts.sort((a, b) => b.units_sold - a.units_sold)

  const totalSold = allProducts.reduce((s, p) => s + p.units_sold, 0)
  const totalRevenue = allProducts.reduce((s, p) => s + p.sales_revenue, 0)
  const withSales = allProducts.filter((p) => p.units_sold > 0)
  const withCogs = allProducts.filter((p) => p.cogs_usd !== null)
  const sgCount = allProducts.filter((p) => p.cogs_source === "shipgoods").length
  const sheetCount = allProducts.filter((p) => p.cogs_source === "sheet").length
  const mostSold = withSales.length > 0 ? withSales[0] : null

  // Cache at Vercel's edge per URL (store + date range): served instantly for 6h,
  // then served stale while it refreshes in the background. Not cached when a
  // data source failed (missing Shopify tokens are a known state, not a failure).
  const hardErrors = errors.filter((e) => !e.includes("no Shopify token"))
  const cacheHeader = hardErrors.length === 0
    ? "public, s-maxage=21600, stale-while-revalidate=86400"
    : "no-store"

  return NextResponse.json({
    products: allProducts,
    stores,
    total_products: allProducts.length,
    products_with_sales: withSales.length,
    products_with_cogs: withCogs.length,
    cogs_from_shipgoods: sgCount,
    cogs_from_sheet: sheetCount,
    total_units_sold: totalSold,
    total_revenue: totalRevenue,
    most_sold: mostSold
      ? { name: mostSold.product_name, store: mostSold.store, units: mostSold.units_sold }
      : null,
    period: { from: dateFrom, to: dateTo },
    sales_sources: salesSources,
    errors,
    generated_at: new Date().toISOString(),
  }, { headers: { "Cache-Control": cacheHeader } })
}
