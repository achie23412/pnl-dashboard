// Meta (Facebook/Instagram) ad spend straight from the Meta Marketing API, without Windsor.
// Server only.
//
// Setup (Vercel environment variables):
//   META_ACCESS_TOKEN = a system-user token from Meta Business Manager with the ads_read permission
//   META_AD_ACCOUNTS  = "act_<id>=<account name>", comma-separated for more than one account.
//                       The account name must be the one the dashboard already uses in
//                       WINDSOR_ACCOUNT_MAP (e.g. "act_1234567890=LUMEGLASSES"), so the rows in
//                       daily_spend stay the same as with Windsor and nothing is counted twice.
// Without these two variables nothing here runs and the dashboard keeps using Windsor.
import { WINDSOR_ACCOUNT_MAP, STORE_TIMEZONE } from "./constants"
import { zonedToUtc, dayIn, shiftDay } from "./windsor"

const GRAPH = "https://graph.facebook.com/v21.0"

type Account = { id: string; name: string }
type SpendOut = { date: string; channel: string; account: string; store: string; spend: number }
export type MetaPerfRow = { date: string; account_name: string; spend: number; clicks: number; impressions: number }

export function metaDirectConfigured(): boolean {
  return !!process.env.META_ACCESS_TOKEN && metaAccounts().length > 0
}

function metaAccounts(): Account[] {
  return (process.env.META_AD_ACCOUNTS || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => {
      const [rawId, ...rest] = x.split("=")
      const id = rawId.trim().startsWith("act_") ? rawId.trim() : `act_${rawId.trim()}`
      return { id, name: rest.join("=").trim() }
    })
    .filter((a) => a.name && WINDSOR_ACCOUNT_MAP[a.name]?.channel === "Meta")
}

async function graph(path: string, params: Record<string, string>): Promise<Record<string, unknown>> {
  const url = new URL(`${GRAPH}/${path}`)
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  url.searchParams.set("access_token", process.env.META_ACCESS_TOKEN || "")
  const res = await fetch(url, { cache: "no-store" })
  const json = await res.json().catch(() => null)
  if (!res.ok || !json || json.error) {
    // Never include the URL in the error: it carries the token
    throw new Error(`Meta API ${res.status}: ${json?.error?.message || "no response"}`)
  }
  return json
}

// All pages of an insights request
async function insights(accountId: string, params: Record<string, string>): Promise<Record<string, string>[]> {
  const out: Record<string, string>[] = []
  let after: string | undefined
  for (let page = 0; page < 50; page++) {
    const json = await graph(`${accountId}/insights`, { ...params, limit: "500", ...(after ? { after } : {}) })
    out.push(...((json.data as Record<string, string>[]) || []))
    const paging = json.paging as { cursors?: { after?: string }; next?: string } | undefined
    if (!paging?.next || !paging.cursors?.after) break
    after = paging.cursors.after
  }
  return out
}

// Ad spend per STORE day, the same shape and logic as Windsor's fetchMetaSpend: spend is pulled per
// hour in the ad account's timezone and booked on the store's own calendar day.
export async function fetchMetaSpendDirect(dateFrom: string, dateTo: string): Promise<SpendOut[]> {
  const sums = new Map<string, SpendOut>()
  for (const acc of metaAccounts()) {
    const store = WINDSOR_ACCOUNT_MAP[acc.name].store
    const info = await graph(acc.id, { fields: "timezone_name,currency" })
    const adTz = String(info.timezone_name || "America/Los_Angeles")
    const storeTz = STORE_TIMEZONE[store] || adTz
    const todayAd = dayIn(adTz, Date.now())
    const until = shiftDay(dateTo, 1) < todayAd ? shiftDay(dateTo, 1) : todayAd
    const rows = await insights(acc.id, {
      level: "account",
      fields: "spend",
      time_increment: "1",
      breakdowns: "hourly_stats_aggregated_by_advertiser_time_zone",
      time_range: JSON.stringify({ since: shiftDay(dateFrom, -1), until }),
    })
    for (const r of rows) {
      const spend = Number(r.spend) || 0
      if (!spend) continue
      const hour = parseInt(String(r.hourly_stats_aggregated_by_advertiser_time_zone || "0").slice(0, 2), 10) || 0
      const day = dayIn(storeTz, zonedToUtc(String(r.date_start).slice(0, 10), hour, adTz))
      if (day < dateFrom || day > dateTo) continue
      const k = `${day}|${acc.name}`
      const cur = sums.get(k) || { date: day, channel: "Meta", account: acc.name, store, spend: 0 }
      cur.spend += spend
      sums.set(k, cur)
    }
  }
  return Array.from(sums.values()).map((x) => ({ ...x, spend: Math.round(x.spend * 100) / 100 }))
}

// Daily spend, clicks and impressions per ad-account day (for the Daily Report's ad table),
// in the same row shape as Windsor's facebook rows.
export async function fetchMetaPerformanceDirect(dateFrom: string, dateTo: string): Promise<MetaPerfRow[]> {
  const out: MetaPerfRow[] = []
  for (const acc of metaAccounts()) {
    const rows = await insights(acc.id, {
      level: "account",
      fields: "spend,clicks,impressions",
      time_increment: "1",
      time_range: JSON.stringify({ since: dateFrom, until: dateTo }),
    })
    for (const r of rows) {
      out.push({
        date: String(r.date_start).slice(0, 10),
        account_name: acc.name,
        spend: Number(r.spend) || 0,
        clicks: Number(r.clicks) || 0,
        impressions: Number(r.impressions) || 0,
      })
    }
  }
  return out
}
