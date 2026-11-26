// Chargeback evidence pack: collects the facts Shopify already has about the disputed order
// (payment checks, addresses, tracking and delivery scans, customer history, refunds, policies)
// and writes the rebuttal for the dispute reason. Only facts from Shopify go in; anything only CS
// knows is left as a [CS: …] placeholder that must be filled before saving.
// Saving fills the evidence form in Shopify; the final "Submit" stays a click in Shopify admin.
import { SHOPIFY_STORES } from "@/lib/constants"
import { getShopifyToken } from "@/lib/shopify-sessions"

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

export async function buildEvidencePack(store: string, disputeId: string): Promise<EvidencePack> {
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

  const [o, c, p, s, r, sh, ev] = await Promise.all([Q_ORDER, Q_CUSTOMER, Q_PAYMENT, Q_SHIPPING, Q_REFUNDS].map((q) => gql(cfg.domain, token, q, { id: orderId }))
    .concat([gql(cfg.domain, token, Q_SHOP, {}), gql(cfg.domain, token, Q_EVIDENCE, { id })]))
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
  if (ev.error) missing.push("Shopify's evidence form (the app needs read/write_shopify_payments_dispute_evidences)")

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
  const priorOrders = customer ? Number(customer.numberOfOrders || 0) - 1 : null
  const refunded = refunds.reduce((a, x) => a + Number(x.totalRefundedSet?.shopMoney?.amount || 0), 0)
  const domain = (shop.primaryDomain?.url as string) || `https://${cfg.domain}`
  const ip = (order.clientIp as string) || (evidence?.customerPurchaseIp as string) || null
  const items = ((order.lineItems?.nodes || []) as Json[]).map((l) => `${l.quantity}× ${l.title}${l.variantTitle ? ` (${l.variantTitle})` : ""}`).join("; ")

  const checks: Check[] = [
    { label: "Card security code (CVV)", ok: cvv ? cvv === "M" : null, detail: cvv ? `${cvv}: ${CVV[cvv] || "unknown code"}` : "not available for this payment" },
    { label: "Address check (AVS)", ok: avs ? AVS_GOOD.test(avs) : null, detail: avs ? `${avs}: ${AVS[avs] || "unknown code"}` : "not available for this payment" },
    { label: "Shipped to the billing address", ok: bill && ship ? sameAddress(bill, ship) : null, detail: bill && ship ? (sameAddress(bill, ship) ? "same address" : "different addresses") : "address missing" },
    { label: "Tracking number", ok: tracking.length > 0, detail: tracking.length ? tracking.map((t) => `${t.company || "carrier"} ${t.number}`).join(", ") : "no tracking on the order" },
    { label: "Delivered (carrier scan)", ok: !!delivered, detail: delivered ? `delivered ${day(delivered.deliveredAt || deliveredEvent?.happenedAt)}${deliveredEvent?.city ? ` in ${deliveredEvent.city}` : ""}` : "no delivery scan yet" },
    { label: "Returning customer", ok: priorOrders != null ? priorOrders > 0 : null, detail: priorOrders != null ? `${priorOrders} earlier order(s)${customer?.createdAt ? `, customer since ${day(customer.createdAt)}` : ""}` : "unknown" },
    { label: "Customer IP at purchase", ok: ip ? true : null, detail: ip || "not available" },
    { label: "Refunds on the order", ok: refunded === 0 ? true : null, detail: refunded ? `${refunded.toFixed(2)} already refunded` : "none" },
  ]
  const score = checks.filter((x) => x.ok === true).length
  const fraudish = /FRAUDULENT|UNRECOGNIZED|DEBIT_NOT_AUTHORIZED/.test(reason || "")
  const notReceived = /PRODUCT_NOT_RECEIVED/.test(reason || "")
  const strength: EvidencePack["strength"] = notReceived ? (delivered ? "strong" : tracking.length ? "medium" : "weak")
    : fraudish ? (score >= 5 && delivered ? "strong" : score >= 3 ? "medium" : "weak")
    : score >= 4 ? "medium" : "weak"

  // The rebuttal letter
  const L: string[] = []
  L.push(`Order ${order.name || ""} was placed on ${day(order.createdAt)} for ${amount} (${items || "see order"}) by ${[ship?.name || bill?.name].filter(Boolean).join("")}${order.email ? ` (${order.email})` : ""}.`)
  if (fraudish) {
    L.push("This purchase was authorised by the cardholder:")
    if (cvv) L.push(`- The card security code was checked at checkout: ${CVV[cvv] || cvv}.`)
    if (avs) L.push(`- The address verification (AVS) result was ${avs}: ${AVS[avs] || "see code"}.`)
    if (bill && ship && sameAddress(bill, ship)) L.push(`- The order was shipped to the cardholder's own billing address: ${addr(bill)}.`)
    if (ip) L.push(`- The order was placed from IP address ${ip}.`)
    if (priorOrders && priorOrders > 0) L.push(`- This customer has ${priorOrders} earlier order(s) with us${customer?.createdAt ? ` and has been a customer since ${day(customer.createdAt)}` : ""}, which were not disputed.`)
  }
  if (tracking.length) {
    L.push(`The order was shipped with ${tracking.map((t) => `${t.company || "the carrier"} (tracking ${t.number}${t.url ? `, ${t.url}` : ""})`).join(" and ")}.`)
    if (delivered) L.push(`The carrier confirms delivery on ${day(delivered.deliveredAt || deliveredEvent?.happenedAt)}${deliveredEvent?.city ? ` in ${deliveredEvent.city}${deliveredEvent.country ? `, ${deliveredEvent.country}` : ""}` : ""}${ship ? `, to the shipping address given at checkout: ${addr(ship)}` : ""}.`)
  }
  if (/PRODUCT_UNACCEPTABLE|NOT_AS_DESCRIBED/.test(reason || "")) {
    L.push("[CS: describe what the customer reported, what we offered (return for a refund under our 30-day money-back guarantee, replacement or partial refund) and whether the item was returned.]")
  }
  if (/CREDIT_NOT_PROCESSED/.test(reason || "")) {
    L.push(refunded ? `We already refunded ${refunded.toFixed(2)} ${dispute.amount?.currencyCode || ""} on ${refunds.map((x) => day(x.createdAt)).join(", ")}.` : "[CS: explain why no refund is due, e.g. the item was not returned under the policy.]")
  }
  if (/SUBSCRIPTION|CANCEL/.test(reason || "")) L.push("[CS: state that this was a one-time purchase (no subscription) or when/how the customer cancelled.]")
  if (/DUPLICATE/.test(reason || "")) L.push("[CS: list the other charge and why both are separate orders.]")
  L.push("[CS: add the customer's messages to us, if any (they show the customer knew about the order), and any offers we made.]")
  L.push(`Our refund policy (${domain}/policies/refund-policy) offers a 30-day money-back guarantee from delivery. The customer did not use it before disputing the charge with their bank. [CS: remove this line if the customer did contact us about a return.]`)
  L.push("We ask the bank to reverse this chargeback.")

  const activity = [
    `Order placed ${order.createdAt || ""}${ip ? ` from IP ${ip}` : ""}${order.email ? ` with email ${order.email}` : ""}.`,
    sale ? `Payment ${sale.kind?.toLowerCase()} via ${sale.gateway}${card.company ? ` (${card.company}${card.number ? ` ${card.number}` : ""}${card.wallet ? `, ${card.wallet}` : ""})` : ""}${cvv ? `, CVV ${cvv}` : ""}${avs ? `, AVS ${avs}` : ""}, ${sale.createdAt}.` : "",
    ...fulfillments.map((f) => `Fulfilled ${f.createdAt}${f.inTransitAt ? `, in transit ${f.inTransitAt}` : ""}${f.deliveredAt ? `, delivered ${f.deliveredAt}` : ""}.`),
    ...events.slice(-8).map((e) => `${e.happenedAt}: ${String(e.status).toLowerCase().replace(/_/g, " ")}${e.city ? ` (${e.city})` : ""}${e.message ? ` – ${e.message}` : ""}`),
  ].filter(Boolean).join("\n")

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
    fields: {
      customerEmailAddress: (order.email as string) || "",
      customerFirstName: (ship?.firstName as string) || customer?.firstName || first || "",
      customerLastName: (ship?.lastName as string) || customer?.lastName || rest.join(" ") || "",
      shippingAddress: ship ? { address1: ship.address1 || "", address2: ship.address2 || "", city: ship.city || "", provinceCode: ship.provinceCode || "", zip: ship.zip || "", countryCode: ship.countryCodeV2 || "" } : null,
      accessActivityLog: activity,
      refundPolicyDisclosure: `The refund policy is linked in the store footer and at checkout: ${domain}/policies/refund-policy. It offers a 30-day money-back guarantee from delivery.`,
      refundRefusalExplanation: refunded ? "" : "The customer did not request a refund or return from us before opening the dispute. [CS: change this if they did.]",
      uncategorizedText: L.join("\n\n"),
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
  const pack = await buildEvidencePack(store, disputeId)
  if (!pack.open) return { ok: false, error: "This dispute no longer needs a response." }
  if (!pack.shopifyEvidence) return { ok: false, error: "The store's Shopify app needs the read_ and write_shopify_payments_dispute_evidences scopes." }
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
