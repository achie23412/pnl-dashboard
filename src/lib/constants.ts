export const STORES = [
  "Overall",
  "LUMEGLASSES",
  "Blinky",
  "Walsh & Farley",
  "Carter & Collins",
  "Susan & Allen",
] as const

export type StoreName = (typeof STORES)[number]

export const STORE_COLORS: Record<string, string> = {
  LUMEGLASSES: "#4E6AA7",
  Blinky: "#5B9EC7",
  "Walsh & Farley": "#4CA082",
  "Carter & Collins": "#8B6BB0",
  "Susan & Allen": "#D47B6A",
}

export const CHANNEL_COLORS: Record<string, string> = {
  Meta: "#4E6AA7",
  TikTok: "#E8456B",
  Google: "#34A853",
}

export const WINDSOR_ACCOUNT_MAP: Record<string, { channel: string; store: string }> = {
  LUMEGLASSES: { channel: "Meta", store: "LUMEGLASSES" },
  "Blinky 1": { channel: "Meta", store: "Blinky" },
  "Lumé_udxtx5": { channel: "TikTok", store: "LUMEGLASSES" },
  "Blinky ad acc": { channel: "TikTok", store: "Blinky" },
  "Carter & Collins": { channel: "Google", store: "Carter & Collins" },
  "Susan & Allen": { channel: "Google", store: "Susan & Allen" },
  "Walsh & Farley": { channel: "Google", store: "Walsh & Farley" },
}

export const SHOPIFY_ACCOUNT_MAP: Record<string, string> = {
  "xq9pn7-dw.myshopify.com": "LUMEGLASSES",
  "ghvi5a-s0.myshopify.com": "Blinky",
  "qqs4yc-x4.myshopify.com": "Walsh & Farley",
  "96bchi-7v.myshopify.com": "Carter & Collins",
  "k8zygw-y0.myshopify.com": "Susan & Allen",
}

export const SHOPIFY_STORES: Record<string, { domain: string; envKey: string }> = {
  LUMEGLASSES: { domain: "xq9pn7-dw.myshopify.com", envKey: "SHOPIFY_TOKEN_LUMEGLASSES" },
  Blinky: { domain: "ghvi5a-s0.myshopify.com", envKey: "SHOPIFY_TOKEN_BLINKY" },
  "Walsh & Farley": { domain: "qqs4yc-x4.myshopify.com", envKey: "SHOPIFY_TOKEN_WALSH_FARLEY" },
  "Carter & Collins": { domain: "96bchi-7v.myshopify.com", envKey: "SHOPIFY_TOKEN_CARTER_COLLINS" },
  "Susan & Allen": { domain: "k8zygw-y0.myshopify.com", envKey: "SHOPIFY_TOKEN_SUSAN_ALLEN" },
}

export const SHIPGOODS_SHOP_MAP: Record<number, string> = {
  16918: "LUMEGLASSES",
  18132: "Blinky",
}

export const AVG_COGS_PER_ORDER: Record<string, number> = {
  LUMEGLASSES: 14.59,
  Blinky: 18.87,
  "Walsh & Farley": 20.08,
  "Carter & Collins": 15.48,
  "Susan & Allen": 24.64,
}

export const COGS_SHEET_ID = "1AIROoLY9Is6y4YI-c3I9kFkd4Clm5PymCy4leGR1fYQ"

export const STORE_SHEET_TAB: Record<string, string> = {
  "Carter & Collins": "Launch Sheet - UK",
  "Susan & Allen": "Launch Sheet - US",
  "Walsh & Farley": "Launch Sheet - Irland",
  Blinky: "Launch Sheet - EUROPE",
}

export const STORE_TIMEZONE: Record<string, string> = {
  LUMEGLASSES: "America/New_York",
  Blinky: "Europe/Amsterdam",
  "Walsh & Farley": "Europe/Dublin",
  "Carter & Collins": "Europe/London",
  "Susan & Allen": "America/New_York",
}

export const STORE_MARKET: Record<string, string> = {
  LUMEGLASSES: "US",
  Blinky: "NL/EU",
  "Walsh & Farley": "IE",
  "Carter & Collins": "UK",
  "Susan & Allen": "US",
}

// Fees follow the Ascend profit sheet (Setup tab): Google stores pay a 6% transaction
// fee on gross revenue and a 10% media buyer fee on ad spend. Meta stores: no media buyer.
export const TRANSACTION_FEE_RATE: Record<string, number> = {
  LUMEGLASSES: 0.029,
  Blinky: 0.029,
  "Walsh & Farley": 0.06,
  "Carter & Collins": 0.06,
  "Susan & Allen": 0.06,
}

export const MEDIA_BUYER_FEE_RATE: Record<string, number> = {
  LUMEGLASSES: 0,
  Blinky: 0,
  "Walsh & Farley": 0.1,
  "Carter & Collins": 0.1,
  "Susan & Allen": 0.1,
}

// Break-even ROAS when profit = revenue − COGS − ad spend − media buyer fee − transaction fee:
// R(1 − cogs% − txn%) = A(1 + mb%)  →  BE ROAS = (1 + mb%) / (1 − cogs% − txn%)
export function breakEvenRoas(cogsRatio: number, txnRate: number, mediaBuyerRate: number): number {
  const margin = 1 - cogsRatio - txnRate
  return margin > 0 ? (1 + mediaBuyerRate) / margin : Infinity
}

export const DATE_PRESETS = [
  { label: "Today", value: "today" },
  { label: "Yesterday", value: "yesterday" },
  { label: "Last 7 days", value: "last_7d" },
  { label: "Last 30 days", value: "last_30d" },
  { label: "This month", value: "this_month" },
  { label: "Last month", value: "last_month" },
  { label: "All time", value: "all_time" },
] as const
