import { NextResponse } from "next/server"
import { unstable_cache } from "next/cache"
import { fetchOrders, fetchProducts, fetchSummary, resolveStore } from "@/lib/shipgoods"
import type { SGOrder, SGProduct } from "@/lib/shipgoods"

const day = (offset: number) =>
  new Date(Date.now() - offset * 86400000).toISOString().slice(0, 10)

function hoursSince(iso: string) {
  return (Date.now() - new Date(iso).getTime()) / 3600000
}

interface OrderRow {
  order_id: string
  order_number: string
  store: string
  status: string
  problem: string
  amount: number
  currency: string
  created_at: string
  updated_at: string
  age_hours: number
  trackings: {
    tracking_number: string
    carrier: string
    tracking_url: string
    item_count: number
  }[]
}

interface RiskProduct {
  name: string
  variant: string
  stock: number
  unit_price: number
  countries: string[]
  updated_at: string
  risk: "high" | "medium" | "low"
  reasons: string[]
}

interface SupplyChainData {
  orders: OrderRow[]
  products_at_risk: RiskProduct[]
  summary: {
    total_orders: number
    address_errors: number
    waiting_process: number
    trace_added: number
    quote_pending: number
    balance_usd: number
    low_stock_products: number
    carriers: Record<string, number>
    stores: Record<string, { total: number; issues: number; shipped: number }>
  }
  generated_at: string
}

function problemLabel(o: SGOrder): string {
  if (o.status === "address_error") return "Address validation failed"
  if (o.status === "waiting_process" && hoursSince(o.created_at) > 72)
    return "Stuck — waiting over 3 days"
  if (o.status === "waiting_process" && hoursSince(o.created_at) > 48)
    return "Slow — waiting over 2 days"
  if (o.status === "waiting_process") return "Awaiting processing"
  if (o.quote_pending) return "Quote pending from supplier"
  return ""
}

function riskLevel(p: SGProduct): { risk: "high" | "medium" | "low"; reasons: string[] } {
  const reasons: string[] = []
  if (p.stock <= 0) reasons.push("Out of stock")
  else if (p.stock <= 5) reasons.push(`Only ${p.stock} units left`)
  else if (p.stock <= 20) reasons.push(`Low stock (${p.stock} units)`)
  const daysSinceUpdate = hoursSince(p.updated_at) / 24
  if (daysSinceUpdate > 30) reasons.push("Not updated in 30+ days")
  if (reasons.length === 0) return { risk: "low", reasons: [] }
  const hasOos = p.stock <= 0
  const hasVeryLow = p.stock <= 5
  return {
    risk: hasOos ? "high" : hasVeryLow ? "high" : "medium",
    reasons,
  }
}

async function buildSupplyChain(): Promise<SupplyChainData> {
  const from = day(29)
  const [orders, products, sgSummary] = await Promise.all([
    fetchOrders(from),
    fetchProducts(),
    fetchSummary(),
  ])

  const carriers: Record<string, number> = {}
  const storeStats: Record<string, { total: number; issues: number; shipped: number }> = {}
  const ensureStore = (s: string) => {
    if (!storeStats[s]) storeStats[s] = { total: 0, issues: 0, shipped: 0 }
  }

  const rows: OrderRow[] = orders.map((o) => {
    const store = resolveStore(o.shop_admin_id)
    ensureStore(store)
    storeStats[store].total++

    if (o.status === "address_error" || o.status === "waiting_process") {
      storeStats[store].issues++
    }
    if (o.status === "trace_added") {
      storeStats[store].shipped++
    }

    for (const t of o.trackings) {
      const c = t.carrier || "unknown"
      carriers[c] = (carriers[c] || 0) + 1
    }

    return {
      order_id: o.order_id,
      order_number: o.external_order_no,
      store,
      status: o.status,
      problem: problemLabel(o),
      amount: o.amounts.product_total || 0,
      currency: o.currency,
      created_at: o.created_at,
      updated_at: o.updated_at,
      age_hours: Math.round(hoursSince(o.created_at)),
      trackings: o.trackings.map((t) => ({
        tracking_number: t.tracking_number,
        carrier: t.carrier,
        tracking_url: t.tracking_url,
        item_count: t.items.length,
      })),
    }
  })

  const riskProducts: RiskProduct[] = products
    .map((p) => {
      const { risk, reasons } = riskLevel(p)
      return {
        name: p.name,
        variant: p.variant_name,
        stock: p.stock,
        unit_price: p.unit_price,
        countries: p.countries,
        updated_at: p.updated_at,
        risk,
        reasons,
      }
    })
    .filter((p) => p.reasons.length > 0)
    .sort((a, b) => {
      const riskOrder = { high: 0, medium: 1, low: 2 }
      return riskOrder[a.risk] - riskOrder[b.risk] || a.stock - b.stock
    })

  return {
    orders: rows.sort(
      (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    ),
    products_at_risk: riskProducts,
    summary: {
      total_orders: orders.length,
      address_errors: orders.filter((o) => o.status === "address_error").length,
      waiting_process: orders.filter((o) => o.status === "waiting_process").length,
      trace_added: orders.filter((o) => o.status === "trace_added").length,
      quote_pending: orders.filter((o) => o.quote_pending).length,
      balance_usd: sgSummary?.balance?.amount ?? 0,
      low_stock_products: riskProducts.filter((p) => p.risk === "high").length,
      carriers,
      stores: storeStats,
    },
    generated_at: new Date().toISOString(),
  }
}

const cached = unstable_cache(buildSupplyChain, ["supply-chain"], {
  revalidate: 600,
})

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const data = url.searchParams.has("fresh") ? await buildSupplyChain() : await cached()
    return NextResponse.json(data)
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    )
  }
}
