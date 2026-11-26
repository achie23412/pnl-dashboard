const BASE = "https://api.whop.com/api/v1"
const API_KEY = process.env.WHOP_API_KEY ?? ""
const ACCOUNT_ID = process.env.WHOP_ACCOUNT_ID ?? ""

async function whopFetch<T>(path: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(`${BASE}${path}`)
  if (params) for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${API_KEY}`,
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
  return API_KEY.length > 0
}

function numFromJson(v: unknown): number {
  if (typeof v === "number") return v
  if (typeof v === "string") return parseFloat(v) || 0
  if (v && typeof v === "object" && "amount" in v) return numFromJson((v as AnyJson).amount)
  return 0
}

export async function fetchWhopBalance(): Promise<WhopBalance> {
  if (!API_KEY) return { available: false, balance_usd: 0, pending_usd: 0, withdrawn_usd: 0, income_usd: 0, recent_payouts: [] }

  const acct: Record<string, string> = ACCOUNT_ID ? { account_id: ACCOUNT_ID } : {}
  const [report, payoutsRes] = await Promise.all([
    whopFetch<AnyJson>("/financial_reports", { report_type: "balance_summary", ...acct }),
    whopFetch<PagedResponse<Payout>>("/payouts", { per_page: "10", ...acct }).catch((e) => {
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
