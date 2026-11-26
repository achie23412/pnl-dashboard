// Copies Shopify refunds that CS didn't log by hand into the CS refund log (cs_refunds), so
// CS Reports, Risky Products and refund approvals have data even when nobody logs.
// An imported row says where it came from, guesses the reason from the refund note, and can be
// corrected on the Refunds page. Orders that CS already logged are left alone.
import { SHOPIFY_STORES } from "@/lib/constants"
import { getShopifyToken } from "@/lib/shopify-sessions"
import { getServiceClient } from "@/lib/supabase"
import { fetchLatestEurRates } from "@/lib/currency"
import { approvalFor } from "@/lib/refund-control"

const API = "2026-10"
export const IMPORTED_BY = "Shopify (auto-import)"
const TAG = (id: string) => `[shopify-refund:${id}]`

const Q = `query($q: String!, $after: String) {
  orders(first: 25, query: $q, after: $after, sortKey: UPDATED_AT) {
    nodes {
      legacyResourceId name email test cancelledAt displayFulfillmentStatus
      totalPriceSet { shopMoney { amount currencyCode } }
      refunds(first: 10) {
        legacyResourceId createdAt note
        totalRefundedSet { shopMoney { amount } }
        refundLineItems(first: 20) {
          nodes { quantity priceSet { shopMoney { amount } } lineItem { title variantTitle product { legacyResourceId } } }
        }
      }
    }
    pageInfo { hasNextPage endCursor }
  }
}`

type Refund = {
  legacyResourceId: string
  createdAt: string
  note: string | null
  totalRefundedSet: { shopMoney: { amount: string } }
  refundLineItems: { nodes: { quantity: number; priceSet: { shopMoney: { amount: string } }; lineItem: { title: string; variantTitle: string | null; product: { legacyResourceId: string } | null } }[] }
}
type Order = {
  legacyResourceId: string
  name: string
  email: string | null
  test: boolean
  cancelledAt: string | null
  displayFulfillmentStatus: string | null
  totalPriceSet: { shopMoney: { amount: string; currencyCode: string } }
  refunds: Refund[]
}

async function gql<T>(domain: string, token: string, variables: Record<string, unknown>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`https://${domain}/admin/api/${API}/graphql.json`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
      body: JSON.stringify({ query: Q, variables }),
      cache: "no-store",
      signal: AbortSignal.timeout(20000),
    })
    if (res.status === 429 && attempt < 4) { await new Promise((r) => setTimeout(r, 1500 * (attempt + 1))); continue }
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const j = await res.json()
    if (j.errors?.some((e: { extensions?: { code?: string } }) => e.extensions?.code === "THROTTLED") && attempt < 4) { await new Promise((r) => setTimeout(r, 1500 * (attempt + 1))); continue }
    if (j.errors?.length) throw new Error(j.errors[0].message)
    return j.data as T
  }
}

// Best guess from the refund note and the order; CS can change it.
function guessReason(note: string, o: Order): string {
  const n = note.toLowerCase()
  if (/chargeback|dispute/.test(n)) return "chargeback"
  if (/wrong (item|size|colou?r|product)|verkeerd/.test(n)) return "wrong_item"
  if (/damag|beschadig/.test(n)) return "damaged"
  if (/defect|broken|quality|kapot|kwaliteit|ripped|torn|hole/.test(n)) return "quality_defect"
  if (/size|fit|too (small|big|large|tight)|maat/.test(n)) return "size_fit"
  if (/not (received|arrived|delivered)|lost|never arrived|niet ontvangen/.test(n)) return "not_received"
  if (/late|delay|took too long/.test(n)) return "late_delivery"
  if (/goodwill|discount|compensat|ladder/.test(n)) return "goodwill"
  if (/changed (my|her|his|their)? ?mind|money.?back|30.?day|return/.test(n)) return "changed_mind"
  if (/cancel/.test(n) || (o.cancelledAt && o.displayFulfillmentStatus === "UNFULFILLED")) return "cancel_before_dispatch"
  if (/not as (described|expected)|different|looks? (different|cheap)/.test(n)) return "not_as_described"
  return "other"
}

export async function importShopifyRefunds(days = 45): Promise<{ imported: number; skipped: number; failed: string[] }> {
  const db = getServiceClient()
  const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10)
  const fx = await fetchLatestEurRates()
  let imported = 0
  let skipped = 0
  const failed: string[] = []

  for (const [store, cfg] of Object.entries(SHOPIFY_STORES)) {
    try {
      const token = await getShopifyToken(cfg.domain, cfg.envKey)
      if (!token) throw new Error("no Shopify credentials")
      const orders: Order[] = []
      let after: string | null = null
      for (let page = 0; page < 40; page++) {
        type Page = { orders: { nodes: Order[]; pageInfo: { hasNextPage: boolean; endCursor: string } } }
        const data: Page = await gql<Page>(cfg.domain, token, {
          q: `updated_at:>=${since} AND (financial_status:refunded OR financial_status:partially_refunded)`,
          after,
        })
        orders.push(...data.orders.nodes.filter((o) => !o.test && o.refunds?.length))
        if (!data.orders.pageInfo.hasNextPage) break
        after = data.orders.pageInfo.endCursor
      }
      if (!orders.length) continue

      // What's already in the log for these orders
      const ids = orders.map((o) => o.legacyResourceId)
      const { data: logged, error } = await db.from("cs_refunds").select("shopify_order_id,logged_by,reason_note").eq("store", store).in("shopify_order_id", ids)
      if (error) throw new Error(error.message)
      const byHand = new Set((logged || []).filter((r) => r.logged_by !== IMPORTED_BY).map((r) => String(r.shopify_order_id)))
      const notes = (logged || []).map((r) => String(r.reason_note || "")).join(" ")

      const rows: Record<string, unknown>[] = []
      for (const o of orders) {
        if (byHand.has(o.legacyResourceId)) { skipped += o.refunds.length; continue }
        const total = Number(o.totalPriceSet.shopMoney.amount) || 0
        const currency = o.totalPriceSet.shopMoney.currencyCode
        for (const r of o.refunds) {
          const amount = Math.round((Number(r.totalRefundedSet.shopMoney.amount) || 0) * 100) / 100
          if (amount <= 0 || r.createdAt.slice(0, 10) < since) continue
          if (notes.includes(TAG(r.legacyResourceId))) { skipped++; continue }
          const rate = currency === "USD" ? fx.USD : currency === "GBP" ? fx.GBP : 1
          const amountEur = Math.round((amount / rate) * 100) / 100
          // Already paid out in Shopify, so above the limit it's flagged for the Owner, not "waiting"
          const approval = approvalFor(amountEur, false) === "waiting" ? "flagged" : "not_needed"
          const note = (r.note || "").trim()
          rows.push({
            store,
            refund_date: r.createdAt.slice(0, 10),
            order_number: o.name.startsWith("#") ? o.name : `#${o.name}`,
            shopify_order_id: o.legacyResourceId,
            customer_email: o.email,
            refund_type: total > 0 && amount >= total - 0.01 ? "full" : "partial",
            reason: guessReason(note, o),
            reason_note: `${note ? `Shopify note: ${note}. ` : ""}Imported from Shopify, reason guessed: check it. ${TAG(r.legacyResourceId)}`,
            percentage: total > 0 ? Math.round((amount / total) * 1000) / 10 : null,
            amount,
            currency,
            order_total: total || null,
            items: r.refundLineItems.nodes.map((li) => ({
              title: li.lineItem.title,
              variant: li.lineItem.variantTitle,
              qty: li.quantity,
              price: li.quantity ? Math.round(((Number(li.priceSet.shopMoney.amount) || 0) / li.quantity) * 100) / 100 : 0,
              product_id: li.lineItem.product?.legacyResourceId || null,
            })),
            logged_by: IMPORTED_BY,
            amount_eur: amountEur,
            approval_status: approval,
            shopify_status: "refunded",
            shopify_refunded: amount,
            shopify_refunded_at: r.createdAt,
            shopify_checked_at: new Date().toISOString(),
          })
        }
      }
      if (rows.length) {
        const ins = await db.from("cs_refunds").insert(rows)
        if (ins.error) throw new Error(ins.error.message)
        imported += rows.length
      }
    } catch (e) {
      failed.push(`${store}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  return { imported, skipped, failed }
}
