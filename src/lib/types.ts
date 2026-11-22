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

export interface DailyPnL {
  date: string
  revenue: number
  spend: number
  cogs: number
  estCogs: number
  profit: number
  orders: number
}

export interface KPIData {
  revenue: number
  spend: number
  cogs: number
  estCogs: number
  profit: number
  orders: number
  roas: number
  cogsPercent: number
}
