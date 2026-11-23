import { SHOPIFY_STORES } from "./constants"

interface ShopifyOrder {
  id: number
  created_at: string
  total_price: string
  current_total_price: string
  financial_status: string
  cancelled_at: string | null
}

interface RevenueRow {
  date: string
  store: string
  revenue: number
  orders: number
}

async function fetchOrders(domain: string, token: string, dateFrom: string, dateTo: string): Promise<ShopifyOrder[]> {
  const allOrders: ShopifyOrder[] = []
  let url = `https://${domain}/admin/api/2024-10/orders.json?status=any&created_at_min=${dateFrom}T00:00:00Z&created_at_max=${dateTo}T23:59:59Z&limit=250&fields=id,created_at,total_price,current_total_price,financial_status,cancelled_at`

  while (url) {
    const res = await fetch(url, {
      headers: { "X-Shopify-Access-Token": token },
    })

    if (!res.ok) {
      throw new Error(`Shopify ${domain}: ${res.status} ${await res.text()}`)
    }

    const data = await res.json()
    allOrders.push(...(data.orders || []))

    const linkHeader = res.headers.get("link")
    const nextMatch = linkHeader?.match(/<([^>]+)>;\s*rel="next"/)
    url = nextMatch ? nextMatch[1] : ""
  }

  return allOrders
}

export async function fetchShopifyRevenueDirect(dateFrom: string, dateTo: string): Promise<RevenueRow[]> {
  const results: RevenueRow[] = []
  const errors: string[] = []

  for (const [storeName, config] of Object.entries(SHOPIFY_STORES)) {
    const token = process.env[config.envKey]
    if (!token) continue

    try {
      const orders = await fetchOrders(config.domain, token, dateFrom, dateTo)

      const byDate = new Map<string, { revenue: number; count: number }>()

      for (const order of orders) {
        if (order.cancelled_at) continue

        const date = order.created_at.slice(0, 10)
        const entry = byDate.get(date) || { revenue: 0, count: 0 }
        entry.revenue += parseFloat(order.current_total_price) || 0
        entry.count += 1
        byDate.set(date, entry)
      }

      for (const [date, data] of Array.from(byDate.entries())) {
        results.push({
          date,
          store: storeName,
          revenue: Math.round(data.revenue * 100) / 100,
          orders: data.count,
        })
      }
    } catch (err: unknown) {
      errors.push(`${storeName}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  if (errors.length > 0 && results.length === 0) {
    throw new Error(`All Shopify stores failed: ${errors.join("; ")}`)
  }

  return results
}

export function hasAnyShopifyToken(): boolean {
  return Object.values(SHOPIFY_STORES).some((c) => !!process.env[c.envKey])
}
