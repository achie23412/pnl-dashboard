import { NextResponse } from "next/server"
import { COGS_SHEET_ID, STORE_SHEET_TAB } from "@/lib/constants"

export interface CogsProduct {
  product_name: string
  cogs_usd: number
  retail_price: string
  cog_pct: string
  category: string
}

function parseCsvRow(row: string): string[] {
  const fields: string[] = []
  let current = ""
  let inQuotes = false
  for (let i = 0; i < row.length; i++) {
    const ch = row[i]
    if (ch === '"') {
      if (inQuotes && row[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (ch === "," && !inQuotes) {
      fields.push(current)
      current = ""
    } else {
      current += ch
    }
  }
  fields.push(current)
  return fields
}

function parseNumber(val: string): number {
  const cleaned = val.replace(/[£$€]/g, "").replace(/\./g, "").replace(",", ".")
  return parseFloat(cleaned) || 0
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const store = searchParams.get("store")

  if (!store) {
    return NextResponse.json({ error: "store param required" }, { status: 400 })
  }

  const tab = STORE_SHEET_TAB[store]
  if (!tab) {
    return NextResponse.json({ products: [], message: "No COGS sheet tab for this store" })
  }

  const url = `https://docs.google.com/spreadsheets/d/${COGS_SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tab)}&range=A3:O600`

  const resp = await fetch(url, { next: { revalidate: 300 } })
  if (!resp.ok) {
    return NextResponse.json({ error: "Failed to fetch sheet" }, { status: 502 })
  }

  const csv = await resp.text()
  const rows = csv.split("\n").filter((r) => r.trim())

  if (rows.length < 2) {
    return NextResponse.json({ products: [] })
  }

  const products: CogsProduct[] = []
  for (let i = 1; i < rows.length; i++) {
    const cols = parseCsvRow(rows[i])
    const name = (cols[1] || "").trim()
    const cogsStr = (cols[9] || "").trim()
    if (!name || !cogsStr) continue

    const cogsUsd = parseNumber(cogsStr)
    if (cogsUsd <= 0) continue

    products.push({
      product_name: name,
      cogs_usd: cogsUsd,
      retail_price: (cols[8] || "").trim(),
      cog_pct: (cols[13] || "").trim(),
      category: (cols[3] || "").trim(),
    })
  }

  return NextResponse.json({ products })
}
