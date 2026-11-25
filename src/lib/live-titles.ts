// Live (published) product titles per Google store, from the public products feed.
// Used for "does the store already sell this?" checks (Season Board coverage).
const PUBLIC_DOMAIN: Record<string, string> = {
  "Walsh & Farley": "walshandfarley.com",
  "Carter & Collins": "carterandcollins.com",
  "Susan & Allen": "susanandallen.com",
}

export async function liveTitles(stores: string[]): Promise<{ store: string; title: string; productType: string }[]> {
  const out: { store: string; title: string; productType: string }[] = []
  await Promise.all(stores.map(async (store) => {
    const domain = PUBLIC_DOMAIN[store]
    if (!domain) return
    for (let page = 1; page <= 40; page++) {
      try {
        const res = await fetch(`https://${domain}/products.json?limit=250&page=${page}`, {
          headers: { "User-Agent": "Mozilla/5.0 (compatible; pnl-dashboard)" },
          next: { revalidate: 900 },
        })
        if (!res.ok) break
        const batch: { title: string; product_type: string }[] = (await res.json()).products || []
        for (const p of batch) out.push({ store, title: p.title, productType: p.product_type || "" })
        if (batch.length < 250) break
      } catch {
        break
      }
    }
  }))
  return out
}
