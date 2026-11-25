// Quoted COGS per product from the per-store launch sheets (column "COG $ (USD)",
// copied there from the supplier's Product Master quotes). Used to compare
// what ShipGoods charged with what was quoted.
import { COGS_SHEET_ID, STORE_SHEET_TAB } from "@/lib/constants"

export interface Quote {
  store: string
  product_name: string
  handle: string | null // from the STORE LINK column
  cog_usd: number
}

function parseCsvRow(row: string): string[] {
  const out: string[] = []
  let cur = ""
  let q = false
  for (let i = 0; i < row.length; i++) {
    const ch = row[i]
    if (ch === '"') {
      if (q && row[i + 1] === '"') {
        cur += '"'
        i++
      } else q = !q
    } else if (ch === "," && !q) {
      out.push(cur)
      cur = ""
    } else cur += ch
  }
  out.push(cur)
  return out
}

// "$12,80" / "$1.234,50" -> 12.8 / 1234.5 (sheet uses comma decimals)
export function parseMoney(v: string): number {
  const s = v.replace(/[^0-9.,-]/g, "")
  if (!s) return 0
  const normalized = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s
  return parseFloat(normalized) || 0
}

export function normalizeTitle(t: string): string {
  return t
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[–—-]/g, " ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function handleFrom(link: string): string | null {
  const m = link.match(/\/products\/([^/?#]+)/)
  return m ? m[1].toLowerCase() : null
}

export async function fetchQuotes(store: string): Promise<Quote[]> {
  const tab = STORE_SHEET_TAB[store]
  if (!tab) return []
  const url = `https://docs.google.com/spreadsheets/d/${COGS_SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tab)}&range=A1:O800`
  const res = await fetch(url, { next: { revalidate: 900 }, signal: AbortSignal.timeout(8000) })
  if (!res.ok) throw new Error(`Quote sheet (${tab}): HTTP ${res.status}`)
  const rows = (await res.text()).split("\n").filter((r) => r.trim())
  const out: Quote[] = []
  for (let i = 1; i < rows.length; i++) {
    const c = parseCsvRow(rows[i])
    const name = (c[1] || "").trim()
    const cog = parseMoney(c[9] || "")
    if (!name || cog <= 0) continue
    out.push({ store, product_name: name, handle: handleFrom(c[6] || ""), cog_usd: cog })
  }
  return out
}

// Find the quote for an invoice line by product title (exact, then prefix).
export function findQuote(quotes: Quote[], title: string): Quote | null {
  const t = normalizeTitle(title)
  if (!t) return null
  let best: Quote | null = null
  for (const q of quotes) {
    const n = normalizeTitle(q.product_name)
    if (n === t) return q
    if (!best && n.length > 12 && (n.startsWith(t) || t.startsWith(n))) best = q
  }
  return best
}

// Charged above quote counts only when it's more than $0.50 AND more than 3%.
export const OVER_QUOTE_ABS = 0.5
export const OVER_QUOTE_PCT = 0.03
export function isOverQuote(charged: number, quoted: number): boolean {
  return charged - quoted > OVER_QUOTE_ABS && charged > quoted * (1 + OVER_QUOTE_PCT)
}
