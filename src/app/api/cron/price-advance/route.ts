import { NextRequest, NextResponse } from "next/server"
import { getServiceClient } from "@/lib/supabase"

export const maxDuration = 30

export async function GET(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const sb = getServiceClient()

  const { data: ladders, error: ladErr } = await sb
    .from("price_ladders")
    .select("*")
    .eq("status", "active")

  if (ladErr) {
    return NextResponse.json({ error: ladErr.message }, { status: 500 })
  }

  if (!ladders || ladders.length === 0) {
    return NextResponse.json({ advanced: 0, message: "No active ladders" })
  }

  const now = Date.now()
  const COOLDOWN_MS = 7 * 86400000
  const results: { product: string; store: string; step: number; price: number }[] = []
  const skipped: string[] = []

  for (const ladder of ladders) {
    const steps: number[] = ladder.steps || []
    const currentStep: number = ladder.current_step || 0

    if (currentStep >= steps.length - 1) {
      await sb.from("price_ladders").update({
        status: "completed", updated_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
      }).eq("id", ladder.id)
      continue
    }

    const { data: lastLog } = await sb
      .from("price_ladder_log")
      .select("changed_at")
      .eq("ladder_id", ladder.id)
      .order("changed_at", { ascending: false })
      .limit(1)

    const lastChange = lastLog?.[0]?.changed_at
    if (lastChange && now - new Date(lastChange).getTime() < COOLDOWN_MS) {
      const daysLeft = Math.ceil((COOLDOWN_MS - (now - new Date(lastChange).getTime())) / 86400000)
      skipped.push(`${ladder.product_name} (${daysLeft}d left)`)
      continue
    }

    const newStep = currentStep + 1
    const isComplete = newStep >= steps.length - 1

    await sb.from("price_ladder_log").insert({
      ladder_id: ladder.id,
      step_from: currentStep,
      step_to: newStep,
      old_price: steps[currentStep],
      new_price: steps[newStep],
      orders_day_before: null,
    })

    try {
      await sb.from("price_changes").insert({
        product_name: ladder.product_name,
        store: ladder.store,
        old_price: steps[currentStep],
        new_price: steps[newStep],
        change_pct: Math.round(((steps[newStep] - steps[currentStep]) / steps[currentStep]) * 1000) / 10,
        rule: "price_ladder_auto",
        status: "applied",
        applied_at: new Date().toISOString(),
      })
    } catch { /* table may not exist */ }

    await sb.from("price_ladders").update({
      current_step: newStep,
      status: isComplete ? "completed" : "active",
      updated_at: new Date().toISOString(),
      ...(isComplete ? { completed_at: new Date().toISOString() } : {}),
    }).eq("id", ladder.id)

    results.push({
      product: ladder.product_name,
      store: ladder.store,
      step: newStep + 1,
      price: steps[newStep],
    })
  }

  return NextResponse.json({
    advanced: results.length,
    skipped: skipped.length,
    results,
    skipped_details: skipped,
  })
}
