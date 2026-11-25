import { NextRequest, NextResponse } from "next/server"
import { SHOPIFY_STORES } from "@/lib/constants"

export const maxDuration = 30

const COLOURS = [
  "black", "white", "red", "blue", "green", "yellow", "pink", "purple", "orange", "brown", "grey", "gray", "beige",
  "navy", "khaki", "cream", "ivory", "burgundy", "maroon", "olive", "camel", "tan", "gold", "silver", "teal", "mint",
  "apricot", "coffee", "wine", "lilac", "rose",
]
const SIZES = ["xxs", "xs", "s", "m", "l", "xl", "xxl", "xxxl", "2xl", "3xl", "4xl", "5xl", "small", "medium", "large", "plus size"]

function removeWord(title: string, word: string): string {
  const re = new RegExp(`(^|\\s)${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\s|$)`, "i")
  return title.replace(re, "$1").replace(/\s{2,}/g, " ").trim()
}

function fixRepeatedWords(title: string): string {
  const words = title.split(/\s+/)
  const seen = new Map<string, number>()
  const result: string[] = []
  for (const w of words) {
    const lower = w.toLowerCase().replace(/[^a-z0-9]/g, "")
    if (lower.length <= 3) { result.push(w); continue }
    const prev = seen.get(lower)
    if (prev != null) {
      // skip the duplicate
      continue
    }
    seen.set(lower, result.length)
    result.push(w)
  }
  return result.join(" ").replace(/\s{2,}/g, " ").trim()
}

function fixColourInTitle(title: string): string {
  let t = title
  for (const c of COLOURS) {
    if (new RegExp(`(^|[^a-z0-9])${c}([^a-z0-9]|$)`, "i").test(t)) {
      t = removeWord(t, c)
    }
  }
  return t
}

function fixSizeInTitle(title: string): string {
  let t = title
  for (const s of SIZES) {
    if (s.length > 2 && new RegExp(`(^|[^a-z0-9])${s}([^a-z0-9]|$)`, "i").test(t)) {
      t = removeWord(t, s)
    }
  }
  return t
}

export function computeFixedTitle(title: string, fixType: string): string {
  switch (fixType) {
    case "repeated_words": return fixRepeatedWords(title)
    case "colour_in_title": return fixColourInTitle(title)
    case "size_in_title": return fixSizeInTitle(title)
    default: return title
  }
}

type FixRequest = {
  store: string
  productId: number
  fixType: string
  newTitle: string
}

export async function POST(req: NextRequest) {
  const body: { fixes: FixRequest[] } = await req.json()
  if (!body.fixes?.length) return NextResponse.json({ error: "No fixes provided" }, { status: 400 })

  const results: { productId: number; store: string; oldTitle: string; newTitle: string; ok: boolean; error?: string }[] = []

  for (const fix of body.fixes) {
    const cfg = SHOPIFY_STORES[fix.store]
    if (!cfg) { results.push({ ...fix, oldTitle: "", ok: false, error: "Unknown store" }); continue }

    const token = process.env[cfg.envKey]
    if (!token) { results.push({ ...fix, oldTitle: "", ok: false, error: `No token (${cfg.envKey})` }); continue }

    try {
      // Fetch current product to get the old title
      const getRes = await fetch(
        `https://${cfg.domain}/admin/api/2024-01/products/${fix.productId}.json?fields=id,title`,
        { headers: { "X-Shopify-Access-Token": token } }
      )
      if (!getRes.ok) {
        results.push({ ...fix, oldTitle: "", ok: false, error: `Shopify GET ${getRes.status}` })
        continue
      }
      const { product } = await getRes.json()
      const oldTitle = product.title

      // Update the title
      const putRes = await fetch(
        `https://${cfg.domain}/admin/api/2024-01/products/${fix.productId}.json`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
          body: JSON.stringify({ product: { id: fix.productId, title: fix.newTitle } }),
        }
      )
      if (!putRes.ok) {
        const text = await putRes.text()
        results.push({ productId: fix.productId, store: fix.store, oldTitle, newTitle: fix.newTitle, ok: false, error: `Shopify PUT ${putRes.status}: ${text.slice(0, 200)}` })
        continue
      }
      results.push({ productId: fix.productId, store: fix.store, oldTitle, newTitle: fix.newTitle, ok: true })
    } catch (e) {
      results.push({ productId: fix.productId, store: fix.store, oldTitle: "", newTitle: fix.newTitle, ok: false, error: e instanceof Error ? e.message : String(e) })
    }
  }

  const ok = results.filter((r) => r.ok).length
  const failed = results.length - ok
  return NextResponse.json({ results, summary: { total: results.length, ok, failed } })
}
