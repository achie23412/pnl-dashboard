import { SHIPGOODS_SHOP_MAP } from "./constants"

const BASE = "https://dashboard.shipgoods.eu/api/v1/shop/analytics"

interface ShipgoodsOrder {
  order_id: string
  order_date: string
  order_costs: number
  shop_admin_id: number
}

export async function fetchCogs(dateFrom: string, dateTo: string) {
  const allOrders: ShipgoodsOrder[] = []
  let page = 1

  while (true) {
    const params = new URLSearchParams({
      date_from: dateFrom,
      date_to: dateTo,
      per_page: "100",
      page: String(page),
    })
    const res = await fetch(`${BASE}/order-costs?${params}`, {
      headers: { Authorization: `Bearer ${process.env.SHIPGOODS_TOKEN}` },
    })
    if (!res.ok) throw new Error(`Shipgoods: ${res.status} ${await res.text()}`)
    const json = await res.json()
    const orders: ShipgoodsOrder[] = Array.isArray(json.data) ? json.data : []
    if (orders.length === 0) break
    for (const o of orders) allOrders.push(o)
    if (orders.length < 100) break
    page++
  }

  const byDateStore = new Map<string, number>()
  for (const order of allOrders) {
    const store = SHIPGOODS_SHOP_MAP[order.shop_admin_id]
    if (!store) continue
    const date = order.order_date.slice(0, 10)
    const key = `${date}|${store}`
    byDateStore.set(key, (byDateStore.get(key) || 0) + (order.order_costs || 0))
  }

  return Array.from(byDateStore.entries()).map(([key, cogs]) => {
    const [date, store] = key.split("|")
    return { date, store, cogs: Math.round(cogs * 100) / 100 }
  })
}
