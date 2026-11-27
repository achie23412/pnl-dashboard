// The customer's emails with us (CommsLayer) for a chargeback: finds the contact by email in every
// CommsLayer account, then the conversations of that contact and their public messages.
// CommsLayer can't list conversations per contact, so recent conversations are scanned (capped,
// to stay inside its 60 calls/minute). Read-only.
import { cl, clAll, commslayerTokens, conversationUrl, type ClContact, type ClConversation, type ClMessage } from "@/lib/commslayer"

export type CommsMessage = { at: string; from: "customer" | "us"; text: string }
export type CommsThread = { subject: string | null; createdAt: string; url: string; messages: CommsMessage[] }
export type CustomerComms = { found: boolean; threads: CommsThread[]; note: string | null }

const clean = (html: string) =>
  String(html || "")
    .replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;/g, "'").replace(/&quot;/g, '"')
    .split("\n").filter((l) => !/^\s*(on .+ wrote:|>)/i.test(l)).join(" ")
    .replace(/\s+/g, " ").trim()

export async function customerComms(email: string): Promise<CustomerComms> {
  const tokens = commslayerTokens()
  if (!email) return { found: false, threads: [], note: "The order has no customer email." }
  if (!tokens.length) return { found: false, threads: [], note: "COMMSLAYER_TOKEN isn't set, so customer emails couldn't be read." }
  const threads: CommsThread[] = []
  const errors: string[] = []
  for (const { token } of tokens) {
    try {
      const contacts = (await cl<{ data: ClContact[] }>(token, "/contacts/search", { email })).data || []
      if (!contacts.length) continue
      const ids = new Set(contacts.map((c) => c.id))
      // Open/pending first (small), then the most recent resolved ones
      const convs = [
        ...(await clAll<ClConversation>(token, "/conversations", { "filter[status]": "open" }, 3)),
        ...(await clAll<ClConversation>(token, "/conversations", { "filter[status]": "pending" }, 2)),
        ...(await clAll<ClConversation>(token, "/conversations", { "filter[status]": "resolved" }, 6)),
      ].filter((c) => ids.has(c.contact_id))
      for (const c of convs.slice(0, 6)) {
        const msgs = (await cl<{ data: ClMessage[] }>(token, `/conversations/${c.id}/messages`, { "page[limit]": 100 })).data || []
        const messages = msgs
          .filter((m) => !m.private && (m.message_type === "incoming" || m.message_type === "outgoing"))
          .map((m) => ({ at: m.created_at, from: (m.message_type === "incoming" ? "customer" : "us") as CommsMessage["from"], text: clean(m.content).slice(0, 600) }))
          .filter((m) => m.text)
          .sort((a, b) => a.at.localeCompare(b.at))
        if (messages.length) threads.push({ subject: c.subject, createdAt: c.created_at, url: conversationUrl(c.account_id, c.display_id), messages })
      }
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    }
  }
  threads.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  return {
    found: threads.length > 0,
    threads,
    note: errors.length ? `CommsLayer: ${errors.join("; ")}` : threads.length ? null : "No conversations with this customer found in CommsLayer (recent conversations checked).",
  }
}
