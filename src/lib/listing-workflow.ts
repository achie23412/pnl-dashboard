// Server-side steps of the product listing workflow:
// 1. fetch the source product ("before"), 2. write the new listing with the Ascend SOP ("after"),
// 3. create it in Shopify as a draft, 4. publish it.
import Anthropic from "@anthropic-ai/sdk"
import { LISTING_SOP_PROMPT } from "@/lib/listing-sop"
import { SHOPIFY_STORES } from "@/lib/constants"
import { getShopifyToken } from "@/lib/shopify-sessions"

export const WORKFLOW_STORES = ["Walsh & Farley", "Carter & Collins", "Susan & Allen"]
const API_VERSION = "2026-10"
const MODEL = "claude-opus-5-5"

export type SourceProduct = {
  url: string
  title: string
  description: string
  bodyHtml: string
  vendor: string
  productType: string
  tags: string[]
  images: string[]
  options: { name: string; values: string[] }[]
  variants: { title: string; price: string; sku: string; options: string[] }[]
  price: number | null
}

export type GeneratedListing = { title: string; description: string; features: string[]; fileNames: string[] }

// ── 1. Before: any Shopify store's /products/<handle> URL
export async function fetchSourceProduct(url: string): Promise<SourceProduct> {
  const u = new URL(url)
  const parts = u.pathname.split("/")
  const i = parts.indexOf("products")
  const handle = i >= 0 ? parts[i + 1]?.replace(/\.(json|js)$/, "") : ""
  if (!handle) throw new Error("Not a Shopify product URL (it needs /products/<name> in it).")
  const res = await fetch(`${u.origin}/products/${handle}.json`, { headers: { "User-Agent": "Mozilla/5.0 (compatible)" } })
  if (!res.ok) throw new Error(`The store returned ${res.status} for the product data.`)
  const p = (await res.json()).product
  if (!p) throw new Error("No product data found at that URL.")
  const variants = (p.variants || []).map((v: Record<string, string>) => ({
    title: v.title || "Default Title",
    price: v.price || "0",
    sku: v.sku || "",
    options: [v.option1, v.option2, v.option3].filter(Boolean),
  }))
  const price = variants.length ? Math.min(...variants.map((v: { price: string }) => Number(v.price) || Infinity)) : null
  return {
    url,
    title: p.title || "",
    description: (p.body_html || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim(),
    bodyHtml: p.body_html || "",
    vendor: p.vendor || "",
    productType: p.product_type || "",
    tags: typeof p.tags === "string" ? p.tags.split(",").map((t: string) => t.trim()).filter(Boolean) : p.tags || [],
    images: (p.images || []).map((img: { src: string }) => img.src),
    options: (p.options || []).map((o: { name: string; values: string[] }) => ({ name: o.name, values: o.values || [] })),
    variants,
    price: price !== null && Number.isFinite(price) ? price : null,
  }
}

// ── 2. After: Ascend listing SOP via Claude (first 4 images are sent so attributes come from what's visible)
export async function generateListing(src: SourceProduct, store: string, extraNotes?: string): Promise<GeneratedListing> {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set in Vercel.")
  const client = new Anthropic()
  const text = [
    `Product information (from the source store):`,
    `Title: ${src.title}`,
    `Description: ${src.description.slice(0, 4000)}`,
    src.productType ? `Product type: ${src.productType}` : "",
    src.options.length ? `Options: ${src.options.map((o) => `${o.name}: ${o.values.join(", ")}`).join(" | ")}` : "",
    `Target store: ${store}`,
    extraNotes ? `Extra notes from the store owner: ${extraNotes}` : "",
    `The images of the product are attached. Only describe what is visible or stated above.`,
  ].filter(Boolean).join("\n")

  // Image URL blocks may be newer than the installed SDK types; the whole params object is cast below.
  const content = [
    ...src.images.slice(0, 4).map((url) => ({ type: "image" as const, source: { type: "url" as const, url } })),
    { type: "text" as const, text },
  ]

  // output_config (effort) is newer than the installed SDK types, so the params are cast; the SDK sends them as-is.
  const params = {
    model: MODEL,
    max_tokens: 4000,
    system: LISTING_SOP_PROMPT,
    output_config: { effort: "low" },
    messages: [{ role: "user", content }],
  } as unknown as Anthropic.MessageCreateParamsNonStreaming

  const response = await client.messages.create(params)
  if ((response.stop_reason as string) === "refusal") throw new Error("Claude declined to write this listing.")
  const raw = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
  return parseListing(raw)
}

export function parseListing(text: string): GeneratedListing {
  const titleMatch = text.match(/Title:\s*(.+?)(?:\n|$)/)
  const descMatch = text.match(/Description:\s*([\s\S]+?)(?=\n\s*Key Features:|$)/)
  const featuresMatch = text.match(/Key Features:\s*([\s\S]+?)(?=\n\s*File Names:|$)/)
  const filesMatch = text.match(/File Names:\s*([\s\S]+?)$/)
  const lines = (m: RegExpMatchArray | null) =>
    m ? m[1].trim().split("\n").map((l) => l.replace(/^[-*•]\s*/, "").trim()).filter(Boolean) : []
  return {
    title: titleMatch ? titleMatch[1].trim() : "",
    description: descMatch ? descMatch[1].trim() : "",
    features: lines(featuresMatch),
    fileNames: lines(filesMatch).filter((l) => !/^\.\.\./.test(l)),
  }
}

// ── Shopify helpers
async function shopify(store: string, query: string, variables: Record<string, unknown>) {
  const cfg = SHOPIFY_STORES[store]
  if (!cfg) throw new Error(`Unknown store ${store}`)
  const token = await getShopifyToken(cfg.domain, cfg.envKey)
  if (!token) throw new Error(`No Shopify token for ${store}. Add ${cfg.envKey} in Vercel (scopes: write_products, write_publications).`)
  const res = await fetch(`https://${cfg.domain}/admin/api/${API_VERSION}/graphql.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
    body: JSON.stringify({ query, variables }),
  })
  const json = await res.json()
  if (!res.ok || json.errors) throw new Error(`Shopify ${res.status}: ${JSON.stringify(json.errors || json).slice(0, 300)}`)
  return json.data
}

export function adminUrl(store: string, productGid: string) {
  const cfg = SHOPIFY_STORES[store]
  const handle = cfg?.domain.replace(".myshopify.com", "")
  return `https://admin.shopify.com/store/${handle}/products/${productGid.split("/").pop()}`
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

// ── 3. Create in Shopify as DRAFT (Drafting SOP: import new products as draft)
export async function createDraftInShopify(job: {
  store: string
  before: SourceProduct
  after: GeneratedListing
  price: number
}): Promise<{ id: string; handle: string }> {
  const { before, after, price } = job
  const descriptionHtml =
    `<p>${esc(after.description)}</p>` +
    (after.features.length ? `<ul>${after.features.map((f) => `<li>${esc(f)}</li>`).join("")}</ul>` : "")

  // Variant prices: keep the source's relative price differences, anchored on the chosen price
  const minSrc = before.price || 0
  const options = before.options.length && !(before.options.length === 1 && before.options[0].name === "Title")
    ? before.options
    : [{ name: "Title", values: ["Default Title"] }]
  const variants = (before.variants.length ? before.variants : [{ title: "Default Title", price: String(price), sku: "", options: ["Default Title"] }])
    .map((v) => {
      const diff = minSrc ? (Number(v.price) || minSrc) - minSrc : 0
      return {
        optionValues: options.map((o, i) => ({ optionName: o.name, name: v.options[i] || o.values[0] })),
        price: (price + diff).toFixed(2),
      }
    })

  const ext = (url: string) => (url.split("?")[0].match(/\.(jpe?g|png|webp|gif)$/i)?.[1] || "jpg").toLowerCase()
  const files = before.images.slice(0, 20).map((src, i) => ({
    originalSource: src,
    contentType: "IMAGE",
    alt: after.title,
    ...(after.fileNames[i] ? { filename: `${after.fileNames[i]}.${ext(src)}` } : {}),
  }))

  const run = (withFilenames: boolean) => shopify(job.store, `
    mutation productSet($input: ProductSetInput!) {
      productSet(synchronous: true, input: $input) {
        product { id handle }
        userErrors { field message }
      }
    }`, {
    input: {
      title: after.title,
      descriptionHtml,
      productType: before.productType || undefined,
      tags: before.tags,
      status: "DRAFT",
      productOptions: options.map((o, i) => ({ name: o.name, position: i + 1, values: o.values.map((v) => ({ name: v })) })),
      variants,
      files: withFilenames ? files : files.map(({ originalSource, contentType, alt }) => ({ originalSource, contentType, alt })),
    },
  })
  let data
  try {
    data = await run(true)
  } catch (e) {
    // If this API version doesn't take custom file names, create it without them rather than fail
    if (e instanceof Error && /filename/i.test(e.message)) data = await run(false)
    else throw e
  }
  const r = data.productSet
  if (r.userErrors?.length) throw new Error(r.userErrors.map((e: { message: string }) => e.message).join("; "))
  return { id: r.product.id, handle: r.product.handle }
}

// ── 4. Publish: set ACTIVE and publish to every sales channel (Online Store, Google & YouTube, ...)
export async function publishInShopify(store: string, productGid: string): Promise<string[]> {
  const pubs = await shopify(store, `{ publications(first: 20) { nodes { id name } } }`, {})
  const nodes: { id: string; name: string }[] = pubs.publications.nodes
  const upd = await shopify(store, `
    mutation($product: ProductUpdateInput!) { productUpdate(product: $product) { userErrors { message } } }`, {
    product: { id: productGid, status: "ACTIVE" },
  })
  if (upd.productUpdate.userErrors?.length) throw new Error(upd.productUpdate.userErrors.map((e: { message: string }) => e.message).join("; "))
  if (nodes.length) {
    const pub = await shopify(store, `
      mutation($id: ID!, $input: [PublicationInput!]!) { publishablePublish(id: $id, input: $input) { userErrors { message } } }`, {
      id: productGid,
      input: nodes.map((n) => ({ publicationId: n.id })),
    })
    if (pub.publishablePublish.userErrors?.length) throw new Error(pub.publishablePublish.userErrors.map((e: { message: string }) => e.message).join("; "))
  }
  return nodes.map((n) => n.name)
}
