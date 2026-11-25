// Shared types and lists for the CS refund / store-credit log.

export const REFUND_REASONS = [
  { value: "size_fit", label: "Size / fit" },
  { value: "not_as_described", label: "Not as expected / described" },
  { value: "quality_defect", label: "Quality / defect" },
  { value: "damaged", label: "Damaged in transit" },
  { value: "wrong_item", label: "Wrong item sent" },
  { value: "not_received", label: "Not received / lost" },
  { value: "late_delivery", label: "Late delivery" },
  { value: "cancel_before_dispatch", label: "Cancelled before dispatch" },
  { value: "changed_mind", label: "Changed mind (30-day guarantee)" },
  { value: "goodwill", label: "Goodwill (ladder)" },
  { value: "chargeback", label: "Dispute / chargeback" },
  { value: "other", label: "Other" },
] as const
export type RefundReason = (typeof REFUND_REASONS)[number]["value"]
export const reasonLabel = (v: string) => REFUND_REASONS.find((r) => r.value === v)?.label || v

// Goodwill ladder (CLAUDE.md): customer picks refund OR store credit per stage; move up only after a decline.
// Never for defects, wrong items, non-delivery, legal remedies or open disputes.
export const GOODWILL_LADDER = [
  { stage: 1, refundPct: 10, creditPct: 60 },
  { stage: 2, refundPct: 20, creditPct: 80 },
  { stage: 3, refundPct: 30, creditPct: 100 },
] as const

export interface OrderItem {
  title: string
  variant: string | null
  qty: number
  price: number // per unit, what the customer paid (after line discounts), store currency
  product_id: string | null
}

export interface OrderLookup {
  store: string
  order_number: string
  shopify_order_id: string
  created_at: string
  customer_email: string | null
  currency: string
  total: number
  refunded: number
  financial_status: string
  items: OrderItem[]
  admin_url: string
  open_disputes: { status: string; type: string }[]
}

export interface CsRefund {
  id: number
  created_at: string
  store: string
  refund_date: string
  order_number: string
  shopify_order_id: string | null
  customer_email: string | null
  conversation_url: string | null
  refund_type: "full" | "partial" | "full_after_return"
  reason: string
  reason_note: string | null
  percentage: number | null
  amount: number
  currency: string
  order_total: number | null
  items: OrderItem[]
  logged_by: string | null
  amount_eur: number | null
  threat: boolean
  approval_status: "not_needed" | "waiting" | "flagged" | "approved" | "rejected"
  approved_by: string | null
  approved_at: string | null
  shopify_status: "checking" | "refunded" | "partial" | "not_refunded" | "no_order"
  shopify_refunded: number | null
  shopify_refunded_at: string | null
  shopify_checked_at: string | null
  attachments: { path: string; name: string; type: string; size: number; uploaded_at: string; by: string | null }[]
}

export interface RefundHistory {
  id: number
  changed_at: string
  changed_by: string | null
  action: string
  changes: Record<string, unknown>
}

export const REFUND_TYPES = [
  { value: "partial", label: "Partial refund" },
  { value: "full", label: "Full refund" },
  { value: "full_after_return", label: "Full refund after return" },
] as const

export interface CsStoreCredit {
  id: number
  created_at: string
  store: string
  issue_date: string
  order_number: string | null
  customer_email: string | null
  conversation_url: string | null
  amount: number
  currency: string
  percentage: number | null
  reason: string
  reason_note: string | null
  code: string | null
  status: "issued" | "used" | "expired"
  logged_by: string | null
}

export const CURRENCY_SIGN: Record<string, string> = { EUR: "€", USD: "$", GBP: "£" }
export const money = (n: number | null | undefined, cur = "EUR") =>
  n == null ? "—" : `${CURRENCY_SIGN[cur] || cur + " "}${n.toLocaleString("en-IE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
