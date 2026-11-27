import { NextRequest, NextResponse } from "next/server"
import { buildCoachReport } from "@/lib/coach-report"
import { renderStoreImage } from "@/lib/coach-report-image"

export const dynamic = "force-dynamic"
export const maxDuration = 60

// Preview of the coach image for one store (logged-in only, via middleware): ?store=Walsh%20%26%20Farley
export async function GET(req: NextRequest) {
  const store = req.nextUrl.searchParams.get("store")
  const report = await buildCoachReport()
  const s = report.stores.find((x) => x.store === store)
  if (!s) return NextResponse.json({ error: "Unknown store" }, { status: 404 })
  const img = renderStoreImage(report, s)
  img.headers.set("Cache-Control", "no-store")
  return img
}
