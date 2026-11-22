import { SHOPIFY_ACCOUNT_MAP, WINDSOR_ACCOUNT_MAP } from "./constants"

const BASE = "https://connectors.windsor.ai/all"

interface WindsorRow {
  date: string
  account_name: string
  [key: string]: string | number
}

async function fetchWindsor(connector: string, fields: string[], dateFrom: string, dateTo: string): Promise<WindsorRow[]> {
  const params = new URLSearchParams({
    api_key: process.env.WINDSOR_API_KEY!,
    connector,
    date_from: dateFrom,
    date_to: dateTo,
    fields: fields.join(","),
  })
  const res = await fetch(`${BASE}?${params}`)
  if (!res.ok) throw new Error(`Windsor ${connector}: ${res.status} ${await res.text()}`)
  const json = await res.json()
  return json.data || []
}

export async function fetchShopifyRevenue(dateFrom: string, dateTo: string) {
  const rows = await fetchWindsor("shopify", ["date", "account_name", "order_id", "order_net_sales"], dateFrom, dateTo)

  const byDateStore = new Map<string, { revenue: number; orderIds: Set<string> }>()
  for (const row of rows) {
    const store = SHOPIFY_ACCOUNT_MAP[row.account_name] || row.account_name
    const key = `${row.date}|${store}`
    let entry = byDateStore.get(key)
    if (!entry) {
      entry = { revenue: 0, orderIds: new Set() }
      byDateStore.set(key, entry)
    }
    const oid = String(row.order_id)
    if (!entry.orderIds.has(oid)) {
      entry.orderIds.add(oid)
      entry.revenue += Number(row.order_net_sales) || 0
    }
  }

  return Array.from(byDateStore.entries()).map(([key, val]) => {
    const [date, store] = key.split("|")
    return { date, store, revenue: Math.round(val.revenue * 100) / 100, orders: val.orderIds.size }
  })
}

export async function fetchMetaSpend(dateFrom: string, dateTo: string) {
  const rows = await fetchWindsor("facebook", ["date", "account_name", "spend"], dateFrom, dateTo)
  return rows.map((r) => {
    const mapping = WINDSOR_ACCOUNT_MAP[r.account_name]
    return {
      date: r.date,
      channel: "Meta",
      account: r.account_name,
      store: mapping?.store || r.account_name,
      spend: Number(r.spend) || 0,
    }
  })
}

export async function fetchTikTokSpend(dateFrom: string, dateTo: string) {
  const rows = await fetchWindsor("tiktok", ["date", "account_name", "spend"], dateFrom, dateTo)
  return rows.map((r) => {
    const mapping = WINDSOR_ACCOUNT_MAP[r.account_name]
    return {
      date: r.date,
      channel: "TikTok",
      account: r.account_name,
      store: mapping?.store || r.account_name,
      spend: Number(r.spend) || 0,
    }
  })
}
