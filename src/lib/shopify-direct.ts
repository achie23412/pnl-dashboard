// Revenue, orders and refunds straight from each store's Shopify Admin API (GraphQL), so the
// P&L doesn't depend on Windsor for sales. Dates are the store's own calendar day (its Shopify
// timezone), like Shopify admin. Amounts are in the store's currency (shopMoney).
import { SHOPIFY_STORES } from "./constants"
import { getShopifyToken } from "./shopify-sessions"

const API = "2026-10"

export interface RevenueRow { date: string; store: string; revenue: number; orders: number }
export interface RefundRow { date: string; store: string; order_id: string; refund_id: string; amount: number }

type Gql<T> = { data?: T; errors?: { message: string; extensions?: { code?: string } }[] }

async function gql<T>(domain: string, token: string, query: string, variables: Record<string, unknown>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`https://${domain}/admin/api/${API}/graphql.json`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
      body: JSON.stringify({ query, variables }),
      cache: "no-store",
    })
    if (res.status === 429 && attempt < 5) { await new Promise((r) => setTimeout(r, 1500 * (attempt + 1))); continue }
    if (!res.ok) throw new Error(`HTTP ${res.status} ${(await res.text()).slice(0, 160)}`)
    const json = (await res.json()) as Gql<T>
    if (json.errors?.some((e) => e.extensions?.code === "THROTTLED") && attempt < 5) { await new Promise((r) => setTimeout(r, 1500 * (attempt + 1))); continue }
    if (json.errors?.length) throw new Error(json.errors[0].message)
    return json.data as T
  }
}

const ORDERS_Q = `query($q: String!, $after: String) {
  orders(first: 50, query: $q, after: $after, sortKey: UPDATED_AT) {
    nodes {
      legacyResourceId createdAt test cancelledAt displayFinancialStatus
      totalPriceSet { shopMoney { amount } }
      refunds(first: 5) { legacyResourceId createdAt totalRefundedSet { shopMoney { amount } } }
    }
    pageInfo { hasNextPage endCursor }
  }
}`

type OrderNode = {
  legacyResourceId: string
  createdAt: string
  test: boolean
  cancelledAt: string | null
  displayFinancialStatus: string | null
  totalPriceSet: { shopMoney: { amount: string } }
  refunds: { legacyResourceId: string; createdAt: string; totalRefundedSet: { shopMoney: { amount: string } } }[]
}
type Page<N> = { orders: { nodes: N[]; pageInfo: { hasNextPage: boolean; endCursor: string } } }

const round = (n: number) => Math.round(n * 100) / 100
const shiftDay = (ymd: string, days: number) => new Date(Date.parse(`${ymd}T12:00:00Z`) + days * 86400000).toISOString().slice(0, 10)

async function storeData(store: string, domain: string, envKey: string, dateFrom: string, dateTo: string) {
  const token = await getShopifyToken(domain, envKey)
  if (!token) throw new Error("no Shopify credentials")
  const { shop } = await gql<{ shop: { ianaTimezone: string } }>(domain, token, "query { shop { ianaTimezone } }", {})
  const localDay = new Intl.DateTimeFormat("en-CA", { timeZone: shop.ianaTimezone || "UTC", year: "numeric", month: "2-digit", day: "2-digit" })
  const dayOf = (iso: string) => localDay.format(new Date(iso)) // en-CA gives YYYY-MM-DD
  const inRange = (d: string) => d >= dateFrom && d <= dateTo

  // Every order created or refunded in the window was updated in it; a day of margin covers the
  // timezone difference, then dates are checked exactly below.
  const q = `updated_at:>=${shiftDay(dateFrom, -1)}`
  const byDate = new Map<string, { revenue: number; orders: number }>()
  const refunds: RefundRow[] = []
  let after: string | null = null
  for (let page = 0; page < 120; page++) {
    const data: Page<OrderNode> = await gql<Page<OrderNode>>(domain, token, ORDERS_Q, { q, after })
    for (const o of data.orders.nodes) {
      if (o.test) continue
      const created = dayOf(o.createdAt)
      // A cancelled order that was never paid isn't a sale; a paid one counts and its refund is
      // subtracted below, like Shopify's own sales report
      const unpaidCancel = !!o.cancelledAt && /VOIDED|EXPIRED|PENDING|AUTHORIZED/.test(o.displayFinancialStatus || "")
      if (inRange(created) && !unpaidCancel) {
        const e = byDate.get(created) || { revenue: 0, orders: 0 }
        e.revenue += Number(o.totalPriceSet.shopMoney.amount) || 0
        e.orders += 1
        byDate.set(created, e)
      }
      for (const r of o.refunds || []) {
        const d = dayOf(r.createdAt)
        const amount = Number(r.totalRefundedSet.shopMoney.amount) || 0
        if (inRange(d) && amount > 0) refunds.push({ date: d, store, order_id: o.legacyResourceId, refund_id: r.legacyResourceId, amount: round(amount) })
      }
    }
    if (!data.orders.pageInfo.hasNextPage) break
    after = data.orders.pageInfo.endCursor
  }
  const revenue: RevenueRow[] = Array.from(byDate.entries()).map(([date, v]) => ({ date, store, revenue: round(v.revenue), orders: v.orders }))
  return { revenue, refunds }
}

// All stores in parallel. A store that fails is listed in `failed` and left out, so the caller can
// keep that store's existing rows (or use another source) instead of overwriting them.
export async function fetchShopifyDirect(dateFrom: string, dateTo: string): Promise<{
  revenue: RevenueRow[]; refunds: RefundRow[]; okStores: string[]; failed: { store: string; error: string }[]
}> {
  const results = await Promise.all(Object.entries(SHOPIFY_STORES).map(async ([store, cfg]) => {
    try { return { store, ...(await storeData(store, cfg.domain, cfg.envKey, dateFrom, dateTo)), error: null as string | null } }
    catch (e) { return { store, revenue: [] as RevenueRow[], refunds: [] as RefundRow[], error: e instanceof Error ? e.message : String(e) } }
  }))
  const ok = results.filter((r) => !r.error)
  return {
    revenue: ok.flatMap((r) => r.revenue),
    refunds: ok.flatMap((r) => r.refunds),
    okStores: ok.map((r) => r.store),
    failed: results.filter((r) => r.error).map((r) => ({ store: r.store, error: String(r.error) })),
  }
}
