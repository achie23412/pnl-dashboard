// Everything on the dashboard is shown in EUR.
// Ad spend (Meta, TikTok, Google) is already EUR. Shopify revenue comes in
// each shop's own currency, and Shipgoods COGS is USD, so those get converted
// at the ECB rate of that day (Frankfurter API, free, no key).

export type Currency = "EUR" | "USD" | "GBP"

// Shop currency per store (checked via Windsor order_currency, 2026-11-24)
export const STORE_CURRENCY: Record<string, Currency> = {
  LUMEGLASSES: "USD",
  Blinky: "EUR",
  "Walsh & Farley": "EUR",
  "Carter & Collins": "GBP",
  "Susan & Allen": "USD",
}

// Shipgoods costs and AVG_COGS_PER_ORDER are in USD
export const COGS_CURRENCY: Currency = "USD"

// Units of foreign currency per 1 EUR, used if the rate API is unreachable
const FALLBACK: Record<Exclude<Currency, "EUR">, number> = { USD: 1.11, GBP: 0.835 }

export interface EurRates {
  dates: string[] // sorted ascending
  byDate: Record<string, { USD: number; GBP: number }>
  fallback: boolean
}

export const FALLBACK_RATES: EurRates = { dates: [], byDate: {}, fallback: true }

export async function fetchEurRates(from: string, to: string): Promise<EurRates> {
  // Start a week earlier so weekends/holidays at the start have a previous rate
  const start = new Date(new Date(from).getTime() - 7 * 86400000).toISOString().slice(0, 10)
  try {
    const res = await fetch(`https://api.frankfurter.dev/v1/${start}..${to}?base=EUR&symbols=USD,GBP`)
    if (!res.ok) throw new Error(String(res.status))
    const json = await res.json()
    const byDate = json.rates as EurRates["byDate"]
    const dates = Object.keys(byDate).sort()
    if (dates.length === 0) return FALLBACK_RATES
    return { dates, byDate, fallback: false }
  } catch {
    return FALLBACK_RATES
  }
}

export async function fetchLatestEurRates(): Promise<{ USD: number; GBP: number }> {
  try {
    const res = await fetch("https://api.frankfurter.dev/v1/latest?base=EUR&symbols=USD,GBP")
    if (!res.ok) throw new Error(String(res.status))
    const json = await res.json()
    return { USD: json.rates.USD, GBP: json.rates.GBP }
  } catch {
    return FALLBACK
  }
}

// Rate for a date = that day's ECB rate, or the last one before it (weekends)
function rateFor(currency: Exclude<Currency, "EUR">, date: string, rates: EurRates): number {
  const { dates, byDate } = rates
  if (dates.length === 0) return FALLBACK[currency]
  let lo = 0
  let hi = dates.length - 1
  let found = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (dates[mid] <= date) {
      found = mid
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  const d = found >= 0 ? dates[found] : dates[0]
  return byDate[d]?.[currency] || FALLBACK[currency]
}

export function toEur(amount: number, currency: Currency, date: string, rates: EurRates): number {
  if (currency === "EUR" || !amount) return amount
  return amount / rateFor(currency, date, rates)
}
