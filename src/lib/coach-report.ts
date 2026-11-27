// Daily coach report: per Google store, the Profit & Loss "Day by day" table for the month up to
// and including yesterday, as an image, posted to the coach's Slack channel as
// "27 November | Walsh & Farley". Same formulas as the Profit & Loss page (Ascend profit sheet).
// Server only (service client).
import { getServiceClient } from "@/lib/supabase"
import { AVG_COGS_PER_ORDER } from "@/lib/constants"
import { mediaBuyerRate } from "@/lib/fee-settings"
import { loadFeeSettings } from "@/lib/fee-settings-server"
import { STORE_CURRENCY, COGS_CURRENCY, AD_SPEND_CURRENCY, fetchEurRates, toEur } from "@/lib/currency"

// Order of the posts in the channel (as posted by hand)
export const COACH_STORES = ["Walsh & Farley", "Carter & Collins", "Susan & Allen"]
// The Main Hub (all stores) image goes first; this is its name in the title and preview URL
export const HUB_KEY = "Main Hub"
const TXN_RATE = 0.06 // Google stores: transaction fee 6% of gross revenue (sheet Setup tab)

export type PnlLine = {
  gross: number; refunds: number; net: number; cogs: number; cogsEst: number; ad: number; orders: number
  mb: number; txn: number; profitBefore: number; profit: number
  roas: number | null; grossRoas: number | null; profitPct: number | null; cogPct: number | null
}
export type StoreReport = { store: string; days: { date: string; line: PnlLine }[]; total: PnlLine; last: PnlLine }
export type CoachReport = { reportDate: string; lastDay: string; month: string; stores: StoreReport[] }

type Acc = { gross: number; refunds: number; cogs: number; cogsEst: number; ad: number; orders: number; mb: number; txn: number }
const emptyAcc = (): Acc => ({ gross: 0, refunds: 0, cogs: 0, cogsEst: 0, ad: 0, orders: 0, mb: 0, txn: 0 })

function finish(a: Acc): PnlLine {
  const net = a.gross - a.refunds
  const profitBefore = a.gross - a.cogs - a.ad - a.mb - a.txn
  const profit = profitBefore - a.refunds
  return {
    ...a, net, profitBefore, profit,
    roas: a.ad > 0 ? net / a.ad : null,
    grossRoas: a.ad > 0 ? a.gross / a.ad : null,
    profitPct: a.gross > 0 ? (profit / a.gross) * 100 : null,
    cogPct: a.gross > 0 ? (a.cogs / a.gross) * 100 : null,
  }
}

// Calendar date in Amsterdam, offset in days (0 = today, -1 = yesterday)
export function amsDate(offsetDays = 0): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam", year: "numeric", month: "2-digit", day: "2-digit" })
    .format(new Date(Date.now() + offsetDays * 86400000))
}

export async function buildCoachReport(): Promise<CoachReport> {
  const reportDate = amsDate(0)
  const lastDay = amsDate(-1)
  const month = lastDay.slice(0, 7) // on the 1st: the full previous month
  const from = `${month}-01`
  const db = getServiceClient()
  const [rev, sp, cg, ref] = await Promise.all([
    db.from("daily_revenue").select("date,store,revenue,orders").gte("date", from).lte("date", lastDay).in("store", COACH_STORES).limit(5000),
    db.from("daily_spend").select("date,store,spend").gte("date", from).lte("date", lastDay).in("store", COACH_STORES).limit(5000),
    db.from("daily_cogs").select("date,store,cogs").gte("date", from).lte("date", lastDay).in("store", COACH_STORES).limit(5000),
    db.from("refunds").select("date,store,amount").gte("date", from).lte("date", lastDay).in("store", COACH_STORES).limit(5000),
  ])
  const err = rev.error || sp.error || cg.error || ref.error
  if (err) throw new Error(err.message)
  const [rates, fees] = await Promise.all([fetchEurRates(from, lastDay), loadFeeSettings()])

  const m = new Map<string, Acc>()
  const get = (s: string, d: string) => {
    const k = `${s}|${String(d).slice(0, 10)}`
    if (!m.has(k)) m.set(k, emptyAcc())
    return m.get(k)!
  }
  for (const r of rev.data || []) {
    const a = get(r.store, r.date)
    a.gross += toEur(Number(r.revenue) || 0, STORE_CURRENCY[r.store] || "EUR", r.date, rates)
    a.orders += Number(r.orders) || 0
  }
  for (const r of sp.data || []) get(r.store, r.date).ad += toEur(Number(r.spend) || 0, AD_SPEND_CURRENCY, r.date, rates)
  for (const r of ref.data || []) get(r.store, r.date).refunds += toEur(Number(r.amount) || 0, STORE_CURRENCY[r.store] || "EUR", r.date, rates)
  const cogsDays = new Set<string>()
  for (const r of cg.data || []) {
    get(r.store, r.date).cogs += toEur(Number(r.cogs) || 0, COGS_CURRENCY, r.date, rates)
    cogsDays.add(`${r.store}|${String(r.date).slice(0, 10)}`)
  }
  m.forEach((a, k) => {
    const [s, d] = k.split("|")
    // No ShipGoods COGS for a day with orders → estimate from the average COGS per order (as the P&L page)
    if (!cogsDays.has(k) && a.orders > 0) {
      const est = a.orders * toEur(AVG_COGS_PER_ORDER[s] || 0, COGS_CURRENCY, d, rates)
      a.cogs += est
      a.cogsEst += est
    }
    a.mb = a.ad * mediaBuyerRate(fees, s, d)
    a.txn = a.gross * TXN_RATE
  })

  const dates: string[] = []
  for (let d = new Date(from + "T00:00:00Z"); d.toISOString().slice(0, 10) <= lastDay; d = new Date(d.getTime() + 86400000)) {
    dates.push(d.toISOString().slice(0, 10))
  }
  const stores = COACH_STORES.map((store) => {
    const total = emptyAcc()
    const days = dates.map((date) => {
      const a = m.get(`${store}|${date}`) || emptyAcc()
      ;(Object.keys(total) as (keyof Acc)[]).forEach((k) => { total[k] += a[k] })
      return { date, line: finish(a) }
    })
    return { store, days, total: finish(total), last: days[days.length - 1]?.line ?? finish(emptyAcc()) }
  })
  return { reportDate, lastDay, month, stores }
}

// ---- Text ----
export const eur = (n: number) => (Math.abs(n) < 0.005 ? "–" : `${n < 0 ? "−" : ""}€${Math.abs(n).toLocaleString("en-IE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)
export const xr = (n: number | null) => (n === null ? "" : `${n.toFixed(2)}x`)
export const pct = (n: number | null) => (n === null ? "" : `${n.toFixed(1)}%`)
export const longDate = (d: string) => new Date(d + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" })
export const shortDate = (d: string) => new Date(d + "T00:00:00Z").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })
export const eur0 = (n: number) => `${n < 0 ? "−" : ""}€${Math.abs(Math.round(n)).toLocaleString("en-IE")}`

// "27 November | Walsh & Farley" — only the title; the numbers are in the image
export function messageText(reportDate: string, name: string): string {
  return `${longDate(reportDate)} | ${name}`
}

// ---- Slack ----
export function slackConfigured(): { token: boolean; channel: boolean } {
  return { token: !!process.env.SLACK_BOT_TOKEN, channel: !!process.env.SLACK_COACH_CHANNEL }
}

async function slackApi(method: string, body: Record<string, unknown>, json: boolean) {
  const res = await fetch(`https://slack.com/api/${method}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}`,
      "Content-Type": json ? "application/json; charset=utf-8" : "application/x-www-form-urlencoded",
    },
    body: json ? JSON.stringify(body) : new URLSearchParams(Object.entries(body).map(([k, v]) => [k, String(v)])).toString(),
  })
  const j = await res.json()
  if (!j.ok) throw new Error(`Slack ${method}: ${j.error}${j.needed ? ` (needs scope ${j.needed})` : ""}`)
  return j
}

// Upload one image with its message text into the coach channel (Slack's external upload flow)
export async function postImage(filename: string, png: ArrayBuffer, text: string) {
  const up = await slackApi("files.getUploadURLExternal", { filename, length: png.byteLength }, false)
  const put = await fetch(up.upload_url, { method: "POST", body: png })
  if (!put.ok) throw new Error(`Slack upload: HTTP ${put.status}`)
  await slackApi("files.completeUploadExternal", {
    files: [{ id: up.file_id, title: filename }],
    channel_id: process.env.SLACK_COACH_CHANNEL,
    initial_comment: text,
  }, true)
}
