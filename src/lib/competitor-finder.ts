// Competitor Finder (server). Builds search keywords per market from:
//  1. Keyword Planner uploads (Season Board, season_keywords), real volumes per country
//  2. what tracked competitors sell (competitor_products titles, best-sellers weigh more)
//  3. the base keyword list (public/keywords.json, UK/US volumes)
// For each keyword it counts how many tracked competitors in that market already sell it.
// High volume + few tracked competitors = a gap: search it to find stores we don't track yet.
import { readFile } from "fs/promises"
import path from "path"
import { getServiceClient } from "@/lib/supabase"
import { selectAll } from "@/lib/opportunity-db"

export const MARKETS = [
  { code: "US", label: "United States", gl: "us", google: "www.google.com", ads: "US", competitorCodes: ["US"] },
  { code: "UK", label: "United Kingdom", gl: "uk", google: "www.google.co.uk", ads: "GB", competitorCodes: ["GB", "UK"] },
  { code: "IE", label: "Ireland", gl: "ie", google: "www.google.ie", ads: "IE", competitorCodes: ["IE"] },
] as const
export type MarketCode = (typeof MARKETS)[number]["code"]

export interface FinderKeyword {
  keyword: string
  volume: number | null // monthly searches in this market, if known
  sources: ("planner" | "competitors" | "base")[]
  sellers: number // tracked competitors in this market selling it
  sellerDomains: string[]
  bestsellerHits: number // times it shows up in a competitor's top-20 best-sellers
  score: number
}

const COLOURS = new Set("black white red blue green yellow pink purple orange brown grey gray beige navy khaki cream ivory burgundy maroon olive camel tan gold silver teal mint apricot coffee wine lilac rose multicolor multicolour".split(" "))
const STOP = new Set("the a an and or with for in of to by on new sale free shipping set pack piece pcs size plus".split(" "))
const SIZES = /^(xxs|xs|s|m|l|xl|xxl|xxxl|\dxl|\d+(cm|mm|in)?)$/

// "Women's Wool Wrap Coat – Belted, Shawl Collar" → ["women's wool wrap coat", "wool wrap coat", "wrap coat"]
export function phrasesFromTitle(title: string, vendor?: string | null): string[] {
  let t = title.split(/\s[–—|-]\s|,|\(|\//)[0].toLowerCase()
  if (vendor) t = t.replace(vendor.toLowerCase(), " ")
  const words = t
    .replace(/[’`]/g, "'")
    .replace(/[^a-z' ]+/g, " ")
    .split(/\s+/)
    .filter((w) => w && !COLOURS.has(w) && !STOP.has(w) && !SIZES.test(w))
  if (words.length < 2) return []
  const core = words.slice(-5)
  const out = new Set<string>()
  out.add(core.join(" "))
  if (core.length > 2) out.add(core.slice(-3).join(" "))
  out.add(core.slice(-2).join(" "))
  return Array.from(out).filter((p) => p.split(" ").length >= 2 && p.length >= 6)
}

// Segments the Google fashion stores don't sell: keep these out of the generic keyword list.
const OFF_NICHE = /\b(wedding|bridal|bride|bridesmaid|prom|quinceanera|homecoming|graduation|communion|christening|running|basketball|football|soccer|golf|tennis|hiking|climbing|ski|snowboard|cycling|bike|gym|yoga|workout|nursing|maternity|kids|kid|baby|toddler|girls|boys|child|children|school|uniform|scrubs|costume|cosplay|halloween|lingerie|underwear|bra|bras|panties|swimsuit|bikini|wig|wigs|jewelry|jewellery|ring|rings|necklace|earrings|watch|watches|nike|adidas|puma|reebok|vans|converse|crocs|ugg|uggs|skechers|asics|hoka|birkenstock|timberland|dr|martens|zara|shein|primark|levis|gucci|prada|on)\b/

const host = (d: string) => String(d || "").toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "")
// Word forms for matching only: "men's"/"mens" → men, "ladies"/"womens" → women, plurals → singular.
function stem(w: string): string {
  if (w === "mens" || w === "man" || w === "male") return "men"
  if (w === "womens" || w === "woman" || w === "ladies" || w === "lady" || w === "female") return "women"
  if (w.length > 4 && w.endsWith("ies")) return w.slice(0, -3) + "y"
  if (w.length > 4 && /(ss|sh|ch|x)es$/.test(w)) return w.slice(0, -2)
  if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1)
  return w
}
const stemAll = (s: string) => s.split(" ").filter(Boolean).map(stem)

const norm = (s: string) => s.toLowerCase().replace(/['’]s\b/g, "").replace(/[^a-z ]+/g, " ").replace(/\s+/g, " ").trim()

export async function buildKeywords(market: MarketCode): Promise<{ keywords: FinderKeyword[]; competitorsInMarket: number; plannerCount: number; productsScanned: number; productsInMarket: number }> {
  const db = getServiceClient()
  const m = MARKETS.find((x) => x.code === market) || MARKETS[0]
  const since = new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10)

  const [planner, products, competitors, base] = await Promise.all([
    selectAll<{ keyword: string; avg_monthly: number }>(db, "season_keywords", "keyword,avg_monthly", (q) => q.eq("country", market)).catch(() => []),
    selectAll<{ competitor_domain: string; title: string; vendor: string | null; markets: string[]; bestseller_rank: number | null }>(
      db,
      "competitor_products",
      "competitor_domain,title,vendor,markets,bestseller_rank",
      (q) => q.gte("last_seen", since),
    ).catch(() => []),
    selectAll<{ domain: string; markets: string[] | null; status: string }>(db, "competitors", "domain,markets,status").catch(() => []),
    readFile(path.join(process.cwd(), "public", "keywords.json"), "utf8")
      .then((t) => JSON.parse(t) as { k: string; uk: number; us: number }[])
      .catch(() => []),
  ])

  // A competitor is in this market when the tracker row OR its scanned products say so.
  const codes = m.competitorCodes as readonly string[]
  const inCodes = (list: string[] | null | undefined) => (list || []).some((x) => codes.includes(String(x).toUpperCase()))
  const dead = new Set(competitors.filter((c) => c.status === "dead").map((c) => host(c.domain)))
  const inMarket = new Set(competitors.filter((c) => c.status !== "dead" && inCodes(c.markets)).map((c) => host(c.domain)))
  for (const p of products) if (inCodes(p.markets) && !dead.has(host(p.competitor_domain))) inMarket.add(host(p.competitor_domain))

  // Normalised title index per competitor in this market (for "who already sells this").
  const titlesByDomain = new Map<string, string[]>()
  const map = new Map<string, FinderKeyword>()
  const get = (kw: string) => {
    const k = norm(kw)
    if (!k || k.split(" ").length < 2) return null
    let x = map.get(k)
    if (!x) {
      x = { keyword: k, volume: null, sources: [], sellers: 0, sellerDomains: [], bestsellerHits: 0, score: 0 }
      map.set(k, x)
    }
    return x
  }

  for (const p of products) {
    const d = host(p.competitor_domain)
    if (!inMarket.has(d)) continue
    const list = titlesByDomain.get(d) || []
    list.push(norm(p.title))
    titlesByDomain.set(d, list)
    for (const ph of phrasesFromTitle(p.title, p.vendor)) {
      const x = get(ph)
      if (!x) continue
      if (!x.sources.includes("competitors")) x.sources.push("competitors")
      if (p.bestseller_rank != null && p.bestseller_rank <= 20) x.bestsellerHits++
    }
  }
  for (const r of planner) {
    if (OFF_NICHE.test(norm(r.keyword))) continue
    const x = get(r.keyword)
    if (!x) continue
    x.volume = Math.max(x.volume || 0, Number(r.avg_monthly) || 0)
    if (!x.sources.includes("planner")) x.sources.push("planner")
  }
  // Product nouns competitors actually use ("coat", "dress", "boots"…): generic keywords must end in one.
  const nouns = new Map<string, number>()
  map.forEach((x) => {
    const last = stem(x.keyword.split(" ").pop() || "")
    nouns.set(last, (nouns.get(last) || 0) + 1)
  })
  const relevant = (kw: string) => {
    const k = norm(kw)
    if (OFF_NICHE.test(k)) return false
    return nouns.size === 0 || (nouns.get(stem(k.split(" ").pop() || "")) || 0) >= 3
  }
  const baseVol = (b: { uk: number; us: number }) => (market === "US" ? b.us : market === "UK" ? b.uk : Math.round(b.uk / 12)) // IE ≈ 1/12 of UK
  for (const b of base) {
    const v = baseVol(b)
    if (!v) continue
    const x = map.get(norm(b.k)) || (v >= 1000 && relevant(b.k) ? get(b.k) : null)
    if (!x) continue
    if (x.volume == null) x.volume = v
    if (!x.sources.includes("base")) x.sources.push("base")
  }

  // Candidates first (cheap demand score), then count sellers only for those.
  const demandOf = (x: FinderKeyword) => Math.log10((x.volume || 0) + 10) + x.bestsellerHits * 0.6 + (x.sources.length - 1) * 0.5
  const keywords = Array.from(map.values())
    .filter((x) => x.volume != null || x.bestsellerHits > 0 || x.sources.length > 1)
    .sort((a, b) => demandOf(b) - demandOf(a))
    .slice(0, 1500)

  // Per competitor: word → set of title indexes, so "sells every word of the keyword" is a set intersection.
  const index = Array.from(titlesByDomain.entries()).map(([d, titles]) => {
    const byWord = new Map<string, Set<number>>()
    titles.forEach((t, i) => {
      for (const w of Array.from(new Set(stemAll(t)))) {
        if (!w) continue
        if (!byWord.has(w)) byWord.set(w, new Set())
        byWord.get(w)!.add(i)
      }
    })
    return { d, byWord }
  })
  for (const x of keywords) {
    const words = Array.from(new Set(stemAll(x.keyword)))
    for (const { d, byWord } of index) {
      const sets = words.map((w) => byWord.get(w))
      if (sets.some((st) => !st)) continue
      const [first, ...rest] = (sets as Set<number>[]).sort((a, b) => a.size - b.size)
      let hit = false
      for (const i of Array.from(first)) if (rest.every((st) => st.has(i))) { hit = true; break }
      if (hit) x.sellerDomains.push(d)
    }
    x.sellers = x.sellerDomains.length
    x.sellerDomains = x.sellerDomains.slice(0, 8)
    // Gap score: demand divided by how covered it already is among tracked competitors.
    x.score = Math.round((demandOf(x) / (1 + x.sellers * 0.35)) * 100) / 100
  }

  const filtered = keywords
  filtered.sort((a, b) => b.score - a.score)
  let productsInMarket = 0
  titlesByDomain.forEach((t) => (productsInMarket += t.length))
  return { keywords: filtered, competitorsInMarket: inMarket.size, plannerCount: planner.length, productsScanned: products.length, productsInMarket }
}

// ── Store check: is a found domain a Shopify store, and do we track it already?
export interface StoreCheck {
  domain: string
  tracked: boolean
  trackedStatus: string | null
  shopify: boolean
  name: string | null
  country: string | null
  currency: string | null
  products: number | null
  shipsTo: string[]
  sampleTitles: string[]
  error: string | null
}

export function cleanDomain(raw: string): string | null {
  const s = raw.trim().toLowerCase()
  if (!s) return null
  try {
    const u = new URL(s.startsWith("http") ? s : `https://${s}`)
    const host = u.hostname.replace(/^www\./, "")
    return /\.[a-z]{2,}$/.test(host) ? host : null
  } catch {
    return null
  }
}

export async function checkStores(raw: string[]): Promise<StoreCheck[]> {
  const domains = Array.from(new Set(raw.map(cleanDomain).filter((d): d is string => !!d))).slice(0, 30)
  const db = getServiceClient()
  const { data: tracked } = await db.from("competitors").select("domain,status").in("domain", domains)
  const trackedMap = new Map((tracked || []).map((t: { domain: string; status: string }) => [t.domain, t.status]))

  return Promise.all(
    domains.map(async (domain): Promise<StoreCheck> => {
      const out: StoreCheck = {
        domain,
        tracked: trackedMap.has(domain),
        trackedStatus: trackedMap.get(domain) || null,
        shopify: false,
        name: null,
        country: null,
        currency: null,
        products: null,
        shipsTo: [],
        sampleTitles: [],
        error: null,
      }
      try {
        const meta = await fetch(`https://${domain}/meta.json`, { signal: AbortSignal.timeout(8000), headers: { "User-Agent": "Mozilla/5.0" } })
        if (meta.ok) {
          const j = await meta.json()
          out.shopify = !!j.myshopify_domain
          out.name = j.name || null
          out.country = j.country || null
          out.currency = j.currency || null
          out.products = typeof j.published_products_count === "number" ? j.published_products_count : null
          out.shipsTo = Array.isArray(j.ships_to_countries) ? j.ships_to_countries.slice(0, 30) : []
        }
        const prod = await fetch(`https://${domain}/products.json?limit=8`, { signal: AbortSignal.timeout(8000), headers: { "User-Agent": "Mozilla/5.0" } })
        if (prod.ok) {
          const j = await prod.json()
          out.shopify = true
          out.sampleTitles = (j.products || []).slice(0, 5).map((p: { title: string }) => p.title)
        }
        if (!out.shopify) out.error = "Not a Shopify store (or it blocks checks)."
      } catch (e: unknown) {
        out.error = e instanceof Error && e.name === "TimeoutError" ? "Store didn't answer in time." : "Couldn't reach the store."
      }
      return out
    }),
  )
}
