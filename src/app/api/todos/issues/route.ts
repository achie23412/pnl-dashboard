// GET → { auto: AutoTodo & {done} } — what the dashboard pages flag, as to-dos.
// Reuses the pages' own data routes (same rules as the pages), with the caller's login cookie.
// The slow ones (ShipGoods, Shopify disputes, CommsLayer) are kept 10 minutes per server.
import { NextRequest, NextResponse } from "next/server"
import { getServiceClient } from "@/lib/supabase"
import { buildIssueTodos, type IssueInput } from "@/lib/issue-todos"

export const dynamic = "force-dynamic"
export const maxDuration = 60

const TTL = 10 * 60 * 1000
const cache = new Map<string, { at: number; data: unknown }>()

async function pageData<T>(origin: string, cookie: string, path: string, timeoutMs: number): Promise<T | null> {
  const hit = cache.get(path)
  if (hit && Date.now() - hit.at < TTL) return hit.data as T
  try {
    const res = await fetch(origin + path, { headers: { cookie }, cache: "no-store", signal: AbortSignal.timeout(timeoutMs) })
    if (!res.ok) return hit ? (hit.data as T) : null
    const data = (await res.json()) as T
    cache.set(path, { at: Date.now(), data })
    return data
  } catch {
    return hit ? (hit.data as T) : null
  }
}

const digits = (s: string | null | undefined) => String(s || "").replace(/\D/g, "")
const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10)

export async function GET(req: NextRequest) {
  const origin = new URL(req.url).origin
  const cookie = req.headers.get("cookie") || ""
  const db = getServiceClient()

  const [refunds, shopRefunds, logged, priceFlags, qualityFlags, todos, supplier, supplyChain, disputes, inbox] = await Promise.all([
    db.from("cs_refunds").select("id,store,order_number,amount,currency,amount_eur,approval_status,shopify_status,threat").gte("refund_date", daysAgo(45)),
    db.from("refunds").select("store,order_id,amount,date").eq("source", "shopify").gte("date", daysAgo(14)),
    db.from("cs_refunds").select("shopify_order_id").gte("refund_date", daysAgo(30)),
    db.from("cs_product_flags").select("store,product_title").eq("kind", "price"),
    db.from("cs_product_flags").select("store,product_title,status").eq("kind", "quality"),
    db.from("todos").select("auto_key,done").eq("source", "auto").eq("done", true).like("auto_key", "issue:%"),
    pageData<IssueInput["supplier"]>(origin, cookie, "/api/supplier-data", 40000),
    pageData<IssueInput["supplyChain"]>(origin, cookie, "/api/supply-chain", 30000),
    pageData<{ disputes: IssueInput["disputes"] }>(origin, cookie, "/api/disputes", 45000),
    pageData<{ rows?: IssueInput["inbox"] }>(origin, cookie, "/api/inbox", 20000),
  ])

  const loggedIds = new Set((logged.data || []).map((r) => digits(r.shopify_order_id)).filter(Boolean))
  const unlogged = (shopRefunds.data || []).filter((r) => digits(r.order_id) && !loggedIds.has(digits(r.order_id)))

  const auto = buildIssueTodos({
    refunds: refunds.data || [],
    unloggedShopifyRefunds: unlogged,
    supplier,
    priceFlags: priceFlags.data || [],
    supplyChain,
    disputes: disputes?.disputes || null,
    inbox: inbox?.rows || null,
    qualityFlags: qualityFlags.data || [],
  })

  const doneKeys = new Set((todos.data || []).map((t) => t.auto_key))
  const missing = [!supplier && "Supplier Costs", !supplyChain && "Supply Chain", !disputes && "Disputes", !inbox?.rows && "Inbox Queue"].filter(Boolean)
  return NextResponse.json({ auto: auto.map((t) => ({ ...t, done: doneKeys.has(t.key) })), missing })
}
