// CommsLayer Integration API (https://app.commslayer.com/api/integration/v1/docs).
// Auth: an integration token (CommsLayer → Settings → Integration tokens) saved in Vercel as
// COMMSLAYER_TOKEN (or several: COMMSLAYER_TOKEN_SA, COMMSLAYER_TOKEN_CC, … one per account).
// Scopes used: conversations:read, messages:read, contacts:read, reports:read.
const BASE = "https://app.commslayer.com/api/integration/v1"

export type ClConversation = {
  id: number
  account_id: number
  inbox_id: number
  contact_id: number
  assignee_id: number | null
  status: "open" | "resolved" | "pending" | "snoozed"
  snoozed_until: string | null
  display_id: number
  labels: string[]
  contact_reason: { id: number; name: string; parent_id: number | null } | null
  subject: string | null
  custom_attributes: Record<string, unknown>
  created_at: string
  updated_at: string
  last_activity_at: string
}
export type ClMessage = {
  id: number
  conversation_id: number
  content: string
  message_type: "incoming" | "outgoing" | "activity" | "template"
  private: boolean
  sender_type: string | null
  created_at: string
}
export type ClContact = { id: number; name: string; email: string; phone_number?: string }

export function commslayerTokens(): { name: string; token: string }[] {
  return Object.entries(process.env)
    .filter(([k, v]) => /^COMMSLAYER_TOKEN(_[A-Z0-9_]+)?$/.test(k) && v)
    .map(([k, v]) => ({ name: k, token: v as string }))
}

// CommsLayer allows 60 calls a minute per token. Keep a rolling count per token (per server
// instance) and stop at 55, so one page load never trips the limit; a real 429 stops the same way.
const RATE_BUDGET = 55
const calls = new Map<string, number[]>()
export class RateLimited extends Error {
  constructor(public retryAfter: number) {
    super(`CommsLayer allows 60 calls a minute; the rest loads in ${retryAfter}s`)
  }
}
function take(token: string) {
  const now = Date.now()
  const recent = (calls.get(token) || []).filter((t) => now - t < 60_000)
  if (recent.length >= RATE_BUDGET) throw new RateLimited(Math.max(5, Math.ceil((60_000 - (now - recent[0])) / 1000)))
  recent.push(now)
  calls.set(token, recent)
}

export async function cl<T>(token: string, path: string, params: Record<string, string | number | undefined> = {}): Promise<T> {
  take(token)
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") q.set(k, String(v))
  const res = await fetch(`${BASE}${path}${q.toString() ? `?${q}` : ""}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    cache: "no-store",
  })
  if (res.status === 429) {
    const body = await res.json().catch(() => null) as { error?: { details?: { retry_after?: number } } } | null
    const wait = Number(body?.error?.details?.retry_after || res.headers.get("retry-after")) || 60
    // Fill the local budget so the rest of this load stops too
    calls.set(token, Array.from({ length: RATE_BUDGET }, () => Date.now() - 60_000 + wait * 1000))
    throw new RateLimited(Math.ceil(wait))
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "")
    throw new Error(`CommsLayer ${path}: HTTP ${res.status}${res.status === 401 ? " (token missing or expired)" : res.status === 403 ? " (token lacks the scope for this)" : ""} ${body.slice(0, 120)}`)
  }
  return res.json() as Promise<T>
}

// All pages of a cursor-paginated list (stops at maxPages)
export async function clAll<T>(token: string, path: string, params: Record<string, string | number | undefined> = {}, maxPages = 10): Promise<T[]> {
  const out: T[] = []
  let after: string | undefined
  for (let i = 0; i < maxPages; i++) {
    const r = await cl<{ data: T[]; meta?: { next_cursor?: string | null } }>(token, path, { ...params, "page[limit]": 100, "page[after]": after })
    out.push(...(r.data || []))
    after = r.meta?.next_cursor || undefined
    if (!after) break
  }
  return out
}

// Run tasks with a small concurrency limit
export async function pool<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let i = 0
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) {
      const k = i++
      out[k] = await fn(items[k])
    }
  }))
  return out
}

// Link to a conversation in the CommsLayer app
export const conversationUrl = (accountId: number, displayId: number) =>
  `https://app.commslayer.com/app/accounts/${accountId}/conversations/${displayId}`

// Store from the inbox name (inbox names are set in CommsLayer)
const STORE_HINTS: [RegExp, string][] = [
  [/susan|allen|\bsa\b/i, "Susan & Allen"],
  [/carter|collins|\bcc\b/i, "Carter & Collins"],
  [/walsh|farley|\bwf\b/i, "Walsh & Farley"],
  [/lume/i, "LUMEGLASSES"],
  [/blinky/i, "Blinky"],
]
export const storeFromName = (name: string) => STORE_HINTS.find(([re]) => re.test(name))?.[1] || null

// Urgency per the CS playbook (section 2): P1 dispute/chargeback/legal/AMEX complaint, P2 order change
// before dispatch, not received, wrong/missing/defective; P3 everything else.
const P1 = /chargeback|charge back|dispute|bank|paypal claim|legal|lawyer|solicitor|trading standards|ccpc|ftc|attorney|amex|american express|fraud/i
const P2 = /cancel|address|change (my|the) order|not (yet )?(received|arrived)|never (received|arrived)|where is my|lost|wrong (item|size|colou?r)|missing|defect|damaged|broken|faulty|ripped|torn/i
export function priorityOf(text: string): "P1" | "P2" | "P3" {
  if (P1.test(text)) return "P1"
  if (P2.test(text)) return "P2"
  return "P3"
}

// What the messages of a conversation tell us: who wrote last, when we first replied, and the
// customer's latest message. Cached per conversation until its last_activity_at changes.
export type ConvDetails = { at: string; waiting: boolean; waiting_since: string | null; first_reply_at: string | null; last_customer_message: string }
export function detailsFromMessages(at: string, msgs: ClMessage[]): ConvDetails {
  const pub = msgs.filter((m) => !m.private && (m.message_type === "incoming" || m.message_type === "outgoing")).sort((a, b) => a.created_at.localeCompare(b.created_at))
  const lastOut = [...pub].reverse().find((m) => m.message_type === "outgoing")
  const incomingAfter = pub.filter((m) => m.message_type === "incoming" && (!lastOut || m.created_at > lastOut.created_at))
  const lastIn = [...pub].reverse().find((m) => m.message_type === "incoming")
  return {
    at,
    waiting: incomingAfter.length > 0,
    waiting_since: incomingAfter[0]?.created_at || null,
    first_reply_at: pub.find((m) => m.message_type === "outgoing")?.created_at || null,
    last_customer_message: (lastIn?.content || "").replace(/\s+/g, " ").slice(0, 300),
  }
}

// First-reply target from the CS playbook: 2 hours (internal standard; the websites say 24h).
export const SLA_HOURS = 2

export type InboxRow = {
  key: string // `${account_id}:${id}`
  account_id: number
  id: number
  display_id: number
  contact_id: number
  url: string
  store: string | null
  inbox: string
  status: ClConversation["status"]
  subject: string
  reason: string | null
  labels: string[]
  customer: string | null
  email: string | null
  created_at: string
  last_activity_at: string
  // From the messages. CommsLayer allows 60 calls a minute and every conversation needs its own
  // call, so these load in batches: details "pending" = not read yet, "known" = the browser has
  // them cached for this last_activity_at, "fresh" = filled in below.
  details: "fresh" | "known" | "pending"
  msg: ConvDetails | null // the details themselves when "fresh", for the page to cache
  contact_loaded: boolean
  waiting_on_us: boolean
  waiting_since: string | null // first customer message after our last reply
  first_reply_at: string | null
  last_customer_message: string
  priority: "P1" | "P2" | "P3"
  priority_source: "rule" | "manual"
  sla_breached: boolean
  // our notes (cs_tickets)
  order_number: string | null
  scenario: string | null
  owner: string | null
  product_title: string | null
  complaint: boolean
  note: string | null
}


// Apply message details (and the SLA/priority that depend on them) to a row. Also used by the page
// for details it has cached.
export function withDetails(r: InboxRow, d: ConvDetails | null, contact?: { name: string | null; email: string | null } | null): InboxRow {
  const out = { ...r }
  if (contact) { out.customer = contact.name || out.customer; out.email = contact.email || out.email; out.contact_loaded = true }
  if (!d) return out
  out.waiting_on_us = r.status === "open" && d.waiting
  out.waiting_since = out.waiting_on_us ? d.waiting_since : null
  out.first_reply_at = d.first_reply_at
  out.last_customer_message = d.last_customer_message
  if (out.subject === "(no subject)" && d.last_customer_message) out.subject = d.last_customer_message.slice(0, 90)
  if (r.priority_source === "rule") out.priority = priorityOf([r.subject, r.reason, ...r.labels, d.last_customer_message].filter(Boolean).join(" "))
  out.sla_breached = !!out.waiting_since && Date.now() - Date.parse(out.waiting_since) > SLA_HOURS * 3600000
  return out
}


const RANK = { P1: 0, P2: 1, P3: 2 }
// Waiting on us first, then P1→P3, then longest wait
export function sortInbox(rows: InboxRow[]) {
  return rows.sort((a, b) =>
    Number(b.waiting_on_us) - Number(a.waiting_on_us) ||
    RANK[a.priority] - RANK[b.priority] ||
    (a.waiting_since || a.last_activity_at).localeCompare(b.waiting_since || b.last_activity_at))
}
