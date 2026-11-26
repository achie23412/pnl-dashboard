import { NextRequest, NextResponse } from "next/server"
import { SHOPIFY_ACCOUNT_MAP } from "@/lib/constants"
import { feedRoom, logFeedChange } from "@/lib/gmc-health"

export async function POST(req: NextRequest) {
  try {
    const { product, store } = await req.json()

    if (!product || !store) {
      return NextResponse.json({ error: "Product and store required" }, { status: 400 })
    }

    const envKey = `SHOPIFY_TOKEN_${store.replace(/[^a-zA-Z0-9]/g, "_").toUpperCase()}`
    const token = process.env[envKey]

    if (!token) {
      return NextResponse.json(
        { error: `No API token found. Set ${envKey} in your environment variables.` },
        { status: 400 },
      )
    }

    const shopifyProduct = {
      product: {
        title: product.title,
        body_html: product.body_html || product.description,
        vendor: product.vendor,
        product_type: product.product_type,
        tags: Array.isArray(product.tags) ? product.tags.join(", ") : product.tags || "",
        variants: product.variants?.map((v: { title: string; price: string; sku: string }) => ({
          title: v.title,
          price: v.price?.replace(/[€$£]/g, "") || "0",
          sku: v.sku || "",
        })) || [{ title: "Default", price: "0" }],
        images: product.images?.map((src: string) => ({ src })) || [],
      },
    }

    const domain = store.includes(".") ? store : `${store}.myshopify.com`
    // Google stores: a new live product is a feed change too, so the 10%-per-day rule applies
    const storeName = SHOPIFY_ACCOUNT_MAP[domain] || store
    const room = await feedRoom(storeName, "new", "publish")
    if (!room.ok) return NextResponse.json({ error: room.error }, { status: 429 })
    const res = await fetch(`https://${domain}/admin/api/2024-01/products.json`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": token,
      },
      body: JSON.stringify(shopifyProduct),
    })

    if (!res.ok) {
      const text = await res.text()
      return NextResponse.json({ error: `Shopify API error: ${res.status} ${text}` }, { status: 422 })
    }

    const data = await res.json()
    if (data.product?.id) await logFeedChange({ store: storeName, product_id: String(data.product.id), title: product.title || null, kind: "publish", new_value: data.product.status || "active", reason: "Import: new product" })
    return NextResponse.json({ success: true, product_id: data.product?.id })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
