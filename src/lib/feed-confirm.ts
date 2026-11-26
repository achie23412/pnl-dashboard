// Two-step confirmation before a price change (Price Suggestions, Price Ladder). For the Google
// stores the second step shows today's feed change room (max 10% of the feed per day, counted on
// GMC Health) and stops when it's used up. Client-side only.
const GOOGLE_STORES = ["Susan & Allen", "Carter & Collins", "Walsh & Farley"]

export async function confirmTwice(store: string, what: string): Promise<boolean> {
  if (!window.confirm(`${what}\n\nGo ahead?`)) return false
  let feed = ""
  if (GOOGLE_STORES.indexOf(store) >= 0) {
    try {
      const j = await (await fetch("/api/gmc-health?usage=1", { cache: "no-store" })).json()
      const s = (j.stores || []).find((x: { store: string }) => x.store === store) as { limit: number; changed: number } | undefined
      if (s && s.limit) {
        if (s.changed >= s.limit) {
          window.alert(`${store}: today's Google feed limit is used (${s.changed}/${s.limit} products = 10% of the feed). Do this tomorrow.`)
          return false
        }
        feed = `\n\nGoogle feed ${store}: ${s.changed}/${s.limit} products changed today (max 10%). This one counts too.`
      }
    } catch {
      feed = "\n\n(Couldn't read today's Google feed counter; check GMC Health.)"
    }
  }
  return window.confirm(`Second check: ${what}${feed}\n\nConfirm again to go ahead.`)
}

// Count a confirmed price change of a Google store in the daily feed counter (GMC Health)
export async function logGoogleFeedChange(c: { store: string; product: string; oldValue?: string | number | null; newValue?: string | number | null; reason: string }) {
  if (GOOGLE_STORES.indexOf(c.store) < 0) return
  await fetch("/api/gmc-health", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "log", store: c.store, product_id: c.product, title: c.product, kind: "price", old_value: c.oldValue != null ? String(c.oldValue) : null, new_value: c.newValue != null ? String(c.newValue) : null, reason: c.reason }),
  }).catch(() => undefined)
}
