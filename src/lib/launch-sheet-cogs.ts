import { COGS_SHEET_ID, STORE_SHEET_TAB, AVG_COGS_PER_ORDER, SHIPGOODS_SHOP_MAP } from "./constants"

function parseCsvRow(row: string): string[] {
  const fields: string[] = []
  let current = ""
  let inQuotes = false
  for (let i = 0; i < row.length; i++) {
    const ch = row[i]
    if (ch === '"') {
      if (inQuotes && row[i + 1] === '"') { current += '"'; i++ }
      else inQuotes = !inQuotes
    } else if (ch === "," && !inQuotes) {
      fields.push(current); current = ""
    } else current += ch
  }
  fields.push(current)
  return fields
}

function parseNumber(val: string): number {
  const cleaned = val.replace(/[£$€]/g, "").replace(/\./g, "").replace(",", ".")
  return parseFloat(cleaned) || 0
}

async function fetchSheetAvgCogs(store: string): Promise<number | null> {
  const tab = STORE_SHEET_TAB[store]
  if (!tab) return null

  try {
    const url = `https://docs.google.com/spreadsheets/d/${COGS_SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tab)}&range=A3:O600`
    const resp = await fetch(url, { signal: AbortSignal.timeout(5000) })
    if (!resp.ok) return null

    const csv = await resp.text()
    const rows = csv.split("\n").filter((r) => r.trim())
    if (rows.length < 2) return null

    let totalCogs = 0
    let count = 0
    for (let i = 1; i < rows.length; i++) {
      const cols = parseCsvRow(rows[i])
      const cogsStr = (cols[9] || "").trim()
      if (!cogsStr) continue
      const cogsUsd = parseNumber(cogsStr)
      if (cogsUsd > 0) { totalCogs += cogsUsd; count++ }
    }
    return count > 0 ? Math.round((totalCogs / count) * 100) / 100 : null
  } catch {
    return null
  }
}

const SHIPGOODS_STORES = new Set(Object.values(SHIPGOODS_SHOP_MAP))

export async function estimateGoogleStoreCogs(
  revenueRows: Array<{ date: string; store: string; orders: number }>,
): Promise<Array<{ date: string; store: string; cogs: number; is_estimate: boolean }>> {
  const googleStores = Object.keys(STORE_SHEET_TAB)

  const sheetAvgs = new Map<string, number>()
  const results = await Promise.allSettled(
    googleStores.map(async (store) => {
      const avg = await fetchSheetAvgCogs(store)
      return { store, avg }
    }),
  )
  for (const r of results) {
    if (r.status === "fulfilled" && r.value.avg !== null) {
      sheetAvgs.set(r.value.store, r.value.avg)
    }
  }

  const rows: Array<{ date: string; store: string; cogs: number; is_estimate: boolean }> = []

  for (const rev of revenueRows) {
    if (SHIPGOODS_STORES.has(rev.store)) continue
    if (rev.orders <= 0) continue

    const avgCogs = sheetAvgs.get(rev.store) ?? AVG_COGS_PER_ORDER[rev.store]
    if (!avgCogs) continue

    rows.push({
      date: rev.date,
      store: rev.store,
      cogs: Math.round(rev.orders * avgCogs * 100) / 100,
      is_estimate: true,
    })
  }

  return rows
}
