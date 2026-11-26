import { NextResponse } from "next/server"
import { unstable_cache } from "next/cache"
import { fetchWindsor } from "@/lib/windsor"
import { WINDSOR_ACCOUNT_MAP } from "@/lib/constants"

interface AdPerfRow {
  store: string
  channel: string
  spend: number
  clicks: number
  impressions: number
  ctr: number
  cpc: number
}

async function buildAdPerformance(date: string): Promise<AdPerfRow[]> {
  const [google, meta, tiktok] = await Promise.all([
    fetchWindsor("google_ads", ["date", "account_name", "spend", "clicks", "impressions"], date, date).catch(() => []),
    fetchWindsor("facebook", ["date", "account_name", "spend", "clicks", "impressions"], date, date).catch(() => []),
    fetchWindsor("tiktok", ["date", "account_name", "spend", "clicks", "impressions"], date, date).catch(() => []),
  ])

  const byKey = new Map<string, { spend: number; clicks: number; impressions: number; store: string; channel: string }>()

  // Windsor's /all endpoint can return every connector's accounts on each call, so keep
  // only the accounts of the channel that call was for (else each store is counted 3×).
  const tagged = [
    ...google.map((r) => ({ r, channel: "Google" })),
    ...meta.map((r) => ({ r, channel: "Meta" })),
    ...tiktok.map((r) => ({ r, channel: "TikTok" })),
  ]
  const seen = new Set<string>()
  for (const { r, channel } of tagged) {
    const mapping = WINDSOR_ACCOUNT_MAP[r.account_name]
    if (!mapping || mapping.channel !== channel) continue
    const rowKey = `${r.date}|${r.account_name}|${r.spend}|${r.clicks}|${r.impressions}`
    if (seen.has(rowKey)) continue
    seen.add(rowKey)
    const key = `${mapping.store}|${mapping.channel}`
    const e = byKey.get(key) || { store: mapping.store, channel: mapping.channel, spend: 0, clicks: 0, impressions: 0 }
    e.spend += Number(r.spend) || 0
    e.clicks += Number(r.clicks) || 0
    e.impressions += Number(r.impressions) || 0
    byKey.set(key, e)
  }

  return Array.from(byKey.values()).map((r) => ({
    ...r,
    ctr: r.impressions > 0 ? (r.clicks / r.impressions) * 100 : 0,
    cpc: r.clicks > 0 ? r.spend / r.clicks : 0,
  }))
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const date = searchParams.get("date") || new Date().toISOString().slice(0, 10)

  try {
    const cached = unstable_cache(() => buildAdPerformance(date), [`ad-perf-v2-${date}`], { revalidate: 300 })
    const rows = await cached()
    return NextResponse.json({ date, rows })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
