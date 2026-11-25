import { NextRequest, NextResponse } from "next/server"
import { getServiceClient } from "@/lib/supabase"
import { runAutoScan } from "@/lib/opportunity-autoscan"
import { revalidateTag } from "next/cache"

export const maxDuration = 60
export const dynamic = "force-dynamic"

// Daily (vercel.json): scan the oldest-scanned competitors, refresh our own
// catalogues and rebuild opportunities so season timing stays current.
export async function GET(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  try {
    const result = await runAutoScan(getServiceClient())
    revalidateTag("opportunity-patterns") // refresh the cached patterns panel
    return NextResponse.json({ ok: true, ...result })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
