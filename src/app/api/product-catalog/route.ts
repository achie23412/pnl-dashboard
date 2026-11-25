import { NextResponse } from "next/server"
import { COGS_SHEET_ID, STORE_SHEET_TAB, SHOPIFY_STORES } from "@/lib/constants"
import { getShopifyToken } from "@/lib/shopify-sessions"

export const maxDuration = 60

interface ShopifyLineItem {
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
  title: string
  unit_cost: number
  quantity: number
  product_cost: number
  sold_price: number
}

interface ShipgoodsOrder {
  row_type?: string
  store_name?: string
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
type SalesMap = Map<string, { qty: number; revenue: number }>

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
async function fetchShipgoodsData(): Promise<ShipgoodsData> {
  const token = process.env.SHIPGOODS_TOKEN
  const base = process.env.SHIPGOODS_BASE || "https://dashboard.shipgoods.eu"
  const empty: ShipgoodsData = { cogsByStore: new Map(), salesByStore: new Map(), error: null }
  if (!token) return { ...empty, error: "ShipGoods: SHIPGOODS_TOKEN not set" }

  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)
  const today = new Date().toISOString().slice(0, 10)
  const fetchPage = async (page: number): Promise<ShipgoodsResponse> => {
    const url = `${base}/api/v1/shop/analytics/order-cost-items?date_from=${thirtyDaysAgo}&date_to=${today}&per_page=100&page=${page}`
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      signal: AbortSignal.timeout(SG_TIMEOUT_MS),
    })
    if (!res.ok) throw new Error(`page ${page}: HTTP ${res.status}`)
    const json: ShipgoodsResponse = await res.json()
    if (!json.data?.list) throw new Error(`page ${page}: unexpected response`)
    return json
  }

  const costAcc = new Map<string, Map<string, { totalCost: number; totalQty: number }>>()
  const salesByStore = new Map<string, SalesMap>()
  const addPage = (json: ShipgoodsResponse) => {
    for (const order of json.data.list) {
      if (order.row_type && order.row_type !== "order_charge") continue
      if (!order.items) continue
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
        const s = sales.get(item.title) || { qty: 0, revenue: 0 }
        s.qty += qty
        s.revenue += (Number(item.sold_price) || 0) * qty
        sales.set(item.title, s)
      }
    }
  }

  const errors: string[] = []
  try {
    const first = await fetchPage(1)
    addPage(first)
    const totalPages = Math.min(first.data.pagination?.total_pages || 1, SG_MAX_PAGES)
    const rest = await Promise.allSettled(
      Array.from({ length: Math.max(totalPages - 1, 0) }, (_, i) => fetchPage(i + 2)),
    )
    for (const r of rest) {
      if (r.status === "fulfilled") addPage(r.value)
      else errors.push(String(r.reason instanceof Error ? r.reason.message : r.reason))
    }
  } catch (e: unknown) {
    errors.push(e instanceof Error ? e.message : String(e))
  }

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

  return { cogsByStore, salesByStore, error: errors.length > 0 ? `ShipGoods: ${errors.join("; ")}` : null }
}

async function fetchShopifySales(domain: string, token: string): Promise<SalesMap> {
  const sales: SalesMap = new Map()
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)

  let url: string | null = `https://${domain}/admin/api/2024-10/orders.json?status=any&created_at_min=${thirtyDaysAgo}T00:00:00Z&limit=250&fields=id,created_at,line_items,cancelled_at,financial_status`
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
        const existing = sales.get(title) || { qty: 0, revenue: 0 }
        existing.qty += item.quantity
        existing.revenue += parseFloat(item.price) * item.quantity
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

async function buildStoreProducts(store: string, sg: ShipgoodsData): Promise<StoreBuildResult> {
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
        sales = await fetchShopifySales(shopifyConfig.domain, token)
        salesSource = "shopify"
      } else {
        errors.push(`${store}: no Shopify token (${shopifyConfig.envKey} or client credentials)`)
      }
    } catch (e: unknown) {
      errors.push(`${store}: ${e instanceof Error ? e.message : String(e)}`)
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
      })
    }
  }

  return { products: catalog, salesSource, errors }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const store = searchParams.get("store")

  if (!store) {
    return NextResponse.json({ error: "store param required" }, { status: 400 })
  }

  // Always fetch ShipGoods — primary COGS source and sales fallback
  const sg = await fetchShipgoodsData()

  let allProducts: CatalogProduct[] = []
  const errors: string[] = sg.error ? [sg.error] : []
  const salesSources: Record<string, StoreBuildResult["salesSource"]> = {}

  const storeNames = store === "all" ? Object.keys(SHOPIFY_STORES) : [store]
  const results = await Promise.allSettled(storeNames.map((s) => buildStoreProducts(s, sg)))
  results.forEach((r, i) => {
    if (r.status === "fulfilled") {
      allProducts = allProducts.concat(r.value.products)
      errors.push(...r.value.errors)
      salesSources[storeNames[i]] = r.value.salesSource
    } else {
      errors.push(`${storeNames[i]}: ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`)
    }
  })

  allProducts.sort((a, b) => b.units_sold - a.units_sold)

  const totalSold = allProducts.reduce((s, p) => s + p.units_sold, 0)
  const totalRevenue = allProducts.reduce((s, p) => s + p.sales_revenue, 0)
  const withSales = allProducts.filter((p) => p.units_sold > 0)
  const withCogs = allProducts.filter((p) => p.cogs_usd !== null)
  const sgCount = allProducts.filter((p) => p.cogs_source === "shipgoods").length
  const sheetCount = allProducts.filter((p) => p.cogs_source === "sheet").length
  const mostSold = withSales.length > 0 ? withSales[0] : null

  return NextResponse.json({
    products: allProducts,
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
    period: "last_30d",
    sales_sources: salesSources,
    errors,
  })
}
