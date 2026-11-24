import { SHIPGOODS_SHOP_MAP } from "./constants"

const BASE = "https://dashboard.shipgoods.eu/api/v1/shop/analytics"

interface ShipgoodsCostItem {
  id: number
  date: string
  shop_admin_id: number
  order_id: string
  amount: number
  currency: string
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
    const res = await fetch(`${BASE}/order-costs?${params}`, {
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
