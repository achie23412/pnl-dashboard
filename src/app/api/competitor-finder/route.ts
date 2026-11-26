import { NextResponse } from "next/server"
import { unstable_cache } from "next/cache"
import { getServiceClient } from "@/lib/supabase"
import { buildKeywords, checkStores, cleanDomain, MARKETS, type MarketCode } from "@/lib/competitor-finder"

export const maxDuration = 60
export const dynamic = "force-dynamic"

const cachedKeywords = unstable_cache((m: MarketCode) => buildKeywords(m), ["competitor-finder-v4"], { revalidate: 3600 })

// GET ?market=US → ranked keywords for that market
export async function GET(req: Request) {
  const market = (new URL(req.url).searchParams.get("market") || "US").toUpperCase() as MarketCode
  if (!MARKETS.some((m) => m.code === market)) return NextResponse.json({ error: "Unknown market" }, { status: 400 })
  try {
    return NextResponse.json({ market, ...(await cachedKeywords(market)) })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}

// POST { action: "check", domains: [...] } → store checks
// POST { action: "add", domain, market, niche, keyword, monthly_visits?, tp_reviews?, tp_rating?, products? } → add to Competitor Tracker
export async function POST(req: Request) {
  const b = await req.json()
  if (b.action === "check") {
    if (!Array.isArray(b.domains) || !b.domains.length) return NextResponse.json({ error: "Paste at least one store." }, { status: 400 })
    return NextResponse.json({ stores: await checkStores(b.domains.map(String)) })
  }
  if (b.action === "add") {
    const domain = cleanDomain(String(b.domain || ""))
    if (!domain) return NextResponse.json({ error: "Bad domain." }, { status: 400 })
    const m = MARKETS.find((x) => x.code === b.market)
    const num = (v: unknown) => (v === "" || v == null || isNaN(Number(v)) ? null : Number(v))
    const visits = num(b.monthly_visits)
    const tp = num(b.tp_reviews)
    const passes = (visits ?? 0) >= 20000 || (tp ?? 0) >= 50
    const notes = [
      `Found via Competitor Finder${b.keyword ? ` ("${b.keyword}")` : ""}`,
      visits != null ? `${visits.toLocaleString("en-IE")} visits/mo` : null,
      tp != null ? `${tp} Trustpilot reviews` : null,
      visits == null && tp == null ? "visits + Trustpilot not checked yet" : passes ? "passes 20k visits / 50 TP rule" : "below 20k visits / 50 TP",
    ]
      .filter(Boolean)
      .join(" · ")
    const row = {
      domain,
      store_name: String(b.name || domain),
      store_url: `https://${domain}`,
      niche: String(b.niche || ""),
      markets: m ? [m.ads] : [],
      monthly_visits: visits,
      tp_reviews: tp,
      ...(num(b.tp_rating) != null && (num(b.tp_rating) as number) >= 1 && (num(b.tp_rating) as number) <= 5
        ? { tp_rating: num(b.tp_rating), tp_checked: new Date().toISOString().slice(0, 10) } : {}),
      products_count: num(b.products),
      status: "new",
      notes,
      last_checked: new Date().toISOString().slice(0, 10),
    }
    const { error } = await getServiceClient().from("competitors").upsert(row, { onConflict: "domain" })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, passes })
  }
  return NextResponse.json({ error: "Unknown action" }, { status: 400 })
}
