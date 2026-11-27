// Google Ads Scaling: the OAK Media × Ascend SOP turned into a per-store to-do list.
// Read-only: pulls Google Ads data from Windsor (campaign and product level), Shopify
// orders/sales and GMC status, and says what to do today. It never changes Google Ads.
//
// SOP numbers (USD in the SOP; the Google Ads accounts run in EUR, so USD amounts are
// converted at today's ECB rate):
//   target ROAS 2.5 · scale +20% after 2–3 on-target days in a row (small budgets 50→80→120→180)
//   50%+ dip after scaling → budget −15% · PMax days 1–4: change nothing · CPC > $1.50 → don't scale
//   exclude: $25 spent + ROAS < 1.8 (1.8–2.2 optimise) · CPC > $1.50 after $5 unless profitable
//   · spend with 0 Shopify sales · winner campaign from ~€250/day: ROAS ≥ 2.2, 14d, ≥ 3 conversions
//   · brand search: Google-only stores from ~$400/day
import { fetchWindsor } from "./windsor"
import { WINDSOR_ACCOUNT_MAP, SHOPIFY_STORES } from "./constants"
import { fetchLatestEurRates } from "./currency"
import { getServiceClient } from "./supabase"
import { getShopifyToken } from "./shopify-sessions"
import { productStats30d } from "./gmc-health-stats"
import { GMC_STORES, amsterdamDay, addDays } from "./gmc-health"

export const SOP = {
  targetRoas: 2.5,
  excludeRoas: 1.8,
  optimiseRoas: 2.2,
  excludeSpendUsd: 25,
  cpcMaxUsd: 1.5,
  cpcMinSpendUsd: 5,
  learningDays: 4,
  testDays: 2,
  minStreak: 2,
  safeStreak: 3,
  stepPct: 20,
  smallLadder: [50, 80, 120, 180],
  dipPct: 50,
  rollbackPct: 15,
  winnerSpendEur: 250,
  winnerRoas: 2.2,
  winnerDays: 14,
  winnerConversions: 3,
  brandSpendUsd: 400,
}

export type Level = "do" | "wait" | "warn" | "ok"
export interface Action { level: Level; title: string; detail: string; rule: string }

export interface DayRow { date: string; budget: number | null; spend: number; clicks: number; conversions: number; value: number; roas: number | null; cpc: number | null; onTarget: boolean }
export interface CampaignInfo { name: string; type: string; status: string; kind: "test" | "main" | "winner" | "brand" | "other"; firstDay: string; budget: number | null; spend7: number; roas7: number | null }
export interface ProductRow {
  itemId: string // as Google shows it, e.g. shopify_US_<product>_<variant>
  productId: string
  title: string
  spend30: number; clicks30: number; conv30: number; value30: number; roas30: number | null; cpc30: number | null
  spend7: number; roas7: number | null
  spend14: number; conv14: number; roas14: number | null
  spendLast3: number
  shopifyUnits30: number | null
  reason: string
}
export interface StoreScaling {
  store: string
  url: string | null
  stage: string
  stageStep: number // SOP step 1–8
  actions: Action[]
  main: { name: string; budget: number | null; launchDay: string; dayN: number; launchKnown: boolean; streak: number; lastChange: string | null; nextBudget: number | null; plusTwenty: number | null } | null
  campaigns: CampaignInfo[]
  days: DayRow[] // whole account, last 14 complete days + today
  avgSpend3: number
  avgSpend7: number
  cpc3: number | null
  tracking: { googleConv7: number; shopifyOrders7: number; convOverClicks: number }
  gmc: { lastSync: string | null; error: string | null; disapproved: number }
  exclude: ProductRow[]
  optimise: ProductRow[]
  recheck: ProductRow[]
  winners: ProductRow[]
  winnerReady: boolean
  brandReady: boolean
}
export interface ScalingData { today: string; usdPerEur: number; thresholds: { excludeSpend: number; cpcMax: number; cpcMinSpend: number; brandSpend: number }; stores: StoreScaling[]; error?: string }

const num = (v: unknown) => Number(v) || 0
const roasOf = (value: number, spend: number) => (spend > 0 ? value / spend : null)
const round2 = (n: number) => Math.round(n * 100) / 100
// Google shows Item IDs with an upper-case country: shopify_US_…, Windsor returns shopify_us_…
const googleItemId = (id: string) => id.replace(/^shopify_([a-z]+)_/i, (_m, c: string) => `shopify_${c.toUpperCase()}_`)

function kindOf(name: string, type: string): CampaignInfo["kind"] {
  if (/test/i.test(name)) return "test"
  if (/winner/i.test(name)) return "winner"
  if (/brand/i.test(name) || type === "SEARCH") return "brand"
  if (type === "PERFORMANCE_MAX" || type === "SHOPPING") return "main"
  return "other"
}

function nextBudget(b: number): { ladder: number; plusTwenty: number } {
  const plusTwenty = Math.round(b * (1 + SOP.stepPct / 100))
  const step = SOP.smallLadder.find((x) => x > b + 0.5)
  return { ladder: b < SOP.smallLadder[SOP.smallLadder.length - 1] && step ? step : plusTwenty, plusTwenty }
}

async function publicUrl(store: string): Promise<string | null> {
  const cfg = SHOPIFY_STORES[store]
  if (!cfg) return null
  try {
    const token = await getShopifyToken(cfg.domain, cfg.envKey)
    if (!token) return null
    const r = await fetch(`https://${cfg.domain}/admin/api/2024-10/shop.json?fields=domain`, { headers: { "X-Shopify-Access-Token": token }, next: { revalidate: 86400 }, signal: AbortSignal.timeout(8000) })
    if (!r.ok) return null
    const d = await r.json()
    return d?.shop?.domain ? `https://${d.shop.domain}` : null
  } catch {
    return null
  }
}

export async function buildScaling(): Promise<ScalingData> {
  const today = amsterdamDay() // the Google Ads accounts run on Amsterdam time
  const yesterday = addDays(today, -1)
  const from30 = addDays(today, -30)
  const from35 = addDays(today, -35)

  const [rates, campRows, prodRows, shopifyStats] = await Promise.all([
    fetchLatestEurRates(),
    fetchWindsor("google_ads", ["date", "account_name", "campaign", "campaign_type", "campaign_status", "budget_amount", "spend", "clicks", "conversions", "conversion_value"], from35, today, 900),
    fetchWindsor("google_ads", ["date", "account_name", "product_item_id", "product_title", "spend", "clicks", "conversions", "conversion_value"], from30, yesterday, 900),
    productStats30d().catch(() => ({} as Awaited<ReturnType<typeof productStats30d>>)),
  ])
  const usd = rates.USD || 1.08
  const fromUsd = (x: number) => x / usd
  const th = { excludeSpend: round2(fromUsd(SOP.excludeSpendUsd)), cpcMax: round2(fromUsd(SOP.cpcMaxUsd)), cpcMinSpend: round2(fromUsd(SOP.cpcMinSpendUsd)), brandSpend: Math.round(fromUsd(SOP.brandSpendUsd)) }

  const sb = getServiceClient()
  const [ordersRes, gmcSetRes, gmcIssRes] = await Promise.all([
    sb.from("daily_revenue").select("store,date,orders").in("store", GMC_STORES).gte("date", addDays(today, -7)).lte("date", yesterday),
    sb.from("gmc_settings").select("store,last_sync_at,last_sync_error"),
    sb.from("gmc_issues").select("store").eq("severity", "DISAPPROVED").is("resolved_on", null),
  ])
  const orders7: Record<string, number> = {}
  for (const r of (ordersRes.data || []) as { store: string; orders: number }[]) orders7[r.store] = (orders7[r.store] || 0) + num(r.orders)
  const gmcSet: Record<string, { last_sync_at: string | null; last_sync_error: string | null }> = {}
  for (const r of (gmcSetRes.data || []) as { store: string; last_sync_at: string | null; last_sync_error: string | null }[]) gmcSet[r.store] = r
  const disapproved: Record<string, number> = {}
  for (const r of (gmcIssRes.data || []) as { store: string }[]) disapproved[r.store] = (disapproved[r.store] || 0) + 1

  const urls = await Promise.all(GMC_STORES.map((s) => publicUrl(s)))

  const stores = GMC_STORES.map((store, si): StoreScaling => {
    const rows = campRows.filter((r) => WINDSOR_ACCOUNT_MAP[r.account_name]?.channel === "Google" && WINDSOR_ACCOUNT_MAP[r.account_name]?.store === store)

    // ---- campaigns ----
    const byCamp: Record<string, { type: string; status: string; days: Record<string, { budget: number | null; spend: number; clicks: number; conv: number; value: number }> }> = {}
    for (const r of rows) {
      const name = String(r.campaign || "(no name)")
      const c = byCamp[name] || (byCamp[name] = { type: String(r.campaign_type || ""), status: String(r.campaign_status || ""), days: {} })
      const d = String(r.date).slice(0, 10)
      const e = c.days[d] || (c.days[d] = { budget: null, spend: 0, clicks: 0, conv: 0, value: 0 })
      if (r.budget_amount != null && r.budget_amount !== "") e.budget = num(r.budget_amount)
      e.spend += num(r.spend); e.clicks += num(r.clicks); e.conv += num(r.conversions); e.value += num(r.conversion_value)
      c.status = String(r.campaign_status || c.status)
    }
    const campaigns: CampaignInfo[] = Object.keys(byCamp).map((name) => {
      const c = byCamp[name]
      const dates = Object.keys(c.days).filter((d) => c.days[d].spend > 0).sort()
      const last7 = Object.keys(c.days).filter((d) => d >= addDays(today, -7) && d <= yesterday)
      const sp7 = last7.reduce((a, d) => a + c.days[d].spend, 0)
      const v7 = last7.reduce((a, d) => a + c.days[d].value, 0)
      const allDates = Object.keys(c.days).sort()
      const latest = allDates[allDates.length - 1]
      return { name, type: c.type, status: c.status, kind: kindOf(name, c.type), firstDay: dates[0] || latest, budget: latest ? c.days[latest].budget : null, spend7: round2(sp7), roas7: roasOf(v7, sp7) }
    }).sort((a, b) => b.spend7 - a.spend7)
    const enabled = campaigns.filter((c) => c.status === "ENABLED")
    const mainC = enabled.find((c) => c.kind === "main") || null
    const testC = enabled.find((c) => c.kind === "test") || null
    const winnerC = enabled.find((c) => c.kind === "winner") || null
    const brandC = enabled.find((c) => c.kind === "brand") || null

    // ---- whole-account days ----
    const dayMap: Record<string, DayRow> = {}
    for (const name of Object.keys(byCamp)) {
      const c = byCamp[name]
      for (const d of Object.keys(c.days)) {
        const e = c.days[d]
        const row = dayMap[d] || (dayMap[d] = { date: d, budget: 0, spend: 0, clicks: 0, conversions: 0, value: 0, roas: null, cpc: null, onTarget: false })
        if (c.status === "ENABLED" && e.budget != null) row.budget = (row.budget || 0) + e.budget
        row.spend += e.spend; row.clicks += e.clicks; row.conversions += e.conv; row.value += e.value
      }
    }
    const days = Object.keys(dayMap).sort().filter((d) => d >= addDays(today, -14)).map((d) => {
      const r = dayMap[d]
      const roas = roasOf(r.value, r.spend)
      return { ...r, spend: round2(r.spend), value: round2(r.value), conversions: round2(r.conversions), roas, cpc: r.clicks > 0 ? r.spend / r.clicks : null, onTarget: roas != null && roas >= SOP.targetRoas }
    })
    const complete = (n: number) => Object.keys(dayMap).filter((d) => d >= addDays(today, -n) && d <= yesterday)
    const sum = (ds: string[], k: "spend" | "clicks" | "conversions" | "value") => ds.reduce((a, d) => a + dayMap[d][k], 0)
    const last3 = complete(3), last7 = complete(7)
    const avgSpend3 = sum(last3, "spend") / 3
    const avgSpend7 = sum(last7, "spend") / 7

    // ---- main campaign: learning, CPC, streak, dip ----
    const actions: Action[] = []
    let main: StoreScaling["main"] = null
    const mc = mainC ? byCamp[mainC.name] : null
    const mainDays = mc ? Object.keys(mc.days).sort() : []
    const cpcDays = mc ? mainDays.filter((d) => d >= addDays(today, -3) && d <= yesterday) : last3
    const cpcSpend = mc ? cpcDays.reduce((a, d) => a + mc.days[d].spend, 0) : sum(last3, "spend")
    const cpcClicks = mc ? cpcDays.reduce((a, d) => a + mc.days[d].clicks, 0) : sum(last3, "clicks")
    const cpc3 = cpcClicks > 0 ? cpcSpend / cpcClicks : null
    const cpcTooHigh = cpc3 != null && cpc3 > th.cpcMax

    // ---- tracking check (SOP step 1) ----
    const googleConv7 = Math.round(sum(last7, "conversions"))
    const shopifyOrders7 = orders7[store] || 0
    const convOverClicks = prodRows.filter((r) => WINDSOR_ACCOUNT_MAP[r.account_name]?.store === store && num(r.conversions) > Math.max(1, num(r.clicks))).length
    if (rows.length > 0 && (googleConv7 > shopifyOrders7 * 1.5 + 2 || convOverClicks > 0)) {
      actions.push({
        level: "warn",
        title: "Check your tracking first",
        detail: `Google counted ${googleConv7} conversions in the last 7 days, Shopify has ${shopifyOrders7} orders${convOverClicks ? `, and ${convOverClicks} product(s) show more conversions than clicks` : ""}. The primary conversion is probably not only the WeTracked purchase, so ROAS here is too high. In Google Ads → Goals → Conversions, keep only the WeTracked purchase as primary, then place a test order with a 99% discount code. Until then, trust Shopify orders over Google's ROAS.`,
        rule: "SOP 1: WeTracked purchase = primary conversion, confirm with a 99% test order",
      })
    }

    const gmcInfo = { lastSync: gmcSet[store]?.last_sync_at || null, error: gmcSet[store]?.last_sync_error || null, disapproved: disapproved[store] || 0 }
    let stage = "", stageStep = 1

    if (rows.length === 0 || (!mainC && !testC)) {
      stage = "Not live yet"
      stageStep = 1
      actions.push({ level: "do", title: "Set up tracking, then launch the test campaign", detail: "Install WeTracked, connect it to Google Ads, set the WeTracked purchase as the primary conversion and confirm it with a 99% discount test order. Only then launch the test campaign exactly as in the video.", rule: "SOP 1–2" })
    } else if (!mainC && testC) {
      const tDays = Object.keys(byCamp[testC.name].days).filter((d) => d <= yesterday && byCamp[testC.name].days[d].spend > 0).length
      stage = `Test campaign, day ${tDays + 1}`
      stageStep = 2
      if (tDays < SOP.testDays) {
        actions.push({ level: "wait", title: `Let the test campaign run: ${tDays} of ${SOP.testDays} full days done`, detail: `Leave "${testC.name}" alone. Check daily that the ads keep spending and that Merchant Center stays live.`, rule: "SOP 2: 2 full days, GMC must stay live" })
      } else {
        const gmcOk = !gmcInfo.error
        actions.push({
          level: gmcOk ? "do" : "warn",
          title: gmcOk ? "Launch your PMax campaign today" : "Check Merchant Center before launching PMax",
          detail: `"${testC.name}" has spent on ${tDays} full days${gmcOk ? ` and Merchant Center is connected (${gmcInfo.disapproved} disapproved item(s), see GMC Health)` : `, but the last Merchant Center sync failed`}. The SOP says: if the ads keep spending and GMC is still live, launch the real PMax campaign on day 3. Name it without "TEST" so this page picks it up as the main campaign.`,
          rule: "SOP 2–3: PMax on day 3",
        })
      }
    }

    if (mainC && mc) {
      const spendDays = mainDays.filter((d) => mc.days[d].spend > 0)
      const launchDay = spendDays[0] || mainDays[0]
      const launchKnown = launchDay > addDays(from35, 1)
      const dayN = Math.round((Date.parse(today) - Date.parse(launchDay)) / 86400000) + 1
      // latest budget change (budget differs from the day before)
      let lastChange: string | null = null
      let prevBudget: number | null = null
      let changeFrom: number | null = null
      for (const d of mainDays) {
        const b = mc.days[d].budget
        if (b == null) continue
        if (prevBudget != null && Math.abs(b - prevBudget) > 0.5) { lastChange = d; changeFrom = prevBudget }
        prevBudget = b
      }
      const budget = prevBudget
      // on-target days in a row, counting back from yesterday, only days after the last budget change
      let streak = 0
      for (let d = yesterday; d >= launchDay && (!lastChange || d > lastChange); d = addDays(d, -1)) {
        const e = mc.days[d]
        const r = e ? roasOf(e.value, e.spend) : null
        if (r != null && r >= SOP.targetRoas) streak++
        else break
      }
      const nb = budget != null ? nextBudget(budget) : null
      main = { name: mainC.name, budget, launchDay, dayN, launchKnown, streak, lastChange, nextBudget: nb ? nb.ladder : null, plusTwenty: nb ? nb.plusTwenty : null }

      if (dayN <= SOP.learningDays) {
        stage = `PMax learning, day ${dayN} of ${SOP.learningDays}`
        stageStep = 3
        actions.push({ level: "wait", title: `Change nothing: day ${dayN} of ${SOP.learningDays}`, detail: `"${mainC.name}" launched ${launchDay}. ROAS can jump around while Google learns the store. Don't touch budget, products or settings until day ${SOP.learningDays + 1}${testC ? `. The test campaign "${testC.name}" is still on` : ""}.`, rule: "SOP 3: days 1–4 after launch, do nothing" })
      } else {
        stage = budget != null && changeFrom != null && budget > changeFrom ? "Scaling" : "Ready to scale on consistency"
        stageStep = 4
      }

      if (cpcTooHigh) {
        actions.push({ level: "warn", title: `CPC too high: €${cpc3!.toFixed(2)} a click`, detail: `The last 3 days averaged €${cpc3!.toFixed(2)} per click, above the ~$${SOP.cpcMaxUsd.toFixed(2)} (€${th.cpcMax.toFixed(2)}) limit. Don't scale. Talk to your coach about a possible domain switch.`, rule: "SOP 3: CPC above ~$1.50 = too high" })
      }

      if (dayN > SOP.learningDays && budget != null) {
        // 50%+ dip after the last raise → −15%
        let dipped = false
        if (lastChange && changeFrom != null && budget > changeFrom && lastChange >= addDays(today, -10)) {
          const pre = [1, 2, 3].map((i) => addDays(lastChange!, -i)).filter((d) => mc.days[d])
          const post = mainDays.filter((d) => d > lastChange! && d <= yesterday)
          const preSp = pre.reduce((a, d) => a + mc.days[d].spend, 0), preV = pre.reduce((a, d) => a + mc.days[d].value, 0)
          const postSp = post.reduce((a, d) => a + mc.days[d].spend, 0), postV = post.reduce((a, d) => a + mc.days[d].value, 0)
          const preR = roasOf(preV, preSp), postR = roasOf(postV, postSp)
          if (post.length >= 2 && preR != null && postR != null && postR <= preR * (1 - SOP.dipPct / 100)) {
            dipped = true
            const back = Math.round(budget * (1 - SOP.rollbackPct / 100))
            actions.push({ level: "do", title: `Scale back: budget €${budget} → €${back}`, detail: `Since the raise on ${lastChange} (€${changeFrom} → €${budget}) ROAS is ${postR.toFixed(2)} vs ${preR.toFixed(2)} in the 3 days before: a dip of ${Math.round((1 - postR / preR) * 100)}%. Lower the daily budget by ${SOP.rollbackPct}%.`, rule: "SOP 4: 50%+ dip after scaling → budget −15%" })
          }
        }
        if (!dipped && !cpcTooHigh) {
          if (streak >= SOP.minStreak) {
            actions.push({
              level: "do",
              title: `Scale budget €${budget} → €${nb!.ladder}`,
              detail: `${streak} days in a row on ROAS ≥ ${SOP.targetRoas}${lastChange ? ` since the last change on ${lastChange}` : ""}. ${nb!.ladder !== nb!.plusTwenty ? `Small budget, so the SOP's bigger step (50 → 80 → 120 → 180). The standard +${SOP.stepPct}% would be €${nb!.plusTwenty}.` : `+${SOP.stepPct}%.`}${streak < SOP.safeStreak ? " 2 days is the minimum; wait 1 more on-target day if you want to be safe." : ""} After this, wait for 2–3 on-target days again before the next step.`,
              rule: "SOP 4: 2–3 on-target days → +20% (small budgets harder)",
            })
          } else {
            const y = mc.days[yesterday]
            const yr = y ? roasOf(y.value, y.spend) : null
            actions.push({
              level: "wait",
              title: `Keep budget at €${budget}: ${streak} of ${SOP.minStreak} on-target days`,
              detail: `Scale only after ${SOP.minStreak}–${SOP.safeStreak} days in a row at ROAS ≥ ${SOP.targetRoas}. Yesterday: ${yr != null ? `ROAS ${yr.toFixed(2)}` : "no spend"}${yr != null && yr < SOP.targetRoas ? " (below target, so the count restarts)" : ""}. Need ${SOP.minStreak - streak} more on-target day(s).`,
              rule: "SOP 4: scale on consistency, not one good day",
            })
          }
        }
      }
    }

    // ---- products (SOP 5, 6, 7) ----
    const pr = prodRows.filter((r) => WINDSOR_ACCOUNT_MAP[r.account_name]?.channel === "Google" && WINDSOR_ACCOUNT_MAP[r.account_name]?.store === store)
    const items: Record<string, ProductRow & { _v7: number; _v14: number; _firstSpend: string }> = {}
    for (const r of pr) {
      const raw = String(r.product_item_id || "")
      const m = raw.match(/^shopify_[a-z]+_(\d+)_/i)
      if (!m) continue
      const d = String(r.date).slice(0, 10)
      const it = items[raw] || (items[raw] = {
        itemId: googleItemId(raw), productId: m[1], title: String(r.product_title || ""),
        spend30: 0, clicks30: 0, conv30: 0, value30: 0, roas30: null, cpc30: null,
        spend7: 0, roas7: null, spend14: 0, conv14: 0, roas14: null, spendLast3: 0,
        shopifyUnits30: null, reason: "", _v7: 0, _v14: 0, _firstSpend: d,
      })
      const sp = num(r.spend), v = num(r.conversion_value), cv = num(r.conversions)
      it.spend30 += sp; it.clicks30 += num(r.clicks); it.conv30 += cv; it.value30 += v
      if (d >= addDays(today, -7)) { it.spend7 += sp; it._v7 += v }
      if (d >= addDays(today, -SOP.winnerDays)) { it.spend14 += sp; it.conv14 += cv; it._v14 += v }
      if (d >= addDays(today, -3)) it.spendLast3 += sp
      if (sp > 0 && d < it._firstSpend) it._firstSpend = d
    }
    const list = Object.keys(items).map((k) => {
      const it = items[k]
      const st = shopifyStats[`${store}|${it.productId}`]
      return {
        ...it,
        spend30: round2(it.spend30), value30: round2(it.value30), conv30: round2(it.conv30), spend7: round2(it.spend7), spend14: round2(it.spend14), conv14: round2(it.conv14), spendLast3: round2(it.spendLast3),
        roas30: roasOf(it.value30, it.spend30), cpc30: it.clicks30 > 0 ? it.spend30 / it.clicks30 : null,
        roas7: roasOf(it._v7, it.spend7), roas14: roasOf(it._v14, it.spend14),
        shopifyUnits30: st ? st.units : Object.keys(shopifyStats).length ? 0 : null,
      }
    })
    const strip = (p: (typeof list)[number], reason: string): ProductRow => {
      const { _v7, _v14, _firstSpend, ...rest } = p
      void _v7; void _v14; void _firstSpend
      return { ...rest, reason }
    }
    const exclude: ProductRow[] = [], optimise: ProductRow[] = [], recheck: ProductRow[] = [], winners: ProductRow[] = []
    for (const p of list) {
      const r = p.roas30 ?? 0
      if (p.spend30 >= th.excludeSpend && r < SOP.excludeRoas) exclude.push(strip(p, `€${p.spend30.toFixed(2)} spent, ROAS ${r.toFixed(2)} < ${SOP.excludeRoas}`))
      else if (p.spend30 >= th.cpcMinSpend && p.cpc30 != null && p.cpc30 > th.cpcMax && r < SOP.targetRoas) exclude.push(strip(p, `CPC €${p.cpc30.toFixed(2)} > $${SOP.cpcMaxUsd.toFixed(2)} after €${p.spend30.toFixed(2)}, not profitable`))
      else if (p.spend30 >= th.excludeSpend && p.shopifyUnits30 === 0) exclude.push(strip(p, `€${p.spend30.toFixed(2)} spent, 0 Shopify sales in 30 days`))
      else if (p.spend30 >= th.excludeSpend && r < SOP.optimiseRoas) optimise.push(strip(p, `ROAS ${r.toFixed(2)}: between ${SOP.excludeRoas} and ${SOP.optimiseRoas}, optimise first`))
      // spent before, nothing in the last 3 days, and back above target: maybe excluded too early
      if (p.spendLast3 === 0 && p.spend30 > 0 && r >= SOP.targetRoas && p.conv30 >= 1) recheck.push(strip(p, `No spend in the last 3 days, 30-day ROAS ${r.toFixed(2)}`))
      if ((p.roas14 ?? 0) >= SOP.winnerRoas && p.conv14 >= SOP.winnerConversions) winners.push(strip(p, `ROAS ${(p.roas14 ?? 0).toFixed(2)} over 14 days, ${Math.round(p.conv14)} conversions`))
    }
    exclude.sort((a, b) => b.spend30 - a.spend30)
    optimise.sort((a, b) => b.spend30 - a.spend30)
    recheck.sort((a, b) => (b.roas30 ?? 0) - (a.roas30 ?? 0))
    winners.sort((a, b) => (b.roas14 ?? 0) - (a.roas14 ?? 0))

    if (exclude.length) {
      actions.push({ level: "do", title: `Exclude ${exclude.length} product item(s)`, detail: `They waste spend under the SOP rules (list below, with a button to copy the Item IDs for bulk add). Check daily, exclude every 2 days: Google's conversions land late.`, rule: "SOP 5: $25 + ROAS < 1.8 · CPC > $1.50 after $5 · 0 Shopify sales" })
    }
    if (recheck.length) {
      actions.push({ level: "do", title: `Re-check ${recheck.length} item(s) that may be excluded`, detail: "These had sales and are above target over 30 days but got no spend in the last 3 days. If they're on your excluded list, remove the exclusion and let them run again.", rule: "SOP 6: re-check exclusions daily" })
    }
    const winnerReady = avgSpend3 >= SOP.winnerSpendEur
    if (winnerReady && !winnerC) {
      actions.push({ level: "do", title: "Launch the winner campaign", detail: `You're at €${Math.round(avgSpend3)}/day (≥ €${SOP.winnerSpendEur}). Add the ${winners.length} winner(s) below (ROAS ≥ ${SOP.winnerRoas}, last 14 days, ≥ ${SOP.winnerConversions} conversions).`, rule: "SOP 7: winner campaign from ~€250/day" })
    } else if (winnerC) {
      actions.push({ level: "ok", title: `Winner campaign live: "${winnerC.name}"`, detail: `Add new winners every 4 days; remove a SKU only on at least 2 days of data. ${winners.length} current winner(s) below.`, rule: "SOP 7" })
    }
    const brandReady = avgSpend7 >= th.brandSpend
    if (brandReady && !brandC) {
      actions.push({ level: "do", title: "Launch brand search", detail: `You average €${Math.round(avgSpend7)}/day over 7 days (≥ $${SOP.brandSpendUsd} ≈ €${th.brandSpend}). Build the ad group with the prompt at the bottom of this page.`, rule: "SOP 8: Google-only stores from ~$400/day" })
    }
    if (!actions.some((a) => a.level === "do" || a.level === "warn")) {
      actions.push({ level: "ok", title: "Nothing to change today", detail: "No scaling step, roll-back or exclusion is due. Check again tomorrow.", rule: "SOP 4–6: check daily" })
    }
    const order: Record<Level, number> = { warn: 0, do: 1, wait: 2, ok: 3 }
    actions.sort((a, b) => order[a.level] - order[b.level])

    return {
      store, url: urls[si], stage, stageStep, actions, main, campaigns, days,
      avgSpend3: round2(avgSpend3), avgSpend7: round2(avgSpend7), cpc3,
      tracking: { googleConv7, shopifyOrders7, convOverClicks }, gmc: gmcInfo,
      exclude, optimise: optimise.slice(0, 50), recheck: recheck.slice(0, 50), winners: winners.slice(0, 50), winnerReady, brandReady,
    }
  })

  return { today, usdPerEur: usd, thresholds: th, stores }
}
