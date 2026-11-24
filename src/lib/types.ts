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

export interface KPIData {
  revenue: number
  spend: number
  cogs: number
  estCogs: number
  txnFees: number
  profit: number
  orders: number
  roas: number
  cogsPercent: number
  sessions: number
  cvr: number | null
  refundAmount: number
  refundRate: number
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
}
