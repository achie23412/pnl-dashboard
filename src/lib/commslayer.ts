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

export async function cl<T>(token: string, path: string, params: Record<string, string | number | undefined> = {}): Promise<T> {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") q.set(k, String(v))
  const res = await fetch(`${BASE}${path}${q.toString() ? `?${q}` : ""}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    cache: "no-store",
  })
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

// Run tasks with a small concurrency limit (CommsLayer rate limits aren't documented)
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
