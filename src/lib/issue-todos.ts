// Turns what the dashboard pages flag (refunds, disputes, supplier costs, order issues, stock,
// inbox SLA, quality, price deductions) into to-dos for the Main Hub list. Each to-do opens the
// page where you fix it. Pure: the route fetches the data, this decides what needs doing.
// Keys contain a short hash of the item ids, so a to-do ticked off comes back when new items appear.
import type { AutoTodo } from "@/lib/todo-rules"

export type IssueInput = {
  refunds?: { id: number; store: string; order_number: string | null; amount: number; currency: string; amount_eur: number | null; approval_status: string; shopify_status: string; threat: boolean }[]
  unloggedShopifyRefunds?: { store: string; order_id: string; amount: number; date: string }[]
  supplier?: {
    products: { title: string; variant_title: string; store: string; cogs_pct: number | null; cogs_alert: string | null; price_alert: string | null; total_qty: number }[]
    invoices: { id: number | string; store: string; order_number: string; has_price_discrepancy: boolean }[]
  } | null
  priceFlags?: { store: string; product_title: string }[] // price-deduction flags already logged
  supplyChain?: {
    orders: { order_number: string; store: string; status: string; age_hours: number }[]
    products_at_risk: { name: string; variant: string; stock: number; risk: string; reasons: string[] }[]
  } | null
  disputes?: { key: string; store: string; id: string; status: string; order_name: string | null; amount: number | null; currency: string | null; evidence_due_by: string | null; submitted_at: string | null }[] | null
  inbox?: { store: string; display_id: string | number; subject: string | null; sla_breached: boolean; waiting_on_us: boolean; priority: string | null; status: string }[] | null
  qualityFlags?: { store: string; product_title: string; status: string }[]
}

const hash = (s: string) => {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}
const keyOf = (type: string, store: string, ids: (string | number)[]) => `issue:${type}:${store}:${hash(ids.map(String).sort().join("|"))}`
const list = (xs: string[], n = 3) => xs.slice(0, n).join(", ") + (xs.length > n ? ` +${xs.length - n} more` : "")
const plural = (n: number, one: string, many = one + "s") => `${n} ${n === 1 ? one : many}`

function byStore<T extends { store: string }>(xs: T[]): Map<string, T[]> {
  const m = new Map<string, T[]>()
  for (const x of xs) m.set(x.store, [...(m.get(x.store) || []), x])
  return m
}

const OUR_STORES = new Set(["LUMEGLASSES", "Walsh & Farley", "Carter & Collins", "Susan & Allen"]) // Blinky stopped 26 Nov 2026
const ours = <T extends { store: string }>(xs: T[]) => xs.filter((x) => OUR_STORES.has(x.store))
const norm = (t: string) => t.trim().toLowerCase().replace(/\s+/g, " ")

export function buildIssueTodos(input: IssueInput): AutoTodo[] {
  const out: AutoTodo[] = []

  // ---- Refunds (Customer Service → Refunds) ----
  const refunds = input.refunds || []
  const waiting = refunds.filter((r) => r.approval_status === "waiting" || r.approval_status === "flagged")
  if (waiting.length) {
    out.push({
      key: keyOf("refund-approval", "all", waiting.map((r) => r.id)),
      title: `Approve ${plural(waiting.length, "refund")} (above €100 or threat)`,
      why: list(waiting.map((r) => `${r.store} ${r.order_number || ""} ${r.currency} ${Number(r.amount).toFixed(2)}${r.approval_status === "flagged" ? " (threat)" : ""}`.replace(/\s+/g, " "))),
      source: "Refunds: owner approval above €100",
      priority: "high",
      fix: "Open Refunds. In the Owner review panel, approve or reject each one. Threat cases are already refunded: just check them.",
      href: "/refunds",
      hrefLabel: "Refunds",
    })
  }
  const notRefunded = ours(refunds).filter((r) => r.shopify_status === "not_refunded" && r.approval_status !== "waiting" && r.approval_status !== "rejected")
  for (const [store, xs] of Array.from(byStore(notRefunded))) {
    out.push({
      key: keyOf("refund-not-done", store, xs.map((r) => r.id)),
      title: `${plural(xs.length, "logged refund")} not refunded in Shopify`,
      why: `Logged in the CS log but Shopify shows no refund: ${list(xs.map((r) => r.order_number || "?"))}.`,
      source: "Refunds: Shopify check",
      priority: "high",
      store,
      fix: "Refund these orders in Shopify (or fix the logged amount). Then press 'Check Shopify now' on Refunds.",
      href: "/refunds",
      hrefLabel: "Refunds",
    })
  }
  for (const [store, xs] of Array.from(byStore(ours(input.unloggedShopifyRefunds || [])))) {
    out.push({
      key: keyOf("refund-unlogged", store, xs.map((r) => r.order_id)),
      title: `Log the reason for ${plural(xs.length, "Shopify refund")}`,
      why: `Refunded in Shopify without a CS log entry: orders ${list(xs.map((r) => r.order_id))}.`,
      source: "Refund Report: unlogged Shopify refunds",
      priority: "normal",
      store,
      fix: "On Refund Report, press 'Log it' next to each order and fill in the reason.",
      href: "/refund-report",
      hrefLabel: "Refund Report",
    })
  }

  // ---- Disputes ----
  const OPEN = ["NEEDS_RESPONSE", "needs_response", "open"]
  const now = Date.now()
  for (const d of input.disputes || []) {
    if (!OPEN.includes(d.status) || d.submitted_at) continue
    const daysLeft = d.evidence_due_by ? Math.ceil((Date.parse(d.evidence_due_by) - now) / 86400000) : null
    out.push({
      key: `issue:dispute:${d.key}`,
      title: `Answer dispute ${d.order_name || d.id}${daysLeft != null ? ` (${daysLeft <= 0 ? "due today" : `${daysLeft}d left`})` : ""}`,
      why: `${d.store}: open bank dispute${d.amount != null ? ` of ${d.currency || ""} ${Number(d.amount).toFixed(2)}` : ""}${d.evidence_due_by ? `, evidence due ${d.evidence_due_by.slice(0, 10)}` : ""}.`,
      source: "Disputes / Chargebacks",
      priority: "high",
      store: d.store,
      fix: "On Disputes, choose fight / accept, add the evidence, submit it in Shopify and mark it submitted.",
      href: "/disputes",
      hrefLabel: "Disputes",
    })
  }

  // ---- Supplier costs and invoices ----
  if (input.supplier) {
    const overQuote = ours(input.supplier.invoices).filter((i) => i.has_price_discrepancy)
    for (const [store, xs] of Array.from(byStore(overQuote))) {
      out.push({
        key: keyOf("over-quote", store, xs.map((i) => i.id)),
        title: `Supplier charged above quote on ${plural(xs.length, "invoice")}`,
        why: `Orders ${list(xs.map((i) => i.order_number))} cost more than the launch-sheet quote (>$0.50 and >3%).`,
        source: "COGS Invoices: charged above quote",
        priority: "high",
        store,
        fix: "On COGS Invoices, check the lines marked over quote and ask the supplier for the difference back.",
        href: "/cogs-invoices",
        hrefLabel: "COGS Invoices",
      })
    }
    const high = ours(input.supplier.products).filter((p) => p.cogs_pct != null && p.cogs_pct > 32)
    for (const [store, xs] of Array.from(byStore(high))) {
      out.push({
        key: keyOf("cogs-high", store, xs.map((p) => `${p.title}|${p.variant_title}`)),
        title: `${plural(xs.length, "product")} with COGS above 32%`,
        why: list(xs.sort((a, b) => (b.cogs_pct || 0) - (a.cogs_pct || 0)).map((p) => `${p.title} ${p.cogs_pct}%`)),
        source: "Supplier Costs: COGS target 28–32%",
        priority: xs.some((p) => (p.cogs_pct || 0) > 40) ? "high" : "normal",
        store,
        fix: "On Supplier Costs, raise the sale price or ask the supplier for a lower price (above 40%: switch supplier).",
        href: "/supplier-costs",
        hrefLabel: "Supplier Costs",
      })
    }
    // Price deductions: 20+ units in 30 days and nothing asked yet
    const asked = new Set((input.priceFlags || []).map((f) => `${f.store}|${f.product_title.trim().toLowerCase()}`))
    const qty = new Map<string, { store: string; title: string; qty: number }>()
    for (const p of ours(input.supplier.products)) {
      const k = `${p.store}|${p.title.trim().toLowerCase()}`
      const cur = qty.get(k) || { store: p.store, title: p.title, qty: 0 }
      cur.qty += p.total_qty
      qty.set(k, cur)
    }
    const toAsk = Array.from(qty.entries()).filter(([k, v]) => v.qty >= 20 && !asked.has(k)).map(([, v]) => v)
    for (const [store, xs] of Array.from(byStore(toAsk))) {
      out.push({
        key: keyOf("price-deduction", store, xs.map((p) => p.title)),
        title: `Ask a volume discount on ${plural(xs.length, "product")}`,
        why: list(xs.map((p) => `${p.title} (${p.qty} units / 30d)`)),
        source: "Price Deductions: 20 / 60 unit tiers",
        priority: "normal",
        store,
        fix: "On Price Deductions, send the supplier the discount request and mark it 'asked'.",
        href: "/price-deductions",
        hrefLabel: "Price Deductions",
      })
    }
  }

  // ---- Supply chain (ShipGoods) ----
  if (input.supplyChain) {
    const addr = ours(input.supplyChain.orders).filter((o) => o.status === "address_error")
    for (const [store, xs] of Array.from(byStore(addr))) {
      out.push({
        key: keyOf("address-error", store, xs.map((o) => o.order_number)),
        title: `Fix the address on ${plural(xs.length, "order")}`,
        why: `ShipGoods can't ship: address validation failed on ${list(xs.map((o) => o.order_number))}.`,
        source: "Order Issues: address errors",
        priority: "high",
        store,
        fix: "On Order Issues, correct the address in ShipGoods (ask the customer if needed).",
        href: "/order-issues",
        hrefLabel: "Order Issues",
      })
    }
    const stuck = ours(input.supplyChain.orders).filter((o) => o.status === "waiting_process" && o.age_hours > 48)
    for (const [store, xs] of Array.from(byStore(stuck))) {
      out.push({
        key: keyOf("stuck", store, xs.map((o) => o.order_number)),
        title: `${plural(xs.length, "order")} stuck for 48h+ at ShipGoods`,
        why: list(xs.sort((a, b) => b.age_hours - a.age_hours).map((o) => `${o.order_number} (${Math.round(o.age_hours)}h)`)),
        source: "Order Issues: waiting over 48 hours",
        priority: xs.some((o) => o.age_hours > 72) ? "high" : "normal",
        store,
        fix: "On Order Issues, check why they're not processed and open a supplier case if needed.",
        href: "/order-issues",
        hrefLabel: "Order Issues",
      })
    }
    // Only products that actually sold in the last 30 days (ShipGoods bills), not the whole catalog
    const selling = new Set(ours(input.supplier?.products || []).map((p) => norm(p.title)))
    const oos = input.supplyChain.products_at_risk.filter((p) => p.risk === "high" && selling.has(norm(p.name)))
    if (oos.length) {
      const byProduct = new Map<string, string[]>()
      for (const p of oos) byProduct.set(p.name.trim(), [...(byProduct.get(p.name.trim()) || []), `${p.variant || "default"} ${p.stock}`])
      out.push({
        key: keyOf("stock", "all", oos.map((p) => `${p.name}|${p.variant}`)),
        title: `${plural(byProduct.size, "selling product")} out of stock or almost (≤5)`,
        why: list(Array.from(byProduct.entries()).map(([n, v]) => `${n} (${v.length} variant${v.length === 1 ? "" : "s"})`), 5),
        source: "Fulfillment Risks: stock",
        priority: "high",
        fix: "On Fulfillment Risks, restock with the supplier or draft the product so no new orders come in.",
        href: "/fulfillment-risks",
        hrefLabel: "Fulfillment Risks",
      })
    }
  }

  // ---- Inbox (CommsLayer) ----
  const late = (input.inbox || []).filter((r) => r.sla_breached && r.status !== "resolved")
  if (late.length) {
    out.push({
      key: keyOf("sla", "all", late.map((r) => r.display_id)),
      title: `${plural(late.length, "customer")} waiting longer than 2 hours`,
      why: list(late.map((r) => `${r.store} #${r.display_id}${r.subject ? ` ${r.subject}` : ""}`)),
      source: "Inbox Queue: 2-hour reply SLA",
      priority: "high",
      fix: "Open Inbox Queue and answer the oldest ones first.",
      href: "/inbox-queue",
      hrefLabel: "Inbox Queue",
    })
  }
  const p1 = (input.inbox || []).filter((r) => r.priority === "P1" && r.status !== "resolved" && !r.sla_breached)
  if (p1.length) {
    out.push({
      key: keyOf("p1", "all", p1.map((r) => r.display_id)),
      title: `${plural(p1.length, "P1 ticket")} open`,
      why: list(p1.map((r) => `${r.store} #${r.display_id}`)),
      source: "Inbox Queue: P1",
      priority: "high",
      fix: "Open Inbox Queue and handle the P1 tickets.",
      href: "/inbox-queue",
      hrefLabel: "Inbox Queue",
    })
  }

  // ---- Quality checks still open ----
  const qOpen = (input.qualityFlags || []).filter((f) => ["open", "test_unit", "supplier"].includes(f.status))
  for (const [store, xs] of Array.from(byStore(qOpen))) {
    out.push({
      key: keyOf("quality", store, xs.map((f) => `${f.product_title}|${f.status}`)),
      title: `${plural(xs.length, "quality check")} still open`,
      why: list(xs.map((f) => `${f.product_title} (${f.status.replace("_", " ")})`)),
      source: "Quality Checks: 10% at 20+ units",
      priority: "normal",
      store,
      fix: "On Quality Checks, order a test unit or send it to the supplier, then mark it resolved or drafted.",
      href: "/quality-checks",
      hrefLabel: "Quality Checks",
    })
  }

  const rank = { high: 0, normal: 1 }
  return out.sort((a, b) => rank[a.priority] - rank[b.priority])
}
