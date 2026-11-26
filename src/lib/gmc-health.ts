// GMC Health for the Google stores: daily sync of Merchant Center issues and price suggestions,
// and every feed change made from the dashboard (drafts, publishes, prices, titles) with the
// daily limit: at most feed_change_pct % of the store's feed products per day (and at most
// max_drafts_per_day drafts). Changes over the limit are queued for the next day.
import { getServiceClient } from "./supabase"
import { listProducts, listPriceInsights, shopifyIds, productTitle } from "./merchant-api"
import { SHOPIFY_STORES } from "./constants"
import { getShopifyToken } from "./shopify-sessions"

export const GMC_STORES = ["Susan & Allen", "Carter & Collins", "Walsh & Farley"]
export const amsterdamDay = (d = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam" }).format(d)
export function addDays(day: string, n: number) {
  const d = new Date(`${day}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
// Monday of the week of `day` (the weekly disapproved check)
export function mondayOf(day: string) {
  const dow = new Date(`${day}T12:00:00Z`).getUTCDay()
  return addDays(day, -((dow + 6) % 7))
}

export interface GmcSettings {
  store: string
  merchant_id: string | null
  max_cog_pct: number
  feed_change_pct: number
  max_drafts_per_day: number
  feed_products: number | null
  feed_items: number | null
  last_sync_at: string | null
  last_sync_error: string | null
}

export async function getSettings(): Promise<GmcSettings[]> {
  const { data, error } = await getServiceClient().from("gmc_settings").select("*")
  if (error) throw new Error(error.message)
  const rows = (data || []) as GmcSettings[]
  return GMC_STORES.map((s) => rows.find((r) => r.store === s) || {
    store: s, merchant_id: null, max_cog_pct: 30, feed_change_pct: 10, max_drafts_per_day: 50,
    feed_products: null, feed_items: null, last_sync_at: null, last_sync_error: null,
  })
}

export const isCounterfeit = (i: { issue_code?: string | null; description?: string | null }) =>
  /counterfeit/i.test(`${i.issue_code || ""} ${i.description || ""}`)

// Daily limit in products. 0 = feed size not known yet (never synced).
export const dailyLimit = (s: GmcSettings) =>
  s.feed_products ? Math.max(1, Math.floor((s.feed_products * Number(s.feed_change_pct)) / 100)) : 0

interface IssueRow {
  store: string; offer_id: string; issue_code: string; product_id: string | null; variant_id: string | null
  title: string | null; description: string | null; detail: string | null; resolution: string | null
  severity: string | null; attribute: string | null; countries: string[]; documentation: string | null
  first_seen: string; last_seen: string; resolved_on: string | null
}

export async function syncStore(s: GmcSettings) {
  if (!s.merchant_id) return { store: s.store, skipped: "No Merchant Center ID" }
  const db = getServiceClient()
  const today = amsterdamDay()
  const products = await listProducts(s.merchant_id)

  const productKeys: Record<string, 1> = {}
  const current: Record<string, Omit<IssueRow, "first_seen">> = {}
  for (const p of products) {
    const offer = p.offerId || (p.name || "").split("~").pop() || ""
    if (!offer) continue
    const ids = shopifyIds(offer)
    productKeys[ids.productId || offer] = 1
    for (const iss of p.productStatus?.itemLevelIssues || []) {
      if (iss.severity !== "DISAPPROVED" && iss.severity !== "DEMOTED") continue
      const code = iss.code || iss.description || "unknown"
      const key = `${offer}|${code}`
      const countries = iss.applicableCountries || []
      const ex = current[key]
      if (ex) {
        for (const c of countries) if (ex.countries.indexOf(c) < 0) ex.countries.push(c)
        if (iss.severity === "DISAPPROVED") ex.severity = "DISAPPROVED"
        continue
      }
      current[key] = {
        store: s.store, offer_id: offer, issue_code: code, product_id: ids.productId, variant_id: ids.variantId,
        title: productTitle(p), description: iss.description || null, detail: iss.detail || null,
        resolution: iss.resolution || null, severity: iss.severity || null, attribute: iss.attribute || null,
        countries: countries.slice(), documentation: iss.documentation || null, last_seen: today, resolved_on: null,
      }
    }
  }

  // Keep "since when" for issues that were already open
  const openSince: Record<string, string> = {}
  for (let i = 0; ; i += 1000) {
    const { data, error } = await db.from("gmc_issues").select("offer_id,issue_code,first_seen")
      .eq("store", s.store).is("resolved_on", null).range(i, i + 999)
    if (error) throw new Error(error.message)
    for (const r of data || []) openSince[`${r.offer_id}|${r.issue_code}`] = r.first_seen
    if (!data || data.length < 1000) break
  }
  const rows: IssueRow[] = Object.keys(current).map((k) => ({ ...current[k], first_seen: openSince[k] || today }))
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await db.from("gmc_issues").upsert(rows.slice(i, i + 500), { onConflict: "store,offer_id,issue_code" })
    if (error) throw new Error(error.message)
  }
  const { data: resolved, error: resErr } = await db.from("gmc_issues").update({ resolved_on: today })
    .eq("store", s.store).is("resolved_on", null).lt("last_seen", today).select("offer_id")
  if (resErr) throw new Error(resErr.message)

  // Google's "lower price" suggestions; not every account/country gets them
  let insights = 0
  let insightsError: string | null = null
  try {
    const list = (await listPriceInsights(s.merchant_id)).filter((x) => x.price != null && x.suggestedPrice != null && x.suggestedPrice < x.price)
    await db.from("gmc_price_insights").delete().eq("store", s.store)
    const ins = list.map((x) => {
      const ids = shopifyIds(x.offerId)
      return {
        store: s.store, offer_id: x.offerId, product_id: ids.productId, variant_id: ids.variantId, title: x.title,
        price: x.price, suggested_price: x.suggestedPrice, currency: x.currency,
        predicted_impressions_change: x.impressions, predicted_clicks_change: x.clicks,
        predicted_conversions_change: x.conversions, effectiveness: x.effectiveness, fetched_on: today,
      }
    })
    for (let i = 0; i < ins.length; i += 500) {
      const { error } = await db.from("gmc_price_insights").insert(ins.slice(i, i + 500))
      if (error) throw new Error(error.message)
    }
    insights = ins.length
  } catch (e) {
    insightsError = e instanceof Error ? e.message : String(e)
  }

  await db.from("gmc_settings").update({
    feed_products: Object.keys(productKeys).length, feed_items: products.length,
    last_sync_at: new Date().toISOString(), last_sync_error: insightsError ? `Price suggestions: ${insightsError}` : null,
  }).eq("store", s.store)

  return {
    store: s.store, items: products.length, products: Object.keys(productKeys).length,
    open_issues: rows.length, new_issues: rows.filter((r) => r.first_seen === today && !openSince[`${r.offer_id}|${r.issue_code}`]).length,
    resolved: (resolved || []).length, price_suggestions: insights, price_suggestions_error: insightsError,
  }
}

export async function markSyncError(store: string, message: string) {
  await getServiceClient().from("gmc_settings").update({ last_sync_at: new Date().toISOString(), last_sync_error: message }).eq("store", store)
}

// ---- Shopify changes ----

async function shopify<T>(store: string, path: string, init?: { method: string; body: unknown }): Promise<T> {
  const cfg = SHOPIFY_STORES[store]
  if (!cfg) throw new Error(`Unknown store ${store}`)
  const token = await getShopifyToken(cfg.domain, cfg.envKey)
  if (!token) throw new Error(`No Shopify access for ${store}`)
  const res = await fetch(`https://${cfg.domain}/admin/api/2024-10/${path}`, {
    method: init?.method || "GET",
    headers: { "X-Shopify-Access-Token": token, "Content-Type": "application/json" },
    body: init ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  })
  const j = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`Shopify ${res.status}: ${JSON.stringify(j?.errors ?? j).slice(0, 160)}`)
  return j as T
}

// Shopify status of products (active / draft / archived), by product id
export async function productStatuses(store: string, ids: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  for (let i = 0; i < ids.length; i += 250) {
    const j = await shopify<{ products?: { id: number; status: string }[] }>(store, `products.json?ids=${ids.slice(i, i + 250).join(",")}&fields=id,status&limit=250`)
    for (const p of j.products || []) out[String(p.id)] = p.status
  }
  return out
}

export async function accessScopes(store: string): Promise<string[]> {
  const cfg = SHOPIFY_STORES[store]
  const token = cfg ? await getShopifyToken(cfg.domain, cfg.envKey) : null
  if (!cfg || !token) return []
  const res = await fetch(`https://${cfg.domain}/admin/oauth/access_scopes.json`, { headers: { "X-Shopify-Access-Token": token }, cache: "no-store" })
  const j = await res.json().catch(() => ({}))
  return (j.access_scopes || []).map((s: { handle: string }) => s.handle)
}

export type ChangeKind = "draft" | "publish" | "price" | "title"
export interface ChangeRequest {
  store: string
  product_id: string
  variant_id?: string | null
  title?: string | null
  kind: ChangeKind
  new_value?: string | null // price or title
  reason: string
}

async function applyChange(c: ChangeRequest): Promise<{ old_value: string | null; new_value: string | null }> {
  if (c.kind === "draft" || c.kind === "publish") {
    const target = c.kind === "draft" ? "draft" : "active"
    const j = await shopify<{ product: { status: string } }>(c.store, `products/${c.product_id}.json?fields=id,status`)
    const old = j.product?.status
    if (c.kind === "draft" && old !== "active") throw new Error(`Not live in Shopify (status: ${old || "unknown"})`)
    if (old === target) return { old_value: old, new_value: target }
    await shopify(c.store, `products/${c.product_id}.json`, { method: "PUT", body: { product: { id: Number(c.product_id), status: target } } })
    return { old_value: old || null, new_value: target }
  }
  if (c.kind === "price") {
    if (!c.variant_id || !c.new_value || !(Number(c.new_value) > 0)) throw new Error("Variant and new price needed")
    const j = await shopify<{ variant: { price: string } }>(c.store, `variants/${c.variant_id}.json`)
    await shopify(c.store, `variants/${c.variant_id}.json`, { method: "PUT", body: { variant: { id: Number(c.variant_id), price: Number(c.new_value).toFixed(2) } } })
    return { old_value: j.variant?.price ?? null, new_value: Number(c.new_value).toFixed(2) }
  }
  if (!c.new_value) throw new Error("New title needed")
  const j = await shopify<{ product: { title: string } }>(c.store, `products/${c.product_id}.json?fields=id,title`)
  await shopify(c.store, `products/${c.product_id}.json`, { method: "PUT", body: { product: { id: Number(c.product_id), title: c.new_value } } })
  return { old_value: j.product?.title ?? null, new_value: c.new_value }
}

interface Usage { products: Record<string, 1>; drafts: number }
async function usageFor(store: string, day: string): Promise<Usage> {
  const { data, error } = await getServiceClient().from("feed_changes").select("product_id,kind")
    .eq("store", store).eq("planned_for", day).eq("status", "applied")
  if (error) throw new Error(error.message)
  const u: Usage = { products: {}, drafts: 0 }
  for (const r of data || []) { u.products[r.product_id] = 1; if (r.kind === "draft") u.drafts++ }
  return u
}
export async function usageToday(store: string) {
  const u = await usageFor(store, amsterdamDay())
  return { changed: Object.keys(u.products).length, drafts: u.drafts }
}

const fits = (u: Usage, s: GmcSettings, c: { product_id: string; kind: string }) =>
  (u.products[c.product_id] === 1 || Object.keys(u.products).length < dailyLimit(s)) &&
  (c.kind !== "draft" || u.drafts < s.max_drafts_per_day)

async function logPriceChange(c: ChangeRequest, old: string | null, now: string | null) {
  const o = Number(old), n = Number(now)
  if (!(o > 0) || !(n > 0)) return
  // Same table as Price Suggestions, so its 7-day cooldown sees this change
  await getServiceClient().from("price_changes").insert({
    product_name: c.title || c.product_id, store: c.store, old_price: o, new_price: n,
    change_pct: Math.round(((n - o) / o) * 1000) / 10, rule: "gmc_price_suggestion", status: "applied", applied_at: new Date().toISOString(),
  }).then(() => undefined, () => undefined)
}

// ---- The 10% rule for every other dashboard feature that changes a Google store's feed ----
// (listing title fixes, publishing, imports). Check before the change, log after it, so the
// daily counter on GMC Health includes everything the dashboard changes.
export const isGoogleStore = (store: string) => GMC_STORES.indexOf(store) >= 0

export async function feedRoom(store: string, productId: string, kind: ChangeKind): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isGoogleStore(store)) return { ok: true }
  const s = (await getSettings()).find((x) => x.store === store)
  const limit = s ? dailyLimit(s) : 0
  if (!s || !limit) return { ok: false, error: `${store}: the daily feed limit isn't known yet (GMC Health hasn't synced). Sync GMC Health first.` }
  const u = await usageFor(store, amsterdamDay())
  if (!fits(u, s, { product_id: productId, kind })) {
    const used = Object.keys(u.products).length
    return { ok: false, error: `${store}: today's feed change limit is used (${used}/${limit} products = ${s.feed_change_pct}% of the feed${kind === "draft" ? `, drafts ${u.drafts}/${s.max_drafts_per_day}` : ""}). Try again tomorrow.` }
  }
  return { ok: true }
}

export async function logFeedChange(c: { store: string; product_id: string; variant_id?: string | null; title?: string | null; kind: ChangeKind; old_value?: string | null; new_value?: string | null; reason: string }, by = "dashboard") {
  if (!isGoogleStore(c.store)) return
  await getServiceClient().from("feed_changes").insert({
    store: c.store, product_id: c.product_id, variant_id: c.variant_id || null, title: c.title || null, kind: c.kind,
    old_value: c.old_value ?? null, new_value: c.new_value ?? null, reason: c.reason, status: "applied",
    planned_for: amsterdamDay(), applied_at: new Date().toISOString(), created_by: by,
  }).then(() => undefined, () => undefined)
}

export interface ChangeResult { product_id: string; status: "applied" | "queued" | "failed" | "skipped"; planned_for?: string; error?: string }

// Apply now when the store still has room today, otherwise queue for tomorrow
export async function requestChanges(reqs: ChangeRequest[], by: string): Promise<ChangeResult[]> {
  const db = getServiceClient()
  const today = amsterdamDay()
  const settings = await getSettings()
  const usage: Record<string, Usage> = {}
  const out: ChangeResult[] = []
  for (const c of reqs) {
    const s = settings.find((x) => x.store === c.store)
    if (!s) { out.push({ product_id: c.product_id, status: "failed", error: "Not a Google store" }); continue }
    if (!dailyLimit(s)) { out.push({ product_id: c.product_id, status: "failed", error: "Sync GMC first, so the feed size (and the daily limit) is known" }); continue }
    const { data: open } = await db.from("feed_changes").select("id").eq("store", c.store).eq("product_id", c.product_id)
      .eq("kind", c.kind).eq("status", "queued").limit(1)
    if (open && open.length) { out.push({ product_id: c.product_id, status: "skipped", error: "Already queued" }); continue }
    const u = usage[c.store] || (usage[c.store] = await usageFor(c.store, today))
    const base = { store: c.store, product_id: c.product_id, variant_id: c.variant_id || null, title: c.title || null, kind: c.kind, reason: c.reason, created_by: by }
    if (!fits(u, s, c)) {
      const planned = addDays(today, 1)
      await db.from("feed_changes").insert({ ...base, new_value: c.new_value || null, status: "queued", planned_for: planned })
      out.push({ product_id: c.product_id, status: "queued", planned_for: planned })
      continue
    }
    try {
      const r = await applyChange(c)
      await db.from("feed_changes").insert({ ...base, ...r, status: "applied", planned_for: today, applied_at: new Date().toISOString() })
      if (c.kind === "price") await logPriceChange(c, r.old_value, r.new_value)
      u.products[c.product_id] = 1
      if (c.kind === "draft") u.drafts++
      out.push({ product_id: c.product_id, status: "applied", planned_for: today })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      await db.from("feed_changes").insert({ ...base, new_value: c.new_value || null, status: "failed", planned_for: today, error: msg })
      out.push({ product_id: c.product_id, status: "failed", error: msg })
    }
  }
  return out
}

// Cron: apply queued changes that are due, as far as today's limit allows; the rest move a day
export async function processQueue() {
  const db = getServiceClient()
  const today = amsterdamDay()
  const settings = await getSettings()
  const { data, error } = await db.from("feed_changes").select("*").eq("status", "queued").lte("planned_for", today).order("created_at")
  if (error) throw new Error(error.message)
  const usage: Record<string, Usage> = {}
  let applied = 0, moved = 0, failed = 0
  for (const row of data || []) {
    const s = settings.find((x) => x.store === row.store)
    const u = usage[row.store] || (usage[row.store] = await usageFor(row.store, today))
    if (!s || !dailyLimit(s) || !fits(u, s, row)) {
      await db.from("feed_changes").update({ planned_for: addDays(today, 1) }).eq("id", row.id)
      moved++
      continue
    }
    const c: ChangeRequest = { store: row.store, product_id: row.product_id, variant_id: row.variant_id, title: row.title, kind: row.kind, new_value: row.new_value, reason: row.reason }
    try {
      const r = await applyChange(c)
      await db.from("feed_changes").update({ ...r, status: "applied", planned_for: today, applied_at: new Date().toISOString() }).eq("id", row.id)
      if (c.kind === "price") await logPriceChange(c, r.old_value, r.new_value)
      u.products[row.product_id] = 1
      if (row.kind === "draft") u.drafts++
      applied++
    } catch (e) {
      await db.from("feed_changes").update({ status: "failed", planned_for: today, error: e instanceof Error ? e.message : String(e) }).eq("id", row.id)
      failed++
    }
  }
  return { applied, moved_to_tomorrow: moved, failed }
}

// Short "how to fix" per type of GMC issue (my notes, based on Google's help pages; Google's own
// resolution text and help link are shown next to it)
export function howToFix(code: string, description: string | null): string {
  const t = `${code} ${description || ""}`.toLowerCase()
  if (/counterfeit/.test(t)) return "Policy: counterfeit goods. Don't appeal unless you can prove the item is genuine. Draft the product (Draft now tab); repeated strikes can suspend the account."
  if (/price/.test(t) && /mismatch|differ|incorrect/.test(t)) return "Feed price differs from the product page. Check the sale/compare-at price, currency and the Simprosys sync, then wait for Google to re-crawl."
  if (/availability|out of stock|stock/.test(t)) return "Stock on the page and in the feed differ. Check Shopify inventory and the Simprosys sync."
  if (/image/.test(t)) return "Replace the main image: no text, logos, watermarks or borders; at least 250×250 px for apparel; product clearly shown."
  if (/gtin|identifier|mpn|brand/.test(t)) return "Product identifiers: add brand + MPN, or set identifier_exists = no in Simprosys when there is no GTIN."
  if (/landing|page|crawl|url|redirect/.test(t)) return "Product page can't be reached: check that it loads, isn't password-protected and doesn't redirect to another page."
  if (/shipping|delivery/.test(t)) return "Shipping is missing or wrong for this country. Check the shipping settings in Merchant Center."
  if (/size|color|colour|gender|age_group|age group|apparel/.test(t)) return "Apparel attribute missing: fill size, colour, gender and age group in Simprosys."
  if (/title|description|capital|promotional/.test(t)) return "Title or description breaks the rules: no promo words, ALL CAPS or claims. Fix it in Shopify/Simprosys."
  if (/policy|misrepresentation|claim|restricted|adult|dangerous/.test(t)) return "Policy issue: read Google's note below, fix the product page or listing, then request a review in Merchant Center."
  return "See Google's resolution and help link below."
}
