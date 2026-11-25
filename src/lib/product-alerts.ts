// Product Alerts: turns Product Performance data (30 / 14 / 7 days and the 7
// days before) into alerts that say what the issue is, why (the numbers) and
// how to fix it (Ascend Drafting System SOP, rule numbers included).
// Pure functions, no imports (unit-testable with plain Node).

export interface WindowProduct {
  product_name: string
  store: string
  units_sold: number
  sales_revenue: number
  ad_spend: number | null
  roas: number | null
  be_roas: number | null
  cogs_usd: number | null
  product_ids: string[]
}

export interface StoreWindow {
  store: string
  revenue: number
  ad_spend: number
  roas: number | null
  be_roas: number | null
  product_level_spend: boolean
  spend_threshold: number
  currency: string
}

export interface AlertInput {
  d30: WindowProduct[]
  d14: WindowProduct[]
  d7: WindowProduct[]
  prev7: WindowProduct[] // the 7 days before the last 7
  stores: StoreWindow[] // 30-day store totals
}

export type Severity = "critical" | "warning" | "info"

export interface Alert {
  id: string
  severity: Severity
  store: string
  product: string | null
  product_ids: string[]
  rule: string // e.g. "Drafting SOP rule 1"
  issue: string
  why: string[]
  fix: string
  caveat: string | null
}

const SYM: Record<string, string> = { EUR: "€", GBP: "£", USD: "$" }
const money = (n: number, cur: string) => `${SYM[cur] || cur + " "}${n.toFixed(n >= 100 ? 0 : 2)}`
const x = (r: number | null) => (r == null ? "—" : `${r.toFixed(2)}x`)
const key = (p: { store: string; product_name: string }) => `${p.store}|${p.product_name}`

function index(list: WindowProduct[]) {
  return new Map(list.map((p) => [key(p), p]))
}

const SINCE_LIVE_CAVEAT =
  "The SOP counts since the product went live; the dashboard only has the last 30 days of Google spend per product, so this uses the last 30 days."

export function buildAlerts(input: AlertInput): Alert[] {
  const alerts: Alert[] = []
  const i14 = index(input.d14)
  const i7 = index(input.d7)
  const iPrev = index(input.prev7)
  const storeInfo = new Map(input.stores.map((s) => [s.store, s]))

  for (const p of input.d30) {
    const st = storeInfo.get(p.store)
    if (!st || !st.product_level_spend || p.ad_spend == null) continue
    const cur = st.currency
    const th = st.spend_threshold
    const spend = p.ad_spend
    const roas30 = p.roas ?? (spend > 0 ? p.sales_revenue / spend : null)
    const r14 = i14.get(key(p))
    const r7 = i7.get(key(p))
    const prev = iPrev.get(key(p))
    const roas14 = r14?.roas ?? null
    const roas7 = r7?.roas ?? null
    const base = { store: p.store, product: p.product_name, product_ids: p.product_ids }
    const id = (r: string) => `${key(p)}|${r}`

    // Hard rule 1: no sale, spend over threshold.
    if (p.units_sold === 0 && spend >= th) {
      alerts.push({
        ...base,
        id: id("r1"),
        severity: "critical",
        rule: "Drafting SOP rule 1",
        issue: "Spending with no sales",
        why: [`${money(spend, cur)} Google spend in the last 30 days`, "0 sales", `Spend threshold: ${money(th, cur)} (€30)`],
        fix: "Draft the product now (set it to draft in Shopify or via Adgain). Google stops spending on it as soon as it's a draft.",
        caveat: SINCE_LIVE_CAVEAT,
      })
      continue
    }
    // Hard rule 4: has sold, spend >= €50 equivalent, ROAS < 1.
    const fifty = (th / 30) * 50
    if (p.units_sold > 0 && spend >= fifty && roas30 != null && roas30 < 1) {
      alerts.push({
        ...base,
        id: id("r4"),
        severity: "critical",
        rule: "Drafting SOP rule 4",
        issue: "Sells, but loses money on ads",
        why: [`${money(spend, cur)} spend`, `${money(p.sales_revenue, cur)} revenue`, `ROAS ${x(roas30)} (below 1.00x)`],
        fix: "Draft the product. Every sale costs more in ads than it brings in.",
        caveat: SINCE_LIVE_CAVEAT,
      })
      continue
    }

    // Review list: 30-day spend >= threshold and 30-day ROAS <= 2.2.
    const onReview = spend >= th && roas30 != null && roas30 <= 2.2
    if (onReview) {
      const up = roas14 != null && roas7 != null && roas30! < roas14 && roas14 < roas7
      const down = roas14 != null && roas7 != null && roas30! > roas14 && roas14 > roas7
      const trend = `ROAS 30d ${x(roas30)} → 14d ${x(roas14)} → 7d ${x(roas7)}`
      if (up) {
        alerts.push({
          ...base,
          id: id("r6"),
          severity: "info",
          rule: "Drafting SOP rule 6",
          issue: "Low ROAS but improving",
          why: [trend, `${money(spend, cur)} spend in 30 days`],
          fix: "Keep it live and re-check next week.",
          caveat: null,
        })
        continue
      }
      const spend7 = r7?.ad_spend ?? 0
      const spend14 = r14?.ad_spend ?? 0
      if ((roas7 != null && roas7 < 2 && spend7 >= 100 * (th / 30)) || (roas14 != null && roas14 < 2 && spend14 >= 100 * (th / 30))) {
        const which = roas7 != null && roas7 < 2 && spend7 >= 100 * (th / 30) ? `7d ROAS ${x(roas7)} on ${money(spend7, cur)}` : `14d ROAS ${x(roas14)} on ${money(spend14, cur)}`
        alerts.push({
          ...base,
          id: id("r7"),
          severity: "warning",
          rule: "Drafting SOP rule 7",
          issue: "High spend at low ROAS",
          why: [which, "Rule: ROAS under 2 with at least €100 spend in that window"],
          fix: "Draft it. Exception: if you have a reason to wait, keep it 7 more days and draft if ROAS is still under 2.",
          caveat: null,
        })
        continue
      }
      if (roas30! < 1.7) {
        alerts.push({
          ...base,
          id: id("r8"),
          severity: "warning",
          rule: "Drafting SOP rule 8",
          issue: "30-day ROAS too low",
          why: [`30d ROAS ${x(roas30)} (draft below 1.70x)`, `${money(spend, cur)} spend, ${money(p.sales_revenue, cur)} revenue`],
          fix: "Draft the product.",
          caveat: null,
        })
        continue
      }
      if (down && roas30! >= 1.7) {
        alerts.push({
          ...base,
          id: id("r9"),
          severity: "warning",
          rule: "Drafting SOP rule 9",
          issue: "ROAS is falling",
          why: [trend],
          fix: "Raise the price by at least 10%, once. Re-check after 7 days and draft if ROAS didn't go up.",
          caveat: null,
        })
        continue
      }
      const noSale14 = (r14?.units_sold ?? 0) === 0
      const prevSpend = prev?.ad_spend ?? 0
      if (noSale14 && spend7 <= prevSpend) {
        alerts.push({
          ...base,
          id: id("r10"),
          severity: "warning",
          rule: "Drafting SOP rule 10",
          issue: "Stagnating: no sales in 14 days",
          why: ["0 sales in the last 14 days", `Spend last 7 days ${money(spend7, cur)} vs ${money(prevSpend, cur)} the 7 days before (not rising)`],
          fix: "Draft the product.",
          caveat: null,
        })
        continue
      }
    }

    // Margin: product ROAS below its own breakeven ROAS (not already caught).
    if (p.units_sold > 0 && roas30 != null && p.be_roas != null && roas30 < p.be_roas && spend >= th) {
      alerts.push({
        ...base,
        id: id("be"),
        severity: "warning",
        rule: "Breakeven ROAS",
        issue: "Below breakeven ROAS",
        why: [`ROAS ${x(roas30)} vs breakeven ${x(p.be_roas)}`, `${money(spend, cur)} spend in 30 days`],
        fix: "Either raise the price (lowers the breakeven) or exclude/draft it. Check the competitor price first so you stay competitive on Google Shopping.",
        caveat: null,
      })
    }
  }

  // Store level: ROAS vs breakeven (all channels, same numbers as the Main Hub).
  for (const s of input.stores) {
    if (s.roas == null || s.be_roas == null || s.ad_spend <= 0) continue
    if (s.roas < s.be_roas) {
      alerts.push({
        id: `${s.store}|store-be`,
        severity: s.roas < s.be_roas * 0.8 ? "critical" : "warning",
        store: s.store,
        product: null,
        product_ids: [],
        rule: "Store breakeven",
        issue: "Store is below breakeven",
        why: [`30-day ROAS ${x(s.roas)} vs breakeven ${x(s.be_roas)}`, `${money(s.ad_spend, s.currency)} ad spend, ${money(s.revenue, s.currency)} revenue`],
        fix: s.product_level_spend
          ? "Start with the product alerts below (draft rule 1/4/7/8 products first). If CPC is above €1 across the store for 7 days, the SOP advises a domain switch instead."
          : "Meta/TikTok store: apply the kill rules per campaign (Simo): $20 with 0 ATC, $30 with 0 sales, $60 with fewer than 2 sales.",
        caveat: null,
      })
    }
  }

  const order: Record<Severity, number> = { critical: 0, warning: 1, info: 2 }
  return alerts.sort((a, b) => order[a.severity] - order[b.severity] || a.store.localeCompare(b.store))
}
