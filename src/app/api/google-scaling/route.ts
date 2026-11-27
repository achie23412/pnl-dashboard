import { NextResponse } from "next/server"
import { buildScaling } from "@/lib/google-scaling"

export const dynamic = "force-dynamic"
export const maxDuration = 60

// Read-only: the Google Ads scaling to-do per Google store (OAK Media × Ascend SOP).
export async function GET() {
  try {
    return NextResponse.json(await buildScaling())
  } catch (e) {
    return NextResponse.json({ stores: [], error: e instanceof Error ? e.message : String(e) }, { status: 200 })
  }
}
