import { NextRequest, NextResponse } from "next/server"
import { SHOPIFY_STORES } from "@/lib/constants"
import { getShopifyToken } from "@/lib/shopify-sessions"
import { getServiceClient } from "@/lib/supabase"

export const dynamic = "force-dynamic"
export const maxDuration = 60

const API = "2026-10"

export type Dispute = {
  key: string // `${store}:${id}`
  store: string
  id: string
  type: "CHARGEBACK" | "INQUIRY" | string
  status: string // NEEDS_RESPONSE, UNDER_REVIEW, CHARGE_REFUNDED, ACCEPTED, WON, LOST
  reason: string | null
  network_reason_code: string | null
  amount: number | null
  currency: string | null
  initiated_at: string | null
  evidence_due_by: string | null
  evidence_sent_on: string | null
  finalized_on: string | null
  order_name: string | null
  order_id: string | null
  admin_url: string | null
  source: "payments" | "orders"
  // our case notes (dispute_cases)
  decision: string | null
  evidence: Record<string, boolean>
  note: string | null
  submitted_at: string | null
}

type Gql = { data?: Record<string, unknown>; errors?: { message: string }[] }

async function gql(domain: string, token: string, query: string, variables: Record<string, unknown> = {}): Promise<Gql> {
  const res = await fetch(`https://${domain}/admin/api/${API}/graphql.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
    body: JSON.stringify({ query, variables }),
    cache: "no-store",
  })
  if (!res.ok) return { errors: [{ message: `HTTP ${res.status}` }] }
  return res.json()
}

const PAYMENTS_Q = `query { shopifyPaymentsAccount { disputes(first: 100) { nodes {
  id status type initiatedAt evidenceDueBy evidenceSentOn finalizedOn
  amount { amount currencyCode } reasonDetails { reason networkReasonCode }
  order { id name }
} } } }`

const ORDERS_Q = `query($q: String!, $after: String) { orders(first: 250, query: $q, after: $after, sortKey: CREATED_AT, reverse: true) {
  nodes { id name createdAt disputes { id initiatedAs status } }
  pageInfo { hasNextPage endCursor }
} }`

async function storeDisputes(store: string, since: string) {
  const cfg = SHOPIFY_STORES[store]
  const token = await getShopifyToken(cfg.domain, cfg.envKey).catch(() => null)
  if (!token) return { store, disputes: [] as Dispute[], orders90d: null as number | null, source: null, error: "no Shopify token" }
  const admin = cfg.domain.replace(".myshopify.com", "")
  const adminUrl = (orderGid?: string | null) => (orderGid ? `https://admin.shopify.com/store/${admin}/orders/${orderGid.split("/").pop()}` : null)

  const count = await gql(cfg.domain, token, `query($q: String!) { ordersCount(query: $q, limit: null) { count } }`, { q: `created_at:>=${since}` })
  const orders90d = (count.data?.ordersCount as { count?: number } | undefined)?.count ?? null

  // 1) Shopify Payments disputes (needs read_shopify_payments_disputes)
  const p = await gql(cfg.domain, token, PAYMENTS_Q)
  const acct = p.data?.shopifyPaymentsAccount as { disputes?: { nodes: Record<string, unknown>[] } } | null | undefined
  if (!p.errors?.length && acct?.disputes) {
    const disputes: Dispute[] = acct.disputes.nodes.map((d) => {
      const order = d.order as { id: string; name: string } | null
      const amount = d.amount as { amount: string; currencyCode: string } | null
      const reason = d.reasonDetails as { reason: string; networkReasonCode: string | null } | null
      return {
        key: `${store}:${d.id}`, store, id: String(d.id), type: String(d.type), status: String(d.status),
        reason: reason?.reason || null, network_reason_code: reason?.networkReasonCode || null,
        amount: amount ? Number(amount.amount) : null, currency: amount?.currencyCode || null,
        initiated_at: (d.initiatedAt as string) || null, evidence_due_by: (d.evidenceDueBy as string) || null,
        evidence_sent_on: (d.evidenceSentOn as string) || null, finalized_on: (d.finalizedOn as string) || null,
        order_name: order?.name || null, order_id: order?.id || null, admin_url: adminUrl(order?.id),
        source: "payments", decision: null, evidence: {}, note: null, submitted_at: null,
      }
    })
    return { store, disputes, orders90d, source: "payments" as const, error: null }
  }
  // Store without Shopify Payments: the account is null and there is nothing to list
  if (!p.errors?.length && acct === null) return { store, disputes: [], orders90d, source: "payments" as const, error: "Shopify Payments not active (other payment provider)" }

  // 2) Fallback: dispute status on each order of the last 90 days (read_orders)
  const disputes: Dispute[] = []
  let after: string | null = null
  for (let page = 0; page < 8; page++) {
    const r = await gql(cfg.domain, token, ORDERS_Q, { q: `created_at:>=${since}`, after })
    if (r.errors?.length) return { store, disputes, orders90d, source: "orders" as const, error: r.errors[0].message }
    const o = r.data?.orders as { nodes: { id: string; name: string; createdAt: string; disputes: { id: string; initiatedAs: string; status: string }[] }[]; pageInfo: { hasNextPage: boolean; endCursor: string } }
    for (const n of o.nodes) for (const d of n.disputes || []) {
      disputes.push({
        key: `${store}:${d.id}`, store, id: d.id, type: d.initiatedAs, status: d.status,
        reason: null, network_reason_code: null, amount: null, currency: null, initiated_at: n.createdAt,
        evidence_due_by: null, evidence_sent_on: null, finalized_on: null, order_name: n.name, order_id: n.id,
        admin_url: adminUrl(n.id), source: "orders", decision: null, evidence: {}, note: null, submitted_at: null,
      })
    }
    if (!o.pageInfo.hasNextPage) break
    after = o.pageInfo.endCursor
  }
  let detailError = ""
  // Details per dispute by id (needs only read_shopify_payments_disputes, not the payments account scope)
  for (const d of disputes) {
    const r = await gql(cfg.domain, token, `query($id: ID!) { dispute(id: $id) {
      id status type initiatedAt evidenceDueBy evidenceSentOn finalizedOn
      amount { amount currencyCode } reasonDetails { reason networkReasonCode }
    } }`, { id: d.id.replace("/OrderDisputeSummary/", "/ShopifyPaymentsDispute/") })
    const x = r.data?.dispute as Record<string, unknown> | null | undefined
    if (!x) { if (r.errors?.length) detailError = r.errors[0].message; continue }
    const amount = x.amount as { amount: string; currencyCode: string } | null
    const reason = x.reasonDetails as { reason: string; networkReasonCode: string | null } | null
    d.status = String(x.status || d.status)
    d.type = String(x.type || d.type)
    d.reason = reason?.reason || null
    d.network_reason_code = reason?.networkReasonCode || null
    d.amount = amount ? Number(amount.amount) : null
    d.currency = amount?.currencyCode || null
    d.initiated_at = (x.initiatedAt as string) || d.initiated_at
    d.evidence_due_by = (x.evidenceDueBy as string) || null
    d.evidence_sent_on = (x.evidenceSentOn as string) || null
    d.finalized_on = (x.finalizedOn as string) || null
  }
  if (disputes.some((d) => d.amount != null) || !disputes.length) return { store, disputes, orders90d, source: "orders" as const, error: null }
  const why = detailError || p.errors?.[0]?.message || ""
  return { store, disputes, orders90d, source: "orders" as const, error: why ? `dispute details unavailable: ${why.slice(0, 220)}` : null }
}

export async function GET() {
  const since = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10)
  const results = await Promise.all(Object.keys(SHOPIFY_STORES).map((s) => storeDisputes(s, since).catch((e) => ({ store: s, disputes: [] as Dispute[], orders90d: null, source: null, error: e instanceof Error ? e.message : String(e) }))))
  const { data: cases } = await getServiceClient().from("dispute_cases").select("*")
  const cmap = new Map((cases || []).map((c: { store: string; dispute_id: string }) => [`${c.store}:${c.dispute_id}`, c]))
  const disputes = results.flatMap((r) => r.disputes).map((d) => {
    const c = cmap.get(d.key) as { decision: string | null; evidence: Record<string, boolean>; note: string | null; submitted_at: string | null } | undefined
    return c ? { ...d, decision: c.decision, evidence: c.evidence || {}, note: c.note, submitted_at: c.submitted_at } : d
  })
  disputes.sort((a, b) => (a.evidence_due_by || "9999").localeCompare(b.evidence_due_by || "9999") || (b.initiated_at || "").localeCompare(a.initiated_at || ""))
  return NextResponse.json({
    disputes,
    stores: results.map((r) => ({ store: r.store, source: r.source, orders90d: r.orders90d, disputes90d: r.disputes.filter((d) => (d.initiated_at || "") >= since).length, error: r.error })),
    fetchedAt: new Date().toISOString(),
  })
}

// PATCH { store, dispute_id, order_number?, decision?, evidence?, note?, submitted? }
export async function PATCH(req: NextRequest) {
  const b = await req.json()
  if (!b.store || !b.dispute_id) return NextResponse.json({ error: "store and dispute_id required" }, { status: 400 })
  const row: Record<string, unknown> = {
    store: String(b.store),
    dispute_id: String(b.dispute_id),
    order_number: b.order_number || null,
    decision: ["fight", "accept", "refund_inquiry"].includes(b.decision) ? b.decision : null,
    evidence: b.evidence && typeof b.evidence === "object" ? b.evidence : {},
    note: typeof b.note === "string" ? b.note.slice(0, 2000) : null,
    updated_at: new Date().toISOString(),
  }
  if (b.submitted === true) row.submitted_at = new Date().toISOString()
  if (b.submitted === false) row.submitted_at = null
  const { data, error } = await getServiceClient().from("dispute_cases").upsert(row, { onConflict: "store,dispute_id" }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
