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
