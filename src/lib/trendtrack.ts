// TrendTrack Public API (server only). Key: TRENDTRACK_API_KEY in Vercel
// (TrendTrack → Workspace settings → API). Docs: https://docs.trendtrack.io/docs/agent-guide.md
//   GET /v1/lookup?q=<domain>&type=shop  → shop id + current monthly visits (0 credits)
//   GET /v1/shops/{id}                   → traffic.monthlyVisits, growth30d, history[{period,value}] (metered)
const BASE = "https://api.trendtrack.io"

export const hasTrendTrackKey = () => !!process.env.TRENDTRACK_API_KEY

export class TrendTrackError extends Error {
  constructor(message: string, public status: number) {
    super(message)
  }
}

async function tt<T>(path: string, retry = true): Promise<T> {
  const key = process.env.TRENDTRACK_API_KEY
  if (!key) throw new TrendTrackError("TRENDTRACK_API_KEY not set in Vercel", 0)
  const res = await fetch(BASE + path, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  })
  if (res.status === 429 && retry) {
    const wait = Math.min(10, Number(res.headers.get("retry-after")) || 2)
    await new Promise((r) => setTimeout(r, wait * 1000))
    return tt<T>(path, false)
  }
  if (!res.ok) {
    const j = await res.json().catch(() => null)
    throw new TrendTrackError(j?.error?.message || `TrendTrack HTTP ${res.status}`, res.status)
  }
  return res.json() as Promise<T>
}

const bare = (d: string) => d.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "")

type LookupResp = { data?: { shop?: { id?: string; domain?: string } | null; signals?: { monthlyVisits?: number | null } | null; matchType?: string }[] }

// Shop id and current monthly visits for a domain; null when TrendTrack doesn't know the shop.
export async function lookupShop(domain: string): Promise<{ id: string; monthlyVisits: number | null } | null> {
  const j = await tt<LookupResp>(`/v1/lookup?q=${encodeURIComponent(bare(domain))}&type=shop&limit=3`)
  const rows = (j.data || []).filter((r) => r.shop?.id)
  const hit = rows.find((r) => bare(r.shop?.domain || "") === bare(domain)) || rows.find((r) => r.matchType === "exact")
  if (!hit?.shop?.id) return null
  const v = hit.signals?.monthlyVisits
  return { id: hit.shop.id, monthlyVisits: v != null && Number.isFinite(Number(v)) ? Number(v) : null }
}

type ShopResp = { data?: { traffic?: { monthlyVisits?: number | null; growth30d?: number | null; history?: { period: string; value: number }[] | null } | null } }

// Monthly traffic history of a shop (oldest → newest), plus its current visits and 30-day growth.
export async function shopTraffic(shopId: string): Promise<{ monthlyVisits: number | null; growth30d: number | null; history: { month: string; visits: number }[] }> {
  const j = await tt<ShopResp>(`/v1/shops/${encodeURIComponent(shopId)}`)
  const t = j.data?.traffic || {}
  const history = (t.history || [])
    .filter((h) => h && h.period && Number.isFinite(Number(h.value)))
    .map((h) => ({ month: `${String(h.period).slice(0, 7)}-01`, visits: Math.round(Number(h.value)) }))
    .sort((a, b) => a.month.localeCompare(b.month))
  return { monthlyVisits: t.monthlyVisits ?? null, growth30d: t.growth30d ?? null, history }
}
