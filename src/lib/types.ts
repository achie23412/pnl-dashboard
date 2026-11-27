export interface RevenueRow {
  date: string
  store: string
  revenue: number
  orders: number
}

export interface SpendRow {
  date: string
  channel: string
  account: string
  store: string
  spend: number
}

export interface CogsRow {
  date: string
  store: string
  cogs: number
}

export interface SessionsRow {
  date: string
  store: string
  sessions: number
}

export interface DailyPnL {
  date: string
  revenue: number
  spend: number
  cogs: number
  estCogs: number
  profit: number
  orders: number
}

export interface RefundRow {
  date: string
  store: string
  amount: number
}

export type CogsConfidence = "actual" | "partial" | "estimated"

export interface KPIData {
  revenue: number
  spend: number
  cogs: number
  estCogs: number
  txnFees: number
  mediaBuyerFees: number
  profit: number
  orders: number
  roas: number
  cogsPercent: number
  sessions: number
  cvr: number | null
  refundAmount: number
  refundRate: number
  breakevenRoas: number
  cogsConfidence: CogsConfidence
}

export interface StoreKPI {
  store: string
  revenue: number
  orders: number
  spend: number
  roas: number
  refundAmount: number
  refundRate: number
  profit: number
}

export interface DailyBriefingRow {
  date: string
  revenue: number
  orders: number
  spend: number
  roas: number
  refundAmount: number
  refundRate: number
  cogs: number
  profit: number
  isToday: boolean
  sessions?: number | null
  cvr?: number | null // orders ÷ human sessions, %
  fees?: number // transaction + media buyer fee
  beRoas?: number | null
}

export interface ProductTest {
  id?: number
  created_at?: string
  product_name: string
  store: string
  launch_date: string
  status: "testing" | "killed" | "scaling" | "winner" | "paused"
  daily_budget: number
  total_spend: number
  total_revenue: number
  total_orders: number
  total_atc: number
  total_clicks: number
  avg_cpc: number
  today_spend: number
  today_revenue: number
  today_orders: number
  yesterday_spend: number
  yesterday_revenue: number
  yesterday_orders: number
  cogs_per_order: number
  notes: string
  kill_reason: string | null
  updated_at?: string
}
