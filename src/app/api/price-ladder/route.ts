import { NextRequest, NextResponse } from "next/server"
import { getServiceClient } from "@/lib/supabase"
import { SESSION_COOKIE } from "@/lib/session"
import { AVG_COGS_PER_ORDER } from "@/lib/constants"

export const maxDuration = 30

/*
  Supabase migration — run once in SQL editor:

  CREATE TABLE price_ladders (
    id bigint generated always as identity primary key,
    store text not null,
    product_name text not null,
    start_price numeric not null,
    target_price numeric not null,
    steps jsonb not null,
    current_step int not null default 0,
    max_drop_pct numeric not null default 15,
    status text not null default 'active',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    completed_at timestamptz
  );

  CREATE TABLE price_ladder_log (
    id bigint generated always as identity primary key,
    ladder_id bigint not null references price_ladders(id),
    step_from int not null,
    step_to int not null,
    old_price numeric not null,
    new_price numeric not null,
    orders_day_before numeric,
    changed_at timestamptz not null default now()
  );

  ALTER TABLE price_ladders ENABLE ROW LEVEL SECURITY;
  ALTER TABLE price_ladder_log ENABLE ROW LEVEL SECURITY;
  GRANT ALL ON price_ladders TO service_role;
  GRANT ALL ON price_ladders TO postgres;
  GRANT ALL ON price_ladder_log TO service_role;
  GRANT ALL ON price_ladder_log TO postgres;
*/

// Generate .95-ending ladder steps between start and target.
// E.g. 79.95 → 89.95 produces [79.95, 82.95, 84.95, 86.95, 89.95].
function generateSteps(start: number, target: number): number[] {
  if (target <= start + 2) return [start, target]

  const steps = [start]
  const floorStart = Math.ceil(start)
  const floorTarget = Math.floor(target)

  const candidates: number[] = []
  for (let n = floorStart; n <= floorTarget; n++) {
    const p = n + 0.95
    if (p > start + 1 && p < target - 1) candidates.push(p)
  }

  if (candidates.length <= 4) {
    for (const c of candidates) steps.push(c)
  } else {
    const skip = Math.ceil(candidates.length / 4)
    for (let i = skip - 1; i < candidates.length; i += skip) {
      steps.push(candidates[i])
    }
  }

  steps.push(target)
  return Array.from(new Set(steps)).sort((a, b) => a - b)
}

interface CatalogProduct {
  product_name: string
  store: string
  units_sold: number
  ad_spend: number
  cogs_usd: number | null
  retail_price: string
  roas: number
  sales_revenue: number
}

async function fetchCatalog(
  origin: string,
  cookie: string,
): Promise<{ products: CatalogProduct[]; period_days: number }> {
  try {
    const res = await fetch(`${origin}/api/product-catalog?store=all`, {
      signal: AbortSignal.timeout(25000),
      headers: { cookie },
      cache: "no-store",
    })
    if (!res.ok) return { products: [], period_days: 30 }
    const data = await res.json()
    return { products: data.products || [], period_days: data.period?.days || 30 }
  } catch {
    return { products: [], period_days: 30 }
  }
}

function cogsPct(store: string, price: number, actualCogs: number | null): number | null {
  const cogs = actualCogs ?? AVG_COGS_PER_ORDER[store]
  if (!cogs || price <= 0) return null
  return Math.round((cogs / price) * 1000) / 10
}

// ---------------------------------------------------------------------------
// GET — list ladders with enriched metrics
// ---------------------------------------------------------------------------
export async function GET(req: NextRequest) {
  const sb = getServiceClient()

  try {
    const { data: ladders, error: ladErr } = await sb
      .from("price_ladders")
      .select("*")
      .order("created_at", { ascending: false })

    if (ladErr) {
      if (ladErr.message?.includes("does not exist"))
        return NextResponse.json({ ladders: [], setup_needed: true })
      throw ladErr
    }

    const ids = (ladders || []).map((l: Record<string, unknown>) => l.id)
    let logs: Record<string, unknown>[] = []
    if (ids.length > 0) {
      const { data } = await sb
        .from("price_ladder_log")
        .select("*")
        .in("ladder_id", ids)
        .order("changed_at", { ascending: false })
      logs = data || []
    }

    const origin = req.nextUrl.origin
    const session = req.cookies.get(SESSION_COOKIE)?.value
    const catalog = await fetchCatalog(origin, session ? `${SESSION_COOKIE}=${session}` : "")
    const pmap = new Map<string, CatalogProduct>()
    for (const p of catalog.products) pmap.set(`${p.product_name}::${p.store}`, p)

    const enriched = (ladders || []).map((ladder: Record<string, unknown>) => {
      const steps: number[] = (ladder.steps as number[]) || []
      const currentStep = (ladder.current_step as number) || 0
      const currentPrice = steps[currentStep] ?? (ladder.start_price as number)
      const nextPrice = steps[currentStep + 1] ?? null
      const isLast = currentStep >= steps.length - 1

      const product = pmap.get(`${ladder.product_name}::${ladder.store}`)
      const ordersDay =
        product && product.units_sold > 0
          ? Math.round((product.units_sold / catalog.period_days) * 100) / 100
          : null
      const cogs = product?.cogs_usd ?? null

      const lastLog = logs.find((l: Record<string, unknown>) => l.ladder_id === ladder.id)
      const lastStepOrdersDay = (lastLog?.orders_day_before as number) ?? null
      const lastStepDate = (lastLog?.changed_at as string) ?? null

      let ordersDrop: number | null = null
      if (ordersDay !== null && lastStepOrdersDay !== null && lastStepOrdersDay > 0) {
        ordersDrop = Math.round(((ordersDay - lastStepOrdersDay) / lastStepOrdersDay) * 1000) / 10
      }

      const maxDrop = (ladder.max_drop_pct as number) || 15
      let canAdvance = false
      let advanceReason = ""

      if (ladder.status !== "active") {
        advanceReason = `Ladder is ${ladder.status}`
      } else if (isLast) {
        advanceReason = "Already at target price"
      } else if (currentStep === 0) {
        canAdvance = true
        advanceReason = "First step — ready to advance"
      } else if (ordersDrop !== null && ordersDrop < -maxDrop) {
        advanceReason = `Orders dropped ${Math.abs(ordersDrop).toFixed(1)}% (threshold: ${maxDrop}%)`
      } else {
        canAdvance = true
        advanceReason =
          ordersDay !== null
            ? `Orders held (${ordersDrop !== null ? (ordersDrop >= 0 ? "+" : "") + ordersDrop.toFixed(1) + "%" : "no prior data"})`
            : "No orders data — advance at your discretion"
      }

      return {
        ...ladder,
        steps,
        current_price: currentPrice,
        next_price: nextPrice,
        is_last: isLast,
        total_steps: steps.length,
        cogs_usd: cogs,
        cogs_pct_current: cogsPct(ladder.store as string, currentPrice, cogs),
        cogs_pct_next: nextPrice ? cogsPct(ladder.store as string, nextPrice, cogs) : null,
        current_orders_day: ordersDay,
        last_step_orders_day: lastStepOrdersDay,
        last_step_date: lastStepDate,
        orders_drop_pct: ordersDrop,
        can_advance: canAdvance,
        advance_reason: advanceReason,
      }
    })

    return NextResponse.json({
      ladders: enriched,
      summary: {
        total: enriched.length,
        active: enriched.filter((l: Record<string, unknown>) => l.status === "active").length,
        ready: enriched.filter((l: Record<string, unknown>) => l.can_advance && !l.is_last).length,
        completed: enriched.filter((l: Record<string, unknown>) => l.status === "completed").length,
      },
    })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}

// ---------------------------------------------------------------------------
// POST — create a new ladder
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  const body = await req.json()
  const { product_name, store, target_price, steps: customSteps, max_drop_pct } = body

  if (!product_name || !store || !target_price)
    return NextResponse.json({ error: "product_name, store, and target_price required" }, { status: 400 })

  const origin = req.nextUrl.origin
  const session = req.cookies.get(SESSION_COOKIE)?.value
  const catalog = await fetchCatalog(origin, session ? `${SESSION_COOKIE}=${session}` : "")
  const product = catalog.products.find((p) => p.product_name === product_name && p.store === store)

  let startPrice = body.start_price as number | undefined
  if (!startPrice && product) {
    startPrice =
      product.sales_revenue > 0 && product.units_sold > 0
        ? Math.round((product.sales_revenue / product.units_sold) * 100) / 100
        : parseFloat(product.retail_price) || 0
  }
  if (!startPrice || startPrice <= 0)
    return NextResponse.json({ error: "Could not determine current price. Provide start_price." }, { status: 400 })

  const steps = customSteps || generateSteps(startPrice, target_price)

  const sb = getServiceClient()

  const { data: existing } = await sb
    .from("price_ladders")
    .select("id")
    .eq("store", store)
    .eq("product_name", product_name)
    .eq("status", "active")
    .limit(1)

  if (existing && existing.length > 0)
    return NextResponse.json({ error: "An active ladder already exists for this product." }, { status: 409 })

  const { data: ladder, error } = await sb
    .from("price_ladders")
    .insert({
      store,
      product_name,
      start_price: startPrice,
      target_price,
      steps,
      current_step: 0,
      max_drop_pct: max_drop_pct || 15,
      status: "active",
    })
    .select()
    .single()

  if (error) {
    if (error.message?.includes("does not exist"))
      return NextResponse.json({ error: "price_ladders table not set up. Run the migration.", setup_needed: true }, { status: 500 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, ladder })
}

// ---------------------------------------------------------------------------
// PATCH — advance / pause / resume / cancel
// ---------------------------------------------------------------------------
export async function PATCH(req: NextRequest) {
  const body = await req.json()
  const { ladder_id, action } = body

  if (!ladder_id || !action)
    return NextResponse.json({ error: "ladder_id and action required" }, { status: 400 })

  const sb = getServiceClient()
  const { data: ladder, error: fetchErr } = await sb
    .from("price_ladders")
    .select("*")
    .eq("id", ladder_id)
    .single()

  if (fetchErr || !ladder) return NextResponse.json({ error: "Ladder not found" }, { status: 404 })

  const steps: number[] = ladder.steps || []
  const currentStep: number = ladder.current_step || 0

  if (action === "advance") {
    if (ladder.status !== "active")
      return NextResponse.json({ error: "Ladder is not active" }, { status: 400 })
    if (currentStep >= steps.length - 1)
      return NextResponse.json({ error: "Already at target price" }, { status: 400 })

    const origin = req.nextUrl.origin
    const session = req.cookies.get(SESSION_COOKIE)?.value
    const catalog = await fetchCatalog(origin, session ? `${SESSION_COOKIE}=${session}` : "")
    const product = catalog.products.find(
      (p: CatalogProduct) => p.product_name === ladder.product_name && p.store === ladder.store,
    )
    const ordersDay =
      product && product.units_sold > 0
        ? Math.round((product.units_sold / catalog.period_days) * 100) / 100
        : null

    const newStep = currentStep + 1
    const isComplete = newStep >= steps.length - 1

    await sb.from("price_ladder_log").insert({
      ladder_id: ladder.id,
      step_from: currentStep,
      step_to: newStep,
      old_price: steps[currentStep],
      new_price: steps[newStep],
      orders_day_before: ordersDay,
    })

    // Also log in price_changes for the cooldown system (best-effort)
    try {
      await sb.from("price_changes").insert({
        product_name: ladder.product_name,
        store: ladder.store,
        old_price: steps[currentStep],
        new_price: steps[newStep],
        change_pct: Math.round(((steps[newStep] - steps[currentStep]) / steps[currentStep]) * 1000) / 10,
        rule: "price_ladder",
        status: "applied",
        applied_at: new Date().toISOString(),
      })
    } catch {
      /* table may not exist */
    }

    const { data: updated, error: upErr } = await sb
      .from("price_ladders")
      .update({
        current_step: newStep,
        status: isComplete ? "completed" : "active",
        updated_at: new Date().toISOString(),
        ...(isComplete ? { completed_at: new Date().toISOString() } : {}),
      })
      .eq("id", ladder.id)
      .select()
      .single()

    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

    return NextResponse.json({
      success: true,
      ladder: updated,
      message: isComplete
        ? `Target price ${steps[newStep]} reached. Ladder completed.`
        : `Advanced to step ${newStep + 1}/${steps.length}: ${steps[newStep]}`,
    })
  }

  if (action === "pause" || action === "resume" || action === "cancel") {
    const statusMap: Record<string, string> = { pause: "paused", resume: "active", cancel: "cancelled" }
    const { data: updated, error: upErr } = await sb
      .from("price_ladders")
      .update({ status: statusMap[action], updated_at: new Date().toISOString() })
      .eq("id", ladder.id)
      .select()
      .single()
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })
    return NextResponse.json({ success: true, ladder: updated })
  }

  return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
}
