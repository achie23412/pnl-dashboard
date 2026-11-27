// Chargeback evidence pack: collects the facts Shopify already has about the disputed order
// (payment checks, addresses, tracking and delivery scans, customer history, refunds, policies,
// billing descriptor) plus the customer's emails with us from CommsLayer, and writes the response in
// the dispute-response format: executive summary → timeline → evidence (transaction, shipping &
// delivery, customer communications, policies) → conclusion, with the files to upload and a win
// chance. Only real facts go in; anything only CS knows is a [CS: …] placeholder to fill before saving.
// Saving fills the evidence form in Shopify; the final "Submit" stays a click in Shopify admin.
import { SHOPIFY_STORES } from "@/lib/constants"
import { getShopifyToken } from "@/lib/shopify-sessions"
import { customerComms, type CustomerComms } from "@/lib/dispute-comms"

const API = "2026-10"
type Json = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

async function gql(domain: string, token: string, query: string, variables: Record<string, unknown>): Promise<{ data: Json | null; error: string | null }> {
  try {
    const res = await fetch(`https://${domain}/admin/api/${API}/graphql.json`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
      body: JSON.stringify({ query, variables }),
      cache: "no-store",
      signal: AbortSignal.timeout(20000),
    })
    if (!res.ok) return { data: null, error: `HTTP ${res.status}` }
    const j = await res.json()
    if (j.errors?.length) return { data: j.data || null, error: j.errors.map((e: { message: string }) => e.message).join("; ") }
    return { data: j.data, error: null }
  } catch (e) {
    return { data: null, error: e instanceof Error ? e.message : String(e) }
  }
}

// Small separate queries: if one field isn't available (scope, API change), the rest still loads.
const Q_DISPUTE = `query($id: ID!) { dispute(id: $id) { id status type evidenceDueBy initiatedAt amount { amount currencyCode } reasonDetails { reason networkReasonCode } order { id } } }`
const Q_ORDER = `query($id: ID!) { order(id: $id) { id name createdAt email phone clientIp
  totalPriceSet { shopMoney { amount currencyCode } }
  billingAddress { name address1 address2 city province provinceCode zip country countryCodeV2 }
  shippingAddress { name firstName lastName address1 address2 city province provinceCode zip country countryCodeV2 }
  lineItems(first: 20) { nodes { title variantTitle quantity } } } }`
const Q_CUSTOMER = `query($id: ID!) { order(id: $id) { customer { firstName lastName numberOfOrders createdAt } } }`
const Q_PAYMENT = `query($id: ID!) { order(id: $id) { transactions(first: 10) { kind status gateway createdAt
  paymentDetails { ... on CardPaymentDetails { avsResultCode cvvResultCode company number wallet } } } } }`
const Q_SHIPPING = `query($id: ID!) { order(id: $id) { fulfillments(first: 10) { createdAt status displayStatus deliveredAt inTransitAt
  trackingInfo { company number url }
  events(first: 40) { nodes { status happenedAt message city country } } } } }`
const Q_REFUNDS = `query($id: ID!) { order(id: $id) { refunds(first: 10) { createdAt note totalRefundedSet { shopMoney { amount currencyCode } } } } }`
const Q_SHOP = `query { shop { name primaryDomain { url } } }`
const Q_PRODUCTS = `query($id: ID!) { order(id: $id) { lineItems(first: 20) { nodes { product { handle onlineStoreUrl } } } } }`
// What the customer sees on their card statement (Unrecognized disputes)
const Q_DESCRIPTOR = `query { shopifyPaymentsAccount { chargeStatementDescriptors { default prefix } } }`
const Q_EVIDENCE = `query($id: ID!) { dispute(id: $id) { disputeEvidence { id submitted customerPurchaseIp accessActivityLog uncategorizedText refundPolicyDisclosure
  disputeFileUploads { id originalFileName disputeEvidenceType } } } }`

const AVS: Record<string, string> = {
  Y: "street address and postal code match", X: "street address and 9-digit postal code match", D: "street address and postal code match",
  M: "street address and postal code match", F: "street address and postal code match", A: "street address matches, postal code does not",
  B: "street address matches", P: "postal code matches", W: "9-digit postal code matches, street address does not", Z: "postal code matches, street address does not",
  N: "no match", U: "not available", R: "retry / system unavailable", S: "not supported", G: "not supported (non-US issuer)", I: "not verified",
}
const CVV: Record<string, string> = { M: "matched", N: "did not match", P: "not processed", S: "should have been present", U: "issuer not certified", X: "not available" }
const AVS_GOOD = /^[YXDMFABPWZ]$/
const day = (iso?: string | null) => (iso ? iso.slice(0, 10) : "")
const addr = (a: Json | null) => (a ? [a.address1, a.address2, a.city, a.province, a.zip, a.country].filter(Boolean).join(", ") : "")
const sameAddress = (a: Json | null, b: Json | null) =>
  !!a && !!b && String(a.zip || "").replace(/\s/g, "").toLowerCase() === String(b.zip || "").replace(/\s/g, "").toLowerCase() &&
  String(a.address1 || "").toLowerCase().replace(/\W/g, "").slice(0, 12) === String(b.address1 || "").toLowerCase().replace(/\W/g, "").slice(0, 12)

export type Check = { label: string; ok: boolean | null; detail: string }
export type EvidencePack = {
  store: string
  disputeId: string
  status: string | null
  reason: string | null
  dueBy: string | null
  open: boolean
  orderName: string | null
  adminDisputeUrl: string | null
  checks: Check[]
  strength: "strong" | "medium" | "weak"
  winChance: "High" | "Medium" | "Low"
  filesNeeded: string[] // evidence files to upload in Shopify, with concrete names
  descriptor: string | null
  comms: CustomerComms
  fields: {
    customerEmailAddress: string
    customerFirstName: string
    customerLastName: string
    shippingAddress: { address1: string; address2: string; city: string; provinceCode: string; zip: string; countryCode: string } | null
    accessActivityLog: string
    refundPolicyDisclosure: string
    refundRefusalExplanation: string
    uncategorizedText: string
  }
  shopifyEvidence: { id: string; submitted: boolean; files: string[]; purchaseIp: string | null } | null
  canSave: boolean
  missing: string[] // data we couldn't read (scope or API)
}

export async function buildEvidencePack(store: string, disputeId: string, opts: { comms?: boolean } = {}): Promise<EvidencePack> {
  const cfg = SHOPIFY_STORES[store]
  if (!cfg) throw new Error("Unknown store")
  const token = await getShopifyToken(cfg.domain, cfg.envKey)
  if (!token) throw new Error("No Shopify token for this store")
  const id = disputeId.replace("/OrderDisputeSummary/", "/ShopifyPaymentsDispute/")
  const missing: string[] = []

  const d = await gql(cfg.domain, token, Q_DISPUTE, { id })
  const dispute = d.data?.dispute as Json | null
  if (!dispute) throw new Error(`Couldn't read the dispute: ${d.error || "not found"}`)
  const orderId = dispute.order?.id as string | undefined
  if (!orderId) throw new Error("The dispute has no order")

  const [o, c, p, s, r, pr, sh, ev, ds] = await Promise.all([Q_ORDER, Q_CUSTOMER, Q_PAYMENT, Q_SHIPPING, Q_REFUNDS, Q_PRODUCTS].map((q) => gql(cfg.domain, token, q, { id: orderId }))
    .concat([gql(cfg.domain, token, Q_SHOP, {}), gql(cfg.domain, token, Q_EVIDENCE, { id }), gql(cfg.domain, token, Q_DESCRIPTOR, {})]))
  const order = (o.data?.order || {}) as Json
  if (o.error) missing.push(`order details (${o.error})`)
  const customer = (c.data?.order?.customer || null) as Json | null
  if (c.error) missing.push(`customer history (${c.error})`)
  const txs = (p.data?.order?.transactions || []) as Json[]
  if (p.error) missing.push(`payment checks (${p.error})`)
  const fulfillments = (s.data?.order?.fulfillments || []) as Json[]
  if (s.error) missing.push(`tracking (${s.error})`)
  const refunds = (r.data?.order?.refunds || []) as Json[]
  const shop = (sh.data?.shop || {}) as Json
  const evidence = (ev.data?.dispute?.disputeEvidence || null) as Json | null
  if (ev.error) missing.push(`Shopify's evidence form (${ev.error})`)

  const reason = (dispute.reasonDetails?.reason as string) || null
  const status = (dispute.status as string) || null
  const open = /NEEDS_RESPONSE/i.test(status || "")
  const amount = `${dispute.amount?.amount} ${dispute.amount?.currencyCode}`
  const bill = order.billingAddress as Json | null
  const ship = order.shippingAddress as Json | null
  const sale = txs.find((t) => /SALE|CAPTURE|AUTHORIZATION/.test(t.kind) && t.status === "SUCCESS") || txs[0]
  const card = (sale?.paymentDetails || {}) as Json
  const avs = card.avsResultCode as string | undefined
  const cvv = card.cvvResultCode as string | undefined
  const delivered = fulfillments.find((f) => f.deliveredAt || /DELIVERED/i.test(f.displayStatus || ""))
  const tracking = fulfillments.flatMap((f) => (f.trackingInfo || []) as Json[]).filter((t) => t.number)
  const events = fulfillments.flatMap((f) => ((f.events?.nodes || []) as Json[])).sort((a, b) => String(a.happenedAt).localeCompare(String(b.happenedAt)))
  const deliveredEvent = events.filter((e) => /DELIVERED/i.test(e.status)).pop()
  const deliveredOn = delivered ? day(delivered.deliveredAt || deliveredEvent?.happenedAt) : ""
  const priorOrders = customer ? Number(customer.numberOfOrders || 0) - 1 : null
  const refunded = refunds.reduce((a, x) => a + Number(x.totalRefundedSet?.shopMoney?.amount || 0), 0)
  const domain = (shop.primaryDomain?.url as string) || `https://${cfg.domain}`
  const ip = (order.clientIp as string) || (evidence?.customerPurchaseIp as string) || null
  const lineItems = (order.lineItems?.nodes || []) as Json[]
  const items = lineItems.map((l) => `${l.quantity}× ${l.title}${l.variantTitle ? ` (${l.variantTitle})` : ""}`).join("; ")
  const productUrls = ((pr.data?.order?.lineItems?.nodes || []) as Json[]).map((l) => (l.product?.onlineStoreUrl as string) || (l.product?.handle ? `${domain}/products/${l.product.handle}` : "")).filter(Boolean)
  const desc = (ds.data?.shopifyPaymentsAccount?.chargeStatementDescriptors || null) as Json | null
  const descriptor = desc ? [desc.prefix, desc.default].filter(Boolean).join(" ").trim() || null : null
  if (ds.error) missing.push(`billing descriptor (${ds.error})`)
  const comms: CustomerComms = opts.comms === false ? { found: false, threads: [], note: null } : await customerComms((order.email as string) || "")
  if (comms.note && /CommsLayer:/.test(comms.note)) missing.push(comms.note)
  const sameAddr = bill && ship ? sameAddress(bill, ship) : null
  const initiated = day(dispute.initiatedAt as string)

  const checks: Check[] = [
    { label: "Card security code (CVV)", ok: cvv ? cvv === "M" : null, detail: cvv ? `${cvv}: ${CVV[cvv] || "unknown code"}` : "not available for this payment" },
    { label: "Address check (AVS)", ok: avs ? AVS_GOOD.test(avs) : null, detail: avs ? `${avs}: ${AVS[avs] || "unknown code"}` : "not available for this payment" },
    { label: "Shipped to the billing address", ok: sameAddr, detail: bill && ship ? (sameAddr ? "same address" : "different addresses") : "address missing" },
    { label: "Tracking number", ok: tracking.length > 0, detail: tracking.length ? tracking.map((t) => `${t.company || "carrier"} ${t.number}`).join(", ") : "no tracking on the order" },
    { label: "Delivered (carrier scan)", ok: !!delivered, detail: delivered ? `delivered ${deliveredOn}${deliveredEvent?.city ? ` in ${deliveredEvent.city}` : ""}` : "no delivery scan yet" },
    { label: "Returning customer", ok: priorOrders != null ? priorOrders > 0 : null, detail: priorOrders != null ? `${priorOrders} earlier order(s)${customer?.createdAt ? `, customer since ${day(customer.createdAt)}` : ""}` : "unknown" },
    { label: "Customer IP at purchase", ok: ip ? true : null, detail: ip || "not available" },
    { label: "Refunds on the order", ok: refunded === 0 ? true : null, detail: refunded ? `${refunded.toFixed(2)} already refunded` : "none" },
    { label: "Customer emails (CommsLayer)", ok: comms.found ? true : null, detail: comms.found ? `${comms.threads.length} conversation(s), ${comms.threads.reduce((a, t) => a + t.messages.length, 0)} messages` : comms.note || "not checked" },
    { label: "Billing descriptor", ok: descriptor ? true : null, detail: descriptor ? `"${descriptor}"` : "not readable" },
  ]
  const score = checks.filter((x) => x.ok === true).length
  const fraudish = /FRAUDULENT|UNRECOGNIZED|DEBIT_NOT_AUTHORIZED/.test(reason || "")
  const unrecognized = /UNRECOGNIZED/.test(reason || "")
  const notReceived = /PRODUCT_NOT_RECEIVED/.test(reason || "")
  const unacceptable = /PRODUCT_UNACCEPTABLE|NOT_AS_DESCRIBED/.test(reason || "")
  const creditNotProcessed = /CREDIT_NOT_PROCESSED/.test(reason || "")
  const subscription = /SUBSCRIPTION|CANCEL/.test(reason || "")
  const duplicate = /DUPLICATE/.test(reason || "")
  const strength: EvidencePack["strength"] = notReceived ? (delivered ? "strong" : tracking.length ? "medium" : "weak")
    : fraudish ? (score >= 6 && delivered ? "strong" : score >= 4 ? "medium" : "weak")
    : unacceptable ? (comms.found && delivered ? "medium" : "weak")
    : creditNotProcessed ? (refunded > 0 ? "strong" : "weak")
    : score >= 5 ? "medium" : "weak"
  const winChance: EvidencePack["winChance"] = strength === "strong" ? "High" : strength === "medium" ? "Medium" : "Low"

  // ---- The response, in the format: summary → timeline → evidence → conclusion (only facts we have)
  const who = [ship?.name || bill?.name].filter(Boolean).join("")
  const summary = notReceived
    ? delivered
      ? `The customer says the order did not arrive, but the carrier confirms delivery on ${deliveredOn} to the shipping address the customer entered at checkout.`
      : `The order was shipped with tracking${tracking.length ? ` (${tracking.map((t) => t.number).join(", ")})` : ""}. [CS: the latest carrier status and what we offered the customer.]`
    : unrecognized
      ? `The cardholder placed this order themselves on ${day(order.createdAt)}${descriptor ? `; the charge appears on the statement as "${descriptor}"` : ""}${delivered ? `, and the goods were delivered on ${deliveredOn}` : ""}.`
      : fraudish
        ? `This purchase was made by the cardholder: ${[cvv === "M" ? "the card security code matched" : "", avs && AVS_GOOD.test(avs) ? "the billing address was verified" : "", sameAddr ? "the order shipped to the billing address" : "", delivered ? `delivery was confirmed on ${deliveredOn}` : ""].filter(Boolean).join(", ") || "[CS: the strongest facts]"}.`
        : unacceptable
          ? `The item was delivered as described on the product page. [CS: what the customer reported and the solution we offered (return for a refund under our 30-day money-back guarantee).]`
          : creditNotProcessed
            ? refunded ? `The refund was already processed: ${refunded.toFixed(2)} ${dispute.amount?.currencyCode || ""} on ${refunds.map((x) => day(x.createdAt)).join(", ")}.` : `No refund is due. [CS: why, e.g. the item was never returned under our policy.]`
            : subscription
              ? `This was a one-time purchase, not a subscription. [CS: confirm, or state when/how the customer cancelled.]`
              : duplicate
                ? `This is not a duplicate charge. [CS: the other charge and why both are separate orders.]`
                : `The order was placed by the customer and fulfilled as agreed. [CS: one sentence on the dispute reason.]`

  type T = { at: string; text: string }
  const timeline: T[] = [
    { at: day(order.createdAt), text: `Order ${order.name || ""} placed for ${amount}: ${items || "see order"}${ip ? `, from IP ${ip}` : ""}${order.email ? `, email ${order.email}` : ""}` },
    ...(sale ? [{ at: day(sale.createdAt), text: `Payment ${String(sale.kind || "").toLowerCase()} succeeded${card.company ? ` (${card.company}${card.number ? ` ${card.number}` : ""})` : ""}${cvv ? `, CVV ${cvv}` : ""}${avs ? `, AVS ${avs}` : ""}` }] : []),
    ...fulfillments.map((f) => ({ at: day(f.createdAt), text: `Shipped${(f.trackingInfo || []).length ? ` with ${((f.trackingInfo || []) as Json[]).map((t) => `${t.company || "carrier"} ${t.number}`).join(", ")}` : ""}` })),
    ...(delivered ? [{ at: deliveredOn, text: `Delivered${deliveredEvent?.city ? ` in ${deliveredEvent.city}${deliveredEvent.country ? `, ${deliveredEvent.country}` : ""}` : ""} (carrier scan)` }] : []),
    ...comms.threads.flatMap((t) => t.messages.map((m) => ({ at: day(m.at), text: `${m.from === "customer" ? "Customer emailed us" : "We replied"}: "${m.text.slice(0, 140)}${m.text.length > 140 ? "…" : ""}"` }))),
    ...refunds.map((x) => ({ at: day(x.createdAt), text: `Refund of ${Number(x.totalRefundedSet?.shopMoney?.amount || 0).toFixed(2)} ${x.totalRefundedSet?.shopMoney?.currencyCode || ""}` })),
    ...(initiated ? [{ at: initiated, text: "Dispute opened with the bank" }] : []),
  ].filter((t) => t.at).sort((a, b) => a.at.localeCompare(b.at))

  const commsLines = comms.found
    ? comms.threads.flatMap((t) => t.messages.map((m) => `- ${day(m.at)} ${m.from === "customer" ? "customer" : "us"}: ${m.text.slice(0, 220)}${m.text.length > 220 ? "…" : ""}`))
    : [comms.note && !/CommsLayer:/.test(comms.note) ? `- The customer did not contact us before opening the dispute. [CS: check and delete this line if they did.]` : "- [CS: the customer's messages to us, if any, with dates.]"]

  const L: string[] = []
  L.push("EXECUTIVE SUMMARY", summary, "§")
  L.push("TIMELINE", ...timeline.map((t) => `- ${t.at}: ${t.text}`), "§")
  L.push("EVIDENCE", "§")
  L.push("Transaction details",
    `- Order ${order.name || ""}, placed ${day(order.createdAt)} by ${who || "the customer"}${order.email ? ` (${order.email})` : ""}`,
    cvv ? `- Card security code (CVV): ${CVV[cvv] || cvv}` : "",
    avs ? `- Address verification (AVS): ${avs}, ${AVS[avs] || "see code"}` : "",
    ip ? `- IP address at purchase: ${ip}` : "",
    priorOrders && priorOrders > 0 ? `- Returning customer: ${priorOrders} earlier order(s), none disputed${customer?.createdAt ? `, customer since ${day(customer.createdAt)}` : ""}` : "",
    unrecognized && descriptor ? `- The charge appears on the card statement as "${descriptor}", the name of our store` : "",
    "§")
  L.push("Shipping & delivery",
    tracking.length ? `- Tracking: ${tracking.map((t) => `${t.company || "carrier"} ${t.number}${t.url ? ` (${t.url})` : ""}`).join("; ")}` : "- [CS: tracking number and carrier]",
    delivered ? `- Delivered on ${deliveredOn}${deliveredEvent?.city ? ` in ${deliveredEvent.city}` : ""} (carrier delivery scan)` : "",
    ship ? `- Shipping address (entered by the customer): ${addr(ship)}${sameAddr ? ", the same as the billing address" : ""}` : "",
    "§")
  L.push("Customer communications", ...commsLines, "§")
  L.push("Policies",
    `- Refund policy (${domain}/policies/refund-policy): 30-day money-back guarantee from delivery${refunded ? "" : "; the customer did not use it before disputing the charge"}`,
    `- Terms of service: ${domain}/policies/terms-of-service`,
    unacceptable && productUrls.length ? `- Product page: ${productUrls.join(", ")}` : "",
    "§")
  L.push("CONCLUSION",
    notReceived && delivered ? "The order was delivered to the customer's own address, as the carrier confirms. We ask the bank to reverse this chargeback."
      : fraudish ? "The evidence shows the cardholder authorised and received this order. We ask the bank to reverse this chargeback."
        : creditNotProcessed && refunded ? "The refund has already been made, so the customer would be refunded twice. We ask the bank to reverse this chargeback."
          : "The order was fulfilled as described and our refund policy was open to the customer. We ask the bank to reverse this chargeback.")

  // ---- Files to upload in Shopify, with concrete names
  const filesNeeded: string[] = []
  if (delivered) filesNeeded.push(`Proof of delivery: carrier tracking page showing the package delivered on ${deliveredOn}${deliveredEvent?.city ? ` in ${deliveredEvent.city}` : ""} (${tracking.map((t) => t.number).join(", ")})`)
  else if (tracking.length) filesNeeded.push(`Shipping proof: carrier tracking page for ${tracking.map((t) => `${t.company || ""} ${t.number}`.trim()).join(", ")} with the latest status`)
  filesNeeded.push(`Order confirmation: Shopify order ${order.name || ""} page showing items, price, ${ship ? "shipping address" : "customer"} and payment (CVV/AVS)`)
  if (fraudish) filesNeeded.push("Customer history: Shopify customer page showing earlier orders that were not disputed")
  if (unrecognized) filesNeeded.push(`Billing descriptor: Shopify Payments settings showing the statement name "${descriptor || "…"}"`)
  if (comms.found) filesNeeded.push(`Customer emails: screenshot or PDF of the CommsLayer conversation${comms.threads.length > 1 ? "s" : ""} (${comms.threads.map((t) => day(t.createdAt)).join(", ")}), with dates visible`)
  if (unacceptable) filesNeeded.push(`Product page: screenshot of ${productUrls[0] || "the product page"} showing the description, photos and size chart as sold`)
  if (creditNotProcessed && refunded) filesNeeded.push(`Refund receipt: Shopify refund of ${refunded.toFixed(2)} on ${refunds.map((x) => day(x.createdAt)).join(", ")}`)
  filesNeeded.push(`Refund policy: screenshot of ${domain}/policies/refund-policy (30-day money-back guarantee)`)

  const [first, ...rest] = String(ship?.name || bill?.name || "").split(" ")
  return {
    store,
    disputeId: id,
    status,
    reason,
    dueBy: (dispute.evidenceDueBy as string) || null,
    open,
    orderName: (order.name as string) || null,
    // The order page in Shopify admin shows the dispute with its "Submit response" button
    adminDisputeUrl: `https://admin.shopify.com/store/${cfg.domain.replace(".myshopify.com", "")}/orders/${orderId.split("/").pop()}`,
    checks,
    strength,
    winChance,
    filesNeeded,
    descriptor,
    comms,
    fields: {
      customerEmailAddress: (order.email as string) || "",
      customerFirstName: (ship?.firstName as string) || customer?.firstName || first || "",
      customerLastName: (ship?.lastName as string) || customer?.lastName || rest.join(" ") || "",
      shippingAddress: ship ? { address1: ship.address1 || "", address2: ship.address2 || "", city: ship.city || "", provinceCode: ship.provinceCode || "", zip: ship.zip || "", countryCode: ship.countryCodeV2 || "" } : null,
      accessActivityLog: timeline.filter((t) => !/Customer emailed|We replied/.test(t.text)).map((t) => `${t.at}: ${t.text}`).concat(events.slice(-8).map((e) => `${day(e.happenedAt)}: carrier ${String(e.status).toLowerCase().replace(/_/g, " ")}${e.city ? ` (${e.city})` : ""}${e.message ? ` – ${e.message}` : ""}`)).join("\n"),
      refundPolicyDisclosure: `The refund policy is linked in the store footer and at checkout: ${domain}/policies/refund-policy. It offers a 30-day money-back guarantee from delivery.`,
      refundRefusalExplanation: refunded ? "" : comms.found ? "[CS: why no refund was given, based on the conversation above.]" : "The customer did not request a refund or return from us before opening the dispute. [CS: change this if they did.]",
      uncategorizedText: L.filter(Boolean).join("\n").replace(/§/g, "").trim(),
    },
    shopifyEvidence: evidence ? { id: evidence.id, submitted: !!evidence.submitted, files: ((evidence.disputeFileUploads || []) as Json[]).map((f) => `${f.disputeEvidenceType}: ${f.originalFileName}`), purchaseIp: evidence.customerPurchaseIp || null } : null,
    canSave: !!evidence && open && !evidence.submitted,
    missing,
  }
}

const M_UPDATE = `mutation($id: ID!, $input: ShopifyPaymentsDisputeEvidenceUpdateInput!) {
  disputeEvidenceUpdate(id: $id, input: $input) { disputeEvidence { id submitted } userErrors { field message } } }`

// Fills Shopify's evidence form (never submits it: the Owner clicks Submit in Shopify admin).
export async function saveEvidence(store: string, disputeId: string, fields: EvidencePack["fields"]): Promise<{ ok: true } | { ok: false; error: string }> {
  const text = Object.values(fields).filter((v) => typeof v === "string").join(" ")
  if (/\[CS:/.test(text)) return { ok: false, error: "Fill in or delete every [CS: …] line first." }
  const pack = await buildEvidencePack(store, disputeId, { comms: false })
  if (!pack.open) return { ok: false, error: "This dispute no longer needs a response." }
  if (!pack.shopifyEvidence) return { ok: false, error: `Shopify's evidence form couldn't be read${pack.missing.length ? `: ${pack.missing.join("; ")}` : ""}. Copy the texts into Shopify instead.` }
  if (pack.shopifyEvidence.submitted) return { ok: false, error: "Evidence was already submitted in Shopify." }
  const cfg = SHOPIFY_STORES[store]
  const token = await getShopifyToken(cfg.domain, cfg.envKey)
  if (!token) return { ok: false, error: "No Shopify token" }
  const input: Json = {
    customerEmailAddress: fields.customerEmailAddress || undefined,
    customerFirstName: fields.customerFirstName || undefined,
    customerLastName: fields.customerLastName || undefined,
    accessActivityLog: fields.accessActivityLog || undefined,
    refundPolicyDisclosure: fields.refundPolicyDisclosure || undefined,
    refundRefusalExplanation: fields.refundRefusalExplanation || undefined,
    uncategorizedText: fields.uncategorizedText || undefined,
  }
  if (fields.shippingAddress?.address1) {
    const a = fields.shippingAddress
    input.shippingAddress = { address1: a.address1, address2: a.address2 || undefined, city: a.city, zip: a.zip, countryCode: a.countryCode || undefined, provinceCode: a.provinceCode || undefined }
  }
  const r = await gql(cfg.domain, token, M_UPDATE, { id: pack.shopifyEvidence.id, input })
  if (r.error) return { ok: false, error: r.error }
  const errs = (r.data?.disputeEvidenceUpdate?.userErrors || []) as { field: string[] | null; message: string }[]
  if (errs.length) return { ok: false, error: errs.map((e) => `${(e.field || []).join(".")}: ${e.message}`).join("; ") }
  return { ok: true }
}
