const BASE = "https://api.whop.com/api/v1"
const API_KEY = process.env.WHOP_API_KEY || ""

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

interface FinancialReport {
  total_income: string
  total_balance: string
  total_pending_balance: string
  total_withdrawals: string
}

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

export async function fetchWhopBalance(): Promise<WhopBalance> {
  if (!API_KEY) return { available: false, balance_usd: 0, pending_usd: 0, withdrawn_usd: 0, income_usd: 0, recent_payouts: [] }

  const [report, payoutsRes] = await Promise.all([
    whopFetch<FinancialReport>("/financial_reports"),
    whopFetch<PagedResponse<Payout>>("/payouts", { per_page: "10" }),
  ])

  return {
    available: true,
    balance_usd: parseFloat(report.total_balance) || 0,
    pending_usd: parseFloat(report.total_pending_balance) || 0,
    withdrawn_usd: parseFloat(report.total_withdrawals) || 0,
    income_usd: parseFloat(report.total_income) || 0,
    recent_payouts: (payoutsRes.data || []).map((p) => ({
      id: p.id,
      amount_usd: parseFloat(p.usd_amount) || parseFloat(p.amount) || 0,
      status: p.status,
      date: p.created_at ? new Date(p.created_at * 1000).toISOString().slice(0, 10) : "",
    })),
  }
}
