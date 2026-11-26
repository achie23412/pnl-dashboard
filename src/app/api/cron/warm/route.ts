import { NextRequest, NextResponse } from "next/server"
import { createSession, SESSION_COOKIE } from "@/lib/session"
import { daysAgo } from "@/lib/product-complaints"
import { syncShipgoods } from "@/lib/shipgoods-store"

export const maxDuration = 60
export const dynamic = "force-dynamic"

// Runs after each data refresh: saves the last 7 days of ShipGoods costs, then builds the product catalogs the pages ask for (30 days: Product
// Rules/Performance/Alerts, Price Suggestions, Season Board; 90 days: Quality Checks) so the first
// visitor of the day doesn't wait ~30 s for ShipGoods. The catalog keeps them for 15 minutes and
// refreshes them in the background after that.
export async function GET(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  // First save the last 7 days of ShipGoods costs (~2 pages), so the catalogs below read them
  // from the database instead of the slow ShipGoods API
  const sync = await syncShipgoods(daysAgo(6), daysAgo(0), 15000).catch((e) => ({ error: e instanceof Error ? e.message : String(e) }))
  const origin = req.nextUrl.origin
  const cookie = `${SESSION_COOKIE}=${await createSession("owner")}`
  const urls = [
    "/api/product-catalog?store=all",
    `/api/product-catalog?store=all&from=${daysAgo(89)}&to=${daysAgo(0)}`,
  ]
  const results = await Promise.all(urls.map(async (u) => {
    const t = Date.now()
    try {
      const r = await fetch(origin + u, { headers: { cookie }, cache: "no-store", signal: AbortSignal.timeout(40000) })
      return { url: u.replace(/from=.*$/, "90 days"), status: r.status, seconds: Math.round((Date.now() - t) / 100) / 10 }
    } catch (e) {
      return { url: u.replace(/from=.*$/, "90 days"), error: e instanceof Error ? e.message : String(e) }
    }
  }))
  return NextResponse.json({ sync, warmed: results })
}
