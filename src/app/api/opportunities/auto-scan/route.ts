import { NextResponse } from "next/server"
import { getServiceClient } from "@/lib/supabase"
import { runAutoScan } from "@/lib/opportunity-autoscan"
import { revalidateTag } from "next/cache"

export const maxDuration = 60
export const dynamic = "force-dynamic"

// "Scan now" from the Product Opportunities page (logged in). Same scan as the
// daily cron; call again while `remaining` > 0 to work through all competitors.
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { recompute?: boolean }
  try {
    const result = await runAutoScan(getServiceClient(), { recompute: body.recompute !== false })
    revalidateTag("opportunity-patterns") // refresh the cached patterns panel
    return NextResponse.json({ ok: true, ...result })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
