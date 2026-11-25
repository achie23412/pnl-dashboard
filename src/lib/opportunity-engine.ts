// Product Opportunities engine. Pure functions, no imports, so it can be unit
// tested with plain Node (node --experimental-strip-types).
//
// Principles:
//  - Observations are facts from the competitor scan (who lists what, when, at
//    what price). Inferences (season fit, store fit) are labelled separately.
//  - A competitor listing a product is NOT proof of sales. The only sales-ish
//    signal is a product appearing in a competitor's best-seller collection,
//    and that is shown as "in best-seller collection", never as revenue.
//  - Evidence strength and commercial potential are scored separately.

// ---------------------------------------------------------------- types

export interface CompetitorProduct {
  competitor_domain: string
  competitor_name: string | null
  markets: string[]
  shopify_product_id: string
  handle: string
  title: string
  url: string
  image: string | null
  product_type: string | null
  vendor: string | null
  tags: string[]
  price: number | null
  compare_at_price: number | null
  currency: string | null
  currency_assumed: boolean
  published_at: string | null
  bestseller_rank: number | null
  first_seen: string // YYYY-MM-DD
  last_seen: string
}

export interface OwnProduct {
  store: string
  shopify_product_id: string
  title: string
  product_type: string | null
}

export interface EventLite {
  date: string // YYYY-MM-DD
  label: string
  type: string // sale | prep | shipping | season | launch | deadline | ...
  store?: string | null // WF | CC | SA | null = all
  note?: string | null
}

export interface TargetStore {
  name: string
  code: string | null // calendar store code
  countries: string[] // ISO alpha-2 markets this store sells to
  timezone: string
  currency: string
}

export interface EvidenceItem {
  key: string // competitor_domain:shopify_product_id
  competitor_domain: string
  competitor_name: string | null
  url: string
  title: string
  image: string | null
  price: number | null
  currency: string | null
  currency_assumed: boolean
  first_seen: string
  last_seen: string
  published_at: string | null
  bestseller_rank: number | null
}

export interface OpportunityDraft {
  cluster_key: string
  title: string
  category: string | null
  gender: string | null
  image: string | null
  evidence: EvidenceItem[]
  competitor_count: number
  observations: string[]
  inferences: string[]
  data_gaps: string[]
  season: string | null
  event_label: string | null
  event_date: string | null
  launch_by: string | null
  timing_source: "calendar" | "assumed" | null
  timing_note: string | null
  markets: string[]
  target_store: string | null
  catalogue_match: string | null
  evidence_score: number
  commercial_score: number
  priority: "high" | "medium" | "low"
  priority_reason: string
  first_observed: string
  last_observed: string
}

// ---------------------------------------------------------------- stores

export const TARGET_STORES: TargetStore[] = [
  { name: "Walsh & Farley", code: "WF", countries: ["IE"], timezone: "Europe/Dublin", currency: "EUR" },
  { name: "Carter & Collins", code: "CC", countries: ["GB", "UK"], timezone: "Europe/London", currency: "GBP" },
  { name: "Susan & Allen", code: "SA", countries: ["US"], timezone: "America/New_York", currency: "USD" },
]

// Currency by competitor market when the store's currency could not be read.
const MARKET_CURRENCY: Record<string, string> = {
  US: "USD", GB: "GBP", UK: "GBP", IE: "EUR", DE: "EUR", NL: "EUR", FR: "EUR", ES: "EUR", IT: "EUR",
  FI: "EUR", AT: "EUR", BE: "EUR", DK: "DKK", SE: "SEK", NO: "NOK", CA: "CAD", AU: "AUD",
}
export function currencyForMarkets(markets: string[]): string | null {
  for (const m of markets) {
    const c = MARKET_CURRENCY[m.toUpperCase()]
    if (c) return c
  }
  return null
}

// ---------------------------------------------------------------- text

const COLORS = new Set([
  "black", "white", "ivory", "cream", "beige", "camel", "brown", "chocolate", "tan", "khaki", "grey", "gray",
  "charcoal", "navy", "blue", "red", "burgundy", "wine", "pink", "rose", "green", "olive", "sage", "emerald",
  "yellow", "mustard", "orange", "purple", "lilac", "lavender", "gold", "silver", "multicolor", "multi",
  "apricot", "coffee", "taupe", "mint", "teal", "coral", "nude", "denim",
])
const MATERIALS = new Set([
  "wool", "cashmere", "knit", "knitted", "linen", "cotton", "silk", "satin", "velvet", "leather", "suede",
  "faux", "fur", "fleece", "corduroy", "tweed", "denim", "sequin", "sequined", "lace", "chiffon", "polyester",
  "jersey", "ribbed", "cable", "quilted", "padded", "teddy", "sherpa", "mohair",
])
const STOPWORDS = new Set([
  "the", "a", "an", "and", "with", "for", "in", "of", "to", "on", "by", "new", "style", "fashion", "casual",
  "elegant", "classic", "premium", "luxury", "trendy", "comfortable", "comfy", "soft", "warm", "chic",
  "stylish", "perfect", "everyday", "set", "piece", "sale", "off", "free", "shipping", "copy", "ladies",
  "s", "xs", "m", "l", "xl", "xxl", "plus", "size",
])
// Product nouns, most specific first. The first noun found decides the category.
const CATEGORY_NOUNS: [string, string][] = [
  ["puffer", "Coats & Jackets"], ["parka", "Coats & Jackets"], ["trench", "Coats & Jackets"], ["coat", "Coats & Jackets"],
  ["jacket", "Coats & Jackets"], ["blazer", "Coats & Jackets"], ["gilet", "Coats & Jackets"], ["vest", "Coats & Jackets"],
  ["cardigan", "Knitwear"], ["sweater", "Knitwear"], ["jumper", "Knitwear"], ["pullover", "Knitwear"], ["turtleneck", "Knitwear"],
  ["hoodie", "Hoodies & Sweatshirts"], ["sweatshirt", "Hoodies & Sweatshirts"],
  ["dress", "Dresses"], ["gown", "Dresses"], ["jumpsuit", "Jumpsuits"], ["romper", "Jumpsuits"],
  ["jeans", "Jeans"], ["trousers", "Trousers"], ["pants", "Trousers"], ["chinos", "Trousers"], ["leggings", "Activewear"],
  ["joggers", "Trousers"], ["shorts", "Shorts"], ["skirt", "Skirts"],
  ["blouse", "Tops"], ["shirt", "Tops"], ["polo", "Tops"], ["tee", "Tops"], ["t-shirt", "Tops"], ["top", "Tops"], ["tank", "Tops"],
  ["boots", "Shoes"], ["boot", "Shoes"], ["sneakers", "Shoes"], ["loafers", "Shoes"], ["sandals", "Shoes"], ["heels", "Shoes"],
  ["shoes", "Shoes"], ["slippers", "Shoes"], ["bag", "Bags"], ["handbag", "Bags"], ["scarf", "Accessories"],
  ["hat", "Accessories"], ["beanie", "Accessories"], ["gloves", "Accessories"], ["belt", "Accessories"],
  ["pajama", "Loungewear"], ["pyjama", "Loungewear"], ["robe", "Loungewear"], ["tracksuit", "Activewear"],
]

export function tokenize(title: string): string[] {
  return title
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9\- ]+/g, " ")
    .split(/\s+/)
    .map((t) => t.replace(/^-+|-+$/g, ""))
    .filter((t) => t.length > 1 && !/^\d+$/.test(t))
}

export function detectGender(title: string, tags: string[] = [], productType = ""): string | null {
  const hay = ` ${title} ${tags.join(" ")} ${productType} `.toLowerCase()
  if (/\b(women|womens|woman|ladies|female|her)\b/.test(hay)) return "women"
  if (/\b(men|mens|man|male|his|gentleman)\b/.test(hay)) return "men"
  return null
}

export function detectCategory(tokens: string[], productType: string | null): string | null {
  for (const [noun, cat] of CATEGORY_NOUNS) {
    if (tokens.includes(noun)) return cat
  }
  const pt = (productType || "").toLowerCase()
  for (const [noun, cat] of CATEGORY_NOUNS) {
    if (pt.includes(noun)) return cat
  }
  return productType ? productType : null
}

// Tokens that identify the product (no colours, sizes, gender words, filler).
export function signature(title: string, brandWords: string[] = []): string[] {
  const brands = new Set(brandWords.map((b) => b.toLowerCase()))
  const out = tokenize(title).filter(
    (t) =>
      !STOPWORDS.has(t) &&
      !COLORS.has(t) &&
      !brands.has(t) &&
      !/^(women|womens|woman|men|mens|man|ladies|unisex)$/.test(t),
  )
  return Array.from(new Set(out))
}

export function jaccard(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0
  const sb = new Set(b)
  let inter = 0
  for (const t of a) if (sb.has(t)) inter++
  return inter / (a.length + b.length - inter)
}

// ---------------------------------------------------------------- seasons

interface SeasonRule {
  season: string
  keywords: string[]
  // calendar labels (lower-case substrings) that time this season, in order of preference
  eventMatch: string[]
  // when no calendar event matches: month-day of the demand peak (northern hemisphere)
  fallbackPeak: { month: number; day: number } | null
}

const SEASON_RULES: SeasonRule[] = [
  {
    season: "Party / NYE",
    keywords: ["sequin", "sequined", "glitter", "sparkly", "metallic", "velvet", "satin", "party", "cocktail", "evening", "nye"],
    eventMatch: ["nye & party", "new year"],
    fallbackPeak: { month: 12, day: 31 },
  },
  {
    season: "Winter",
    keywords: ["coat", "puffer", "parka", "wool", "knit", "knitted", "sweater", "cardigan", "jumper", "turtleneck", "boots", "boot", "scarf", "fleece", "sherpa", "teddy", "thermal", "beanie", "gloves", "cashmere", "quilted", "padded", "fur"],
    eventMatch: ["winter products", "winter"],
    fallbackPeak: { month: 12, day: 15 },
  },
  {
    season: "Christmas gifting",
    keywords: ["pajama", "pyjama", "slippers", "robe", "christmas", "xmas", "gift"],
    eventMatch: ["christmas", "xmas"],
    fallbackPeak: { month: 12, day: 25 },
  },
  {
    season: "New Year / activewear",
    keywords: ["leggings", "gym", "yoga", "tracksuit", "joggers", "sports", "athletic", "running", "workout"],
    eventMatch: ["jan trending", "new year new me"],
    fallbackPeak: { month: 1, day: 10 },
  },
  {
    season: "Valentine's",
    keywords: ["valentine", "valentines", "heart", "romantic"],
    eventMatch: ["valentine"],
    fallbackPeak: { month: 2, day: 14 },
  },
  {
    season: "Autumn",
    keywords: ["autumn", "fall", "corduroy", "flannel", "suede", "plaid", "tweed", "checked"],
    eventMatch: ["autumn"],
    fallbackPeak: { month: 10, day: 1 },
  },
  {
    season: "Spring",
    keywords: ["trench", "floral", "pastel", "blouse", "light", "spring", "rain"],
    eventMatch: ["spring"],
    fallbackPeak: { month: 4, day: 1 },
  },
  {
    season: "Summer",
    keywords: ["linen", "swim", "swimsuit", "bikini", "sandals", "shorts", "sundress", "beach", "summer", "maxi"],
    eventMatch: ["summer"],
    fallbackPeak: { month: 6, day: 21 },
  },
]

export function detectSeason(tokens: string[]): SeasonRule | null {
  let best: SeasonRule | null = null
  let bestHits = 0
  for (const rule of SEASON_RULES) {
    const hits = rule.keywords.filter((k) => tokens.includes(k)).length
    if (hits > bestHits) {
      best = rule
      bestHits = hits
    }
  }
  return best
}

// Today's date (YYYY-MM-DD) in a timezone.
export function todayIn(timezone: string, now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now)
  const get = (t: string) => parts.find((p) => p.type === t)?.value || ""
  return `${get("year")}-${get("month")}-${get("day")}`
}

export function addDays(date: string, days: number): string {
  const d = new Date(date + "T12:00:00Z")
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export function daysBetween(from: string, to: string): number {
  return Math.round((new Date(to + "T12:00:00Z").getTime() - new Date(from + "T12:00:00Z").getTime()) / 86400000)
}

// Google Shopping needs time to index and learn before a demand peak. The
// calendar's own notes say 2-3 weeks; the course says 4-6 weeks. We use 21 days
// when no calendar "prep" event exists, and say so.
export const ASSUMED_LEAD_DAYS = 21

export interface Timing {
  season: string | null
  event_label: string | null
  event_date: string | null
  launch_by: string | null
  timing_source: "calendar" | "assumed" | null
  timing_note: string | null
}

export function timingFor(tokens: string[], store: TargetStore | null, events: EventLite[], today: string): Timing {
  const rule = detectSeason(tokens)
  if (!rule) {
    return { season: "Evergreen", event_label: null, event_date: null, launch_by: null, timing_source: null, timing_note: "No seasonal keywords: treated as evergreen (sells year-round)." }
  }
  const relevant = events
    .filter((e) => !e.store || !store || e.store === store.code)
    .filter((e) => e.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))
  // Prefer a "list products by" (prep) date over e.g. the sale day itself.
  const prepFirst = [...relevant.filter((e) => e.type === "prep"), ...relevant.filter((e) => e.type !== "prep")]
  for (const m of rule.eventMatch) {
    const ev = prepFirst.find((e) => e.label.toLowerCase().includes(m))
    if (ev) {
      // "prep"/"launch" events are already the listing deadline; for others list ahead.
      const isDeadline = ev.type === "prep" || ev.type === "launch"
      const launchBy = isDeadline ? ev.date : addDays(ev.date, -ASSUMED_LEAD_DAYS)
      return {
        season: rule.season,
        event_label: ev.label,
        event_date: ev.date,
        launch_by: launchBy,
        timing_source: isDeadline ? "calendar" : "assumed",
        timing_note: isDeadline
          ? `From the calendar: "${ev.label}" on ${ev.date}${ev.store ? ` (${ev.store})` : ""}.`
          : `Calendar event "${ev.label}" on ${ev.date}; launch date assumes ${ASSUMED_LEAD_DAYS} days for Google to index and learn.`,
      }
    }
  }
  // No calendar event: next occurrence of the season's peak, minus the assumed lead time.
  if (rule.fallbackPeak) {
    const y = Number(today.slice(0, 4))
    const mk = (yr: number) => `${yr}-${String(rule.fallbackPeak!.month).padStart(2, "0")}-${String(rule.fallbackPeak!.day).padStart(2, "0")}`
    let peak = mk(y)
    if (peak < today) peak = mk(y + 1)
    return {
      season: rule.season,
      event_label: `${rule.season} peak (assumed)`,
      event_date: peak,
      launch_by: addDays(peak, -ASSUMED_LEAD_DAYS),
      timing_source: "assumed",
      timing_note: `No calendar event for ${rule.season}. Peak date and ${ASSUMED_LEAD_DAYS}-day lead time are assumptions; add an event to the calendar to replace them.`,
    }
  }
  return { season: rule.season, event_label: null, event_date: null, launch_by: null, timing_source: null, timing_note: null }
}

// ---------------------------------------------------------------- clustering

interface Prepared {
  p: CompetitorProduct
  sig: string[]
  gender: string | null
  category: string | null
}

export const SIMILARITY_THRESHOLD = 0.5

function prepare(p: CompetitorProduct): Prepared {
  const brandWords = [p.vendor || "", p.competitor_name || "", p.competitor_domain.split(".")[0]]
    .join(" ")
    .split(/\s+/)
    .filter((w) => w.length > 2)
  const sig = signature(p.title, brandWords)
  return {
    p,
    sig,
    gender: detectGender(p.title, p.tags, p.product_type || ""),
    category: detectCategory(tokenize(p.title), p.product_type),
  }
}

export interface Cluster {
  items: Prepared[]
  sig: string[]
  gender: string | null
  category: string | null
}

// Greedy clustering within gender+category buckets. Near-identical products
// (same type, Jaccard >= threshold on identifying words) become one cluster.
export function clusterProducts(products: CompetitorProduct[]): Cluster[] {
  const buckets = new Map<string, Prepared[]>()
  for (const p of products) {
    const prep = prepare(p)
    if (prep.sig.length === 0) continue
    const k = `${prep.gender || "any"}|${prep.category || "other"}`
    const arr = buckets.get(k) || []
    arr.push(prep)
    buckets.set(k, arr)
  }
  const clusters: Cluster[] = []
  buckets.forEach((items) => {
    const local: Cluster[] = []
    for (const it of items) {
      let best: Cluster | null = null
      let bestScore = 0
      for (const c of local) {
        const s = jaccard(it.sig, c.sig)
        if (s > bestScore) {
          bestScore = s
          best = c
        }
      }
      if (best && bestScore >= SIMILARITY_THRESHOLD) {
        best.items.push(it)
      } else {
        local.push({ items: [it], sig: it.sig, gender: it.gender, category: it.category })
      }
    }
    clusters.push(...local)
  })
  return clusters
}

// ---------------------------------------------------------------- catalogue

export function catalogueMatch(sig: string[], category: string | null, own: OwnProduct[], store: string | null): string | null {
  let best: OwnProduct | null = null
  let bestScore = 0
  for (const o of own) {
    if (store && o.store !== store) continue
    const oc = detectCategory(tokenize(o.title), o.product_type)
    if (category && oc && oc !== category) continue
    const s = jaccard(sig, signature(o.title))
    if (s > bestScore) {
      bestScore = s
      best = o
    }
  }
  if (best && bestScore >= SIMILARITY_THRESHOLD) return `${best.store}: "${best.title}" (${Math.round(bestScore * 100)}% similar)`
  return null
}

// ---------------------------------------------------------------- scoring

export interface Scores {
  evidence_score: number
  commercial_score: number
  priority: "high" | "medium" | "low"
  priority_reason: string
}

export function scoreOpportunity(args: {
  competitorCount: number
  bestsellerHits: number
  newestDaysAgo: number | null
  scansSeen: number // distinct last_seen dates across evidence (repeat sightings)
  daysToLaunch: number | null // launch_by - today in the store's timezone
  seasonal: boolean
  hasCatalogueMatch: boolean
  catalogueKnown: boolean
  storeFit: boolean
  priceInRange: boolean | null
}): Scores {
  // Evidence strength: how much the scan actually shows.
  let ev = 0
  const evWhy: string[] = []
  ev += Math.min(args.competitorCount, 4) * 15
  evWhy.push(`${args.competitorCount} competitor${args.competitorCount === 1 ? "" : "s"}`)
  if (args.bestsellerHits > 0) {
    ev += 25
    evWhy.push(`in ${args.bestsellerHits} best-seller collection${args.bestsellerHits === 1 ? "" : "s"}`)
  }
  if (args.newestDaysAgo != null && args.newestDaysAgo <= 30) {
    ev += 5
    evWhy.push("newly listed")
  }
  if (args.scansSeen >= 2) ev += 10
  ev = Math.min(ev, 100)

  // Commercial potential: timing, gap, store fit (inferences).
  let co = 0
  const coWhy: string[] = []
  if (args.daysToLaunch == null) {
    co += args.seasonal ? 5 : 20
    coWhy.push(args.seasonal ? "season timing unknown" : "evergreen")
  } else if (args.daysToLaunch < -14) {
    coWhy.push("launch window passed")
  } else if (args.daysToLaunch <= 0) {
    co += 30
    coWhy.push("launch now (window open)")
  } else if (args.daysToLaunch <= 35) {
    co += 40
    coWhy.push(`launch within ${args.daysToLaunch} days`)
  } else {
    co += 20
    coWhy.push(`launch in ${args.daysToLaunch} days`)
  }
  if (!args.catalogueKnown) {
    co += 10
    coWhy.push("our catalogue not scanned")
  } else if (args.hasCatalogueMatch) {
    coWhy.push("similar product already listed")
  } else {
    co += 30
    coWhy.push("gap in our catalogue")
  }
  if (args.storeFit) {
    co += 20
    coWhy.push("competitor sells in our market")
  }
  if (args.priceInRange) co += 10
  co = Math.min(co, 100)

  const priority: Scores["priority"] =
    ev >= 50 && co >= 60 ? "high" : ev >= 50 || co >= 60 ? "medium" : "low"
  return {
    evidence_score: ev,
    commercial_score: co,
    priority,
    priority_reason: `Evidence ${ev}/100 (${evWhy.join(", ")}). Potential ${co}/100 (${coWhy.join(", ")}).`,
  }
}

// ---------------------------------------------------------------- build

export interface BuildInput {
  products: CompetitorProduct[]
  own: OwnProduct[]
  events: EventLite[]
  now?: Date
}

function storeForMarkets(markets: string[]): TargetStore | null {
  const up = markets.map((m) => m.toUpperCase())
  return TARGET_STORES.find((s) => s.countries.some((c) => up.includes(c))) || null
}

function fmtPrice(n: number | null, cur: string | null, assumed: boolean): string {
  if (n == null) return "price unknown"
  return `${cur || "?"} ${n.toFixed(2)}${assumed ? " (currency assumed)" : ""}`
}

// An opportunity needs at least one of: listed by 2+ competitors, a best-seller
// slot, or a seasonal new listing (last 30 days). Single random listings are noise.
export function qualifies(c: Cluster, today: string): boolean {
  const comps = new Set(c.items.map((i) => i.p.competitor_domain))
  if (comps.size >= 2) return true
  if (c.items.some((i) => i.p.bestseller_rank != null && i.p.bestseller_rank <= 20)) return true
  const newest = c.items.map((i) => i.p.published_at || i.p.first_seen).sort().pop() || ""
  const seasonal = detectSeason(c.sig) != null
  return seasonal && newest.slice(0, 10) >= addDays(today, -30)
}

export function clusterKey(c: Cluster): string {
  // Stable-ish key: bucket + the 4 most common identifying words. Existing
  // opportunities are also matched by shared evidence (see mergeKeys).
  const freq = new Map<string, number>()
  for (const it of c.items) for (const t of it.sig) freq.set(t, (freq.get(t) || 0) + 1)
  const top = Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 4)
    .map(([t]) => t)
    .sort()
  return `${c.gender || "any"}|${c.category || "other"}|${top.join("-")}`
}

export function buildOpportunities(input: BuildInput): OpportunityDraft[] {
  const now = input.now || new Date()
  const utcToday = todayIn("UTC", now)
  const clusters = clusterProducts(input.products)
  const catalogueKnownStores = new Set(input.own.map((o) => o.store))
  const out: OpportunityDraft[] = []

  for (const c of clusters) {
    if (!qualifies(c, utcToday)) continue
    const items = c.items
      .slice()
      .sort((a, b) => (a.p.bestseller_rank ?? 999) - (b.p.bestseller_rank ?? 999))
    const comps = Array.from(new Set(items.map((i) => i.p.competitor_domain)))
    const markets = Array.from(new Set(items.flatMap((i) => i.p.markets.map((m) => m.toUpperCase()))))
    const store = storeForMarkets(markets)
    const today = store ? todayIn(store.timezone, now) : utcToday
    const rep = items[0].p

    const evidence: EvidenceItem[] = items.map((i) => ({
      key: `${i.p.competitor_domain}:${i.p.shopify_product_id}`,
      competitor_domain: i.p.competitor_domain,
      competitor_name: i.p.competitor_name,
      url: i.p.url,
      title: i.p.title,
      image: i.p.image,
      price: i.p.price,
      currency: i.p.currency,
      currency_assumed: i.p.currency_assumed,
      first_seen: i.p.first_seen,
      last_seen: i.p.last_seen,
      published_at: i.p.published_at,
      bestseller_rank: i.p.bestseller_rank,
    }))

    const firstObserved = items.map((i) => i.p.first_seen).sort()[0]
    const lastObserved = items.map((i) => i.p.last_seen).sort().pop() as string
    const publishDates = items.map((i) => (i.p.published_at || "").slice(0, 10)).filter(Boolean).sort()
    const newest = publishDates.length ? publishDates[publishDates.length - 1] : null
    const newestDaysAgo = newest ? daysBetween(newest, utcToday) : null
    const bestsellerHits = items.filter((i) => i.p.bestseller_rank != null).length
    const scansSeen = new Set(items.map((i) => i.p.last_seen)).size

    // Prices: only compare within one currency.
    const byCur = new Map<string, number[]>()
    for (const i of items) {
      if (i.p.price == null) continue
      const k = i.p.currency || "?"
      byCur.set(k, [...(byCur.get(k) || []), i.p.price])
    }
    const priceObs: string[] = []
    byCur.forEach((prices, cur) => {
      const lo = Math.min(...prices)
      const hi = Math.max(...prices)
      priceObs.push(lo === hi ? `${cur} ${lo.toFixed(2)}` : `${cur} ${lo.toFixed(2)}–${hi.toFixed(2)}`)
    })
    const storePrices = store ? byCur.get(store.currency) : undefined
    const priceInRange = storePrices && storePrices.length ? storePrices.some((p) => p >= 25 && p <= 90) : null

    const timing = timingFor(c.sig, store, input.events, today)
    const daysToLaunch = timing.launch_by ? daysBetween(today, timing.launch_by) : null
    const catalogueKnown = store ? catalogueKnownStores.has(store.name) : false
    const match = store && catalogueKnown ? catalogueMatch(c.sig, c.category, input.own, store.name) : null

    const observations: string[] = []
    observations.push(
      `Listed by ${comps.length} tracked competitor${comps.length === 1 ? "" : "s"}: ${comps.join(", ")}.`,
    )
    if (bestsellerHits > 0) {
      const ranks = items.filter((i) => i.p.bestseller_rank != null).map((i) => `${i.p.competitor_domain} #${i.p.bestseller_rank}`)
      observations.push(`In best-seller collection: ${ranks.join(", ")} (collection position, not sales figures).`)
    }
    if (priceObs.length) observations.push(`Competitor prices: ${priceObs.join("; ")}.`)
    if (newest) observations.push(`Most recent competitor publish date: ${newest}.`)
    observations.push(`First seen in our scans ${firstObserved}, last seen ${lastObserved}.`)

    const inferences: string[] = []
    if (timing.season) inferences.push(`Season: ${timing.season} (keyword match on the product name).`)
    if (store) inferences.push(`Fits ${store.name}: competitor sells in ${markets.join(", ")}.`)
    if (!match && catalogueKnown) inferences.push(`No similar product found in ${store!.name}'s catalogue.`)

    const data_gaps: string[] = ["No sales data: a listing is not proof the product sells."]
    if (!store) data_gaps.push("Competitor markets don't match a Google store; pick the store manually.")
    if (items.some((i) => i.p.currency_assumed)) data_gaps.push("Some currencies are assumed from the competitor's market.")
    if (items.some((i) => i.p.price == null)) data_gaps.push("Some prices missing.")
    if (store && !catalogueKnown) data_gaps.push(`${store.name}'s catalogue hasn't been scanned yet, so duplicates can't be checked.`)
    if (timing.timing_source === "assumed") data_gaps.push("Launch date uses an assumed lead time.")
    if (scansSeen < 2) data_gaps.push("Seen in one scan only; no change over time yet.")

    const scores = scoreOpportunity({
      competitorCount: comps.length,
      bestsellerHits,
      newestDaysAgo,
      scansSeen,
      daysToLaunch,
      seasonal: timing.season != null && timing.season !== "Evergreen",
      hasCatalogueMatch: !!match,
      catalogueKnown,
      storeFit: !!store,
      priceInRange,
    })

    out.push({
      cluster_key: clusterKey(c),
      title: rep.title,
      category: c.category,
      gender: c.gender,
      image: items.find((i) => i.p.image)?.p.image || null,
      evidence,
      competitor_count: comps.length,
      observations,
      inferences,
      data_gaps,
      season: timing.season,
      event_label: timing.event_label,
      event_date: timing.event_date,
      launch_by: timing.launch_by,
      timing_source: timing.timing_source,
      timing_note: timing.timing_note,
      markets,
      target_store: store ? store.name : null,
      catalogue_match: match,
      ...scores,
      first_observed: firstObserved,
      last_observed: lastObserved,
    })
  }

  return out.sort(
    (a, b) =>
      ({ high: 0, medium: 1, low: 2 }[a.priority] - { high: 0, medium: 1, low: 2 }[b.priority]) ||
      b.evidence_score + b.commercial_score - (a.evidence_score + a.commercial_score),
  )
}

// Existing opportunity that shares any evidence product with a fresh draft.
// Used so a re-scan updates the same opportunity instead of creating a copy.
export function findExisting<T extends { id: number; cluster_key: string; evidence: { key: string }[] }>(
  draft: OpportunityDraft,
  existing: T[],
): T | null {
  const keys = new Set(draft.evidence.map((e) => e.key))
  for (const e of existing) {
    if (e.cluster_key === draft.cluster_key) return e
    if ((e.evidence || []).some((x) => keys.has(x.key))) return e
  }
  return null
}

// Rejected opportunities only come back when the evidence meaningfully grows.
export const RESURFACE_MIN_NEW_COMPETITORS = 2
export function shouldResurface(competitorCountAtDecision: number | null, competitorCountNow: number): boolean {
  if (competitorCountAtDecision == null) return false
  return competitorCountNow - competitorCountAtDecision >= RESURFACE_MIN_NEW_COMPETITORS
}

// ---------------------------------------------------------------- patterns

export interface PatternRow {
  label: string
  detail: string
}

// Catalogue-wide observations for the patterns panel (counts only, no guesses).
export function patternSummary(products: CompetitorProduct[], now: Date = new Date()): PatternRow[] {
  const today = todayIn("UTC", now)
  const recent = products.filter((p) => (p.published_at || p.first_seen).slice(0, 10) >= addDays(today, -14))
  const prior = products.filter((p) => {
    const d = (p.published_at || p.first_seen).slice(0, 10)
    return d < addDays(today, -14) && d >= addDays(today, -28)
  })
  const countBy = (list: CompetitorProduct[], f: (p: CompetitorProduct) => string[]) => {
    const m = new Map<string, Set<string>>()
    for (const p of list)
      for (const k of f(p)) {
        const s = m.get(k) || new Set<string>()
        s.add(p.competitor_domain)
        m.set(k, s)
      }
    return Array.from(m.entries())
      .map(([k, s]) => ({ k, n: s.size }))
      .sort((a, b) => b.n - a.n)
  }
  const cat = (p: CompetitorProduct) => {
    const c = detectCategory(tokenize(p.title), p.product_type)
    return c ? [c] : []
  }
  const rows: PatternRow[] = []
  const recentCats = countBy(recent, cat).slice(0, 5)
  const priorCats = new Map(countBy(prior, cat).map((r) => [r.k, r.n]))
  if (recentCats.length) {
    rows.push({
      label: "New listings, last 14 days (by category)",
      detail: recentCats.map((r) => `${r.k}: ${r.n} competitors (prev. 14 days: ${priorCats.get(r.k) || 0})`).join(" · "),
    })
  }
  const mats = countBy(recent, (p) => tokenize(p.title).filter((t) => MATERIALS.has(t))).slice(0, 6)
  if (mats.length) rows.push({ label: "Materials in new listings", detail: mats.map((r) => `${r.k} (${r.n} competitors)`).join(" · ") })
  const cols = countBy(recent, (p) => tokenize(p.title).filter((t) => COLORS.has(t))).slice(0, 6)
  if (cols.length) rows.push({ label: "Colours in new listings", detail: cols.map((r) => `${r.k} (${r.n} competitors)`).join(" · ") })
  const bands = countBy(products.filter((p) => p.price != null && p.currency), (p) => {
    const v = p.price as number
    const band = v < 30 ? "<30" : v < 50 ? "30–50" : v < 80 ? "50–80" : v < 120 ? "80–120" : "120+"
    return [`${p.currency} ${band}`]
  }).slice(0, 6)
  if (bands.length) rows.push({ label: "Price points (competitors per band)", detail: bands.map((r) => `${r.k}: ${r.n}`).join(" · ") })
  return rows
}

// ---------------------------------------------------------------- workflow

export type OppStatus =
  | "new" | "under_review" | "approved" | "queued" | "importing" | "imported"
  | "adapting" | "ready_for_review" | "ready_to_publish" | "saved" | "rejected" | "failed"

// Transitions a person can trigger from the page. Import states (queued,
// importing, imported, failed) are only set by the import API.
export const MANUAL_TRANSITIONS: Record<OppStatus, OppStatus[]> = {
  new: ["under_review", "approved", "saved", "rejected"],
  under_review: ["approved", "saved", "rejected", "new"],
  saved: ["under_review", "approved", "rejected"],
  rejected: ["under_review"],
  approved: ["under_review", "saved", "rejected"],
  queued: [],
  importing: [],
  failed: ["approved", "rejected"],
  imported: ["adapting"],
  adapting: ["ready_for_review", "imported"],
  ready_for_review: ["ready_to_publish", "adapting"],
  ready_to_publish: ["adapting"],
}

export function canTransition(from: OppStatus, to: OppStatus): boolean {
  return (MANUAL_TRANSITIONS[from] || []).includes(to)
}

// Statuses from which the import API may start an import.
export const IMPORTABLE: OppStatus[] = ["approved", "failed", "queued"]

// Listing checks that must all be done before "Ready for final review".
export const ADAPT_CHECKS: { key: string; label: string; via: string }[] = [
  { key: "title", label: "Title rewritten (GMC format, no competitor brand)", via: "Redo Listing" },
  { key: "description", label: "Original description + 3 key features", via: "Redo Listing" },
  { key: "seo", label: "SEO image file names applied", via: "Redo Listing" },
  { key: "images", label: "Images checked: no competitor logos/watermarks, rights OK", via: "Shopify (manual)" },
  { key: "variants", label: "Variants and options checked", via: "Shopify (manual)" },
  { key: "sizing", label: "Size chart added or not needed", via: "Shopify (manual)" },
  { key: "pricing", label: "Price set for our margin (3–4× COGS, competitive)", via: "Shopify (manual)" },
  { key: "collections", label: "Added to the right collections", via: "Shopify (manual)" },
  { key: "claims", label: "No unsupported claims; facts verified", via: "Review" },
]

export function missingChecks(checks: Record<string, boolean> | null | undefined): string[] {
  return ADAPT_CHECKS.filter((c) => !(checks || {})[c.key]).map((c) => c.label)
}

// Competitor branding left in imported text (names, domains, vendor).
export function brandingWarnings(text: string, competitorNames: string[]): string[] {
  const hay = text.toLowerCase()
  const out: string[] = []
  for (const n of competitorNames) {
    const clean = n.toLowerCase().replace(/^www\./, "")
    const base = clean.split(".")[0]
    if (base.length >= 4 && hay.includes(base)) out.push(`Mentions "${base}" (competitor)`)
  }
  return Array.from(new Set(out))
}
