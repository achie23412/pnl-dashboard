// Builds the "Must do" list for a day from the dashboard data and the user's SOPs.
// Every task carries `why` (the numbers that triggered it) and `source` (which rule it comes from).
import { AVG_COGS_PER_ORDER, TRANSACTION_FEE_RATE } from "@/lib/constants"
import { STORE_CURRENCY, COGS_CURRENCY, toEur, type EurRates } from "@/lib/currency"
import type { RevenueRow, SpendRow, CogsRow } from "@/lib/types"

export type AutoTodo = {
  key: string // stable per day/period, used to remember "done"
  title: string
  why: string
  source: string
  priority: "high" | "normal"
  store?: string
}

export const GOOGLE_STORES = ["Walsh & Farley", "Carter & Collins", "Susan & Allen"]
export const META_STORES = ["LUMEGLASSES", "Blinky"]
const ALL_STORES = [...META_STORES, ...GOOGLE_STORES]

const addDays = (d: string, n: number) => {
  const x = new Date(d + "T00:00:00Z")
  x.setUTCDate(x.getUTCDate() + n)
  return x.toISOString().slice(0, 10)
}
const eur = (n: number) => `€${n.toLocaleString("en-IE", { maximumFractionDigits: n < 100 ? 2 : 0 })}`

export type TodoInput = {
  today: string // YYYY-MM-DD (Amsterdam)
  revenue: RevenueRow[] // native currency, last ~11 days
  spend: SpendRow[]
  cogs: CogsRow[]
  rates: EurRates
  hasSessions: boolean
  lastRefresh: { status: string; error: string | null; completed_at: string | null; started_at?: string | null } | null
}

export function buildAutoTodos(input: TodoInput): AutoTodo[] {
  const { today, rates } = input
  const todos: AutoTodo[] = []
  const recentFrom = addDays(today, -3)
  const baselineFrom = addDays(today, -10)
  const inRecent = (d: string) => d >= recentFrom && d < today
  const inBaseline = (d: string) => d >= baselineFrom && d < recentFrom
  const inWindow = (d: string) => d >= baselineFrom && d < today

  const rev = input.revenue.map((r) => ({ ...r, revenue: toEur(r.revenue, STORE_CURRENCY[r.store] || "EUR", r.date, rates) }))
  const spend = input.spend.map((r) => ({ ...r, spend: toEur(r.spend, STORE_CURRENCY[r.store] || "EUR", r.date, rates) }))
  const cogs = input.cogs.map((r) => ({ ...r, cogs: toEur(r.cogs, COGS_CURRENCY, r.date, rates) }))
  const sum = <T,>(rows: T[], pick: (r: T) => number) => rows.reduce((a, r) => a + pick(r), 0)

  const activeGoogle: string[] = []
  const activeMeta: string[] = []

  for (const s of ALL_STORES) {
    const rRev = sum(rev.filter((r) => r.store === s && inRecent(r.date)), (r) => r.revenue)
    const rSpend = sum(spend.filter((r) => r.store === s && inRecent(r.date)), (r) => r.spend)
    const bRev = sum(rev.filter((r) => r.store === s && inBaseline(r.date)), (r) => r.revenue)
    const bSpend = sum(spend.filter((r) => r.store === s && inBaseline(r.date)), (r) => r.spend)
    if (rSpend > 0) (GOOGLE_STORES.includes(s) ? activeGoogle : activeMeta).push(s)
    if (rSpend < 30) continue

    // Break-even ROAS over the 10-day window: COGS % (actual, else estimated per order) + fee rate
    const wRev = rev.filter((r) => r.store === s && inWindow(r.date))
    const wCogs = cogs.filter((r) => r.store === s && inWindow(r.date))
    const cogsDays = new Set(wCogs.map((r) => r.date))
    const revTotal = sum(wRev, (r) => r.revenue)
    const cogsTotal =
      sum(wCogs, (r) => r.cogs) +
      sum(wRev.filter((r) => !cogsDays.has(r.date)), (r) =>
        r.orders * toEur(AVG_COGS_PER_ORDER[s] || 0, COGS_CURRENCY, r.date, rates))
    const margin = (revTotal > 0 ? cogsTotal / revTotal : 0) + (TRANSACTION_FEE_RATE[s] || 0.035)
    const be = margin < 1 ? 1 / (1 - margin) : Infinity

    const roas = rRev / rSpend
    const baseRoas = bSpend > 0 ? bRev / bSpend : null
    const drop = baseRoas ? (1 - roas / baseRoas) * 100 : 0
    const numbers =
      `Last 3 days: ${eur(rSpend)} spent, ${eur(rRev)} revenue = ${roas.toFixed(2)}x ROAS. ` +
      `Break-even ${Number.isFinite(be) ? be.toFixed(2) + "x" : "n/a"}` +
      (baseRoas ? `. The 7 days before: ${baseRoas.toFixed(2)}x (${drop > 0 ? "−" : "+"}${Math.abs(drop).toFixed(0)}%).` : ".")

    const isGoogle = GOOGLE_STORES.includes(s)
    if (roas < be) {
      todos.push({
        key: `below-be:${s}:${today}`,
        store: s,
        priority: "high",
        title: isGoogle
          ? drop >= 50
            ? `${s}: cut 15%, run exclusions`
            : `${s}: run exclusions, hold budget`
          : `${s}: kill bad tests, no scaling`,
        why: numbers,
        source: isGoogle
          ? "OAK × Ascend Google Ads SOP: 50%+ dip → scale back 15%; exclude products with $25 spent + ROAS < 1.8"
          : "Simo: kill at $10 CPC>$1 + 0 ATC / $20 0 ATC / $30 0 sales / $60 <2 sales; only scale with net profit >20%",
      })
    } else if (baseRoas && drop >= 30) {
      todos.push({
        key: `roas-drop:${s}:${today}`,
        store: s,
        priority: "normal",
        title: `${s}: ROAS −${drop.toFixed(0)}%, hold budget`,
        why: numbers,
        source: isGoogle
          ? "OAK × Ascend Google Ads SOP: only scale after 2–3 days in a row on target ROAS (2.5)"
          : "Simo: only scale when spend >$60 and total, today and yesterday net profit are all >20%",
      })
    }

    // Winner campaign from ~€250/day on a Google store
    if (isGoogle && rSpend / 3 >= 250) {
      const block = Math.floor(new Date(today + "T00:00:00Z").getTime() / (4 * 86400000))
      todos.push({
        key: `winners:${s}:${block}`,
        store: s,
        priority: "normal",
        title: `${s}: add to winner campaign`,
        why: `Spend is ${eur(rSpend / 3)}/day over the last 3 days (threshold ~250/day).`,
        source: "OAK × Ascend Google Ads SOP step 7: ROAS ≥ 2.2, ≥ 3 conversions in 14 days; add new winners every 4 days",
      })
    }
  }

  // ── Daily SOP routines (only for stores that actually spent in the last 3 days)
  if (activeGoogle.length > 0) {
    todos.push({
      key: `exclusions:${today}`,
      priority: "normal",
      title: `Run product exclusions (${activeGoogle.join(", ")})`,
      why: `These stores had Google spend in the last 3 days. Also re-check the excluded list and remove exclusions that are back above target with sales.`,
      source: "OAK × Ascend Google Ads SOP steps 5–6: check daily, exclude every 2 days ($25 + ROAS < 1.8, or CPC > $1.50 after $5)",
    })
    if (new Date(today + "T00:00:00Z").getUTCDay() === 1) {
      todos.push({
        key: `drafting-weekly:${today}`,
        priority: "high",
        title: `Monday draft cleanup (Google stores)`,
        why: `It's Monday. Use the Adgain numbers; first matching rule decides; log product, date and rule number.`,
        source: "Ascend Drafting SOP: review rules 6–11 weekly, hard rules 1–5 any day, max 50 drafts per store per day",
      })
    }
  }
  if (activeMeta.length > 0) {
    todos.push({
      key: `simo-midnight:${today}`,
      priority: "normal",
      title: `Midnight scale check (${activeMeta.join(", ")})`,
      why: `These stores had Meta/TikTok spend in the last 3 days.`,
      source: "Simo: 4 gates (spend >$60, total, today and yesterday net profit >20%) → double at midnight, compare over 72h",
    })
  }

  todos.push({
    key: `coach-report:${today}`,
    priority: "normal",
    title: "Send P&L to coach",
    why: "Per store: date, revenue, spend, ROAS, COGS % — plus a screenshot of the full-month dashboard.",
    source: "Coach requirement (Daily Report page)",
  })

  // ── Data health
  const lr = input.lastRefresh
  if (lr) {
    const ageH = lr.completed_at ? (Date.now() - new Date(lr.completed_at).getTime()) / 3600000 : Infinity
    if (lr.status === "error" || lr.status === "partial") {
      todos.push({
        key: `refresh-errors:${today}`,
        priority: lr.status === "error" ? "high" : "normal",
        title: lr.status === "error" ? "Data refresh failed" : "Data refresh had errors",
        why: (lr.error || "No error text").slice(0, 220),
        source: "refresh_log (last run)",
      })
    } else if (ageH > 26) {
      todos.push({
        key: `refresh-stale:${today}`,
        priority: "high",
        title: "Data refresh stale (26h+)",
        why: lr.completed_at ? `Last completed run: ${lr.completed_at.slice(0, 16).replace("T", " ")} UTC.` : "No completed run found.",
        source: "refresh_log (daily cron ~07:00 Amsterdam)",
      })
    }
  }
  if (!input.hasSessions) {
    todos.push({
      key: "cvr-tokens",
      priority: "normal",
      title: "Add Shopify tokens for CVR",
      why: "The daily_sessions table is still empty, so conversion rate can't be calculated.",
      source: "P&L dashboard setup",
    })
  }

  const rank = { high: 0, normal: 1 }
  return todos.sort((a, b) => rank[a.priority] - rank[b.priority])
}

export function amsterdamToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date())
}
