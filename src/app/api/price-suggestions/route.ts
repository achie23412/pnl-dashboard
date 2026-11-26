import { unstable_cache } from "next/cache"
import { NextRequest, NextResponse } from "next/server"
import { getServiceClient } from "@/lib/supabase"
import { SESSION_COOKIE } from "@/lib/session"
import { TRANSACTION_FEE_RATE } from "@/lib/constants"

export const maxDuration = 30

interface CatalogProduct {
  product_name: string
  store: string
  cogs_usd: number | null
  retail_price: string
  cog_pct: string
  category: string
  units_sold: number
  sales_revenue: number
  cogs_source: string
  ad_spend: number
  roas: number
  be_roas: number | null
}

interface StoreSummary {
  store: string
  revenue: number
  ad_spend: number
  roas: number | null
  be_roas: number | null
}

export interface LadderStepDetail {
  step: number
  price: number
  change_pct: number
  cogs_pct: number | null
  estimated_date: string
}

export interface PriceSuggestion {
  product_name: string
  store: string
  current_price: number
  suggested_price: number
  change_pct: number
  rule: string
  rule_id: string
  reason: string
  priority: "high" | "normal" | "low"
  metrics: {
    roas: number
    be_roas: number | null
    units_sold: number
    ad_spend: number
    cogs_usd: number | null
    margin_pct: number | null
  }
  cooldown_until: string | null
  target_price: number | null
  steps_info: string
  all_steps: LadderStepDetail[]
}

const GOOGLE_STORES = ["Walsh & Farley", "Carter & Collins", "Susan & Allen"]
const MIN_SPEND_GOOGLE = 5

// "104,95" / "1.234,56" / "$104.95" / "1,234.56" -> number. The launch sheets use a decimal comma,
// which the old parser turned into 10495.
function parseMoney(raw: string | undefined | null): number {
  if (!raw) return 0
  let t = raw.replace(/[^0-9.,]/g, "")
  if (t.includes(",") && t.includes(".")) {
    t = t.lastIndexOf(",") > t.lastIndexOf(".") ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, "")
  } else if (t.includes(",")) {
    t = /,\d{1,2}$/.test(t) ? t.replace(",", ".") : t.replace(/,/g, "")
  }
  const n = parseFloat(t)
  return Number.isFinite(n) ? n : 0
}

// Prefer what customers actually paid (average sold price); the launch-sheet price can be outdated.
function resolvePrice(p: CatalogProduct): number {
  if (p.sales_revenue > 0 && p.units_sold > 0) return Math.round((p.sales_revenue / p.units_sold) * 100) / 100
  return parseMoney(p.retail_price)
}

// --- Ladder stepping: cap price increases to small steps (like Price Ladder) ---
const MAX_STEP_PCT = 10
const MIN_STEP_PCT = 3

function ladderStep(
  currentPrice: number,
  targetPrice: number,
): { price: number; pct: number; stepsInfo: string; targetFull: number } | null {
  if (targetPrice <= currentPrice) return null

  const totalPct = ((targetPrice - currentPrice) / currentPrice) * 100

  if (totalPct <= MAX_STEP_PCT) {
    return { price: Math.ceil(targetPrice * 100) / 100, pct: Math.round(totalPct * 10) / 10, stepsInfo: "", targetFull: targetPrice }
  }

  const stepPrice = Math.min(
    Math.ceil(currentPrice * (1 + MAX_STEP_PCT / 100) * 100) / 100,
    Math.ceil(targetPrice * 100) / 100,
  )
  const stepPct = Math.round(((stepPrice - currentPrice) / currentPrice) * 1000) / 10
  if (stepPct < MIN_STEP_PCT) return null

  const totalSteps = Math.ceil(totalPct / MAX_STEP_PCT)
  return { price: stepPrice, pct: stepPct, stepsInfo: `Step 1 of ~${totalSteps}`, targetFull: targetPrice }
}

function generateAllSteps(
  currentPrice: number,
  targetPrice: number,
  cogsUsd: number | null,
): LadderStepDetail[] {
  if (targetPrice <= currentPrice) return []
  const steps: LadderStepDetail[] = []
  let price = currentPrice
  let stepNum = 1
  const now = new Date()

  while (price < targetPrice - 0.01) {
    const nextPrice = Math.min(
      Math.ceil(price * (1 + MAX_STEP_PCT / 100) * 100) / 100,
      Math.ceil(targetPrice * 100) / 100,
    )
    const pct = Math.round(((nextPrice - price) / price) * 1000) / 10
    if (pct < MIN_STEP_PCT && nextPrice < targetPrice - 0.01) break

    const date = new Date(now.getTime() + (stepNum - 1) * 7 * 86400000)
    steps.push({
      step: stepNum,
      price: nextPrice,
      change_pct: pct,
      cogs_pct: cogsUsd && nextPrice > 0 ? Math.round((cogsUsd / nextPrice) * 1000) / 10 : null,
      estimated_date: date.toISOString().split("T")[0],
    })

    price = nextPrice
    stepNum++
  }
  return steps
}

function generateSuggestions(products: CatalogProduct[], stores: StoreSummary[]): PriceSuggestion[] {
  const suggestions: PriceSuggestion[] = []
  const storeBeRoas = new Map(stores.map(s => [s.store, s.be_roas]))

  for (const p of products) {
    const price = resolvePrice(p)
    if (!price || price <= 0) continue
    if (p.units_sold < 1) continue

    const isGoogle = GOOGLE_STORES.includes(p.store)
    const hasSpend = p.ad_spend != null && p.ad_spend > 0
    const hasRoas = p.roas != null && p.roas > 0
    const txnRate = TRANSACTION_FEE_RATE[p.store] ?? 0.035
    const beRoas = p.be_roas ?? storeBeRoas.get(p.store) ?? null
    const roas = p.roas ?? 0
    const spend = p.ad_spend ?? 0

    let productMargin: number | null = null
    if (p.cogs_usd !== null && p.cogs_usd > 0 && price > 0) {
      productMargin = 1 - (p.cogs_usd / price) - txnRate
    }

    const metrics = { roas, be_roas: beRoas, units_sold: p.units_sold, ad_spend: spend, cogs_usd: p.cogs_usd, margin_pct: productMargin != null ? Math.round(productMargin * 1000) / 10 : null }

    // Rule 1: Thin margin (margin < 25%) — applies to ALL stores with COGS data
    if (productMargin !== null && productMargin < 0.25 && p.cogs_usd !== null && p.cogs_usd > 0) {
      const targetMargin = 0.35
      const targetPrice = p.cogs_usd / (1 - targetMargin - txnRate)
      const step = ladderStep(price, targetPrice)
      if (step) {
        const allSteps = step.stepsInfo ? generateAllSteps(price, targetPrice, p.cogs_usd) : []
        suggestions.push({
          product_name: p.product_name, store: p.store, current_price: price,
          suggested_price: step.price,
          change_pct: step.pct,
          rule: "Thin margin", rule_id: "thin_margin",
          reason: `Margin is ${(productMargin * 100).toFixed(0)}% (target 35%).${step.stepsInfo ? ` ${step.stepsInfo} toward target.` : ""} COGS $${p.cogs_usd.toFixed(2)} + ${(txnRate * 100).toFixed(1)}% fees leave too little.`,
          priority: "high", metrics, cooldown_until: null,
          target_price: step.stepsInfo ? Math.ceil(targetPrice * 100) / 100 : null,
          steps_info: step.stepsInfo,
          all_steps: allSteps,
        })
        continue
      }
    }

    // Rule 2: ROAS downtrend — SOP rule 9: ROAS 1.0–2.2 → raise price 10% (Google only)
    if (isGoogle && hasRoas && roas >= 1.0 && roas <= 2.2 && spend >= MIN_SPEND_GOOGLE) {
      const newPrice = Math.ceil(price * 1.10 * 100) / 100
      suggestions.push({
        product_name: p.product_name, store: p.store, current_price: price,
        suggested_price: newPrice, change_pct: 10,
        rule: "ROAS downtrend", rule_id: "roas_downtrend",
        reason: `ROAS ${roas.toFixed(2)}x (between 1.0–2.2). Ascend Drafting SOP rule 9: raise price ≥10%, re-check after 7 days.`,
        priority: "high", metrics, cooldown_until: null,
        target_price: null, steps_info: "", all_steps: [],
      })
      continue
    }

    // Rule 3: Possibly overpriced — ROAS > 5 but very few sales (Google only)
    if (isGoogle && hasRoas && roas > 5 && p.units_sold <= 2 && spend >= MIN_SPEND_GOOGLE) {
      const newPrice = Math.ceil(price * 0.92 * 100) / 100
      suggestions.push({
        product_name: p.product_name, store: p.store, current_price: price,
        suggested_price: newPrice, change_pct: -8,
        rule: "Possibly overpriced", rule_id: "overpriced",
        reason: `High ROAS ${roas.toFixed(2)}x but only ${p.units_sold} sales. Price may be too high for conversion volume.`,
        priority: "low", metrics, cooldown_until: null,
        target_price: null, steps_info: "", all_steps: [],
      })
      continue
    }

    // Rule 4: Below break-even with spend — losing money
    if (beRoas !== null && hasRoas && roas < beRoas && roas > 0 && spend >= MIN_SPEND_GOOGLE) {
      const gap = ((beRoas - roas) / beRoas) * 100
      if (gap > 15) {
        const increase = Math.min(gap * 0.4, MAX_STEP_PCT)
        const newPrice = Math.ceil(price * (1 + increase / 100) * 100) / 100
        suggestions.push({
          product_name: p.product_name, store: p.store, current_price: price,
          suggested_price: newPrice, change_pct: Math.round(increase * 10) / 10,
          rule: "Below break-even", rule_id: "below_be",
          reason: `ROAS ${roas.toFixed(2)}x vs ${beRoas.toFixed(2)}x break-even (${gap.toFixed(0)}% gap). Raise price to close the margin gap.`,
          priority: "normal", metrics, cooldown_until: null,
          target_price: null, steps_info: "", all_steps: [],
        })
        continue
      }
    }

    // Rule 5: COGS% too high (> 40% of price) — applies to ALL stores with COGS data
    if (p.cogs_usd !== null && p.cogs_usd > 0 && price > 0 && (p.cogs_usd / price) > 0.40) {
      const cogsPct = (p.cogs_usd / price) * 100
      const targetPrice = p.cogs_usd / 0.30
      const step = ladderStep(price, targetPrice)
      if (step) {
        const allSteps = step.stepsInfo ? generateAllSteps(price, targetPrice, p.cogs_usd) : []
        suggestions.push({
          product_name: p.product_name, store: p.store, current_price: price,
          suggested_price: step.price,
          change_pct: step.pct,
          rule: "COGS% too high", rule_id: "high_cogs",
          reason: `COGS is ${cogsPct.toFixed(0)}% of price ($${p.cogs_usd.toFixed(2)} / $${price.toFixed(2)}).${step.stepsInfo ? ` ${step.stepsInfo} toward target 30%.` : " Target: under 30%."}`,
          priority: "normal", metrics, cooldown_until: null,
          target_price: step.stepsInfo ? Math.ceil(targetPrice * 100) / 100 : null,
          steps_info: step.stepsInfo,
          all_steps: allSteps,
        })
      }
    }
  }

  const rank = { high: 0, normal: 1, low: 2 }
  return suggestions.sort((a, b) => rank[a.priority] - rank[b.priority])
}

// The catalog behind this (Shopify orders, Windsor spend, ShipGoods, quote sheet) takes ~8 s and
// only changes with the daily data, so the suggestions are saved for 30 minutes. The cookie is part
// of the key because the catalog route needs the logged-in session.
const cachedSuggestions = unstable_cache(
  async (origin: string, cookie: string) => {
    const catalogRes = await fetch(`${origin}/api/product-catalog?store=all`, {
      signal: AbortSignal.timeout(25000),
      headers: { cookie },
      cache: "no-store",
    })
    if (!catalogRes.ok) throw new Error("Failed to fetch product catalog")
    const catalog = await catalogRes.json()
    const products: CatalogProduct[] = catalog.products || []
    const stores: StoreSummary[] = catalog.stores || []
    return { suggestions: generateSuggestions(products, stores), period: catalog.period }
  },
  ["price-suggestions-v1"],
  { revalidate: 1800 },
)

export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin

  try {
    // Only the session cookie, so other cookies don't split the cache
    const session = req.cookies.get(SESSION_COOKIE)?.value
    const base = await cachedSuggestions(origin, session ? `${SESSION_COOKIE}=${session}` : "")
    const suggestions: PriceSuggestion[] = base.suggestions.map((s) => ({ ...s }))
    const catalog = { period: base.period }

    // Fetch recent price changes to add cooldown info
    const sb = getServiceClient()
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString()
    const { data: recentChanges } = await sb
      .from("price_changes")
      .select("product_name, store, created_at")
      .gte("created_at", sevenDaysAgo)
      .eq("status", "applied")

    if (recentChanges) {
      const changeMap = new Map<string, string>()
      for (const c of recentChanges) {
        const key = `${c.product_name}::${c.store}`
        changeMap.set(key, c.created_at)
      }
      for (const s of suggestions) {
        const key = `${s.product_name}::${s.store}`
        const lastChange = changeMap.get(key)
        if (lastChange) {
          const cooldownEnd = new Date(new Date(lastChange).getTime() + 7 * 86400000)
          s.cooldown_until = cooldownEnd.toISOString()
        }
      }
    }

    const increases = suggestions.filter(s => s.change_pct > 0).length
    const decreases = suggestions.filter(s => s.change_pct < 0).length
    const avgImpact = suggestions.length > 0
      ? suggestions.reduce((a, s) => a + s.change_pct, 0) / suggestions.length
      : 0

    return NextResponse.json({
      suggestions,
      summary: {
        total: suggestions.length,
        increases,
        decreases,
        avg_change_pct: Math.round(avgImpact * 10) / 10,
        high_priority: suggestions.filter(s => s.priority === "high").length,
      },
      period: catalog.period,
      generated_at: new Date().toISOString(),
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { product_name, store, old_price, new_price, change_pct, rule, target_price, all_steps } = body

  if (!product_name || !store || !old_price || !new_price) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
  }

  const sb = getServiceClient()

  // Check cooldown
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString()
  const { data: recent } = await sb
    .from("price_changes")
    .select("created_at")
    .eq("product_name", product_name)
    .eq("store", store)
    .eq("status", "applied")
    .gte("created_at", sevenDaysAgo)
    .limit(1)

  if (recent && recent.length > 0) {
    const cooldownEnd = new Date(new Date(recent[0].created_at).getTime() + 7 * 86400000)
    return NextResponse.json({
      error: `Price was changed on ${new Date(recent[0].created_at).toLocaleDateString()}. Cooldown until ${cooldownEnd.toLocaleDateString()}.`,
      cooldown_until: cooldownEnd.toISOString(),
    }, { status: 429 })
  }

  // Log the first step
  const { data: change, error: insertErr } = await sb
    .from("price_changes")
    .insert({
      product_name,
      store,
      old_price,
      new_price,
      change_pct,
      rule: rule || "manual",
      status: "applied",
      applied_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (insertErr) {
    if (insertErr.message?.includes("relation") && insertErr.message?.includes("does not exist")) {
      return NextResponse.json({ error: "Price changes table not set up yet. Run the migration in Supabase SQL editor.", setup_needed: true }, { status: 500 })
    }
    return NextResponse.json({ error: insertErr.message }, { status: 500 })
  }

  // Multi-step: create a price_ladder entry for auto-advance
  let ladder_id: number | null = null
  if (Array.isArray(all_steps) && all_steps.length > 1 && target_price) {
    const steps = [old_price, ...all_steps.map((s: { price: number }) => s.price)]
    try {
      // Cancel any existing active ladder for the same product
      await sb.from("price_ladders")
        .update({ status: "cancelled", updated_at: new Date().toISOString() })
        .eq("store", store).eq("product_name", product_name).eq("status", "active")

      const { data: ladderRow } = await sb.from("price_ladders").insert({
        store, product_name, start_price: old_price, target_price,
        steps, current_step: 1, max_drop_pct: 15, status: "active",
      }).select("id").single()
      ladder_id = ladderRow?.id ?? null

      if (ladder_id) {
        await sb.from("price_ladder_log").insert({
          ladder_id, step_from: 0, step_to: 1,
          old_price, new_price, orders_day_before: null,
        })
      }
    } catch { /* price_ladders table may not exist yet */ }
  }

  return NextResponse.json({
    success: true, change,
    ladder_id,
    message: ladder_id
      ? `Step 1 applied. ${all_steps.length - 1} more steps will auto-advance every 7 days.`
      : "Logged. Shopify push coming when tokens are set up.",
  })
}
