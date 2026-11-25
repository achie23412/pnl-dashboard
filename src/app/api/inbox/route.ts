import { NextRequest, NextResponse } from "next/server"
import { getServiceClient } from "@/lib/supabase"
import {
  cl, clAll, pool, commslayerTokens, conversationUrl, storeFromName, priorityOf, detailsFromMessages, withDetails, sortInbox, RateLimited, SLA_HOURS,
  type ClConversation, type ClMessage, type ClContact, type ConvDetails, type InboxRow,
} from "@/lib/commslayer"
export type { InboxRow } from "@/lib/commslayer"

export const dynamic = "force-dynamic"
export const maxDuration = 60

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

// Per server instance: the conversation list for 45s, message details until a conversation changes,
// contacts and account names for the life of the instance.
let listCache: { at: number; convs: (ClConversation & { _inbox: string; _account: string; _token: string })[]; resolvedToday: number; errors: string[] } | null = null
const detailCache = new Map<string, ConvDetails>()
const contactCache = new Map<number, { name: string | null; email: string | null }>()
const accountCache = new Map<string, { id: number; name: string }>()

async function loadList(fresh: boolean): Promise<NonNullable<typeof listCache>> {
  if (!fresh && listCache && Date.now() - listCache.at < 45_000) return listCache
  const today = new Date().toISOString().slice(0, 10)
  const from = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)
  const convs: NonNullable<typeof listCache>["convs"] = []
  const errors: string[] = []
  let resolvedToday = 0
  for (const { name: tokenName, token } of commslayerTokens()) {
    try {
      let account = accountCache.get(token)
      if (!account) { account = (await cl<{ data: { id: number; name: string } }>(token, "/account")).data; accountCache.set(token, account) }
      // "pending" and "snoozed" are the same Pending status in CommsLayer
      const [open, pending, resolved, inboxReport] = await Promise.all([
        clAll<ClConversation>(token, "/conversations", { "filter[status]": "open" }, 6),
        clAll<ClConversation>(token, "/conversations", { "filter[status]": "pending" }, 3),
        cl<{ data: ClConversation[] }>(token, "/conversations", { "filter[status]": "resolved", "page[limit]": 100 }).catch((e) => { if (e instanceof RateLimited) throw e; return { data: [] as ClConversation[] } }),
        cl<unknown>(token, "/reports/inboxes", { from_date: from, to_date: today }).catch((e) => { if (e instanceof RateLimited) throw e; return null }),
      ])
      resolvedToday += (resolved.data || []).filter((c) => c.updated_at.slice(0, 10) === today).length
      const names = inboxNames(inboxReport)
      const seen = new Set<number>()
      for (const c of [...open, ...pending]) {
        if (seen.has(c.id)) continue
        seen.add(c.id)
        convs.push({ ...c, _inbox: names.get(c.inbox_id) || `Inbox ${c.inbox_id}`, _account: account.name, _token: token })
      }
    } catch (e) {
      if (e instanceof RateLimited) throw e
      errors.push(`${tokenName}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  listCache = { at: Date.now(), convs, resolvedToday, errors }
  return listCache
}

async function inbox(fresh: boolean, known: Record<string, string>, knownContacts: Set<number>) {
  if (!commslayerTokens().length) return NextResponse.json({ configured: false })
  const list = await loadList(fresh).catch((e: unknown) => (e instanceof Error ? e : new Error(String(e))))
  if (list instanceof RateLimited) return NextResponse.json({ configured: true, rateLimited: true, retryAfter: list.retryAfter, error: list.message }, { status: 429 })
  if (list instanceof Error) throw list
  const { data: tickets } = await getServiceClient().from("cs_tickets").select("*")
  const tmap = new Map<string, Ticket>((tickets || []).map((t: Ticket) => [`${t.account_id}:${t.conversation_id}`, t]))
  const keyOf = (c: ClConversation) => `${c.account_id}:${c.id}`

  // Read messages for what nobody has cached yet: open before pending, newest activity first
  const needMsgs = list.convs
    .filter((c) => detailCache.get(keyOf(c))?.at !== c.last_activity_at && known[keyOf(c)] !== c.last_activity_at)
    .sort((a, b) => Number(b.status === "open") - Number(a.status === "open") || b.last_activity_at.localeCompare(a.last_activity_at))
  const errors = [...list.errors]
  let retryAfter: number | null = null
  const stop = (e: unknown) => {
    if (e instanceof RateLimited) { retryAfter = Math.max(retryAfter ?? 0, e.retryAfter); return }
    if (errors.length < 3) errors.push(e instanceof Error ? e.message : String(e))
  }
  await pool(needMsgs, 4, async (c) => {
    if (retryAfter) return
    try {
      const msgs = (await cl<{ data: ClMessage[] }>(c._token, `/conversations/${c.id}/messages`, { "page[limit]": 100 })).data || []
      detailCache.set(keyOf(c), detailsFromMessages(c.last_activity_at, msgs))
    } catch (e) { stop(e) }
  })
  // Then customer names/emails, open conversations first
  const needContacts = Array.from(new Map(list.convs
    .filter((c) => !contactCache.has(c.contact_id) && !knownContacts.has(c.contact_id))
    .sort((a, b) => Number(b.status === "open") - Number(a.status === "open"))
    .map((c) => [c.contact_id, c._token])).entries())
  await pool(needContacts, 4, async ([id, token]) => {
    if (retryAfter) return
    try {
      const ct = (await cl<{ data: ClContact }>(token, `/contacts/${id}`)).data
      contactCache.set(id, { name: ct?.name || null, email: ct?.email || null })
    } catch (e) {
      if (e instanceof RateLimited) return stop(e)
      contactCache.set(id, { name: null, email: null })
    }
  })

  const rows: InboxRow[] = list.convs.map((c) => {
    const t = tmap.get(keyOf(c))
    const cached = detailCache.get(keyOf(c))
    const d = cached?.at === c.last_activity_at ? cached : null
    const base: InboxRow = {
      key: keyOf(c),
      account_id: c.account_id,
      id: c.id,
      display_id: c.display_id,
      contact_id: c.contact_id,
      url: conversationUrl(c.account_id, c.display_id),
      store: t?.store || storeFromName(c._inbox) || storeFromName(c._account) || null,
      inbox: c._inbox,
      status: c.status,
      subject: c.subject || "(no subject)",
      reason: c.contact_reason?.name || null,
      labels: c.labels || [],
      customer: null,
      email: null,
      created_at: c.created_at,
      last_activity_at: c.last_activity_at,
      details: d ? "fresh" : known[keyOf(c)] === c.last_activity_at ? "known" : "pending",
      msg: d,
      contact_loaded: false,
      waiting_on_us: false,
      waiting_since: null,
      first_reply_at: null,
      last_customer_message: "",
      priority: t?.priority || priorityOf([c.subject, c.contact_reason?.name, ...(c.labels || [])].filter(Boolean).join(" ")),
      priority_source: t?.priority ? "manual" : "rule",
      sla_breached: false,
      order_number: t?.order_number || null,
      scenario: t?.scenario || null,
      owner: t?.owner || null,
      product_title: t?.product_title || null,
      complaint: !!t?.complaint,
      note: t?.note || null,
    }
    return withDetails(base, d, contactCache.get(c.contact_id))
  })

  sortInbox(rows)
  const pending = rows.filter((r) => r.details === "pending").length
  const contactsPending = new Set(rows.filter((r) => !contactCache.has(r.contact_id) && !knownContacts.has(r.contact_id)).map((r) => r.contact_id)).size
  return NextResponse.json({
    configured: true, rows, resolvedToday: list.resolvedToday, slaHours: SLA_HOURS, errors,
    pending, contactsPending, retryAfter: pending || contactsPending ? (retryAfter ?? 5) : null,
    fetchedAt: new Date(list.at).toISOString(),
  })
}

export async function GET(req: NextRequest) {
  // ?only=complaints → our ticket notes marked as a product complaint (for Quality Checks / Risky Products)
  if (new URL(req.url).searchParams.get("only") === "complaints") {
    const { data, error } = await getServiceClient().from("cs_tickets").select("*").eq("complaint", true).order("updated_at", { ascending: false }).limit(2000)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ rows: data || [] })
  }
  return inbox(new URL(req.url).searchParams.get("fresh") === "1", {}, new Set())
}

// POST { fresh?, known?: { [key]: last_activity_at }, knownContacts?: number[] }: the page sends what it
// already has cached, so only changed conversations use up the 60 calls a minute.
export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({}))
  const known: Record<string, string> = b.known && typeof b.known === "object" ? b.known : {}
  const knownContacts = new Set<number>(Array.isArray(b.knownContacts) ? b.knownContacts.map(Number).filter(Boolean) : [])
  return inbox(!!b.fresh, known, knownContacts)
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
  return NextResponse.json(data)
}
