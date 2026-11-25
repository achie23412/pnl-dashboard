import { NextRequest, NextResponse } from "next/server"
import { getServiceClient } from "@/lib/supabase"
import {
  cl, clAll, pool, commslayerTokens, conversationUrl, storeFromName, priorityOf,
  type ClConversation, type ClMessage, type ClContact,
} from "@/lib/commslayer"

export const dynamic = "force-dynamic"
export const maxDuration = 60

// First-reply target from the CS playbook: 2 hours (internal standard; the websites say 24h).
const SLA_HOURS = 2

export type InboxRow = {
  key: string // `${account_id}:${id}`
  account_id: number
  id: number
  display_id: number
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

type Ticket = {
  account_id: number; conversation_id: number; store: string | null; order_number: string | null; scenario: string | null
  priority: "P1" | "P2" | "P3" | null; owner: string | null; product_title: string | null; complaint: boolean; note: string | null
}

// Inbox names: /reports/inboxes returns per-inbox metrics; find {id, name} pairs anywhere in it
function inboxNames(report: unknown): Map<number, string> {
  const m = new Map<number, string>()
  const walk = (x: unknown) => {
    if (Array.isArray(x)) return x.forEach(walk)
    if (x && typeof x === "object") {
      const o = x as Record<string, unknown>
      const id = o.id ?? o.inbox_id
      const name = o.name ?? o.inbox_name
      if (typeof id === "number" && typeof name === "string") m.set(id, name)
      Object.values(o).forEach(walk)
    }
  }
  walk(report)
  return m
}

let cache: { at: number; body: unknown } | null = null

export async function GET(req: NextRequest) {
  // ?only=complaints → our ticket notes marked as a product complaint (for Quality Checks / Risky Products)
  if (new URL(req.url).searchParams.get("only") === "complaints") {
    const { data, error } = await getServiceClient().from("cs_tickets").select("*").eq("complaint", true).order("updated_at", { ascending: false }).limit(2000)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ rows: data || [] })
  }
  const tokens = commslayerTokens()
  if (!tokens.length) return NextResponse.json({ configured: false })
  const fresh = new URL(req.url).searchParams.get("fresh") === "1"
  if (!fresh && cache && Date.now() - cache.at < 60_000) return NextResponse.json(cache.body)

  const db = getServiceClient()
  const errors: string[] = []
  const rows: InboxRow[] = []
  let resolvedToday = 0
  const today = new Date().toISOString().slice(0, 10)

  const { data: tickets } = await db.from("cs_tickets").select("*")
  const tmap = new Map<string, Ticket>((tickets || []).map((t: Ticket) => [`${t.account_id}:${t.conversation_id}`, t]))

  for (const { name: tokenName, token } of tokens) {
    try {
      const account = await cl<{ data: { id: number; name: string } }>(token, "/account")
      const from = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)
      const [open, pending, snoozed, resolved, inboxReport] = await Promise.all([
        clAll<ClConversation>(token, "/conversations", { "filter[status]": "open" }, 6),
        clAll<ClConversation>(token, "/conversations", { "filter[status]": "pending" }, 3),
        clAll<ClConversation>(token, "/conversations", { "filter[status]": "snoozed" }, 2).catch(() => [] as ClConversation[]),
        cl<{ data: ClConversation[] }>(token, "/conversations", { "filter[status]": "resolved", "page[limit]": 100 }).catch(() => ({ data: [] as ClConversation[] })),
        cl<unknown>(token, "/reports/inboxes", { from_date: from, to_date: today }).catch(() => null),
      ])
      resolvedToday += (resolved.data || []).filter((c) => c.updated_at.slice(0, 10) === today).length
      const names = inboxNames(inboxReport)
      const seen = new Set<number>()
      const convs = [...open, ...pending, ...snoozed].filter((c) => (seen.has(c.id) ? false : (seen.add(c.id), true)))

      const contacts = new Map<number, ClContact | null>()
      await pool(Array.from(new Set(convs.map((c) => c.contact_id))), 6, async (id) => {
        try { contacts.set(id, (await cl<{ data: ClContact }>(token, `/contacts/${id}`)).data) } catch { contacts.set(id, null) }
      })

      const built = await pool(convs, 6, async (c): Promise<InboxRow> => {
        let msgs: ClMessage[] = []
        try { msgs = (await cl<{ data: ClMessage[] }>(token, `/conversations/${c.id}/messages`, { "page[limit]": 100 })).data || [] } catch (e) {
          if (errors.length < 3) errors.push(e instanceof Error ? e.message : String(e))
        }
        const pub = msgs.filter((m) => !m.private && (m.message_type === "incoming" || m.message_type === "outgoing")).sort((a, b) => a.created_at.localeCompare(b.created_at))
        const lastOut = [...pub].reverse().find((m) => m.message_type === "outgoing")
        const incomingAfter = pub.filter((m) => m.message_type === "incoming" && (!lastOut || m.created_at > lastOut.created_at))
        const firstOut = pub.find((m) => m.message_type === "outgoing")
        const lastIn = [...pub].reverse().find((m) => m.message_type === "incoming")
        const waiting = c.status === "open" && incomingAfter.length > 0
        const waitingSince = waiting ? incomingAfter[0].created_at : null
        const t = tmap.get(`${c.account_id}:${c.id}`)
        const text = [c.subject, c.contact_reason?.name, ...(c.labels || []), lastIn?.content].filter(Boolean).join(" ")
        const prio = t?.priority || priorityOf(text)
        const inbox = names.get(c.inbox_id) || `Inbox ${c.inbox_id}`
        const contact = contacts.get(c.contact_id)
        return {
          key: `${c.account_id}:${c.id}`,
          account_id: c.account_id,
          id: c.id,
          display_id: c.display_id,
          url: conversationUrl(c.account_id, c.display_id),
          store: t?.store || storeFromName(inbox) || storeFromName(account.data.name) || null,
          inbox,
          status: c.status,
          subject: c.subject || (lastIn?.content || "").replace(/\s+/g, " ").slice(0, 90) || "(no subject)",
          reason: c.contact_reason?.name || null,
          labels: c.labels || [],
          customer: contact?.name || null,
          email: contact?.email || null,
          created_at: c.created_at,
          last_activity_at: c.last_activity_at,
          waiting_on_us: waiting,
          waiting_since: waitingSince,
          first_reply_at: firstOut?.created_at || null,
          last_customer_message: (lastIn?.content || "").replace(/\s+/g, " ").slice(0, 300),
          priority: prio,
          priority_source: t?.priority ? "manual" : "rule",
          sla_breached: !!waitingSince && Date.now() - Date.parse(waitingSince) > SLA_HOURS * 3600000,
          order_number: t?.order_number || null,
          scenario: t?.scenario || null,
          owner: t?.owner || null,
          product_title: t?.product_title || null,
          complaint: !!t?.complaint,
          note: t?.note || null,
        }
      })
      rows.push(...built)
    } catch (e) {
      errors.push(`${tokenName}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const rank = { P1: 0, P2: 1, P3: 2 }
  rows.sort((a, b) =>
    Number(b.waiting_on_us) - Number(a.waiting_on_us) ||
    rank[a.priority] - rank[b.priority] ||
    (a.waiting_since || a.last_activity_at).localeCompare(b.waiting_since || b.last_activity_at))
  const body = { configured: true, rows, resolvedToday, slaHours: SLA_HOURS, errors, fetchedAt: new Date().toISOString() }
  cache = { at: Date.now(), body }
  return NextResponse.json(body)
}

// PATCH { account_id, conversation_id, display_id?, store?, order_number?, scenario?, priority?, owner?, product_title?, complaint?, note? }
export async function PATCH(req: NextRequest) {
  const b = await req.json()
  const account_id = Number(b.account_id)
  const conversation_id = Number(b.conversation_id)
  if (!account_id || !conversation_id) return NextResponse.json({ error: "account_id and conversation_id required" }, { status: 400 })
  const s = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 500) : null)
  const row = {
    account_id,
    conversation_id,
    display_id: Number(b.display_id) || null,
    store: s(b.store),
    order_number: s(b.order_number),
    scenario: s(b.scenario),
    priority: ["P1", "P2", "P3"].includes(b.priority) ? b.priority : null,
    owner: s(b.owner),
    product_title: s(b.product_title),
    complaint: !!b.complaint,
    note: s(b.note),
    updated_at: new Date().toISOString(),
  }
  const { data, error } = await getServiceClient().from("cs_tickets").upsert(row, { onConflict: "account_id,conversation_id" }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  cache = null
  return NextResponse.json(data)
}
