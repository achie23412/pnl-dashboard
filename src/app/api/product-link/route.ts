import { NextRequest, NextResponse } from "next/server"
import { SHOPIFY_STORES } from "@/lib/constants"
import { getShopifyToken } from "@/lib/shopify-sessions"

// GET /api/product-link?store=Walsh%20%26%20Farley&title=...&id=123[&to=admin]
// Finds the product in that store (by Shopify id, else by exact title) and redirects to
// its product page in the store, or to the Shopify admin with to=admin.
// Falls back to a search (store or admin) when the product can't be found.
export const dynamic = "force-dynamic"

const PUBLIC_DOMAIN: Record<string, string> = {
  "Walsh & Farley": "walshandfarley.com",
  "Carter & Collins": "carterandcollins.com",
  "Susan & Allen": "susanandallen.com",
  LUMEGLASSES: "lumeglasses.com",
  Blinky: "wearblinky.com",
}

type Found = { id: string; handle: string; onlineStoreUrl: string | null } | null

async function lookup(store: string, id: string | null, title: string | null): Promise<Found> {
  const cfg = SHOPIFY_STORES[store]
  if (!cfg) return null
  const token = await getShopifyToken(cfg.domain, cfg.envKey).catch(() => null)
  if (!token) return null
  const gql = async (query: string, variables: Record<string, unknown>) => {
    const res = await fetch(`https://${cfg.domain}/admin/api/2026-10/graphql.json`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
      body: JSON.stringify({ query, variables }),
      cache: "no-store",
    })
    return res.ok ? (await res.json()).data : null
  }
  if (id && /^\d+$/.test(id)) {
    const d = await gql(`query($id: ID!) { product(id: $id) { id handle onlineStoreUrl } }`, { id: `gid://shopify/Product/${id}` })
    if (d?.product) return d.product
  }
  if (title) {
    const q = `title:"${title.replace(/["\\]/g, " ").trim()}"`
    const d = await gql(`query($q: String!) { products(first: 5, query: $q) { nodes { id handle title onlineStoreUrl } } }`, { q })
    const nodes: { id: string; handle: string; title: string; onlineStoreUrl: string | null }[] = d?.products?.nodes || []
    const exact = nodes.find((n) => n.title.trim().toLowerCase() === title.trim().toLowerCase())
    return exact || nodes[0] || null
  }
  return null
}

export async function GET(req: NextRequest) {
  const p = new URL(req.url).searchParams
  const store = p.get("store") || ""
  const title = p.get("title")
  const id = p.get("id")
  const toAdmin = p.get("to") === "admin"
  const cfg = SHOPIFY_STORES[store]
  const adminHandle = cfg?.domain.replace(".myshopify.com", "")
  const domain = PUBLIC_DOMAIN[store]

  const found = await lookup(store, id, title).catch(() => null)

  if (toAdmin) {
    if (found && adminHandle) return NextResponse.redirect(`https://admin.shopify.com/store/${adminHandle}/products/${found.id.split("/").pop()}`)
    if (id && adminHandle) return NextResponse.redirect(`https://admin.shopify.com/store/${adminHandle}/products/${id}`)
    if (adminHandle) return NextResponse.redirect(`https://admin.shopify.com/store/${adminHandle}/products?query=${encodeURIComponent(title || "")}`)
  } else {
    if (found?.onlineStoreUrl) return NextResponse.redirect(found.onlineStoreUrl)
    if (found && domain) return NextResponse.redirect(`https://${domain}/products/${found.handle}`)
    if (domain) return NextResponse.redirect(`https://${domain}/search?type=product&q=${encodeURIComponent(title || "")}`)
  }
  return NextResponse.json({ error: "Unknown store" }, { status: 404 })
}
