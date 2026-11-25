import { NextRequest, NextResponse } from "next/server"
import { getServiceClient } from "@/lib/supabase"
import { addHistory, setStatus } from "@/lib/opportunity-db"
import { canTransition, missingChecks, ADAPT_CHECKS, TARGET_STORES, type OppStatus } from "@/lib/opportunity-engine"
import { SHOPIFY_STORES } from "@/lib/constants"

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const id = Number(params.id)
  const db = getServiceClient()
  const [opp, history, jobs] = await Promise.all([
    db.from("opportunities").select("*").eq("id", id).single(),
    db.from("opportunity_history").select("*").eq("opportunity_id", id).order("at", { ascending: false }),
    db.from("import_jobs").select("*").eq("opportunity_id", id).order("updated_at", { ascending: false }),
  ])
  if (opp.error) return NextResponse.json({ error: opp.error.message }, { status: 404 })
  return NextResponse.json({ opportunity: opp.data, history: history.data || [], jobs: jobs.data || [] })
}

// PATCH {status?, note?, notes?, target_store?, adapt_checks?, source_url?}
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const id = Number(params.id)
  const body = (await req.json().catch(() => null)) as {
    status?: OppStatus
    note?: string
    notes?: string
    target_store?: string | null
    adapt_checks?: Record<string, boolean>
    source_url?: string
  } | null
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  const db = getServiceClient()
  const { data: opp, error } = await db.from("opportunities").select("*").eq("id", id).single()
  if (error || !opp) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const patch: Record<string, unknown> = {}
  if (typeof body.notes === "string") patch.notes = body.notes.slice(0, 5000)
  if (body.target_store !== undefined) {
    if (body.target_store !== null && !SHOPIFY_STORES[body.target_store]) {
      return NextResponse.json({ error: `Unknown store "${body.target_store}"` }, { status: 400 })
    }
    if (["queued", "importing", "imported", "adapting", "ready_for_review", "ready_to_publish"].includes(opp.status)) {
      return NextResponse.json({ error: "Store can't change after the product is queued for import" }, { status: 409 })
    }
    patch.target_store = body.target_store
  }
  if (body.source_url) {
    const ok = (opp.evidence || []).some((e: { url: string }) => e.url === body.source_url)
    if (!ok) return NextResponse.json({ error: "Source URL must be one of this opportunity's tracked competitor products" }, { status: 400 })
    if (["queued", "importing", "imported", "adapting", "ready_for_review", "ready_to_publish"].includes(opp.status)) {
      return NextResponse.json({ error: "Source can't change after the product is queued for import" }, { status: 409 })
    }
    patch.source_url = body.source_url
  }
  if (body.adapt_checks) {
    if (!["adapting", "ready_for_review"].includes(opp.status)) {
      return NextResponse.json({ error: "Listing checks can only change while adapting" }, { status: 409 })
    }
    const allowed = new Set(ADAPT_CHECKS.map((c) => c.key))
    const merged = { ...(opp.adapt_checks || {}) }
    for (const [k, v] of Object.entries(body.adapt_checks)) if (allowed.has(k)) merged[k] = !!v
    patch.adapt_checks = merged
    // Unticking a check after "ready for review" sends it back to adapting.
    if (opp.status === "ready_for_review" && missingChecks(merged).length > 0) {
      patch.status = "adapting"
      await addHistory(db, id, "ready_for_review", "adapting", "A listing check was unticked.")
    }
  }
  if (Object.keys(patch).length > 0) {
    patch.updated_at = new Date().toISOString()
    const { error: upErr } = await db.from("opportunities").update(patch).eq("id", id)
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })
    if (typeof body.notes === "string") await addHistory(db, id, null, null, "Notes updated.")
    if (body.target_store !== undefined) await addHistory(db, id, null, null, `Store set to ${body.target_store || "none"}.`)
  }

  if (body.status && body.status !== opp.status) {
    const from = opp.status as OppStatus
    const to = body.status
    if (!canTransition(from, to)) {
      return NextResponse.json({ error: `Can't move from "${from}" to "${to}"` }, { status: 409 })
    }
    const store = (patch.target_store as string | undefined) ?? opp.target_store
    if (to === "approved" && !store) {
      return NextResponse.json({ error: "Choose the store before approving" }, { status: 400 })
    }
    if (to === "ready_for_review") {
      const checks = (patch.adapt_checks as Record<string, boolean>) || opp.adapt_checks || {}
      const missing = missingChecks(checks)
      if (missing.length) return NextResponse.json({ error: `Not ready. Still open: ${missing.join("; ")}` }, { status: 409 })
    }
    try {
      await setStatus(db, id, to, body.note || `Status: ${from} → ${to}.`, {}, [from])
    } catch (e: unknown) {
      return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 409 })
    }
  }

  const { data: fresh } = await db.from("opportunities").select("*").eq("id", id).single()
  return NextResponse.json({ opportunity: fresh, stores: TARGET_STORES.map((s) => s.name) })
}
