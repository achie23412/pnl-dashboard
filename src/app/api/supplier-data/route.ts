import { NextResponse } from "next/server"
import {
  fetchOrderCostItems,
  fetchProducts,
  fetchSummary,
  mapStoreName,
  type OrderCostItem,
  type SGProduct,
} from "@/lib/shipgoods"

export const maxDuration = 30

function fmt(d: Date) {
  return d.toISOString().slice(0, 10)
}

export async function GET() {
  try {
    const now = new Date()
    const thirtyAgo = new Date(now.getTime() - 30 * 86400000)
    const sevenAgo = new Date(now.getTime() - 7 * 86400000)

    const [costItems, products, summary] = await Promise.all([
      fetchOrderCostItems(fmt(thirtyAgo), fmt(now)),
      fetchProducts(),
      fetchSummary(),
    ])

    // Build product quote map (current catalog prices from ShipGoods)
    const quoteMap = new Map<string, { unit_price: number; countries: string[] }>()
    for (const p of products) {
      const key = `${p.product_id}::${p.variant_id}`
      quoteMap.set(key, { unit_price: p.unit_price, countries: p.countries })
    }

    // Aggregate per-product stats from order cost items
    interface ProductAgg {
      title: string
      variant_title: string
      store: string
      product_id: string
      variant_id: string
      total_qty: number
      total_cogs: number
      total_sold: number
      unit_costs: number[]
      orders: number
      last_order_date: string
      quote_price: number | null
    }

    const productMap = new Map<string, ProductAgg>()
    const invoices: Array<{
      id: number
      date: string
      store: string
      order_number: string
      order_id_in_shop: string
      amount: number
      product_total: number
      discount: number
      items: OrderCostItem["items"]
      has_price_discrepancy: boolean
    }> = []

    for (const order of costItems) {
      const store = mapStoreName(order.store_name)
      let hasDiscrepancy = false

      for (const li of order.items) {
        const pKey = `${li.title}::${li.variant_title}::${store}`
        const existing = productMap.get(pKey) || {
          title: li.title,
          variant_title: li.variant_title,
          store,
          product_id: li.product_id,
          variant_id: li.variant_id,
          total_qty: 0,
          total_cogs: 0,
          total_sold: 0,
          unit_costs: [],
          orders: 0,
          last_order_date: "",
          quote_price: null,
        }

        existing.total_qty += li.quantity
        existing.total_cogs += li.product_cost
        existing.total_sold += li.sold_price * li.quantity
        existing.unit_costs.push(li.unit_cost)
        existing.orders += 1
        if (order.bill_date > existing.last_order_date) {
          existing.last_order_date = order.bill_date
        }

        const qKey = `${li.product_id}::${li.variant_id}`
        const quote = quoteMap.get(qKey)
        if (quote) {
          existing.quote_price = quote.unit_price
          if (Math.abs(li.unit_cost - quote.unit_price) > 0.50) {
            hasDiscrepancy = true
          }
        }

        productMap.set(pKey, existing)
      }

      invoices.push({
        id: order.id,
        date: order.bill_date,
        store,
        order_number: order.order_number,
        order_id_in_shop: order.order_id_in_shop,
        amount: Math.abs(order.amount),
        product_total: order.product_total,
        discount: order.discount,
        items: order.items,
        has_price_discrepancy: hasDiscrepancy,
      })
    }

    // Build supplier cost analysis with alerts
    const supplierProducts = Array.from(productMap.values()).map((p) => {
      const avgCost =
        p.unit_costs.length > 0
          ? p.unit_costs.reduce((a, b) => a + b, 0) / p.unit_costs.length
          : 0
      const minCost = p.unit_costs.length > 0 ? Math.min(...p.unit_costs) : 0
      const maxCost = p.unit_costs.length > 0 ? Math.max(...p.unit_costs) : 0
      const costVariance = maxCost - minCost

      // Check price vs quote
      let priceAlert: string | null = null
      if (p.quote_price !== null && avgCost > p.quote_price + 0.50) {
        priceAlert = `Charged $${avgCost.toFixed(2)} avg vs $${p.quote_price.toFixed(2)} quote — ask supplier why (+$${(avgCost - p.quote_price).toFixed(2)})`
      }

      // Check if volume qualifies for negotiation
      let negotiationAlert: string | null = null
      if (p.total_qty >= 20) {
        negotiationAlert = `${p.total_qty} units in 30d — request volume discount`
      } else if (p.total_qty >= 10) {
        negotiationAlert = `${p.total_qty} units in 30d — approaching volume for price reduction`
      }

      return {
        title: p.title,
        variant_title: p.variant_title,
        store: p.store,
        total_qty: p.total_qty,
        total_cogs: Math.round(p.total_cogs * 100) / 100,
        total_sold: Math.round(p.total_sold * 100) / 100,
        avg_cost: Math.round(avgCost * 100) / 100,
        min_cost: Math.round(minCost * 100) / 100,
        max_cost: Math.round(maxCost * 100) / 100,
        cost_variance: Math.round(costVariance * 100) / 100,
        quote_price: p.quote_price,
        orders: p.orders,
        last_order_date: p.last_order_date,
        cogs_pct:
          p.total_sold > 0
            ? Math.round((p.total_cogs / p.total_sold) * 1000) / 10
            : null,
        price_alert: priceAlert,
        negotiation_alert: negotiationAlert,
      }
    })

    supplierProducts.sort((a, b) => b.total_qty - a.total_qty)

    // Summary stats
    const recentInvoices = invoices.filter((inv) => inv.date >= fmt(sevenAgo))
    const totalInvoiced30d = invoices.reduce((a, inv) => a + inv.amount, 0)
    const totalInvoiced7d = recentInvoices.reduce((a, inv) => a + inv.amount, 0)
    const pendingDiscrepancies = invoices.filter((inv) => inv.has_price_discrepancy)
    const productsWithAlerts = supplierProducts.filter(
      (p) => p.price_alert || p.negotiation_alert
    )

    return NextResponse.json({
      invoices: invoices.sort((a, b) => b.date.localeCompare(a.date)),
      products: supplierProducts,
      summary: {
        total_invoices_30d: invoices.length,
        total_invoiced_30d: Math.round(totalInvoiced30d * 100) / 100,
        total_invoiced_7d: Math.round(totalInvoiced7d * 100) / 100,
        discrepancies: pendingDiscrepancies.length,
        products_tracked: supplierProducts.length,
        products_with_alerts: productsWithAlerts.length,
        active_stores: Array.from(new Set(invoices.map((inv) => inv.store))).length,
        avg_cogs_unit:
          supplierProducts.length > 0
            ? Math.round(
                (supplierProducts.reduce((a, p) => a + p.avg_cost * p.total_qty, 0) /
                  supplierProducts.reduce((a, p) => a + p.total_qty, 0)) *
                  100
              ) / 100
            : 0,
        balance: summary?.balance ?? null,
      },
      generated_at: new Date().toISOString(),
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
