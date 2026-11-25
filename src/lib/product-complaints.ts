// Product complaints from the CS refund log (cs_refunds) and Inbox Queue tickets marked as a
// product complaint (cs_tickets). Used by Quality Checks, Risky Products and the to-do list.
import { reasonLabel } from "@/lib/cs-log"

// Reasons that say something about the product itself
export const COMPLAINT_REASONS = ["quality_defect", "not_as_described", "damaged", "wrong_item", "size_fit"]
// Reasons that count as a quality refund (Quality Checks rate)
export const QUALITY_REASONS = ["quality_defect", "not_as_described"]

// Rules (dashboard rules, also shown on each page)
export const QUALITY_RATE = 0.1 // 10% quality refunds…
export const QUALITY_MIN_UNITS = 20 // …with 20+ units sold
export const RISKY_COMPLAINTS = 2 // 2+ complaints…
export const RISKY_DAYS = 7 // …in 7 days

export type ComplaintEvent = {
  store: string
  product: string // product title as on the order
  key: string // `${store}|${lowercased title}`
  date: string // YYYY-MM-DD
  reason: string
  reasonLabel: string
  order: string | null
  source: "refund" | "ticket"
  url: string | null
  note: string | null
}

type RefundRow = { store: string; refund_date: string; order_number: string; reason: string; reason_note: string | null; conversation_url: string | null; items: { title: string; qty: number }[] }
type TicketRow = { store: string | null; product_title: string | null; updated_at: string; order_number: string | null; scenario: string | null; note: string | null; account_id: number; display_id: number | null; complaint: boolean }

export const productKey = (store: string, title: string) => `${store}|${title.trim().toLowerCase()}`

export function complaintEvents(refunds: RefundRow[], tickets: TicketRow[]): ComplaintEvent[] {
  const out: ComplaintEvent[] = []
  for (const r of refunds) {
    if (!COMPLAINT_REASONS.includes(r.reason)) continue
    const items = (r.items || []).filter((i) => i?.title)
    for (const it of items) {
      out.push({
        store: r.store, product: it.title, key: productKey(r.store, it.title), date: r.refund_date,
        reason: r.reason, reasonLabel: reasonLabel(r.reason), order: r.order_number, source: "refund",
        url: r.conversation_url, note: r.reason_note,
      })
    }
  }
  for (const t of tickets) {
    if (!t.complaint || !t.product_title || !t.store) continue
    out.push({
      store: t.store, product: t.product_title, key: productKey(t.store, t.product_title), date: t.updated_at.slice(0, 10),
      reason: "ticket", reasonLabel: t.scenario ? `Ticket: ${t.scenario}` : "Ticket complaint", order: t.order_number, source: "ticket",
      url: t.display_id ? `https://app.commslayer.com/app/accounts/${t.account_id}/conversations/${t.display_id}` : null, note: t.note,
    })
  }
  return out.sort((a, b) => b.date.localeCompare(a.date))
}

export const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10)

// Risky products: RISKY_COMPLAINTS+ complaints in the last RISKY_DAYS days
export function riskyProducts(events: ComplaintEvent[]) {
  const since = daysAgo(RISKY_DAYS - 1)
  const by = new Map<string, ComplaintEvent[]>()
  for (const e of events) if (e.date >= since) by.set(e.key, [...(by.get(e.key) || []), e])
  return Array.from(by.entries())
    .filter(([, list]) => list.length >= RISKY_COMPLAINTS)
    .map(([key, list]) => ({ key, store: list[0].store, product: list[0].product, events: list, last: list[0].date }))
    .sort((a, b) => b.events.length - a.events.length || b.last.localeCompare(a.last))
}
