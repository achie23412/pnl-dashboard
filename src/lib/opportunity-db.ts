// Server-side helpers for the Product Opportunities workflow (service key).
import { getServiceClient } from "@/lib/supabase"
import { HARDCODED_EVENTS } from "@/lib/calendar-hardcoded"
import {
  buildOpportunities,
  findExisting,
  shouldResurface,
  type CompetitorProduct,
  type OwnProduct,
  type EventLite,
  type OppStatus,
} from "@/lib/opportunity-engine"

export type Db = ReturnType<typeof getServiceClient>

// Competitor products considered "current" for recommendations.
export const ACTIVE_WINDOW_DAYS = 45

export async function selectAll<T>(db: Db, table: string, columns: string, apply?: (q: any) => any): Promise<T[]> {
  const out: T[] = []
  const PAGE = 1000
  for (let offset = 0; offset < 100000; offset += PAGE) {
    let q = db.from(table).select(columns).range(offset, offset + PAGE - 1)
    if (apply) q = apply(q)
    const { data, error } = await q
    if (error) throw new Error(`${table}: ${error.message}`)
    const rows = (data || []) as T[]
    out.push(...rows)
    if (rows.length < PAGE) break
  }
  return out
}

export async function loadEvents(db: Db): Promise<EventLite[]> {
  const events: EventLite[] = HARDCODED_EVENTS.map((e) => ({ date: e.date, label: e.label, type: e.type, store: e.store || null, note: e.note || null }))
  const { data } = await db.from("calendar_events").select("date,label,type,store,note")
  for (const e of (data || []) as EventLite[]) events.push(e)
  return events
}

export interface OppRow {
  id: number
  cluster_key: string
  status: OppStatus
  evidence: { key: string }[]
  competitor_count: number
  competitor_count_at_decision: number | null
  target_store: string | null
}

export async function addHistory(db: Db, opportunityId: number, from: string | null, to: string | null, note: string) {
  await db.from("opportunity_history").insert({ opportunity_id: opportunityId, from_status: from, to_status: to, note })
}

// Set status with history. `expectFrom` guards against stale updates.
export async function setStatus(db: Db, id: number, to: OppStatus, note: string, extra: Record<string, unknown> = {}, expectFrom?: OppStatus[]) {
  const { data: row, error } = await db.from("opportunities").select("id,status,competitor_count").eq("id", id).single()
  if (error || !row) throw new Error(`Opportunity ${id} not found`)
  if (expectFrom && !expectFrom.includes(row.status)) {
    throw new Error(`Opportunity ${id} is "${row.status}", expected ${expectFrom.join(" / ")}`)
  }
  const patch: Record<string, unknown> = { status: to, updated_at: new Date().toISOString(), ...extra }
  if (to === "rejected" || to === "approved" || to === "saved") patch.competitor_count_at_decision = row.competitor_count
  let q = db.from("opportunities").update(patch).eq("id", id)
  if (expectFrom) q = q.in("status", expectFrom)
  const { error: upErr } = await q
  if (upErr) throw new Error(upErr.message)
  await addHistory(db, id, row.status, to, note)
}

// Rebuild opportunities from the latest scan. Existing rows keep their status,
// notes and store choice; only evidence, scores and timing are refreshed.
export async function recomputeOpportunities(db: Db): Promise<{ created: number; updated: number; resurfaced: number; total: number }> {
  const since = new Date(Date.now() - ACTIVE_WINDOW_DAYS * 86400000).toISOString().slice(0, 10)
  const [products, own, events, existing] = await Promise.all([
    selectAll<CompetitorProduct>(db, "competitor_products", "*", (q) => q.gte("last_seen", since)),
    selectAll<OwnProduct>(db, "own_products", "store,shopify_product_id,title,product_type"),
    loadEvents(db),
    selectAll<OppRow>(db, "opportunities", "id,cluster_key,status,evidence,competitor_count,competitor_count_at_decision,target_store"),
  ])
  const drafts = buildOpportunities({ products, own, events })
  let resurfaced = 0
  const claimed = new Set<number>()
  const usedKeys = new Set(existing.map((e) => e.cluster_key))
  const now = new Date().toISOString()
  const updates: { id: number; patch: Record<string, unknown> }[] = []
  const inserts: Record<string, unknown>[] = []
  const history: { opportunity_id: number; from_status: string | null; to_status: string | null; note: string }[] = []

  for (const d of drafts) {
    const match = findExisting(d, existing.filter((e) => !claimed.has(e.id)))
    const fields = {
      title: d.title,
      category: d.category,
      gender: d.gender,
      image: d.image,
      evidence: d.evidence,
      competitor_count: d.competitor_count,
      observations: d.observations,
      inferences: d.inferences,
      data_gaps: d.data_gaps,
      season: d.season,
      event_label: d.event_label,
      event_date: d.event_date,
      launch_by: d.launch_by,
      timing_source: d.timing_source,
      timing_note: d.timing_note,
      markets: d.markets,
      catalogue_match: d.catalogue_match,
      evidence_score: d.evidence_score,
      commercial_score: d.commercial_score,
      priority: d.priority,
      priority_reason: d.priority_reason,
      first_observed: d.first_observed,
      last_observed: d.last_observed,
      updated_at: now,
    }
    if (match) {
      claimed.add(match.id)
      const patch: Record<string, unknown> = { ...fields }
      if (!match.target_store && d.target_store) patch.target_store = d.target_store
      // Rejected items stay hidden unless at least 2 more competitors now list it.
      if (match.status === "rejected" && shouldResurface(match.competitor_count_at_decision, d.competitor_count)) {
        patch.status = "new"
        resurfaced++
        history.push({ opportunity_id: match.id, from_status: "rejected", to_status: "new", note: `Resurfaced: now ${d.competitor_count} competitors (was ${match.competitor_count_at_decision} when rejected).` })
      }
      updates.push({ id: match.id, patch })
    } else {
      // Two drafts can produce the same key; make it unique rather than overwrite.
      let key = d.cluster_key
      for (let n = 2; usedKeys.has(key); n++) key = `${d.cluster_key}#${n}`
      usedKeys.add(key)
      inserts.push({ ...fields, cluster_key: key, target_store: d.target_store, status: "new", created_at: now })
    }
  }

  // Updates: parallel in small chunks.
  for (let i = 0; i < updates.length; i += 20) {
    const chunk = updates.slice(i, i + 20)
    const results = await Promise.all(chunk.map((u) => db.from("opportunities").update(u.patch).eq("id", u.id)))
    const failed = results.find((r) => r.error)
    if (failed?.error) throw new Error(failed.error.message)
  }
  // Inserts: batched, then one history row each.
  for (let i = 0; i < inserts.length; i += 200) {
    const { data, error } = await db.from("opportunities").insert(inserts.slice(i, i + 200)).select("id")
    if (error) throw new Error(error.message)
    for (const r of (data || []) as { id: number }[]) {
      history.push({ opportunity_id: r.id, from_status: null, to_status: "new", note: "Created from competitor scan." })
    }
  }
  for (let i = 0; i < history.length; i += 500) {
    await db.from("opportunity_history").insert(history.slice(i, i + 500))
  }
  return { created: inserts.length, updated: updates.length, resurfaced, total: drafts.length }
}
