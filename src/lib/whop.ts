const BASE = "https://api.whop.com/api/v1"
const API_KEY = process.env.WHOP_API_KEY ?? ""
const ACCOUNT_ID = process.env.WHOP_ACCOUNT_ID ?? ""

// Whop accounts (one per Whop company; the store companies are sub-accounts of "Whale").
// The first one is WHOP_API_KEY / WHOP_ACCOUNT_ID (Susan & Allen, biz_PmK6HnMrmDitKH), named by
// WHOP_ACCOUNT_LABEL. Other stores: their company id below (not secret), or WHOP_ACCOUNT_ID_<STORE>,
// and WHOP_API_KEY_<STORE> when that company needs its own key (else the main key is used).
const STORE_ACCOUNT_IDS: Record<string, string> = {
  CARTER_COLLINS: "biz_3P2Gsrmd3LCuMv", // Carter & Collins
}
export interface WhopAccount { label: string; key: string; accountId: string }
const EXTRA_STORES: Record<string, string> = { CARTER_COLLINS: "Carter & Collins", SUSAN_ALLEN: "Susan & Allen", WALSH_FARLEY: "Walsh & Farley", LUMEGLASSES: "LUMEGLASSES", BLINKY: "Blinky" }
export function whopAccounts(): WhopAccount[] {
  const out: WhopAccount[] = []
  if (API_KEY) out.push({ label: process.env.WHOP_ACCOUNT_LABEL || "Susan & Allen", key: API_KEY, accountId: ACCOUNT_ID })
  for (const [suffix, store] of Object.entries(EXTRA_STORES)) {
    const id = process.env[`WHOP_ACCOUNT_ID_${suffix}`] || STORE_ACCOUNT_IDS[suffix] || ""
    if (id && id === ACCOUNT_ID) continue // that's the main account
    const key = process.env[`WHOP_API_KEY_${suffix}`] || ""
    if (!id && !key) continue
    out.push({ label: store, key: key || API_KEY, accountId: id })
  }
  return out.filter((a) => a.key)
}

async function whopFetch<T>(path: string, params?: Record<string, string>, key = API_KEY): Promise<T> {
  const url = new URL(`${BASE}${path}`)
  if (params) for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${key}`,
      "Api-Version-Date": "2026-07-18",
      Accept: "application/json",
    },
  })
  if (!res.ok) {
    const body = await res.text().catch(() => "")
    throw new Error(`Whop ${res.status}: ${body.slice(0, 200)}`)
  }
  return res.json() as Promise<T>
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyJson = Record<string, any>

interface Payout {
  id: string
  amount: string
  usd_amount: string
  status: string
  created_at: number
}

interface PagedResponse<T> {
  data: T[]
  page_info?: { end_cursor?: string; has_next_page?: boolean }
}

export interface WhopBalance {
  available: boolean
  balance_usd: number
  pending_usd: number
  withdrawn_usd: number
  income_usd: number
  recent_payouts: { id: string; amount_usd: number; status: string; date: string }[]
}

export function whopConfigured(): boolean {
  return whopAccounts().length > 0
}

function numFromJson(v: unknown): number {
  if (typeof v === "number") return v
  if (typeof v === "string") return parseFloat(v) || 0
  if (v && typeof v === "object" && "amount" in v) return numFromJson((v as AnyJson).amount)
  return 0
}

export async function fetchWhopBalance(account?: WhopAccount): Promise<WhopBalance> {
  const a = account || whopAccounts()[0]
  if (!a) return { available: false, balance_usd: 0, pending_usd: 0, withdrawn_usd: 0, income_usd: 0, recent_payouts: [] }

  const acct: Record<string, string> = a.accountId ? { account_id: a.accountId } : {}
  const [report, payoutsRes] = await Promise.all([
    whopFetch<AnyJson>("/financial_reports", { report_type: "balance_summary", ...acct }, a.key),
    whopFetch<PagedResponse<Payout>>("/payouts", { per_page: "10", ...acct }, a.key).catch((e) => {
      console.warn("[whop] payouts fetch failed (non-blocking):", e instanceof Error ? e.message : e)
      return { data: [] } as PagedResponse<Payout>
    }),
  ])

  // The balance_summary response may use the new format (ending_balance,
  // beginning_balance, rows) or the legacy flat fields. Parse both.
  const balance = numFromJson(report.ending_balance) || numFromJson(report.total_balance) || numFromJson(report.total)
  const pending = numFromJson(report.pending_balance) || numFromJson(report.total_pending_balance)
  const withdrawn = numFromJson(report.total_withdrawals)
  const income = numFromJson(report.total_income)

  console.log("[whop] balance_summary keys:", Object.keys(report).join(", "), "| balance:", balance, "| pending:", pending)

  return {
    available: true,
    balance_usd: balance,
    pending_usd: pending,
    withdrawn_usd: withdrawn,
    income_usd: income,
    recent_payouts: (payoutsRes.data || []).map((p) => ({
      id: p.id,
      amount_usd: parseFloat(p.usd_amount) || parseFloat(p.amount) || 0,
      status: p.status,
      date: p.created_at ? new Date(p.created_at * 1000).toISOString().slice(0, 10) : "",
    })),
  }
}
