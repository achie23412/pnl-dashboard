// Last-30-day Google spend (Windsor, EUR) and Shopify sales (units, revenue converted to EUR)
// per product for the Google stores, for the GMC Health disapproved list.
import { fetchGoogleProductSpend } from "./windsor"
import { fetchLatestEurRates, STORE_CURRENCY } from "./currency"
import { SHOPIFY_STORES } from "./constants"
import { getShopifyToken } from "./shopify-sessions"
import { GMC_STORES, amsterdamDay, addDays } from "./gmc-health"

export interface ProductStats { spend: number; units: number; revenue_eur: number }

async function storeSales(store: string, from: string, to: string, eurPer: number) {
  const out: Record<string, { units: number; revenue_eur: number }> = {}
  const cfg = SHOPIFY_STORES[store]
  const token = cfg ? await getShopifyToken(cfg.domain, cfg.envKey) : null
  if (!cfg || !token) return out
  let url: string | null = `https://${cfg.domain}/admin/api/2024-10/orders.json?status=any&created_at_min=${from}T00:00:00Z&created_at_max=${to}T23:59:59Z&limit=250&fields=created_at,line_items,cancelled_at`
  for (let pages = 0; url && pages < 10; pages++) {
    const res: Response = await fetch(url, { headers: { "X-Shopify-Access-Token": token }, cache: "no-store", signal: AbortSignal.timeout(15000) })
    if (!res.ok) break
    const data = await res.json()
    for (const o of data.orders || []) {
      if (o.cancelled_at) continue
      for (const li of o.line_items || []) {
        if (!li.product_id) continue
        const k = String(li.product_id)
        const s = out[k] || (out[k] = { units: 0, revenue_eur: 0 })
        s.units += Number(li.quantity) || 0
        s.revenue_eur += (parseFloat(li.price) || 0) * (Number(li.quantity) || 0) / eurPer
      }
    }
    const next = res.headers.get("link")?.match(/<([^>]+)>;\s*rel="next"/)
    url = next ? next[1] : null
  }
  return out
}

// Key: "<store>|<shopify product id>"
export async function productStats30d(): Promise<Record<string, ProductStats>> {
  const to = amsterdamDay()
  const from = addDays(to, -29)
  const rates = await fetchLatestEurRates()
  const eurPer = (store: string) => (STORE_CURRENCY[store] === "USD" ? rates.USD : STORE_CURRENCY[store] === "GBP" ? rates.GBP : 1)
  type Sales = Record<string, { units: number; revenue_eur: number }>
  const [spend, sales] = await Promise.all([
    fetchGoogleProductSpend(from, to).catch(() => [] as { store: string; productId: string; spend: number }[]),
    Promise.all(GMC_STORES.map((s) => storeSales(s, from, to, eurPer(s)).catch((): Sales => ({})))),
  ])
  const out: Record<string, ProductStats> = {}
  const get = (k: string) => out[k] || (out[k] = { spend: 0, units: 0, revenue_eur: 0 })
  for (const r of spend) {
    if (GMC_STORES.indexOf(r.store) < 0) continue
    get(`${r.store}|${r.productId}`).spend += r.spend
  }
  GMC_STORES.forEach((store, i) => {
    const m = sales[i]
    for (const pid of Object.keys(m)) {
      const s = get(`${store}|${pid}`)
      s.units += m[pid].units
      s.revenue_eur += m[pid].revenue_eur
    }
  })
  return out
}
