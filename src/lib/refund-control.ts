// Refund control (server): approval rule, Shopify check of logged refunds, open disputes.
import { SHOPIFY_STORES } from "@/lib/constants"
import { getShopifyToken } from "@/lib/shopify-sessions"
import { getServiceClient } from "@/lib/supabase"

export const APPROVAL_LIMIT_EUR = 100 // above this a refund waits for the Owner (guide: Refunds)

// Status for a new or edited refund.
export function approvalFor(amountEur: number | null, threat: boolean, current?: string | null): string {
  if (current === "approved" || current === "rejected") return current
  if (threat) return "flagged" // refund in full at once, owner is informed
  return (amountEur ?? 0) > APPROVAL_LIMIT_EUR ? "waiting" : "not_needed"
}

const API = "2024-10"

async function tokenFor(store: string) {
  const cfg = SHOPIFY_STORES[store]
  if (!cfg) return null
  const token = await getShopifyToken(cfg.domain, cfg.envKey)
  return token ? { domain: cfg.domain, token } : null
}

// Open bank disputes on an order (Shopify GraphQL). Open = still to be decided.
export async function openDisputes(store: string, orderId: string): Promise<{ status: string; type: string }[]> {
  const t = await tokenFor(store)
  if (!t || !orderId) return []
  const res = await fetch(`https://${t.domain}/admin/api/${API}/graphql.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": t.token },
    body: JSON.stringify({ query: `query($id: ID!) { order(id: $id) { disputes { status initiatedAs } } }`, variables: { id: `gid://shopify/Order/${orderId}` } }),
    cache: "no-store",
    signal: AbortSignal.timeout(10000),
  }).catch(() => null)
  if (!res?.ok) return []
  const j = await res.json().catch(() => null)
  const list = (j?.data?.order?.disputes || []) as { status: string; initiatedAs: string }[]
  return list
    .filter((d) => ["NEEDS_RESPONSE", "UNDER_REVIEW", "OPEN"].includes(String(d.status).toUpperCase()))
    .map((d) => ({ status: d.status, type: d.initiatedAs }))
}

// What Shopify actually refunded on an order (successful refund transactions).
async function refundedInShopify(store: string, orderId: string): Promise<{ total: number; lastAt: string | null } | null> {
  const t = await tokenFor(store)
  if (!t) return null
  const res = await fetch(`https://${t.domain}/admin/api/${API}/orders/${orderId}/refunds.json`, {
    headers: { "X-Shopify-Access-Token": t.token },
    cache: "no-store",
    signal: AbortSignal.timeout(10000),
  }).catch(() => null)
  if (!res?.ok) return null
  const j = await res.json()
  let total = 0
  let lastAt: string | null = null
  for (const r of j.refunds || []) {
    for (const tx of r.transactions || []) {
      if (tx.kind === "refund" && tx.status === "success") {
        total += parseFloat(tx.amount) || 0
        if (!lastAt || tx.created_at > lastAt) lastAt = tx.created_at
      }
    }
  }
  return { total: Math.round(total * 100) / 100, lastAt }
}

type RefundRow = {
  id: number
  store: string
  shopify_order_id: string | null
  amount: number
  approval_status: string
  shopify_status: string
  created_at: string
  refund_date: string
}

// Compare logged refunds with Shopify. All logged refunds on the same order are added up,
// so two partial refunds on one order are checked together. Waiting/rejected ones are skipped:
// the money should NOT have gone out yet.
export async function checkRefunds(limit = 40): Promise<{ checked: number; notRefunded: number }> {
  const db = getServiceClient()
  const since = new Date(Date.now() - 45 * 86400000).toISOString().slice(0, 10)
  const { data } = await db
    .from("cs_refunds")
    .select("id,store,shopify_order_id,amount,approval_status,shopify_status,created_at,refund_date")
    .gte("refund_date", since)
    .neq("shopify_status", "refunded")
    .order("refund_date", { ascending: false })
    .limit(limit)
  const rows = (data || []) as RefundRow[]
  let notRefunded = 0
  const byOrder = new Map<string, RefundRow[]>()
  for (const r of rows) {
    if (!r.shopify_order_id) {
      await db.from("cs_refunds").update({ shopify_status: "no_order", shopify_checked_at: new Date().toISOString() }).eq("id", r.id)
      continue
    }
    const k = `${r.store}::${r.shopify_order_id}`
    byOrder.set(k, [...(byOrder.get(k) || []), r])
  }
  for (const [k, list] of Array.from(byOrder.entries())) {
    const [store, orderId] = k.split("::")
    const s = await refundedInShopify(store, orderId)
    if (!s) continue
    // all refunds logged on this order that should have gone out
    const { data: all } = await db.from("cs_refunds").select("amount,approval_status").eq("store", store).eq("shopify_order_id", orderId)
    const due = (all || [])
      .filter((x: { approval_status: string }) => x.approval_status !== "waiting" && x.approval_status !== "rejected")
      .reduce((a: number, x: { amount: number }) => a + (Number(x.amount) || 0), 0)
    for (const r of list) {
      if (r.approval_status === "waiting" || r.approval_status === "rejected") {
        await db.from("cs_refunds").update({ shopify_status: "checking", shopify_refunded: s.total, shopify_checked_at: new Date().toISOString() }).eq("id", r.id)
        continue
      }
      // Give CS two hours after logging before calling it "not refunded".
      const fresh = Date.now() - Date.parse(r.created_at) < 2 * 3600000
      const status = s.total >= due - 0.01 && due > 0 ? "refunded" : s.total > 0 ? "partial" : fresh ? "checking" : "not_refunded"
      if (status === "not_refunded") notRefunded++
      await db
        .from("cs_refunds")
        .update({ shopify_status: status, shopify_refunded: s.total, shopify_refunded_at: s.lastAt, shopify_checked_at: new Date().toISOString() })
        .eq("id", r.id)
    }
  }
  return { checked: rows.length, notRefunded }
}
