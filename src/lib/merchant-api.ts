// Google Merchant API (Merchant Center) with a service account. The key is the JSON file of a
// Google Cloud service account, saved in Vercel as GOOGLE_MERCHANT_SA_JSON (raw JSON or base64).
// The service account must be a user in each Merchant Center account, and the Cloud project must
// be registered once per account (registerGcp below).
import { createSign } from "crypto"

const BASE = "https://merchantapi.googleapis.com"
const SCOPE = "https://www.googleapis.com/auth/content"

interface ServiceAccount { client_email: string; private_key: string }

function serviceAccount(): ServiceAccount | null {
  const raw = (process.env.GOOGLE_MERCHANT_SA_JSON || "").trim()
  if (!raw) return null
  try {
    const json = raw.startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8")
    const sa = JSON.parse(json)
    return sa.client_email && sa.private_key ? { client_email: sa.client_email, private_key: sa.private_key } : null
  } catch {
    return null
  }
}

export const merchantConfigured = () => serviceAccount() != null
export const serviceAccountEmail = () => serviceAccount()?.client_email ?? null

const b64url = (s: string | Buffer) => (typeof s === "string" ? Buffer.from(s, "utf8") : s).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_")

let cached: { token: string; exp: number } | null = null
async function accessToken(): Promise<string> {
  if (cached && cached.exp > Date.now() + 60000) return cached.token
  const sa = serviceAccount()
  if (!sa) throw new Error("GOOGLE_MERCHANT_SA_JSON is not set in Vercel")
  const iat = Math.floor(Date.now() / 1000)
  const unsigned = `${b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${b64url(JSON.stringify({ iss: sa.client_email, scope: SCOPE, aud: "https://oauth2.googleapis.com/token", iat, exp: iat + 3600 }))}`
  const signer = createSign("RSA-SHA256")
  signer.update(unsigned)
  const jwt = `${unsigned}.${b64url(signer.sign(sa.private_key))}`
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=${encodeURIComponent("urn:ietf:params:oauth:grant-type:jwt-bearer")}&assertion=${jwt}`,
    cache: "no-store",
  })
  const j = await res.json().catch(() => ({}))
  if (!res.ok || !j.access_token) throw new Error(`Google sign-in failed: ${j.error_description || j.error || res.status}`)
  cached = { token: j.access_token, exp: Date.now() + (Number(j.expires_in) || 3600) * 1000 }
  return cached.token
}

async function call<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const token = await accessToken()
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${BASE}${path}`, {
      method: init?.method || "GET",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: init?.body ? JSON.stringify(init.body) : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(25000),
    })
    if ((res.status === 429 || res.status === 503) && attempt < 3) { await new Promise((r) => setTimeout(r, 1500 * (attempt + 1))); continue }
    const j = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(`Merchant API ${res.status}: ${j?.error?.message || "request failed"}`)
    return j as T
  }
}

export interface MerchantIssue {
  code?: string
  severity?: string // NOT_IMPACTED | DEMOTED | DISAPPROVED
  resolution?: string
  attribute?: string
  reportingContext?: string
  description?: string
  detail?: string
  documentation?: string
  applicableCountries?: string[]
}
export interface MerchantProduct {
  name?: string
  offerId?: string
  feedLabel?: string
  productAttributes?: { title?: string; price?: { amountMicros?: string; currencyCode?: string } }
  attributes?: { title?: string; price?: { amountMicros?: string; currencyCode?: string } } // older API versions
  productStatus?: { itemLevelIssues?: MerchantIssue[] }
}

// All feed items of a Merchant Center account, with their issues
export async function listProducts(merchantId: string, maxPages = 40): Promise<MerchantProduct[]> {
  const out: MerchantProduct[] = []
  let pageToken = ""
  for (let i = 0; i < maxPages; i++) {
    const j = await call<{ products?: MerchantProduct[]; nextPageToken?: string }>(
      `/products/v1/accounts/${encodeURIComponent(merchantId)}/products?pageSize=1000${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""}`,
    )
    out.push(...(j.products || []))
    if (!j.nextPageToken) break
    pageToken = j.nextPageToken
  }
  return out
}

export interface PriceInsight {
  offerId: string
  title: string | null
  price: number | null
  suggestedPrice: number | null
  currency: string | null
  impressions: number | null
  clicks: number | null
  conversions: number | null
  effectiveness: string | null
}

const micros = (p?: { amountMicros?: string | number } | null) => (p?.amountMicros != null ? Number(p.amountMicros) / 1e6 : null)
const num = (v: unknown) => (v == null || v === "" ? null : Number(v))

// Google's price suggestions (Merchant Center "price insights")
export async function listPriceInsights(merchantId: string, maxPages = 20): Promise<PriceInsight[]> {
  const query = "SELECT id, offer_id, title, price, suggested_price, predicted_impressions_change_fraction, predicted_clicks_change_fraction, predicted_conversions_change_fraction, effectiveness FROM price_insights_product_view"
  const out: PriceInsight[] = []
  let pageToken = ""
  for (let i = 0; i < maxPages; i++) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const j = await call<{ results?: { priceInsightsProductView?: any }[]; nextPageToken?: string }>(
      `/reports/v1/accounts/${encodeURIComponent(merchantId)}/reports:search`,
      { method: "POST", body: { query, pageSize: 1000, ...(pageToken ? { pageToken } : {}) } },
    )
    for (const r of j.results || []) {
      const v = r.priceInsightsProductView
      if (!v?.offerId) continue
      out.push({
        offerId: String(v.offerId),
        title: v.title ?? null,
        price: micros(v.price),
        suggestedPrice: micros(v.suggestedPrice),
        currency: v.suggestedPrice?.currencyCode || v.price?.currencyCode || null,
        impressions: num(v.predictedImpressionsChangeFraction),
        clicks: num(v.predictedClicksChangeFraction),
        conversions: num(v.predictedConversionsChangeFraction),
        effectiveness: v.effectiveness ?? null,
      })
    }
    if (!j.nextPageToken) break
    pageToken = j.nextPageToken
  }
  return out
}

// One-time: link the Google Cloud project to a Merchant Center account (Merchant API requirement).
// developerEmail (optional) becomes an API developer contact on that account.
export async function registerGcp(merchantId: string, developerEmail: string | null) {
  return call<Record<string, unknown>>(
    `/accounts/v1/accounts/${encodeURIComponent(merchantId)}/developerRegistration:registerGcp`,
    { method: "POST", body: developerEmail ? { developerEmail } : {} },
  )
}

// shopify_GB_<productId>_<variantId> -> ids (other feed apps: no ids)
export function shopifyIds(offerId: string): { productId: string | null; variantId: string | null } {
  const m = offerId.match(/^shopify_[a-z]+_(\d+)_(\d+)$/i)
  return m ? { productId: m[1], variantId: m[2] } : { productId: null, variantId: null }
}

export function productTitle(p: MerchantProduct) {
  return p.productAttributes?.title || p.attributes?.title || null
}
