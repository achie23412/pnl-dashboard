// Reads the refund sheets CS fills in and brings them into the dashboard's refund log.
//  - Ascend "Refund Sheet" (tabs Store 1–10; the store name is typed in cell B4 of each tab)
//  - Lumé's own refund sheet (REFUNDS DOCUMENTATION), only refunds since the dashboard log went live
// Shopify refunds are already imported automatically (refund-import.ts) with a guessed reason;
// a sheet row adds the real reason, %, ticket link and who did it to that imported row.
// Only when Shopify has no refund for the order yet, the sheet row becomes a new log entry.
// Rows with reason "Store credit" go to the store credit log.
// Later the direction flips (dashboard → Ascend sheet); until then CS logs in the sheets.
import { SHOPIFY_STORES } from "@/lib/constants"
import { STORE_CURRENCY, fetchLatestEurRates } from "@/lib/currency"
import { getShopifyToken } from "@/lib/shopify-sessions"
import { getServiceClient } from "@/lib/supabase"
import { approvalFor } from "@/lib/refund-control"
import { IMPORTED_BY } from "@/lib/refund-import"

import { ASCEND_SHEET_ID, ASCEND_TABS, LUME_SHEET_ID, LUME_TAB, LUME_FROM } from "@/lib/refund-sheet-links"

type SheetRefund = {
  source: "ascend" | "lume"
  store: string
  date: string // YYYY-MM-DD
  order: string // digits only
  pct: number | null
  amount: number | null
  reason: string
  text: string // what CS wrote (specific reason, notes)
  ticket: string | null
  by: string | null
  storeCredit: boolean
  key: string
}

// ---------- reading ----------
function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cur = ""
  let q = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cur += '"'; i++ }
      else if (ch === '"') q = false
      else cur += ch
    } else if (ch === '"') q = true
    else if (ch === ",") { row.push(cur); cur = "" }
    else if (ch === "\n") { row.push(cur); rows.push(row); row = []; cur = "" }
    else if (ch !== "\r") cur += ch
  }
  if (cur || row.length) { row.push(cur); rows.push(row) }
  return rows
}

async function csv(id: string, gid: number, range: string): Promise<string[][]> {
  const res = await fetch(`https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv&gid=${gid}&range=${range}`, { cache: "no-store", signal: AbortSignal.timeout(12000) })
  if (res.status === 401 || res.status === 403 || (res.headers.get("content-type") || "").includes("text/html")) {
    throw new Error("no access: share the sheet as 'Anyone with the link: Viewer'")
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return parseCsv(await res.text())
}

const num = (s: string | undefined): number | null => {
  const m = String(s || "").replace(/\s/g, "").match(/-?\d+(?:[.,]\d+)?/)
  if (!m) return null
  const v = parseFloat(m[0].replace(",", "."))
  return Number.isFinite(v) ? v : null
}
const pad = (n: number) => String(n).padStart(2, "0")
// "26-11-2026" (day first) or "11-26-2026" (month first); also ISO and slashes
function parseDate(raw: string, dayFirst: boolean): string | null {
  const s = String(raw || "").trim()
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (iso) return `${iso[1]}-${pad(+iso[2])}-${pad(+iso[3])}`
  const p = s.replace(/[^\d]+/g, "-").split("-").filter(Boolean).map(Number)
  if (p.length < 3) return null
  let [a, b, y] = p
  if (y < 100) y += 2000
  if (y < 2024 || y > 2030) return null
  let d = dayFirst ? a : b
  let m = dayFirst ? b : a
  if (m > 12 && d <= 12) [d, m] = [m, d]
  if (m < 1 || m > 12 || d < 1 || d > 31) return null
  return `${y}-${pad(m)}-${pad(d)}`
}
const orderDigits = (s: string) => (String(s || "").match(/\d{3,}/) || [""])[0]
const hash = (s: string) => {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}

// Ascend dropdown + free text → our reason codes
function mapReason(text: string): string {
  const t = text.toLowerCase()
  if (/chargeback|dispute/.test(t)) return "chargeback"
  if (/sizing|too (small|big)|size|fit\b/.test(t) && !/wrong size/.test(t)) return "size_fit"
  if (/wrong (size|item)|missing item|wrong product/.test(t)) return "wrong_item"
  if (/damag|scratch|broken/.test(t)) return "damaged"
  if (/not as described|doesn.t meet|expectation/.test(t)) return "not_as_described"
  if (/quality|defect/.test(t)) return "quality_defect"
  if (/never received|not received|lost|return(ed)? to (the )?sender|rtc|no movement|wrong address|delivered but not/.test(t)) return "not_received"
  if (/delay|customs|logistic|took too long|waiting|slow/.test(t)) return "late_delivery"
  if (/return.*accept|accept.*(offer|%)|cashback|%.*offer|offer.*%|discount|goodwill|store credit/.test(t)) return "goodwill"
  if (/cancel|duplicate|by mistake|no longer want|changed (his|her|their)? ?mind|not ready|accidental|oos|out of stock|unauthori/.test(t)) return "cancel_before_dispatch"
  if (/only refund|refund only|remove/.test(t)) return "changed_mind"
  return "other"
}

async function readAscend(): Promise<{ rows: SheetRefund[]; notes: string[] }> {
  const rows: SheetRefund[] = []
  const notes: string[] = []
  await Promise.all(ASCEND_TABS.map(async (gid, i) => {
    try {
      const head = await csv(ASCEND_SHEET_ID, gid, "A4:C4")
      const name = (head[0]?.slice(1).find((x) => x.trim()) || "").trim()
      if (!name) return // tab not in use yet
      const store = Object.keys(SHOPIFY_STORES).find((s) => s.toLowerCase() === name.toLowerCase() || name.toLowerCase().includes(s.toLowerCase()))
      if (!store) { notes.push(`Store ${i + 1}: "${name}" isn't one of the dashboard's stores`); return }
      const data = await csv(ASCEND_SHEET_ID, gid, "A8:O2007")
      for (const c of data) {
        const order = orderDigits(c[1])
        const date = parseDate(c[0], true) || parseDate(c[13], true)
        if (!order || !date) continue
        const reasonPick = (c[6] || "").trim()
        const text = [c[7], c[14]].map((x) => (x || "").trim()).filter(Boolean).join(" · ")
        const pct = num(c[5])
        const amount = num(c[9])
        rows.push({
          source: "ascend", store, date, order, pct, amount,
          reason: mapReason(`${reasonPick} ${text}`),
          text: [reasonPick, text].filter(Boolean).join(": "),
          ticket: /^https?:\/\//.test((c[2] || "").trim()) ? c[2].trim() : null,
          by: (c[12] || c[11] || "").trim() || null,
          storeCredit: /store credit/i.test(reasonPick),
          key: `ascend:${hash([store, order, date, pct, amount, reasonPick].join("|"))}`,
        })
      }
    } catch (e) {
      notes.push(`Ascend sheet Store ${i + 1}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }))
  return { rows, notes }
}

async function readLume(): Promise<{ rows: SheetRefund[]; notes: string[] }> {
  try {
    const data = await csv(LUME_SHEET_ID, LUME_TAB, "A2:G3000")
    const rows: SheetRefund[] = []
    for (const c of data) {
      const date = parseDate(c[0], false)
      const order = orderDigits(c[2])
      if (!date || !order || date < LUME_FROM) continue
      const e = (c[4] || "").trim()
      const f = (c[5] || "").trim()
      const pct = /%/.test(e) ? num(e) : null
      const amount = /\$|eur|€|^\d/i.test(f) ? num(f) : /\$/.test(e) ? num(e) : null
      const text = (c[6] || "").trim()
      rows.push({
        source: "lume", store: "LUMEGLASSES", date, order, pct, amount,
        reason: mapReason(text),
        text,
        ticket: null,
        by: null,
        storeCredit: false,
        key: `lume:${hash([order, date, e, f].join("|"))}`,
      })
    }
    return { rows, notes: [] }
  } catch (e) {
    return { rows: [], notes: [`Lumé refund sheet: ${e instanceof Error ? e.message : String(e)}`] }
  }
}

async function shopifyOrder(store: string, digits: string): Promise<{ id: string; total: number; currency: string; email: string | null } | null> {
  const cfg = SHOPIFY_STORES[store]
  if (!cfg) return null
  const token = await getShopifyToken(cfg.domain, cfg.envKey).catch(() => null)
  if (!token) return null
  const res = await fetch(`https://${cfg.domain}/admin/api/2024-10/orders.json?status=any&name=${encodeURIComponent("#" + digits)}&fields=id,name,total_price,currency,email`, {
    headers: { "X-Shopify-Access-Token": token }, cache: "no-store", signal: AbortSignal.timeout(10000),
  }).catch(() => null)
  if (!res?.ok) return null
  const o = ((await res.json()).orders || []).find((x: { name: string }) => x.name.replace(/\D/g, "") === digits)
  return o ? { id: String(o.id), total: parseFloat(o.total_price) || 0, currency: o.currency, email: o.email || null } : null
}

// ---------- writing ----------
export async function syncRefundSheets(): Promise<{ enriched: number; added: number; credits: number; notes: string[] }> {
  const db = getServiceClient()
  const [a, l] = await Promise.all([readAscend(), readLume()])
  const rows = [...a.rows, ...l.rows]
  const notes = [...a.notes, ...l.notes]
  let enriched = 0
  let added = 0
  let credits = 0
  if (!rows.length) return { enriched, added, credits, notes }

  const fx = await fetchLatestEurRates()
  const eur = (amount: number, cur: string) => Math.round((amount / (cur === "USD" ? fx.USD : cur === "GBP" ? fx.GBP : 1)) * 100) / 100
  const tag = (k: string) => `[refund-sheet:${k}]`

  // Everything already in the logs that came from a sheet
  const [{ data: logged }, { data: creditRows }] = await Promise.all([
    db.from("cs_refunds").select("id,store,order_number,logged_by,reason_note,percentage,amount").gte("refund_date", "2025-01-01"),
    db.from("cs_store_credits").select("reason_note"),
  ])
  const all = (logged || []) as { id: number; store: string; order_number: string; logged_by: string | null; reason_note: string | null; percentage: number | null; amount: number }[]
  const seen = (k: string) => all.some((r) => (r.reason_note || "").includes(tag(k))) || (creditRows || []).some((r) => String(r.reason_note || "").includes(tag(k)))

  for (const r of rows) {
    if (seen(r.key)) continue
    const label = r.source === "ascend" ? "Ascend refund sheet" : "Lumé refund sheet"
    const who = `${label}${r.by ? ` (${r.by})` : ""}`
    const cur = STORE_CURRENCY[r.store] || "EUR"
    const note = `${r.text || "(no text)"} — from the ${label}. ${tag(r.key)}`

    if (r.storeCredit) {
      const ins = await db.from("cs_store_credits").insert({
        store: r.store, issue_date: r.date, order_number: `#${r.order}`, conversation_url: r.ticket,
        amount: r.amount ?? 0, currency: cur, percentage: r.pct, reason: "goodwill", reason_note: note, logged_by: who,
      })
      if (ins.error) notes.push(`Store credit #${r.order}: ${ins.error.message}`)
      else credits++
      continue
    }

    // 1) Add the real reason to the refund Shopify import already put in the log
    const imported = all.find((x) => x.store === r.store && x.order_number.replace(/\D/g, "") === r.order && x.logged_by === IMPORTED_BY && !(x.reason_note || "").includes("[refund-sheet:"))
    if (imported) {
      const keepTag = ((imported.reason_note || "").match(/\[shopify-refund:[^\]]+\]/) || [""])[0]
      const upd = await db.from("cs_refunds").update({
        reason: r.reason,
        reason_note: `${note} ${keepTag}`.trim(),
        percentage: r.pct ?? imported.percentage,
        conversation_url: r.ticket,
        logged_by: who,
        updated_at: new Date().toISOString(),
      }).eq("id", imported.id)
      if (upd.error) notes.push(`#${r.order}: ${upd.error.message}`)
      else { enriched++; imported.reason_note = note }
      continue
    }

    // 2) Not in Shopify's refunds (yet): log it from the sheet
    const o = await shopifyOrder(r.store, r.order)
    const amount = r.amount ?? (r.pct != null && o ? Math.round(o.total * r.pct) / 100 : 0)
    const amountEur = eur(amount, o?.currency || cur)
    const approval = approvalFor(amountEur, false) === "waiting" ? "flagged" : "not_needed" // already done by CS
    const ins = await db.from("cs_refunds").insert({
      store: r.store, refund_date: r.date, order_number: `#${r.order}`, shopify_order_id: o?.id || null, customer_email: o?.email || null,
      conversation_url: r.ticket, refund_type: (r.pct ?? 0) >= 100 || (o && amount >= o.total - 0.01) ? "full" : "partial",
      reason: r.reason, reason_note: note, percentage: r.pct, amount, currency: o?.currency || cur, order_total: o?.total ?? null,
      logged_by: who, amount_eur: amountEur, approval_status: approval, shopify_status: o ? "checking" : "no_order",
    })
    if (ins.error) notes.push(`#${r.order}: ${ins.error.message}`)
    else { added++; all.push({ id: -1, store: r.store, order_number: `#${r.order}`, logged_by: who, reason_note: note, percentage: r.pct, amount }) }
  }
  return { enriched, added, credits, notes }
}
