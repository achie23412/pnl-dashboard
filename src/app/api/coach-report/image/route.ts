import { NextRequest, NextResponse } from "next/server"
import { buildCoachReport, HUB_KEY } from "@/lib/coach-report"
import { buildHub } from "@/lib/coach-hub"
import { renderStoreImage, renderHubImage } from "@/lib/coach-report-image"

export const dynamic = "force-dynamic"
export const maxDuration = 60

// Preview of one coach image (logged-in only, via middleware): ?store=Walsh%20%26%20Farley or ?store=Main%20Hub
export async function GET(req: NextRequest) {
  const store = req.nextUrl.searchParams.get("store")
  if (store === HUB_KEY) {
    const img = renderHubImage(await buildHub())
    img.headers.set("Cache-Control", "no-store")
    return img
  }
  const report = await buildCoachReport()
  const s = report.stores.find((x) => x.store === store)
  if (!s) return NextResponse.json({ error: "Unknown store" }, { status: 404 })
  const img = renderStoreImage(report, s)
  img.headers.set("Cache-Control", "no-store")
  return img
}
