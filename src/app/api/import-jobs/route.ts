import { NextRequest, NextResponse } from "next/server"
import { getServiceClient } from "@/lib/supabase"
import { addHistory, setStatus } from "@/lib/opportunity-db"
import { IMPORTABLE, type OppStatus } from "@/lib/opportunity-engine"
import { SHOPIFY_STORES } from "@/lib/constants"
import {
  importToShopify,
  handleFromUrl,
  productIdFromAdminUrl,
  type PriceRule,
  type SourceProduct,
} from "@/lib/shopify-import"

export const maxDuration = 60

// A job stuck in "importing" longer than this may be retried.
const STALE_IMPORTING_MS = 3 * 60 * 1000

type Db = ReturnType<typeof getServiceClient>

interface Job {
  id: number
  opportunity_id: number | null
  source_url: string
  store: string
  status: "queued" | "importing" | "imported" | "failed"
  method: "api" | "kopy"
  shopify_product_id: string | null
  admin_url: string | null
  error: string | null
  attempts: number
  updated_at: string
}

export async function GET() {
  const db = getServiceClient()
  const { data, error } = await db.from("import_jobs").select("*").order("updated_at", { ascending: false }).limit(300)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ jobs: data || [] })
}

function err(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status })
}

async function findJob(db: Db, store: string, sourceUrl: string): Promise<Job | null> {
  const { data } = await db.from("import_jobs").select("*").eq("store", store).eq("source_url", sourceUrl).maybeSingle()
  return (data as Job) || null
}

function snapshot(p: SourceProduct) {
  return {
    title: p.title,
    handle: p.handle,
    product_type: p.product_type || null,
    body_text: (p.body_html || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 4000),
    options: (p.options || []).map((o) => ({ name: o.name, values: o.values })),
    variant_count: (p.variants || []).length,
    image_count: (p.images || []).length,
    first_image: p.images?.[0]?.src || null,
  }
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as {
    action?: "queue" | "run" | "manual"
    opportunity_ids?: number[]
    job_id?: number
    opportunity_id?: number
    source_url?: string
    store?: string
    product?: SourceProduct
    price_rule?: PriceRule
    admin_url?: string
  } | null
  if (!body?.action) return err("action required")
  const db = getServiceClient()

  // ------------------------------------------------------------ queue
  // Approved opportunities -> one queued job each (store + source URL unique).
  if (body.action === "queue") {
    if (!body.opportunity_ids?.length) return err("opportunity_ids required")
    const { data: opps, error } = await db.from("opportunities").select("*").in("id", body.opportunity_ids)
    if (error) return err(error.message, 500)
    const results: { id: number; ok: boolean; job_id?: number; error?: string }[] = []
    for (const o of opps || []) {
      if (!["approved", "failed"].includes(o.status)) {
        results.push({ id: o.id, ok: false, error: `status is "${o.status}"; only approved products can be sent to the importer` })
        continue
      }
      if (!o.target_store || !SHOPIFY_STORES[o.target_store]) {
        results.push({ id: o.id, ok: false, error: "no valid store chosen" })
        continue
      }
      const sourceUrl: string | undefined = o.source_url || o.evidence?.[0]?.url
      if (!sourceUrl) {
        results.push({ id: o.id, ok: false, error: "no source URL" })
        continue
      }
      let job = await findJob(db, o.target_store, sourceUrl)
      if (job?.status === "imported") {
        // Already in the store: link instead of importing twice.
        await db.from("import_jobs").update({ opportunity_id: o.id }).eq("id", job.id)
        await setStatus(db, o.id, "imported", `Already imported earlier (job ${job.id}); linked.`, { last_import_job_id: job.id }, ["approved", "failed"])
        results.push({ id: o.id, ok: true, job_id: job.id })
        continue
      }
      if (job) {
        const { error: upErr } = await db.from("import_jobs").update({ status: "queued", opportunity_id: o.id, error: null, updated_at: new Date().toISOString() }).eq("id", job.id)
        if (upErr) {
          results.push({ id: o.id, ok: false, error: upErr.message })
          continue
        }
      } else {
        const { data: created, error: insErr } = await db
          .from("import_jobs")
          .insert({ opportunity_id: o.id, source_url: sourceUrl, store: o.target_store, status: "queued" })
          .select("*")
          .single()
        if (insErr) {
          results.push({ id: o.id, ok: false, error: insErr.message })
          continue
        }
        job = created as Job
      }
      await setStatus(db, o.id, "queued", `Queued for import into ${o.target_store} (job ${job!.id}).`, { last_import_job_id: job!.id, source_url: sourceUrl }, ["approved", "failed"])
      results.push({ id: o.id, ok: true, job_id: job!.id })
    }
    return NextResponse.json({ results })
  }

  // ------------------------------------------------------------ run (Kopy-style API import)
  if (body.action === "run") {
    if (!body.product) return err("product (the source product JSON) required")
    let job: Job | null = null
    if (body.job_id) {
      const { data } = await db.from("import_jobs").select("*").eq("id", body.job_id).single()
      job = (data as Job) || null
      if (!job) return err("Job not found", 404)
    } else {
      // Manual import from the importer page (you typed the URL yourself).
      if (!body.source_url || !body.store) return err("source_url and store required")
      if (!SHOPIFY_STORES[body.store]) return err(`Unknown store "${body.store}"`)
      job = await findJob(db, body.store, body.source_url)
      if (!job) {
        const { data, error } = await db.from("import_jobs").insert({ source_url: body.source_url, store: body.store, status: "queued" }).select("*").single()
        if (error) return err(error.code === "23505" ? "This product is already being imported into this store" : error.message, 409)
        job = data as Job
      }
    }
    if (job.status === "imported") return NextResponse.json({ job, already_imported: true })
    if (job.status === "importing" && Date.now() - new Date(job.updated_at).getTime() < STALE_IMPORTING_MS) {
      return err("Import already running for this product; wait a moment", 409)
    }
    // Only explicitly approved opportunities may be imported.
    if (job.opportunity_id) {
      const { data: opp } = await db.from("opportunities").select("id,status").eq("id", job.opportunity_id).single()
      if (!opp || !IMPORTABLE.includes(opp.status as OppStatus)) {
        return err(`Opportunity is "${opp?.status}"; approve it before importing`, 403)
      }
    }
    const expectHandle = handleFromUrl(job.source_url)
    if (!expectHandle || body.product.handle !== expectHandle) {
      return err(`Product data doesn't match the source URL (expected handle "${expectHandle}")`)
    }
    const rule: PriceRule = body.price_rule || { type: "keep" }

    // Claim the job (guards against double clicks).
    const claimed = await db
      .from("import_jobs")
      .update({ status: "importing", attempts: job.attempts + 1, method: "api", error: null, source_snapshot: snapshot(body.product), updated_at: new Date().toISOString() })
      .eq("id", job.id)
      .eq("updated_at", job.updated_at)
      .select("id")
    if (!claimed.data?.length) return err("Job changed meanwhile; refresh and try again", 409)
    if (job.opportunity_id) {
      await db.from("opportunities").update({ status: "importing", last_import_job_id: job.id, updated_at: new Date().toISOString() }).eq("id", job.opportunity_id)
      await addHistory(db, job.opportunity_id, null, "importing", `Import started (job ${job.id}, attempt ${job.attempts + 1}).`)
    }

    try {
      const tags = ["dashboard-import", ...(job.opportunity_id ? [`opportunity-${job.opportunity_id}`] : [])]
      const res = await importToShopify(job.store, body.product, rule, tags)
      const { data: done } = await db
        .from("import_jobs")
        .update({ status: "imported", shopify_product_id: res.productId, admin_url: res.adminUrl, error: null, updated_at: new Date().toISOString() })
        .eq("id", job.id)
        .select("*")
        .single()
      if (job.opportunity_id) {
        await db.from("opportunities").update({ status: "imported", updated_at: new Date().toISOString() }).eq("id", job.opportunity_id)
        await addHistory(db, job.opportunity_id, "importing", "imported", res.existed ? `Product already existed in ${job.store} (same handle); linked ${res.productId}, nothing duplicated.` : `Imported as DRAFT into ${job.store}: ${res.productId}.`)
      }
      return NextResponse.json({ job: done, existed: res.existed })
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e)
      await db.from("import_jobs").update({ status: "failed", error: message, updated_at: new Date().toISOString() }).eq("id", job.id)
      if (job.opportunity_id) {
        await db.from("opportunities").update({ status: "failed", updated_at: new Date().toISOString() }).eq("id", job.opportunity_id)
        await addHistory(db, job.opportunity_id, "importing", "failed", `Import failed: ${message}`)
      }
      return err(message, 502)
    }
  }

  // ------------------------------------------------------------ manual (imported in the Kopy app)
  if (body.action === "manual") {
    if (!body.admin_url) return err("admin_url (the product's Shopify admin link) required")
    const productId = productIdFromAdminUrl(body.admin_url)
    if (!productId) return err("That doesn't look like a Shopify product admin link (…/products/<id>)")
    let job: Job | null = null
    if (body.job_id) {
      const { data } = await db.from("import_jobs").select("*").eq("id", body.job_id).single()
      job = (data as Job) || null
    }
    if (!job) return err("Job not found; queue the product first", 404)
    if (job.opportunity_id) {
      const { data: opp } = await db.from("opportunities").select("status").eq("id", job.opportunity_id).single()
      if (!opp || !["queued", "failed", "importing", "approved"].includes(opp.status)) {
        return err(`Opportunity is "${opp?.status}"; only approved/queued products can be marked imported`, 403)
      }
    }
    const { data: done, error } = await db
      .from("import_jobs")
      .update({ status: "imported", method: "kopy", shopify_product_id: productId, admin_url: body.admin_url, error: null, updated_at: new Date().toISOString() })
      .eq("id", job.id)
      .select("*")
      .single()
    if (error) return err(error.message, 500)
    if (job.opportunity_id) {
      await db.from("opportunities").update({ status: "imported", last_import_job_id: job.id, updated_at: new Date().toISOString() }).eq("id", job.opportunity_id)
      await addHistory(db, job.opportunity_id, null, "imported", `Marked imported via Kopy: product ${productId}. Check it is a DRAFT in Shopify.`)
    }
    return NextResponse.json({ job: done })
  }

  return err("Unknown action")
}
