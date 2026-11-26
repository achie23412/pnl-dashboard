import { NextRequest, NextResponse } from "next/server"
import { getServiceClient } from "@/lib/supabase"

export const maxDuration = 30
export const dynamic = "force-dynamic"

interface CpRow {
  id: number
  competitor_domain: string
  title: string
  handle: string
  url: string
  image: string | null
  product_type: string | null
  price: number | null
  currency: string | null
  bestseller_rank: number | null
}

interface OwnRow {
  id: number
  store: string
  title: string
  product_type: string | null
  handle: string | null
}

interface CoverageRow {
  id: number
  competitor_product_id: number
  own_product_id: number | null
  own_product_title: string | null
  status: string
  auto_matched: boolean
  verified: boolean
  verified_at: string | null
  notes: string | null
}

function normalizeTitle(t: string): string[] {
  return t
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w))
}

const STOP_WORDS = new Set([
  "the", "and", "for", "with", "from", "that", "this", "are", "was", "has",
  "not", "but", "all", "can", "had", "her", "his", "one", "our", "out",
  "new", "now", "old", "see", "way", "who", "did", "get", "let", "set",
  "women", "womens", "men", "mens", "size", "pack", "pcs", "pair",
])

function titleOverlap(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0
  const setB = new Set(b)
  const matches = a.filter((w) => setB.has(w)).length
  return matches / Math.min(a.length, b.length)
}

export async function GET(req: NextRequest) {
  const domain = req.nextUrl.searchParams.get("domain")
  const db = getServiceClient()

  if (domain) {
    const { data: products } = await db
      .from("competitor_products")
      .select("id, competitor_domain, title, handle, url, image, product_type, price, currency, bestseller_rank")
      .eq("competitor_domain", domain)
      .not("bestseller_rank", "is", null)
      .order("bestseller_rank", { ascending: true })
      .limit(50)

    if (!products || products.length === 0) {
      return NextResponse.json({ products: [], coverage: [] })
    }

    const ids = (products as CpRow[]).map((p) => p.id)
    const { data: coverage } = await db
      .from("product_coverage")
      .select("*")
      .in("competitor_product_id", ids)

    return NextResponse.json({
      products: products as CpRow[],
      coverage: (coverage as CoverageRow[]) || [],
    })
  }

  const { data: summary } = await db.rpc("coverage_summary")
  if (summary) {
    return NextResponse.json({ summary })
  }

  const { data: products } = await db
    .from("competitor_products")
    .select("id, competitor_domain, bestseller_rank")
    .not("bestseller_rank", "is", null)

  const { data: coverage } = await db
    .from("product_coverage")
    .select("competitor_product_id, status, verified")

  const covMap = new Map(
    ((coverage as CoverageRow[]) || []).map((c) => [c.competitor_product_id, c]),
  )

  const byDomain = new Map<string, { total: number; covered: number; partly: number }>()
  for (const p of (products as CpRow[]) || []) {
    const d = p.competitor_domain
    if (!byDomain.has(d)) byDomain.set(d, { total: 0, covered: 0, partly: 0 })
    const s = byDomain.get(d)!
    s.total++
    const cov = covMap.get(p.id)
    if (cov?.verified && cov.status === "covered") s.covered++
    else if (cov?.verified && cov.status === "partly_covered") s.partly++
  }

  const result: Record<string, { total: number; covered: number; partly: number }> = {}
  for (const [domain, stats] of Array.from(byDomain.entries())) {
    result[domain] = stats
  }
  return NextResponse.json({ summary: result })
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    action?: string
    domain?: string
    competitor_product_id?: number
    status?: string
    verified?: boolean
    own_product_title?: string
    notes?: string
  }

  const db = getServiceClient()

  if (body.action === "auto_match") {
    if (!body.domain) return NextResponse.json({ error: "domain required" }, { status: 400 })

    const { data: cpProducts } = await db
      .from("competitor_products")
      .select("id, title, product_type")
      .eq("competitor_domain", body.domain)
      .not("bestseller_rank", "is", null)
      .order("bestseller_rank", { ascending: true })
      .limit(50)

    const { data: ownProducts } = await db
      .from("own_products")
      .select("id, store, title, product_type, handle")

    if (!cpProducts || cpProducts.length === 0) {
      return NextResponse.json({ matched: 0, total: 0 })
    }

    const ownNorm = ((ownProducts as OwnRow[]) || []).map((o) => ({
      ...o,
      words: normalizeTitle(o.title),
    }))

    let matched = 0
    const upserts: Array<Record<string, unknown>> = []

    for (const cp of cpProducts as CpRow[]) {
      const cpWords = normalizeTitle(cp.title)
      let bestMatch: { id: number; title: string; score: number; type: string } | null = null

      for (const own of ownNorm) {
        const overlap = titleOverlap(cpWords, own.words)
        const typeMatch = cp.product_type && own.product_type &&
          cp.product_type.toLowerCase() === own.product_type.toLowerCase()

        const score = overlap + (typeMatch ? 0.2 : 0)
        if (score > (bestMatch?.score ?? 0)) {
          bestMatch = {
            id: own.id,
            title: own.title,
            score,
            type: score >= 0.5 ? "covered" : score >= 0.3 ? "partly_covered" : "not_covered",
          }
        }
      }

      if (bestMatch && bestMatch.type !== "not_covered") {
        matched++
        upserts.push({
          competitor_product_id: cp.id,
          own_product_id: bestMatch.id,
          own_product_title: bestMatch.title,
          status: bestMatch.type,
          auto_matched: true,
          verified: false,
        })
      } else {
        upserts.push({
          competitor_product_id: cp.id,
          own_product_id: null,
          own_product_title: null,
          status: "not_covered",
          auto_matched: true,
          verified: false,
        })
      }
    }

    if (upserts.length > 0) {
      await db
        .from("product_coverage")
        .upsert(upserts, { onConflict: "competitor_product_id" })
    }

    return NextResponse.json({ ok: true, matched, total: cpProducts.length })
  }

  if (body.action === "verify") {
    if (!body.competitor_product_id) {
      return NextResponse.json({ error: "competitor_product_id required" }, { status: 400 })
    }

    const update: Record<string, unknown> = {
      verified: body.verified ?? true,
      verified_at: body.verified ? new Date().toISOString() : null,
    }
    if (body.status) update.status = body.status
    if (body.own_product_title !== undefined) update.own_product_title = body.own_product_title
    if (body.notes !== undefined) update.notes = body.notes

    const { error } = await db
      .from("product_coverage")
      .update(update)
      .eq("competitor_product_id", body.competitor_product_id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (body.action === "set_status") {
    if (!body.competitor_product_id || !body.status) {
      return NextResponse.json({ error: "competitor_product_id and status required" }, { status: 400 })
    }

    const { error } = await db
      .from("product_coverage")
      .upsert(
        {
          competitor_product_id: body.competitor_product_id,
          status: body.status,
          own_product_title: body.own_product_title || null,
          verified: false,
          auto_matched: false,
        },
        { onConflict: "competitor_product_id" },
      )

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 })
}
