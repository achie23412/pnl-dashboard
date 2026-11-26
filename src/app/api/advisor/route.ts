// Advisor: live checks of the data pipeline and setup, instead of hard-coded advice.
// Every item is worked out from the database and the server's settings at request time.
import { NextResponse } from "next/server"
import { getServiceClient } from "@/lib/supabase"
import { STORES } from "@/lib/constants"

export const dynamic = "force-dynamic"

type Priority = "high" | "medium" | "low"
type Category = "data" | "automation" | "dashboard" | "tracking" | "security"
export interface AdvisorItem {
  id: string
  title: string
  description: string
  priority: Priority
  category: Category
  action?: string
  impact: string
}

const STORE_LIST = STORES.filter((s) => s !== "Overall") as string[]
const dayStr = (d: Date) => d.toISOString().slice(0, 10)
const daysAgo = (n: number) => dayStr(new Date(Date.now() - n * 86400000))
const age = (ymd: string) => Math.floor((Date.now() - Date.parse(`${ymd}T12:00:00Z`)) / 86400000)

async function latestPerStore(table: string, since: string): Promise<Map<string, string>> {
  const { data } = await getServiceClient().from(table).select("store,date").gte("date", since).limit(20000)
  const m = new Map<string, string>()
  for (const r of (data || []) as { store: string; date: string }[]) if (!m.has(r.store) || r.date > m.get(r.store)!) m.set(r.store, r.date)
  return m
}

export async function GET() {
  const db = getServiceClient()
  const items: AdvisorItem[] = []
  const since = daysAgo(30)

  const [log, rev, spend, cogs, sessions, csRefunds, shopRefunds, scans] = await Promise.all([
    db.from("refresh_log").select("started_at,status,error").order("id", { ascending: false }).limit(1),
    latestPerStore("daily_revenue", since),
    latestPerStore("daily_spend", since),
    latestPerStore("daily_cogs", since),
    latestPerStore("daily_sessions", since),
    db.from("cs_refunds").select("id", { count: "exact", head: true }).gte("refund_date", since),
    db.from("refunds").select("date", { count: "exact", head: true }).gte("date", since),
    db.from("competitor_scan_state").select("domain,last_error").eq("last_ok", false).gte("last_scanned", new Date(Date.now() - 86400000).toISOString()),
  ])

  // Security / setup
  if (!process.env.ROLE_SECRET) items.push({
    id: "role-secret", priority: "high", category: "security",
    title: "Set ROLE_SECRET in Vercel",
    description: "Login sessions are signed with the dashboard password because ROLE_SECRET isn't set. If the password ever leaks, sessions can be forged until the password changes.",
    action: "Vercel → pnl-dashboard → Settings → Environment Variables → add ROLE_SECRET (a long random string) for Production, then redeploy. Everyone logs in once more.",
    impact: "Sessions stay safe even if the password is shared.",
  })
  if (!process.env.CRON_SECRET) items.push({
    id: "cron-secret", priority: "medium", category: "security",
    title: "Set CRON_SECRET in Vercel",
    description: "The data refresh, refund check and opportunity scan URLs can be called by anyone who knows them, because CRON_SECRET isn't set.",
    action: "Add CRON_SECRET (a long random string) in Vercel's Environment Variables and redeploy. Vercel's scheduled runs send it automatically.",
    impact: "Strangers can't trigger refreshes or use up API limits.",
  })
  if (!process.env.SHIPGOODS_TOKEN) items.push({
    id: "shipgoods-token", priority: "high", category: "data",
    title: "SHIPGOODS_TOKEN is missing", description: "The refresh can't read COGS from ShipGoods.",
    action: "Add SHIPGOODS_TOKEN in Vercel's Environment Variables.", impact: "Without it COGS stays at 0.",
  })
  if (!process.env.WINDSOR_API_KEY) items.push({
    id: "windsor-key", priority: "high", category: "data",
    title: "WINDSOR_API_KEY is missing", description: "Ad spend for Meta, Google Ads and TikTok comes from Windsor.",
    action: "Add WINDSOR_API_KEY in Vercel's Environment Variables.", impact: "Without it ad spend stops updating.",
  })

  // Refresh health
  const last = log.data?.[0] as { started_at: string; status: string; error: string | null } | undefined
  if (!last || Date.now() - Date.parse(last.started_at) > 26 * 3600000) items.push({
    id: "refresh-stale", priority: "high", category: "automation",
    title: "The daily data refresh hasn't run in over a day",
    description: last ? `Last run: ${new Date(last.started_at).toLocaleString("en-GB", { timeZone: "Europe/Amsterdam" })}.` : "No refresh has ever been logged.",
    action: "Check Vercel → pnl-dashboard → Cron Jobs, and the latest deployment's logs for /api/cron/refresh.",
    impact: "All numbers on the dashboard are getting older.",
  })
  else if (last.status !== "success") items.push({
    id: "refresh-partial", priority: "medium", category: "data",
    title: `Last data refresh: ${last.status}`,
    description: last.error || "Part of the data didn't load.",
    action: "Open the refresh status in the top bar for details; the notes say which source failed.",
    impact: "Some numbers may be missing or older than the rest.",
  })

  // Per-store freshness
  for (const store of STORE_LIST) {
    const r = rev.get(store)
    const s = spend.get(store)
    const c = cogs.get(store)
    if (!r || age(r) > 3) items.push({
      id: `rev-${store}`, priority: s && age(s) <= 3 ? "high" : "medium", category: "data",
      title: `${store}: no revenue ${r ? `since ${r}` : "in 30 days"}`,
      description: s && age(s) <= 3 ? `Ads are still spending (last spend ${s}) but no sales come in: either sales are missing or the ads aren't converting.` : "No ad spend either, so the store may be paused.",
      action: "Check the store's orders in Shopify. If it has sales, check the refresh notes for this store.",
      impact: "Profit for this store is wrong if sales exist.",
    })
    if (r && age(r) <= 3 && (!c || age(c) > 4)) items.push({
      id: `cogs-${store}`, priority: "medium", category: "data",
      title: `${store}: COGS ${c ? `stops on ${c}` : "missing"}`,
      description: `Revenue runs until ${r}, but COGS ${c ? `stops on ${c}` : "has no rows in 30 days"}.`,
      action: "Check that the store's orders are in ShipGoods (Supply Chain page) or in the COGS launch sheet.",
      impact: "Profit is overstated while COGS is missing.",
    })
    if (!sessions.get(store) || age(sessions.get(store)!) > 3) items.push({
      id: `sessions-${store}`, priority: "low", category: "data",
      title: `${store}: no session data`,
      description: "CVR needs human sessions from Shopify (read_reports access).",
      action: "Check the store's Shopify app has the read_reports scope.",
      impact: "CVR for this store is empty.",
    })
  }

  // CS logs
  if ((csRefunds.count ?? 0) === 0 && (shopRefunds.count ?? 0) > 0) items.push({
    id: "cs-log-empty", priority: "medium", category: "tracking",
    title: "Shopify has refunds but the CS refund log is empty",
    description: `${shopRefunds.count} refunds in Shopify in the last 30 days, none in the CS log. They're copied in automatically every morning; check the reasons there.`,
    action: "Open Customer Service → Refunds and correct the guessed reasons of the imported rows.",
    impact: "Risky Products and CS Reports depend on the reasons.",
  })

  // Competitor scans
  const failedScans = (scans.data || []) as { domain: string; last_error: string | null }[]
  if (failedScans.length) items.push({
    id: "scan-failed", priority: "low", category: "automation",
    title: `${failedScans.length} competitor scan${failedScans.length > 1 ? "s" : ""} failed in the last 24 hours`,
    description: failedScans.map((f) => `${f.domain} (${f.last_error || "error"})`).join(", "),
    action: "In the Competitor Tracker, fix the domain or set the store to dead if it closed.",
    impact: "No new products are picked up from these stores.",
  })

  const rank = { high: 0, medium: 1, low: 2 }
  items.sort((a, b) => rank[a.priority] - rank[b.priority])
  return NextResponse.json({ items, checkedAt: new Date().toISOString() })
}
