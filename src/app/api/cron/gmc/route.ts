import { NextRequest, NextResponse } from "next/server"
import { merchantConfigured } from "@/lib/merchant-api"
import { getSettings, syncStore, markSyncError, processQueue } from "@/lib/gmc-health"

export const maxDuration = 60
export const dynamic = "force-dynamic"

// Daily (07:40 Amsterdam): read GMC issues and price suggestions for the Google stores, then apply
// queued feed changes as far as today's limit allows. The GMC Health page shows the week's list
// from Monday on.
export async function GET(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const out: Record<string, unknown> = {}
  if (merchantConfigured()) {
    const settings = (await getSettings()).filter((s) => s.merchant_id)
    out.sync = await Promise.all(settings.map((s) => syncStore(s).catch(async (e) => {
      const msg = e instanceof Error ? e.message : String(e)
      await markSyncError(s.store, msg)
      return { store: s.store, error: msg }
    })))
  } else {
    out.sync = "GOOGLE_MERCHANT_SA_JSON not set"
  }
  out.queue = await processQueue().catch((e) => ({ error: e instanceof Error ? e.message : String(e) }))
  return NextResponse.json(out)
}
