// Same-day refunds for the P&L: the daily refresh writes Shopify refunds into the `refunds` table
// once a day. This replaces yesterday's and today's Shopify refunds whenever the refund check runs,
// so a refund made in Shopify shows in P&L, Daily Report and Main Hub within minutes.
// Same rows and rules as the daily refresh (source 'shopify'); manual rows are never touched.
import { fetchShopifyDirect } from "@/lib/shopify-direct"
import { getServiceClient } from "@/lib/supabase"

export async function refreshRecentRefunds(): Promise<{ rows: number; stores: string[]; error?: string }> {
  const today = new Date().toISOString().slice(0, 10)
  const from = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
  const d = await fetchShopifyDirect(from, today)
  if (!d.okStores.length) return { rows: 0, stores: [], error: d.failed.map((f) => `${f.store}: ${f.error}`).join("; ") || "no store answered" }
  const db = getServiceClient()
  const { error: delErr } = await db.from("refunds").delete().eq("source", "shopify").gte("date", from).lte("date", today).in("store", d.okStores)
  if (delErr) return { rows: 0, stores: d.okStores, error: delErr.message }
  if (d.refunds.length) {
    const { error } = await db.from("refunds").insert(
      d.refunds.map((r) => ({
        date: r.date,
        store: r.store,
        order_id: r.order_id,
        amount: r.amount,
        reason: `Shopify refund ${r.refund_id.split("/").pop()}`,
        source: "shopify",
        status: "refunded",
      })),
    )
    if (error) return { rows: 0, stores: d.okStores, error: error.message }
  }
  return { rows: d.refunds.length, stores: d.okStores }
}
