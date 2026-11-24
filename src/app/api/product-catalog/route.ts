import { NextResponse } from "next/server"
import { COGS_SHEET_ID, STORE_SHEET_TAB, SHOPIFY_STORES } from "@/lib/constants"

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

  const url = `https://docs.google.com/spreadsheets/d/${COGS_SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tab)}&range=A3:O600`
  const resp = await fetch(url, { next: { revalidate: 300 } })
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
}

interface ShipgoodsItem {
  title: string
  unit_cost: number
  quantity: number
  product_cost: number
  sold_price: number
}

interface ShipgoodsOrder {
  items: ShipgoodsItem[]
}

interface ShipgoodsResponse {
  code: number
  data: {
    list: ShipgoodsOrder[]
    pagination: { total_pages: number; page: number }
  }
}

async function fetchShipgoodsCogs(): Promise<Map<string, { avgCogs: number; totalQty: number }>> {
  const token = process.env.SHIPGOODS_TOKEN
  const base = process.env.SHIPGOODS_BASE || "https://dashboard.shipgoods.eu"
  if (!token) return new Map()

  const productMap = new Map<string, { totalCost: number; totalQty: number }>()
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)
  const today = new Date().toISOString().slice(0, 10)

  let page = 1
  const maxPages = 3

  while (page <= maxPages) {
    const url = `${base}/api/v1/shop/analytics/order-cost-items?date_from=${thirtyDaysAgo}&date_to=${today}&per_page=100&page=${page}`
    const res: Response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    })

    if (!res.ok) break

    const json: ShipgoodsResponse = await res.json()
    if (!json.data?.list) break

    for (const order of json.data.list) {
      if (!order.items) continue
      for (const item of order.items) {
        const title = item.title
        if (!title) continue
        const existing = productMap.get(title) || { totalCost: 0, totalQty: 0 }
        existing.totalCost += item.unit_cost * item.quantity
        existing.totalQty += item.quantity
        productMap.set(title, existing)
      }
    }

    if (page >= json.data.pagination.total_pages) break
    page++
  }

  const result = new Map<string, { avgCogs: number; totalQty: number }>()
  const entries = Array.from(productMap.entries())
  for (let i = 0; i < entries.length; i++) {
    const [title, data] = entries[i]
    result.set(title, {
      avgCogs: data.totalQty > 0 ? Math.round((data.totalCost / data.totalQty) * 100) / 100 : 0,
      totalQty: data.totalQty,
    })
  }
  return result
}

async function fetchShopifySales(domain: string, token: string): Promise<Map<string, { qty: number; revenue: number }>> {
  const sales = new Map<string, { qty: number; revenue: number }>()
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)

  let url: string | null = `https://${domain}/admin/api/2024-10/orders.json?status=any&created_at_min=${thirtyDaysAgo}T00:00:00Z&limit=250&fields=id,created_at,line_items,cancelled_at,financial_status`
  let pages = 0

  while (url && pages < 5) {
    pages++
    const res: Response = await fetch(url, {
      headers: { "X-Shopify-Access-Token": token },
      signal: AbortSignal.timeout(8000),
    })

    if (!res.ok) break

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

async function buildStoreProducts(
  store: string,
  sgCogs: Map<string, { avgCogs: number; totalQty: number }>
): Promise<CatalogProduct[]> {
  const cogsProducts = await fetchCogsProducts(store)

  let sales = new Map<string, { qty: number; revenue: number }>()
  const shopifyConfig = SHOPIFY_STORES[store]
  if (shopifyConfig) {
    const token = process.env[shopifyConfig.envKey]
    if (token) {
      try {
        sales = await fetchShopifySales(shopifyConfig.domain, token)
      } catch {
        // continue without sales
      }
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

  return catalog
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const store = searchParams.get("store")

  if (!store) {
    return NextResponse.json({ error: "store param required" }, { status: 400 })
  }

  // Always fetch ShipGoods — it's the primary COGS source
  const sgCogs = await fetchShipgoodsCogs()

  let allProducts: CatalogProduct[] = []

  if (store === "all") {
    const storesWithData = Object.keys(SHOPIFY_STORES)
    const results = await Promise.allSettled(storesWithData.map((s) => buildStoreProducts(s, sgCogs)))
    for (let i = 0; i < results.length; i++) {
      if (results[i].status === "fulfilled") {
        allProducts = allProducts.concat((results[i] as PromiseFulfilledResult<CatalogProduct[]>).value)
      }
    }
  } else {
    allProducts = await buildStoreProducts(store, sgCogs)
  }

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
  })
}
