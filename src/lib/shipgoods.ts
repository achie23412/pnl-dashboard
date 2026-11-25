import { SHIPGOODS_SHOP_MAP, SHOPIFY_ACCOUNT_MAP } from "./constants"

const BASE = "https://dashboard.shipgoods.eu/api/v1/shop"

const SG_STORE_MAP: Record<string, string> = Object.fromEntries(
  Object.entries(SHOPIFY_ACCOUNT_MAP).map(([domain, store]) => [
    domain.replace(".myshopify.com", ""),
    store,
  ])
)

interface ShipgoodsCostItem {
  id: number
  date: string
  shop_admin_id: number
  order_id: string
  amount: number
  currency: string
}

export interface OrderCostItemLine {
  product_id: string
  variant_id: string
  title: string
  variant_title: string
  quantity: number
  unit_cost: number
  product_cost: number
  sold_price: number
}

export interface OrderCostItem {
  id: number
  row_type: string
  bill_date: string
  ledger_date: string
  store_name: string
  shop_name: string
  order_id: string
  order_id_in_shop: string
  order_number: string
  order_create_time: string
  amount: number
  currency: string
  product_total: number
  discount: number
  discount_label: string
  items: OrderCostItemLine[]
}

export interface SGProduct {
  product_id: string
  variant_id: string
  name: string
  variant_name: string
  countries: string[]
  unit_price: number
  currency: string
  stock: number
  updated_at: string
}

export async function fetchCogs(dateFrom: string, dateTo: string) {
  const token = process.env.SHIPGOODS_TOKEN
  if (!token) throw new Error("SHIPGOODS_TOKEN not set")

  const allItems: ShipgoodsCostItem[] = []
  let page = 1

  while (true) {
    const params = new URLSearchParams({
      date_from: dateFrom,
      date_to: dateTo,
      per_page: "100",
      page: String(page),
    })
    const res = await fetch(`${BASE}/analytics/order-costs?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) throw new Error(`Shipgoods: ${res.status} ${await res.text()}`)
    const json = await res.json()
    const items: ShipgoodsCostItem[] = json.data?.list ?? []
    if (items.length === 0) break
    for (const item of items) allItems.push(item)
    const totalPages = json.data?.pagination?.total_pages ?? 1
    if (page >= totalPages) break
    page++
  }

  const byDateStore = new Map<string, number>()
  for (const item of allItems) {
    const store = SHIPGOODS_SHOP_MAP[item.shop_admin_id]
    if (!store) continue
    const date = item.date.slice(0, 10)
    const key = `${date}|${store}`
    byDateStore.set(key, (byDateStore.get(key) || 0) + Math.abs(item.amount || 0))
  }

  return Array.from(byDateStore.entries()).map(([key, cogs]) => {
    const [date, store] = key.split("|")
    return { date, store, cogs: Math.round(cogs * 100) / 100 }
  })
}

function sgHeaders() {
  const token = process.env.SHIPGOODS_TOKEN
  if (!token) throw new Error("SHIPGOODS_TOKEN not set")
  return { Authorization: `Bearer ${token}` }
}

export function mapStoreName(sgStoreName: string): string {
  return SG_STORE_MAP[sgStoreName] || sgStoreName
}

export async function fetchOrderCostItems(
  dateFrom: string,
  dateTo: string
): Promise<OrderCostItem[]> {
  const all: OrderCostItem[] = []
  let page = 1
  while (true) {
    const params = new URLSearchParams({
      date_from: dateFrom,
      date_to: dateTo,
      per_page: "200",
      page: String(page),
    })
    const res = await fetch(
      `${BASE}/analytics/order-cost-items?${params}`,
      { headers: sgHeaders() }
    )
    if (!res.ok) throw new Error(`Shipgoods cost-items: ${res.status}`)
    const json = await res.json()
    const items: OrderCostItem[] = json.data?.list ?? []
    if (items.length === 0) break
    all.push(...items)
    if (items.length < 200) break
    page++
  }
  return all
}

export async function fetchProducts(): Promise<SGProduct[]> {
  const all: SGProduct[] = []
  let page = 1
  while (true) {
    const params = new URLSearchParams({
      per_page: "200",
      page: String(page),
    })
    const res = await fetch(`${BASE}/products?${params}`, {
      headers: sgHeaders(),
    })
    if (!res.ok) throw new Error(`Shipgoods products: ${res.status}`)
    const json = await res.json()
    const items: SGProduct[] = json.data?.list ?? json.data ?? []
    if (items.length === 0) break
    all.push(...items)
    if (items.length < 200) break
    page++
  }
  return all
}

export async function fetchSummary() {
  const res = await fetch(`${BASE}/analytics/summary`, {
    headers: sgHeaders(),
  })
  if (!res.ok) throw new Error(`Shipgoods summary: ${res.status}`)
  const json = await res.json()
  return json.data
}

export interface SGTracking {
  tracking_number: string
  carrier: string
  tracking_url: string
  items: { variant_id: string; quantity: number }[]
}

export interface SGOrder {
  order_id: string
  external_order_no: string
  shop_admin_id: number
  status: string
  quote_pending: boolean
  shipping_method: string
  currency: string
  amounts: {
    product_total: number
    shipping: number | null
    total: number | null
    charged: number | null
  }
  trackings: SGTracking[]
  created_at: string
  updated_at: string
}

export async function fetchOrders(updatedSince: string): Promise<SGOrder[]> {
  const all: SGOrder[] = []
  let page = 1
  while (true) {
    const params = new URLSearchParams({
      updated_since: updatedSince,
      per_page: "100",
      page: String(page),
    })
    const res = await fetch(`${BASE}/orders?${params}`, { headers: sgHeaders() })
    if (!res.ok) throw new Error(`Shipgoods orders: ${res.status}`)
    const json = await res.json()
    const items: SGOrder[] = json.data?.list ?? []
    if (items.length === 0) break
    all.push(...items)
    const totalPages = json.data?.pagination?.total_pages ?? 1
    if (page >= totalPages) break
    page++
  }
  return all
}

export function resolveStore(shopAdminId: number): string {
  return SHIPGOODS_SHOP_MAP[shopAdminId] || `Shop #${shopAdminId}`
}
