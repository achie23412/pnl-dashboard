import { NextRequest, NextResponse } from "next/server"

export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json()
    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "URL required" }, { status: 400 })
    }

    const parsed = new URL(url)
    const pathParts = parsed.pathname.split("/")
    const productsIdx = pathParts.indexOf("products")
    if (productsIdx === -1) {
      return NextResponse.json({ error: "Not a valid product URL (must contain /products/)" }, { status: 400 })
    }

    const handle = pathParts[productsIdx + 1]?.replace(".json", "")
    if (!handle) {
      return NextResponse.json({ error: "Could not extract product handle from URL" }, { status: 400 })
    }

    const jsonUrl = `${parsed.origin}/products/${handle}.json`
    const res = await fetch(jsonUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible)" },
    })

    if (!res.ok) {
      return NextResponse.json({ error: `Store returned ${res.status}. The .json endpoint may be blocked.` }, { status: 422 })
    }

    const data = await res.json()
    const p = data.product

    if (!p) {
      return NextResponse.json({ error: "No product data found" }, { status: 422 })
    }

    const product = {
      title: p.title || "",
      description: (p.body_html || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim(),
      body_html: p.body_html || "",
      price: p.variants?.[0]?.price ? `€${p.variants[0].price}` : "",
      compare_at_price: p.variants?.[0]?.compare_at_price ? `€${p.variants[0].compare_at_price}` : "",
      images: (p.images || []).map((img: { src: string }) => img.src),
      variants: (p.variants || []).map((v: { title: string; price: string; sku: string }) => ({
        title: v.title || "Default",
        price: `€${v.price}`,
        sku: v.sku || "",
      })),
      vendor: p.vendor || "",
      product_type: p.product_type || "",
      tags: p.tags ? (typeof p.tags === "string" ? p.tags.split(", ") : p.tags) : [],
    }

    return NextResponse.json(product)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
