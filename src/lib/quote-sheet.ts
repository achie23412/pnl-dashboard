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

async function fetchLaunchQuotes(store: string): Promise<Quote[]> {
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

// "Quotation Sheet" tab: the supplier fills in COG $ per market (J UK, K US, L Poland,
// M Australia, N Europe). Read straight from there so nobody has to retype it onto the
// launch sheet. Ireland and Blinky use the Europe column.
const QUOTATION_TAB = "Quotation Sheet"
const QUOTATION_COL: Record<string, number> = {
  "Carter & Collins": 9,
  "Susan & Allen": 10,
  "Walsh & Farley": 13,
  Blinky: 13,
}

async function fetchQuotationQuotes(store: string): Promise<Quote[]> {
  const col = QUOTATION_COL[store]
  if (col == null) return []
  const url = `https://docs.google.com/spreadsheets/d/${COGS_SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(QUOTATION_TAB)}&range=A1:O3000`
  const res = await fetch(url, { next: { revalidate: 900 }, signal: AbortSignal.timeout(8000) })
  if (!res.ok) throw new Error(`Quotation sheet: HTTP ${res.status}`)
  const out: Quote[] = []
  for (const row of (await res.text()).split("\n")) {
    const c = parseCsvRow(row)
    if (!/^\d+$/.test((c[0] || "").trim())) continue // product rows start with a product number
    const name = (c[1] || "").trim()
    const cog = parseMoney(c[col] || "")
    if (!name || cog <= 0) continue
    out.push({ store, product_name: name, handle: null, cog_usd: cog })
  }
  return out
}

// Quotes for a store: the launch sheet's COG $ first, then the supplier's Quotation Sheet
// for products not on the launch sheet yet.
export async function fetchQuotes(store: string): Promise<Quote[]> {
  const [launch, quotation] = await Promise.all([
    fetchLaunchQuotes(store),
    fetchQuotationQuotes(store).catch(() => [] as Quote[]),
  ])
  const seen = new Set(launch.map((q) => normalizeTitle(q.product_name)))
  return [...launch, ...quotation.filter((q) => !seen.has(normalizeTitle(q.product_name)))]
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
