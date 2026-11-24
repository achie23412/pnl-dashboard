import { NextResponse } from "next/server"
import { COGS_SHEET_ID, STORE_SHEET_TAB, SHOPIFY_STORES } from "@/lib/constants"

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

async function fetchCogsProducts(store: string) {
  const tab = STORE_SHEET_TAB[store]
  if (!tab) return []

  const url = `https://docs.google.com/spreadsheets/d/${COGS_SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tab)}&range=A3:O600`
  const resp = await fetch(url, { next: { revalidate: 300 } })
  if (!resp.ok) return []

  const csv = await resp.text()
  const rows = csv.split("\n").filter((r) => r.trim())
  if (rows.length < 2) return []

  const products: { product_name: string; cogs_usd: number; retail_price: string; cog_pct: string; category: string }[] = []
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

async function fetchShopifySales(domain: string, token: string): Promise<Map<string, { qty: number; revenue: number }>> {
  const sales = new Map<string, { qty: number; revenue: number }>()
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)

  let url: string | null = `https://${domain}/admin/api/2024-10/orders.json?status=any&created_at_min=${thirtyDaysAgo}T00:00:00Z&limit=250&fields=id,created_at,line_items,cancelled_at,financial_status`

  while (url) {
    const res: Response = await fetch(url, {
      headers: { "X-Shopify-Access-Token": token },
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

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const store = searchParams.get("store")

  if (!store) {
    return NextResponse.json({ error: "store param required" }, { status: 400 })
  }

  const cogsProducts = await fetchCogsProducts(store)

  let sales = new Map<string, { qty: number; revenue: number }>()
  const shopifyConfig = SHOPIFY_STORES[store]
  if (shopifyConfig) {
    const token = process.env[shopifyConfig.envKey]
    if (token) {
      try {
        sales = await fetchShopifySales(shopifyConfig.domain, token)
      } catch {
        // Shopify fetch failed, continue without sales data
      }
    }
  }

  const catalog = cogsProducts.map((p) => {
    const normalizedName = p.product_name.toLowerCase().trim()
    let matchedSales = sales.get(p.product_name)

    if (!matchedSales) {
      const entries = Array.from(sales.entries())
      for (let i = 0; i < entries.length; i++) {
        const [title, s] = entries[i]
        if (title.toLowerCase().trim() === normalizedName) {
          matchedSales = s
          break
        }
        if (title.toLowerCase().includes(normalizedName.slice(0, 30)) || normalizedName.includes(title.toLowerCase().slice(0, 30))) {
          matchedSales = s
          break
        }
      }
    }

    return {
      ...p,
      units_sold: matchedSales?.qty ?? 0,
      sales_revenue: matchedSales?.revenue ?? 0,
    }
  })

  catalog.sort((a, b) => b.units_sold - a.units_sold)

  return NextResponse.json({
    products: catalog,
    total_products: catalog.length,
    products_with_sales: catalog.filter((p) => p.units_sold > 0).length,
    period: "last_30d",
  })
}
