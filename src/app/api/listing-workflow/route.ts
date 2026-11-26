import { NextRequest, NextResponse } from "next/server"
import { getServiceClient } from "@/lib/supabase"
import {
  WORKFLOW_STORES, fetchSourceProduct, generateListing, createDraftInShopify, publishInShopify, adminUrl,
  type SourceProduct, type GeneratedListing,
} from "@/lib/listing-workflow"
import { checkListing, isReady } from "@/lib/gmc-check"
import { feedRoom, logFeedChange } from "@/lib/gmc-health"

export const maxDuration = 60
export const dynamic = "force-dynamic"

const PUBLISH_PER_DAY = 10 // Ascend Drafting SOP: publish 10 a day per store

type Job = {
  id: number
  store: string
  source_url: string
  status: string
  before: SourceProduct | null
  after: GeneratedListing | null
  price: number | null
  gmc: unknown
  error: string | null
  shopify_product_id: string | null
  shopify_admin_url: string | null
  published_at: string | null
  notes: string | null
}

const gmcFor = (before: SourceProduct, after: GeneratedListing, price: number | null) =>
  checkListing(
    { ...after, price, images: before.images, variants: before.variants },
    `${before.title} ${before.description} ${before.productType} ${before.tags.join(" ")}`,
  )

const amsterdamDayStart = () => {
  const d = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date())
  return new Date(`${d}T00:00:00+01:00`).toISOString()
}

export async function GET() {
  const db = getServiceClient()
  const { data, error } = await db.from("listing_jobs").select("*").order("created_at", { ascending: false }).limit(300)
  if (error) return NextResponse.json({ error: `listing_jobs: ${error.message}` }, { status: 500 })
  const since = amsterdamDayStart()
  const publishedToday: Record<string, number> = {}
  for (const s of WORKFLOW_STORES) publishedToday[s] = 0
  for (const j of data || []) if (j.published_at && j.published_at >= since) publishedToday[j.store] = (publishedToday[j.store] || 0) + 1
  return NextResponse.json({ jobs: data, publishedToday, limit: PUBLISH_PER_DAY })
}

// POST { url, store, notes? } → runs fetch + generate + GMC check for one product
export async function POST(req: NextRequest) {
  const { url, store, notes } = await req.json()
  if (!url || !WORKFLOW_STORES.includes(store)) return NextResponse.json({ error: "url and a Google store are required" }, { status: 400 })
  const db = getServiceClient()
  const { data: job, error } = await db
    .from("listing_jobs")
    .insert({ store, source_url: String(url).trim(), status: "working", notes: notes || null })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(await runGeneration(job as Job, true))
}

async function runGeneration(job: Job, fetchBefore: boolean, notes?: string) {
  const db = getServiceClient()
  try {
    const before = fetchBefore || !job.before ? await fetchSourceProduct(job.source_url) : job.before
    if (before !== job.before) {
      // Save "before" right away so it shows even if writing the listing fails
      await db.from("listing_jobs").update({ before, price: job.price ?? before.price }).eq("id", job.id)
    }
    const after = await generateListing(before, job.store, notes ?? job.notes ?? undefined)
    const price = job.price ?? before.price
    const gmc = gmcFor(before, after, price)
    const { data } = await db
      .from("listing_jobs")
      .update({ before, after, price, gmc, status: "review", error: null, updated_at: new Date().toISOString() })
      .eq("id", job.id)
      .select()
      .single()
    return data
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    const { data } = await db
      .from("listing_jobs")
      .update({ status: "error", error: message, updated_at: new Date().toISOString() })
      .eq("id", job.id)
      .select()
      .single()
    return data
  }
}

// PATCH { id, action, ... }
export async function PATCH(req: NextRequest) {
  const body = await req.json()
  const db = getServiceClient()
  const { data: job, error } = await db.from("listing_jobs").select("*").eq("id", body.id).single()
  if (error || !job) return NextResponse.json({ error: "Job not found" }, { status: 404 })
  const j = job as Job
  const now = new Date().toISOString()
  const update = async (fields: Record<string, unknown>) => {
    const { data, error: e } = await db.from("listing_jobs").update({ ...fields, updated_at: now }).eq("id", j.id).select().single()
    if (e) throw new Error(e.message)
    return data
  }

  try {
    switch (body.action) {
      case "save": {
        if (!j.before) throw new Error("Nothing to save yet")
        const after: GeneratedListing = body.after
        const price = body.price === null || body.price === "" ? null : Number(body.price)
        // Editing an approved listing sends it back to review
        return NextResponse.json(await update({ after, price, gmc: gmcFor(j.before, after, price), status: j.status === "approved" ? "review" : j.status }))
      }
      case "regenerate": {
        await update({ status: "working" })
        return NextResponse.json(await runGeneration(j, !j.before, body.notes))
      }
      case "retry":
        await update({ status: "working" })
        return NextResponse.json(await runGeneration(j, true))
      case "approve": {
        if (!j.before || !j.after) throw new Error("Nothing to approve yet")
        const gmc = gmcFor(j.before, j.after, j.price)
        if (!isReady(gmc)) throw new Error("Fix the critical GMC issues first")
        return NextResponse.json(await update({ status: "approved", gmc }))
      }
      case "reject":
        return NextResponse.json(await update({ status: "rejected" }))
      case "reopen":
        return NextResponse.json(await update({ status: "review" }))
      case "draft": {
        if (j.status !== "approved") throw new Error("Approve the listing first")
        if (!j.before || !j.after || !j.price) throw new Error("Listing or price missing")
        const created = await createDraftInShopify({ store: j.store, before: j.before, after: j.after, price: j.price })
        return NextResponse.json(await update({
          status: "in_shopify",
          shopify_product_id: created.id,
          shopify_admin_url: adminUrl(j.store, created.id),
          error: null,
        }))
      }
      case "publish": {
        if (j.status !== "in_shopify" || !j.shopify_product_id) throw new Error("Create the Shopify draft first")
        const since = amsterdamDayStart()
        const { count } = await db
          .from("listing_jobs")
          .select("id", { count: "exact", head: true })
          .eq("store", j.store)
          .gte("published_at", since)
        if ((count || 0) >= PUBLISH_PER_DAY) throw new Error(`Already ${count} published today for ${j.store}. Drafting SOP: publish 10 a day; the rest stays as draft until tomorrow.`)
        // Google stores: never change more than 10% of the feed per day (GMC Health counter)
        const pid = String(j.shopify_product_id).split("/").pop() || String(j.shopify_product_id)
        const room = await feedRoom(j.store, pid, "publish")
        if (!room.ok) throw new Error(room.error)
        const channels = await publishInShopify(j.store, j.shopify_product_id)
        await logFeedChange({ store: j.store, product_id: pid, kind: "publish", old_value: "draft", new_value: "active", reason: "Listing workflow: published" })
        return NextResponse.json(await update({ status: "published", published_at: now, error: null, notes: `Published to: ${channels.join(", ")}` }))
      }
      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 })
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    await db.from("listing_jobs").update({ error: message, updated_at: now }).eq("id", j.id)
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

export async function DELETE(req: NextRequest) {
  const id = new URL(req.url).searchParams.get("id")
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 })
  const db = getServiceClient()
  const { error } = await db.from("listing_jobs").delete().eq("id", id).neq("status", "published")
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
