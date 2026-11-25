import { NextResponse } from "next/server"
import { SHOPIFY_STORES } from "@/lib/constants"
import { getShopifyToken } from "@/lib/shopify-sessions"
import type { OrderLookup, OrderItem } from "@/lib/cs-log"

export const dynamic = "force-dynamic"

// GET /api/shopify-order?store=Blinky&order=1042 → the order with its line items,
// so CS can tick which products are refunded. Uses the store's Admin API token.
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams
  const store = sp.get("store") || ""
  const raw = (sp.get("order") || "").trim().replace(/^#/, "")
  const byId = (sp.get("id") || "").replace(/\D/g, "")
  const cfg = SHOPIFY_STORES[store]
  if (!cfg) return NextResponse.json({ error: "Pick a store first." }, { status: 400 })
  if (!raw && !byId) return NextResponse.json({ error: "Enter an order number." }, { status: 400 })

  try {
    const token = await getShopifyToken(cfg.domain, cfg.envKey)
    if (!token) return NextResponse.json({ error: `No Shopify token for ${store}.` }, { status: 400 })
    const fields = "id,name,created_at,email,currency,total_price,financial_status,line_items,refunds"
    const url = byId
      ? `https://${cfg.domain}/admin/api/2024-10/orders.json?status=any&ids=${byId}&fields=${fields}`
      : `https://${cfg.domain}/admin/api/2024-10/orders.json?status=any&name=${encodeURIComponent("#" + raw)}&fields=${fields}`
    const res = await fetch(
      url,
      { headers: { "X-Shopify-Access-Token": token }, cache: "no-store", signal: AbortSignal.timeout(12000) },
    )
    if (res.status === 403) {
      return NextResponse.json({ error: `${store}: the Shopify app has no read_orders permission. Add it in Shopify, or fill in the products by hand.` }, { status: 403 })
    }
    if (!res.ok) return NextResponse.json({ error: `Shopify answered ${res.status}.` }, { status: 502 })
    const { orders } = await res.json()
    const o = (orders || []).find((x: { name: string }) => byId || x.name.replace(/^#/, "") === raw) || orders?.[0]
    if (!o) return NextResponse.json({ error: `Order ${raw ? "#" + raw : byId} not found in ${store}.` }, { status: 404 })

    type Line = { title: string; variant_title: string | null; quantity: number; price: string; total_discount: string; product_id: number | null }
    const items: OrderItem[] = (o.line_items as Line[]).map((l) => ({
      title: l.title,
      variant: l.variant_title,
      qty: l.quantity,
      price: Math.round(((parseFloat(l.price) || 0) - (parseFloat(l.total_discount) || 0) / Math.max(1, l.quantity)) * 100) / 100,
      product_id: l.product_id ? String(l.product_id) : null,
    }))
    type Refund = { transactions?: { amount: string; kind: string; status: string }[] }
    const refunded = ((o.refunds || []) as Refund[])
      .flatMap((r) => r.transactions || [])
      .filter((t) => t.kind === "refund" && t.status === "success")
      .reduce((a, t) => a + (parseFloat(t.amount) || 0), 0)

    const out: OrderLookup = {
      store,
      order_number: o.name,
      shopify_order_id: String(o.id),
      created_at: o.created_at,
      customer_email: o.email || null,
      currency: o.currency,
      total: parseFloat(o.total_price) || 0,
      refunded: Math.round(refunded * 100) / 100,
      financial_status: o.financial_status,
      items,
      admin_url: `https://admin.shopify.com/store/${cfg.domain.replace(".myshopify.com", "")}/orders/${o.id}`,
    }
    return NextResponse.json(out)
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
