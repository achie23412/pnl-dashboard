import { NextResponse } from "next/server"
import { unstable_cache } from "next/cache"
import { buildCashflow } from "@/lib/cashflow"

export const maxDuration = 60
export const dynamic = "force-dynamic"

// Cached 30 minutes: Windsor + Supabase reads take a few seconds.
const getCashflow = unstable_cache(buildCashflow, ["cashflow-v1"], { revalidate: 1800 })

export async function GET(req: Request) {
  try {
    const fresh = new URL(req.url).searchParams.get("fresh") === "1"
    const data = fresh ? await buildCashflow() : await getCashflow()
    return NextResponse.json(data)
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
