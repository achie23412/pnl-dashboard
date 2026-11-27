// Claude writes the chargeback response from the evidence pack (facts from Shopify + the customer's
// CommsLayer emails), in the dispute-response format: executive summary → timeline → evidence →
// conclusion, plus the files to upload and a win probability. It may only use the facts given;
// anything missing stays a [CS: …] placeholder for the CS Manager. Nothing is sent anywhere: the text
// goes back into the editor, and saving to Shopify stays a separate click.
import Anthropic from "@anthropic-ai/sdk"
import type { EvidencePack } from "@/lib/dispute-evidence"

const MODEL = "claude-opus-5-5"

const SYSTEM = `You are a Shopify Payments dispute specialist with years of experience winning chargebacks for online stores.

STORE POLICY (always true, use it where relevant):
- 30-day money-back guarantee from delivery (refund policy page).
- Full refund, no fees, for a cancellation before dispatch.
- No exchanges: the customer returns the item for a refund and reorders.

YOUR TASK
Write the response to the bank for this dispute, using ONLY the facts in the evidence pack you receive (Shopify order, payment checks, shipping and delivery, customer history, refunds, policies, billing descriptor, and the customer's emails with us from our support inbox).

FORMAT (plain text, these headings exactly):
EXECUTIVE SUMMARY
[1–2 sentences that answer the dispute reason directly]

TIMELINE
[- YYYY-MM-DD: event — chronological: order, payment, shipping, delivery, every customer email (one line each, summarised), refunds, dispute opened]

EVIDENCE
Transaction details
[- order number and date, CVV, AVS, IP, returning customer; 3-D Secure only if given]
Shipping & delivery
[- carrier and tracking, delivery confirmation with date and place, address match]
Customer communications
[- per email: date and a one-line summary; show where the customer acknowledged the order or refused a solution we offered]
Policies
[- refund policy and terms with their links]

CONCLUSION
[1–2 sentences why the dispute should be decided in the store's favour]

Then a line with exactly "---" and after it:
EVIDENCE FILES NEEDED
[- one file per line, with a concrete name, e.g. "Delivery confirmation showing the package delivered on 2026-11-12 to the verified shipping address"]
WIN PROBABILITY: Low | Medium | High

PRIORITISE PER REASON
- Fraudulent: CVV, AVS, 3-D Secure, IP, billing = shipping address, returning customer, delivery confirmation.
- Unrecognized: the billing descriptor the customer sees, the order confirmation, any contact with customer service, delivery.
- Product not received: tracking, delivery confirmation, address match, what we offered.
- Product unacceptable / not as described: the product page, what the customer reported, the solutions we offered (return under the 30-day guarantee).
- Credit not processed: the refund already made, or why none is due under the policy.
- Subscription cancelled: one-time purchase, no subscription.
- Duplicate: why the charges are separate orders.

NEVER
- Invent, guess or exaggerate a fact, date, tracking event, email or offer. If something the response needs is not in the pack, write a placeholder like [CS: what we offered the customer] — the CS Manager fills it in.
- Use an aggressive or emotional tone, long paragraphs, or apologies without facts.
- Include internal notes, links to our support tool, or anything about other customers.
- Write in any language but English.`

export type WrittenResponse = { text: string; files: string[]; winChance: EvidencePack["winChance"] | null }

export async function writeResponse(pack: EvidencePack): Promise<WrittenResponse> {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set in Vercel.")
  const facts = {
    store: pack.store,
    order: pack.orderName,
    dispute_reason: pack.reason,
    evidence_due_by: pack.dueBy,
    checks: pack.checks.map((c) => `${c.label}: ${c.detail}`),
    billing_descriptor: pack.descriptor,
    activity_log: pack.fields.accessActivityLog,
    shipping_address: pack.fields.shippingAddress,
    customer: { email: pack.fields.customerEmailAddress, first_name: pack.fields.customerFirstName, last_name: pack.fields.customerLastName },
    customer_emails: pack.comms.found
      ? pack.comms.threads.map((t) => ({ subject: t.subject, started: t.createdAt, messages: t.messages }))
      : `none found (${pack.comms.note || "not checked"})`,
    refund_policy: pack.fields.refundPolicyDisclosure,
    draft_response: pack.fields.uncategorizedText,
    suggested_files: pack.filesNeeded,
  }
  // output_config (effort) is newer than the installed SDK types, so the params are cast; the SDK sends them as-is.
  const params = {
    model: MODEL,
    max_tokens: 4000,
    system: SYSTEM,
    output_config: { effort: "medium" },
    messages: [{ role: "user", content: `Evidence pack for this dispute (JSON):\n\n${JSON.stringify(facts, null, 2)}\n\nWrite the response.` }],
  } as unknown as Anthropic.MessageCreateParamsNonStreaming
  const res = await new Anthropic().messages.create(params)
  if ((res.stop_reason as string) === "refusal") throw new Error("Claude declined to write this response.")
  const raw = res.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("").trim()
  const [body, tail = ""] = raw.split(/\n-{3,}\s*\n/)
  const files = (tail.match(/EVIDENCE FILES NEEDED\s*([\s\S]*?)(?=WIN PROBABILITY|$)/i)?.[1] || "")
    .split("\n").map((l) => l.replace(/^[-*•\d.)\s]+/, "").trim()).filter(Boolean)
  const win = tail.match(/WIN PROBABILITY:\s*(Low|Medium|High)/i)?.[1]
  return {
    text: body.trim(),
    files,
    winChance: win ? ((win[0].toUpperCase() + win.slice(1).toLowerCase()) as EvidencePack["winChance"]) : null,
  }
}
