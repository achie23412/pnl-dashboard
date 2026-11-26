// Competitor monthly visitors (TrendTrack) → Season Board lines and "Peak starting" alerts. Server only.
//
// Snapshot (daily cron, free TrendTrack lookups): every competitor's current monthly visits are
// saved for the current month. Once per store, its monthly traffic history is copied too, so the
// lines have the past months straight away. Table: competitor_visits (supabase/competitor-visits.sql).
//
// Lines: total visitors of the competitors in a Season Board category (Coats & Jackets,
// Knitwear, Dresses…; general stores = "All fashion"), per market.
// Peak starting = visitors up more than RISE_PCT% month-over-month (same stores, at least
// MIN_VISITS visitors and MIN_STORES stores), OR within PEAK_WEEKS weeks of last year's peak
// month. Last year's peak comes from the visitor history when it covers a year, else from the
// Keyword Planner searches already on the Season Board.
import { getServiceClient } from "@/lib/supabase"
import { tokenize, detectCategory } from "@/lib/opportunity-engine"
import { categoryOf, timing, COUNTRY_STORES, MONTHS } from "@/lib/season-keywords"
import { liveTitles } from "@/lib/live-titles"
import { hasTrendTrackKey, lookupShop, shopTraffic, TrendTrackError } from "@/lib/trendtrack"

export const RISE_PCT = 20
export const PEAK_WEEKS = 4
export const MIN_VISITS = 20000
export const MIN_STORES = 2
export const ALL_FASHION = "All fashion"
export const SEASON_MARKETS = ["US", "UK", "IE"] as const

const monthStart = (d = new Date()) => `${d.toISOString().slice(0, 7)}-01`
const addMonths = (ym: string, n: number) => {
  const d = new Date(`${ym.slice(0, 7)}-01T12:00:00Z`)
  d.setUTCMonth(d.getUTCMonth() + n)
  return monthStart(d)
}
const toMarket = (m: string) => (m.toUpperCase() === "GB" ? "UK" : m.toUpperCase())

type Competitor = { domain: string; store_name: string | null; niche: string | null; markets: string[] | null; status: string | null; season_category: string | null; trendtrack_id: string | null; tt_history_at: string | null }

// Season Board category of a competitor: its own setting, else from niche and name, else general.
export function competitorCategory(c: Pick<Competitor, "season_category" | "niche" | "store_name">): string {
  if (c.season_category) return c.season_category
  const toks = tokenize(`${c.niche || ""}`)
  const stems = toks.flatMap((t) => [t, t.replace(/(es|s)$/, "")])
  return detectCategory(stems, null) || ALL_FASHION
}

async function loadCompetitors(): Promise<Competitor[]> {
  const { data, error } = await getServiceClient()
    .from("competitors")
    .select("domain,store_name,niche,markets,status,season_category,trendtrack_id,tt_history_at")
    .not("domain", "is", null)
  if (error) throw new Error(`competitors: ${error.message}`)
  return ((data || []) as Competitor[]).filter((c) => c.domain && c.status !== "removed" && c.status !== "rejected")
}

// ------------------------------------------------------------------ snapshot

export interface SnapshotResult {
  ok: boolean
  stores: number
  snapshots: number
  histories: number
  notFound: string[]
  errors: string[]
  remaining: number
}

// Saves this month's visitors for every competitor not saved yet today, and copies the traffic
// history of up to `historyLimit` stores that don't have it yet. Stops starting new stores after
// `budgetMs`, so it fits one serverless call; the next run picks up the rest.
export async function snapshotCompetitorVisits(opts: { budgetMs?: number; historyLimit?: number } = {}): Promise<SnapshotResult> {
  const budget = opts.budgetMs ?? 45000
  const historyLimit = opts.historyLimit ?? 25
  const started = Date.now()
  const out: SnapshotResult = { ok: true, stores: 0, snapshots: 0, histories: 0, notFound: [], errors: [], remaining: 0 }
  if (!hasTrendTrackKey()) return { ...out, ok: false, errors: ["TRENDTRACK_API_KEY is not set in Vercel"] }

  const db = getServiceClient()
  const comps = await loadCompetitors()
  const month = monthStart()
  const today = new Date().toISOString().slice(0, 10)
  const { data: done } = await db.from("competitor_visits").select("domain,captured_at,source").eq("month", month)
  const doneToday = new Set((done || []).filter((r) => r.source === "snapshot" && String(r.captured_at).slice(0, 10) === today).map((r) => r.domain))
  // stores without history first, then the ones not refreshed today
  const todo = comps.filter((c) => !doneToday.has(c.domain) || !c.tt_history_at).sort((a, b) => Number(!!a.tt_history_at) - Number(!!b.tt_history_at))
  out.stores = comps.length
  let historiesLeft = historyLimit

  const work = async (c: Competitor) => {
    let id = c.trendtrack_id
    let visits: number | null = null
    const shop = await lookupShop(c.domain)
    if (!shop) {
      out.notFound.push(c.domain)
      return
    }
    id = shop.id
    visits = shop.monthlyVisits
    const patch: Record<string, unknown> = { trendtrack_id: id, last_synced: new Date().toISOString() }
    if (visits != null) {
      patch.monthly_visits = visits
      // history rows for this month win over a snapshot
      await db.from("competitor_visits").upsert({ domain: c.domain, month, monthly_visits: visits, source: "snapshot", captured_at: new Date().toISOString() }, { onConflict: "domain,month" })
      out.snapshots++
    }
    if (!c.tt_history_at && historiesLeft > 0) {
      historiesLeft--
      const t = await shopTraffic(id)
      const rows = t.history.filter((h) => h.month < month).map((h) => ({ domain: c.domain, month: h.month, monthly_visits: h.visits, source: "history", captured_at: new Date().toISOString() }))
      if (rows.length) await db.from("competitor_visits").upsert(rows, { onConflict: "domain,month" })
      if (t.growth30d != null) patch.growth_30d = t.growth30d
      if (visits == null && t.monthlyVisits != null) {
        patch.monthly_visits = t.monthlyVisits
        await db.from("competitor_visits").upsert({ domain: c.domain, month, monthly_visits: t.monthlyVisits, source: "snapshot", captured_at: new Date().toISOString() }, { onConflict: "domain,month" })
        out.snapshots++
      }
      patch.tt_history_at = new Date().toISOString()
      out.histories++
    }
    await db.from("competitors").update(patch).eq("domain", c.domain)
  }

  let i = 0
  const runners = Array.from({ length: 4 }, async () => {
    while (i < todo.length && Date.now() - started < budget) {
      const c = todo[i++]
      try {
        await work(c)
      } catch (e) {
        out.errors.push(`${c.domain}: ${e instanceof Error ? e.message : String(e)}`)
        // a bad key or no credits: stop instead of failing 140 times
        if (e instanceof TrendTrackError && (e.status === 401 || e.status === 402 || e.status === 403)) i = todo.length
      }
    }
  })
  await Promise.all(runners)
  out.remaining = Math.max(0, todo.length - i)
  out.ok = out.errors.length === 0
  await db.from("sync_status").upsert({ key: "competitor-visits", ran_at: new Date().toISOString(), ok: out.ok, result: { ...out, notFound: out.notFound.slice(0, 20), errors: out.errors.slice(0, 10) } }, { onConflict: "key" })
  return out
}

// ------------------------------------------------------------------ lines + alerts

export interface SeasonLine {
  market: string
  category: string
  stores: number
  points: { month: string; visits: number; stores: number }[] // oldest → newest
  mom: number | null // % change of the latest month vs the month before, same stores
}

export interface PeakAlert {
  market: string
  category: string
  kind: "rising" | "peak_soon"
  title: string
  why: string
  mom: number | null
  visits: number
  peakMonth: number | null // 0-11
  peakSource: "visitors" | "keywords" | null
  ourLive: number
  ourExamples: string[]
  competitorBestsellers: { title: string; url: string; store: string }[]
}

type VisitRow = { domain: string; month: string; monthly_visits: number; source: string }

async function loadVisits(since: string): Promise<VisitRow[]> {
  const db = getServiceClient()
  const out: VisitRow[] = []
  for (let i = 0; ; i += 1000) {
    const { data, error } = await db.from("competitor_visits").select("domain,month,monthly_visits,source").gte("month", since).order("month").range(i, i + 999)
    if (error) throw new Error(`competitor_visits: ${error.message}`)
    out.push(...((data || []) as VisitRow[]))
    if (!data || data.length < 1000) break
  }
  return out
}

// Keyword Planner peak month per market + category (sum of the category's monthly searches)
async function keywordPeaks(): Promise<Map<string, number>> {
  const db = getServiceClient()
  const sums = new Map<string, number[]>()
  for (let i = 0; ; i += 1000) {
    const { data, error } = await db.from("season_keywords").select("country,keyword,category,months").range(i, i + 999)
    if (error) break
    for (const k of (data || []) as { country: string; keyword: string; category: string | null; months: number[] }[]) {
      if (!Array.isArray(k.months) || k.months.length !== 12) continue
      const cat = k.category || categoryOf(k.keyword)
      for (const key of [`${k.country}|${cat}`, `${k.country}|${ALL_FASHION}`]) {
        const s = sums.get(key) || new Array(12).fill(0)
        k.months.forEach((v, m) => (s[m] += Number(v) || 0))
        sums.set(key, s)
      }
    }
    if (!data || data.length < 1000) break
  }
  const out = new Map<string, number>()
  sums.forEach((s, key) => {
    const t = timing(s)
    if (!t.evergreen && t.peakVol > 0) out.set(key, t.peak)
  })
  return out
}

const daysUntilMonth = (m: number, now = new Date()) => {
  let y = now.getUTCFullYear()
  if (m < now.getUTCMonth()) y++
  return Math.round((Date.UTC(y, m, 1) - Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())) / 86400000)
}

export async function seasonVisits(): Promise<{ lines: SeasonLine[]; alerts: PeakAlert[]; months: string[]; lastSnapshot: string | null; rule: { risePct: number; peakWeeks: number; minVisits: number; minStores: number } }> {
  const db = getServiceClient()
  const now = monthStart()
  const since = addMonths(now, -24)
  const [comps, visits, kwPeaks, { data: sync }] = await Promise.all([
    loadCompetitors(),
    loadVisits(since),
    keywordPeaks().catch(() => new Map<string, number>()),
    db.from("sync_status").select("ran_at").eq("key", "competitor-visits").maybeSingle(),
  ])
  const months: string[] = []
  for (let m = since; m <= now; m = addMonths(m, 1)) months.push(m)

  const byDomain = new Map<string, Map<string, number>>()
  for (const v of visits) {
    const m = byDomain.get(v.domain) || new Map<string, number>()
    m.set(String(v.month).slice(0, 10), Number(v.monthly_visits) || 0)
    byDomain.set(v.domain, m)
  }

  // market|category → domains
  const groups = new Map<string, string[]>()
  for (const c of comps) {
    if (!byDomain.has(c.domain)) continue
    const cat = competitorCategory(c)
    const markets = Array.from(new Set((c.markets || []).map(toMarket))).filter((m) => (SEASON_MARKETS as readonly string[]).includes(m))
    for (const mk of markets) {
      for (const cc of cat === ALL_FASHION ? [ALL_FASHION] : [cat, ALL_FASHION]) {
        const key = `${mk}|${cc}`
        groups.set(key, [...(groups.get(key) || []), c.domain])
      }
    }
  }

  const lines: SeasonLine[] = []
  groups.forEach((domains, key) => {
    const [market, category] = key.split("|")
    const points = months
      .map((m) => {
        let sum = 0
        let n = 0
        for (const d of domains) {
          const v = byDomain.get(d)?.get(m)
          if (v != null) {
            sum += v
            n++
          }
        }
        return { month: m, visits: sum, stores: n }
      })
      .filter((p) => p.stores > 0)
    // month-over-month on the same stores: latest month with data vs the month before it
    let mom: number | null = null
    const last = points[points.length - 1]
    if (last) {
      const prev = addMonths(last.month, -1)
      let a = 0
      let b = 0
      for (const d of domains) {
        const x = byDomain.get(d)
        const cur = x?.get(last.month)
        const pre = x?.get(prev)
        if (cur != null && pre != null && pre > 0) {
          a += cur
          b += pre
        }
      }
      if (b > 0) mom = Math.round(((a - b) / b) * 1000) / 10
    }
    lines.push({ market, category, stores: domains.length, points, mom })
  })
  lines.sort((a, b) => a.market.localeCompare(b.market) || (a.category === ALL_FASHION ? -1 : b.category === ALL_FASHION ? 1 : (b.points[b.points.length - 1]?.visits || 0) - (a.points[a.points.length - 1]?.visits || 0)))

  // Alerts
  const raw: Omit<PeakAlert, "ourLive" | "ourExamples" | "competitorBestsellers">[] = []
  for (const l of lines) {
    const last = l.points[l.points.length - 1]
    if (!last) continue
    // last year's peak: visitor history when it covers 12+ months, else Keyword Planner
    const yearAgo = l.points.filter((p) => p.month >= addMonths(now, -14) && p.month <= addMonths(now, -2))
    let peakMonth: number | null = null
    let peakSource: PeakAlert["peakSource"] = null
    if (yearAgo.length >= 10) {
      const top = yearAgo.reduce((a, p) => (p.visits > a.visits ? p : a))
      peakMonth = Number(top.month.slice(5, 7)) - 1
      peakSource = "visitors"
    } else if (kwPeaks.has(`${l.market}|${l.category}`)) {
      peakMonth = kwPeaks.get(`${l.market}|${l.category}`)!
      peakSource = "keywords"
    }
    const rising = l.mom != null && l.mom > RISE_PCT && last.visits >= MIN_VISITS && last.stores >= MIN_STORES
    const days = peakMonth != null ? daysUntilMonth(peakMonth) : null
    const soon = days != null && days >= 0 && days <= PEAK_WEEKS * 7
    if (!rising && !soon) continue
    const why = [
      rising ? `visitors +${l.mom}% month-over-month (${last.stores} stores, ${Math.round(last.visits / 1000)}k visits)` : null,
      soon ? `${days === 0 ? "peak month starts today" : `${days} days to last year's peak (${MONTHS[peakMonth!]}, from ${peakSource === "visitors" ? "competitor visitors" : "Keyword Planner searches"})`}` : null,
    ].filter(Boolean).join(" · ")
    raw.push({ market: l.market, category: l.category, kind: rising ? "rising" : "peak_soon", title: `Peak starting: ${l.category} · ${l.market}`, why, mom: l.mom, visits: last.visits, peakMonth, peakSource })
  }

  // What to push: our live products in the category, competitors' best-sellers in it
  const alerts: PeakAlert[] = []
  if (raw.length) {
    const markets = Array.from(new Set(raw.map((r) => r.market)))
    const titlesByMarket = new Map<string, { store: string; title: string }[]>()
    await Promise.all(markets.map(async (m) => titlesByMarket.set(m, await liveTitles(COUNTRY_STORES[m] || []).catch(() => []))))
    const { data: cp } = await db
      .from("competitor_products")
      .select("competitor_domain,competitor_name,title,url,markets,bestseller_rank")
      .not("bestseller_rank", "is", null)
      .gte("last_seen", new Date(Date.now() - 21 * 86400000).toISOString().slice(0, 10))
      .order("bestseller_rank")
      .limit(3000)
    const compProducts = (cp || []) as { competitor_domain: string; competitor_name: string | null; title: string; url: string; markets: string[] | null; bestseller_rank: number }[]
    for (const r of raw) {
      const inCat = (title: string) => r.category === ALL_FASHION || categoryOf(title) === r.category
      const ours = (titlesByMarket.get(r.market) || []).filter((t) => inCat(t.title))
      const best = compProducts
        .filter((p) => (p.markets || []).map(toMarket).includes(r.market) && inCat(p.title))
        .slice(0, 5)
        .map((p) => ({ title: p.title, url: p.url, store: p.competitor_name || p.competitor_domain }))
      alerts.push({ ...r, ourLive: ours.length, ourExamples: ours.slice(0, 5).map((t) => t.title), competitorBestsellers: best })
    }
  }
  // biggest first; general "All fashion" after the specific categories
  alerts.sort((a, b) => Number(a.category === ALL_FASHION) - Number(b.category === ALL_FASHION) || Number(b.kind === "rising") - Number(a.kind === "rising") || b.visits - a.visits)

  return {
    lines,
    alerts,
    months,
    lastSnapshot: (sync?.ran_at as string | undefined) || null,
    rule: { risePct: RISE_PCT, peakWeeks: PEAK_WEEKS, minVisits: MIN_VISITS, minStores: MIN_STORES },
  }
}
