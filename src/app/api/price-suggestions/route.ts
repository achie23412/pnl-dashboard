import { NextRequest, NextResponse } from "next/server"
import { getServiceClient } from "@/lib/supabase"
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
}

const GOOGLE_STORES = ["Walsh & Farley", "Carter & Collins", "Susan & Allen"]

function generateSuggestions(products: CatalogProduct[], stores: StoreSummary[]): PriceSuggestion[] {
  const suggestions: PriceSuggestion[] = []
  const storeBeRoas = new Map(stores.map(s => [s.store, s.be_roas]))

  for (const p of products) {
    const price = parseFloat(p.retail_price?.replace(/[^0-9.]/g, "") || "0")
    if (!price || price <= 0) continue
    if (p.ad_spend < 25) continue

    const isGoogle = GOOGLE_STORES.includes(p.store)
    const txnRate = TRANSACTION_FEE_RATE[p.store] ?? 0.035
    const beRoas = p.be_roas ?? storeBeRoas.get(p.store) ?? null

    let productMargin: number | null = null
    if (p.cogs_usd !== null && price > 0) {
      productMargin = 1 - (p.cogs_usd / price) - txnRate
    }

    // Rule 1: BE-ROAS too high (price too low relative to COGS) — margin < 25%
    if (productMargin !== null && productMargin < 0.25 && p.cogs_usd !== null) {
      const targetMargin = 0.35
      const targetPrice = p.cogs_usd / (1 - targetMargin - txnRate)
      const changePct = ((targetPrice - price) / price) * 100
      if (changePct > 3) {
        suggestions.push({
          product_name: p.product_name,
          store: p.store,
          current_price: price,
          suggested_price: Math.ceil(targetPrice * 100) / 100,
          change_pct: Math.round(changePct * 10) / 10,
          rule: "Thin margin",
          rule_id: "thin_margin",
          reason: `Margin is ${(productMargin * 100).toFixed(0)}% (target 35%). COGS $${p.cogs_usd.toFixed(2)} + ${(txnRate * 100).toFixed(1)}% fees leave too little.`,
          priority: "high",
          metrics: { roas: p.roas, be_roas: beRoas, units_sold: p.units_sold, ad_spend: p.ad_spend, cogs_usd: p.cogs_usd, margin_pct: productMargin ? Math.round(productMargin * 1000) / 10 : null },
          cooldown_until: null,
        })
        continue
      }
    }

    // Rule 2: ROAS downtrend — SOP rule 9: ROAS 1.0–2.2 → raise price 10%
    if (isGoogle && p.roas >= 1.0 && p.roas <= 2.2 && p.ad_spend >= 25) {
      const newPrice = Math.ceil(price * 1.10 * 100) / 100
      suggestions.push({
        product_name: p.product_name,
        store: p.store,
        current_price: price,
        suggested_price: newPrice,
        change_pct: 10,
        rule: "ROAS downtrend",
        rule_id: "roas_downtrend",
        reason: `ROAS ${p.roas.toFixed(2)}x (between 1.0–2.2). Ascend Drafting SOP rule 9: raise price ≥10%, re-check after 7 days.`,
        priority: "high",
        metrics: { roas: p.roas, be_roas: beRoas, units_sold: p.units_sold, ad_spend: p.ad_spend, cogs_usd: p.cogs_usd, margin_pct: productMargin ? Math.round(productMargin * 1000) / 10 : null },
        cooldown_until: null,
      })
      continue
    }

    // Rule 3: BE-ROAS too low (overpriced) — ROAS > 5 but very few sales
    if (p.roas > 5 && p.units_sold <= 2 && p.ad_spend >= 25) {
      const newPrice = Math.ceil(price * 0.92 * 100) / 100
      suggestions.push({
        product_name: p.product_name,
        store: p.store,
        current_price: price,
        suggested_price: newPrice,
        change_pct: -8,
        rule: "Possibly overpriced",
        rule_id: "overpriced",
        reason: `High ROAS ${p.roas.toFixed(2)}x but only ${p.units_sold} sales. Price may be too high for conversion volume.`,
        priority: "low",
        metrics: { roas: p.roas, be_roas: beRoas, units_sold: p.units_sold, ad_spend: p.ad_spend, cogs_usd: p.cogs_usd, margin_pct: productMargin ? Math.round(productMargin * 1000) / 10 : null },
        cooldown_until: null,
      })
      continue
    }

    // Rule 4: Below break-even with spend — losing money
    if (beRoas !== null && p.roas < beRoas && p.roas > 0 && p.ad_spend >= 25) {
      const gap = ((beRoas - p.roas) / beRoas) * 100
      if (gap > 15) {
        const increase = Math.min(gap * 0.4, 15)
        const newPrice = Math.ceil(price * (1 + increase / 100) * 100) / 100
        suggestions.push({
          product_name: p.product_name,
          store: p.store,
          current_price: price,
          suggested_price: newPrice,
          change_pct: Math.round(increase * 10) / 10,
          rule: "Below break-even",
          rule_id: "below_be",
          reason: `ROAS ${p.roas.toFixed(2)}x vs ${beRoas.toFixed(2)}x break-even (${gap.toFixed(0)}% gap). Raise price to close the margin gap.`,
          priority: "normal",
          metrics: { roas: p.roas, be_roas: beRoas, units_sold: p.units_sold, ad_spend: p.ad_spend, cogs_usd: p.cogs_usd, margin_pct: productMargin ? Math.round(productMargin * 1000) / 10 : null },
          cooldown_until: null,
        })
        continue
      }
    }

    // Rule 5: COGS% too high (> 40% of price) — not sustainable
    if (p.cogs_usd !== null && price > 0 && (p.cogs_usd / price) > 0.40 && p.units_sold >= 1) {
      const cogsPct = (p.cogs_usd / price) * 100
      const targetPrice = p.cogs_usd / 0.30
      const changePct = ((targetPrice - price) / price) * 100
      if (changePct > 5) {
        suggestions.push({
          product_name: p.product_name,
          store: p.store,
          current_price: price,
          suggested_price: Math.ceil(targetPrice * 100) / 100,
          change_pct: Math.round(changePct * 10) / 10,
          rule: "COGS% too high",
          rule_id: "high_cogs",
          reason: `COGS is ${cogsPct.toFixed(0)}% of price ($${p.cogs_usd.toFixed(2)} / $${price.toFixed(2)}). Target: under 30%.`,
          priority: "normal",
          metrics: { roas: p.roas, be_roas: beRoas, units_sold: p.units_sold, ad_spend: p.ad_spend, cogs_usd: p.cogs_usd, margin_pct: productMargin ? Math.round(productMargin * 1000) / 10 : null },
          cooldown_until: null,
        })
      }
    }
  }

  const rank = { high: 0, normal: 1, low: 2 }
  return suggestions.sort((a, b) => rank[a.priority] - rank[b.priority])
}

export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin

  try {
    const catalogRes = await fetch(`${origin}/api/product-catalog?store=all`, {
      signal: AbortSignal.timeout(25000),
      headers: { cookie: req.headers.get("cookie") || "" },
    })
    if (!catalogRes.ok) {
      return NextResponse.json({ error: "Failed to fetch product catalog" }, { status: 502 })
    }
    const catalog = await catalogRes.json()
    const products: CatalogProduct[] = catalog.products || []
    const stores: StoreSummary[] = catalog.stores || []

    const suggestions = generateSuggestions(products, stores)

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
  const { product_name, store, old_price, new_price, change_pct, rule } = body

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

  // Log the change as pending
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

  return NextResponse.json({ success: true, change })
}
