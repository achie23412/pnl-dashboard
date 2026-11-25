import { NextRequest, NextResponse } from "next/server"
import { getServiceClient } from "@/lib/supabase"
import { setStatus } from "@/lib/opportunity-db"
import { canTransition, type OppStatus } from "@/lib/opportunity-engine"

// POST {ids: number[], to: "approved" | "rejected" | "saved" | "under_review", target_store?: string}
const BULK_ALLOWED: OppStatus[] = ["approved", "rejected", "saved", "under_review"]

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { ids?: number[]; to?: OppStatus; target_store?: string } | null
  if (!body?.ids?.length || !body.to || !BULK_ALLOWED.includes(body.to)) {
    return NextResponse.json({ error: "ids and a valid target status are required" }, { status: 400 })
  }
  const db = getServiceClient()
  const { data: rows, error } = await db.from("opportunities").select("id,status,target_store").in("id", body.ids)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const results: { id: number; ok: boolean; error?: string }[] = []
  for (const r of rows || []) {
    const from = r.status as OppStatus
    if (!canTransition(from, body.to)) {
      results.push({ id: r.id, ok: false, error: `can't go from ${from} to ${body.to}` })
      continue
    }
    const store = r.target_store || body.target_store || null
    if (body.to === "approved" && !store) {
      results.push({ id: r.id, ok: false, error: "no store chosen" })
      continue
    }
    try {
      await setStatus(db, r.id, body.to, `Bulk: ${from} → ${body.to}.`, !r.target_store && store ? { target_store: store } : {}, [from])
      results.push({ id: r.id, ok: true })
    } catch (e: unknown) {
      results.push({ id: r.id, ok: false, error: e instanceof Error ? e.message : String(e) })
    }
  }
  return NextResponse.json({ results })
}
