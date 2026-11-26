// Media buyer fee per store, switched on from a start date (Store Settings page).
// Before the start date, or with no date set, the fee is 0. Safe to import in pages and API routes.
export type MediaBuyerSetting = { pct: number; from: string | null }
export type FeeSettings = Record<string, MediaBuyerSetting>

export const DEFAULT_MEDIA_BUYER_PCT = 10

// Share of ad spend (0.1 = 10%) on a given day (YYYY-MM-DD)
export function mediaBuyerRate(settings: FeeSettings | null | undefined, store: string, date: string): number {
  const s = settings?.[store]
  if (!s || !s.from || date < s.from) return 0
  return (Number(s.pct) || 0) / 100
}

// Rate that applies today (for break-even ROAS and product margins)
export function mediaBuyerRateNow(settings: FeeSettings | null | undefined, store: string): number {
  return mediaBuyerRate(settings, store, new Date().toISOString().slice(0, 10))
}

export function toFeeSettings(rows: { store: string; media_buyer_fee_pct: number | null; media_buyer_fee_from: string | null }[] | null): FeeSettings {
  const out: FeeSettings = {}
  for (const r of rows || []) out[r.store] = { pct: Number(r.media_buyer_fee_pct ?? DEFAULT_MEDIA_BUYER_PCT), from: r.media_buyer_fee_from ? String(r.media_buyer_fee_from).slice(0, 10) : null }
  return out
}
