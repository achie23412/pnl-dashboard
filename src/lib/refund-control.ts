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
// so two partial refunds on one order are checked together.
// Shopify is the truth: when an order was refunded there (also by hand, also while the refund
// still waited for the Owner), the refund becomes "refunded" with Shopify's date and amount.
// A waiting refund with nothing refunded yet stays waiting (the money shouldn't have gone out).
export async function checkRefunds(limit = 40): Promise<{ checked: number; notRefunded: number; refunded: number }> {
  const db = getServiceClient()
  const since = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10)
  const { data } = await db
    .from("cs_refunds")
    .select("id,store,shopify_order_id,amount,approval_status,shopify_status,created_at,refund_date")
    .gte("refund_date", since)
    .neq("shopify_status", "refunded")
    .order("shopify_checked_at", { ascending: true, nullsFirst: true }) // least recently checked first
    .limit(limit)
  const rows = (data || []) as RefundRow[]
  let notRefunded = 0
  let refunded = 0
  const now = () => new Date().toISOString()
  const byOrder = new Map<string, RefundRow[]>()
  for (const r of rows) {
    if (!r.shopify_order_id) {
      await db.from("cs_refunds").update({ shopify_status: "no_order", shopify_checked_at: now() }).eq("id", r.id)
      continue
    }
    const k = `${r.store}::${r.shopify_order_id}`
    byOrder.set(k, [...(byOrder.get(k) || []), r])
  }
  const entries = Array.from(byOrder.entries())
  // 6 orders at a time keeps Shopify's rate limit happy and the page check under a minute
  for (let i = 0; i < entries.length; i += 6) {
    await Promise.all(entries.slice(i, i + 6).map(async ([k, list]) => {
      const [store, orderId] = k.split("::")
      const s = await refundedInShopify(store, orderId)
      if (!s) return
      // everything logged on this order except rejected refunds
      const { data: all } = await db.from("cs_refunds").select("amount,approval_status").eq("store", store).eq("shopify_order_id", orderId)
      const due = (all || [])
        .filter((x: { approval_status: string }) => x.approval_status !== "rejected")
        .reduce((a: number, x: { amount: number }) => a + (Number(x.amount) || 0), 0)
      for (const r of list) {
        const base = { shopify_refunded: s.total, shopify_refunded_at: s.lastAt, shopify_checked_at: now() }
        const waiting = r.approval_status === "waiting" || r.approval_status === "rejected"
        let status: string
        if (s.total > 0 && s.total >= due - 0.01) status = "refunded"
        else if (s.total > 0) status = "partial"
        else if (waiting) status = "checking" // not refunded, and not supposed to be yet
        else status = Date.now() - Date.parse(r.created_at) < 2 * 3600000 ? "checking" : "not_refunded" // 2h for CS
        const upd: Record<string, unknown> = { ...base, shopify_status: status }
        // Refunded in Shopify while still waiting for the Owner: the decision was made in Shopify.
        if (status === "refunded" && r.approval_status === "waiting") {
          upd.approval_status = "approved"
          upd.approved_by = "Refunded in Shopify"
          upd.approved_at = s.lastAt || now()
        }
        if (status === "refunded") refunded++
        if (status === "not_refunded") notRefunded++
        await db.from("cs_refunds").update(upd).eq("id", r.id)
        if (upd.approval_status) {
          await db.from("cs_refund_history").insert({ refund_id: r.id, changed_by: "Shopify check", action: "approved", changes: { approval_status: ["waiting", "approved"], note: "Refunded in Shopify" } })
        }
      }
    }))
  }
  const result = { checked: rows.length, notRefunded, refunded }
  await db.from("sync_status").upsert({ key: "refund-check", ran_at: now(), ok: true, result }, { onConflict: "key" })
  return result
}

// When the Shopify check last ran (null before the first run or without the table).
export async function lastRefundSync(): Promise<{ ran_at: string; result: Record<string, unknown> } | null> {
  const { data } = await getServiceClient().from("sync_status").select("ran_at,result").eq("key", "refund-check").maybeSingle()
  return (data as { ran_at: string; result: Record<string, unknown> } | null) || null
}
