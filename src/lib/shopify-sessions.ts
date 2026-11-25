import { SHOPIFY_STORES } from "./constants"

// Online store sessions per store per day, from Shopify Analytics (ShopifyQL).
// Used for store CVR = orders / sessions.
//
// Per store, set ONE of these in Vercel (suffix = the part after SHOPIFY_TOKEN_,
// e.g. LUMEGLASSES, BLINKY, WALSH_FARLEY, CARTER_COLLINS, SUSAN_ALLEN):
//   - SHOPIFY_TOKEN_<SUFFIX>                      Admin API access token (shpat_...)
//   - SHOPIFY_CLIENT_ID_<SUFFIX> + SHOPIFY_CLIENT_SECRET_<SUFFIX>
//                                                 Dev Dashboard app, client credentials grant
// The app needs the read_reports scope.

const API_VERSION = "2026-10"

export interface SessionRow {
  date: string
  store: string
  sessions: number
}

// Exported so the product catalog uses the same token fallback as sessions.
export async function getShopifyToken(domain: string, envKey: string): Promise<string | null> {
  const direct = process.env[envKey]
  if (direct) return direct

  const suffix = envKey.replace("SHOPIFY_TOKEN_", "")
  const clientId = process.env[`SHOPIFY_CLIENT_ID_${suffix}`]
  const clientSecret = process.env[`SHOPIFY_CLIENT_SECRET_${suffix}`]
  if (!clientId || !clientSecret) return null

  const res = await fetch(`https://${domain}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: clientId, client_secret: clientSecret }),
  })
  if (!res.ok) throw new Error(`token ${res.status} ${await res.text()}`)
  const json = await res.json()
  return json.access_token || null
}

export function hasAnySessionsCredentials(): boolean {
  return Object.values(SHOPIFY_STORES).some((c) => {
    const suffix = c.envKey.replace("SHOPIFY_TOKEN_", "")
    return !!process.env[c.envKey] || (!!process.env[`SHOPIFY_CLIENT_ID_${suffix}`] && !!process.env[`SHOPIFY_CLIENT_SECRET_${suffix}`])
  })
}

export async function fetchShopifySessions(dateFrom: string, dateTo: string): Promise<{ rows: SessionRow[]; errors: string[] }> {
  const rows: SessionRow[] = []
  const errors: string[] = []

  for (const [storeName, config] of Object.entries(SHOPIFY_STORES)) {
    try {
      const token = await getShopifyToken(config.domain, config.envKey)
      if (!token) continue

      // Human sessions only (bots excluded): CVR = orders / human sessions
      const shopifyql = `FROM sessions SHOW sessions WHERE human_or_bot_session = 'human' TIMESERIES day SINCE ${dateFrom} UNTIL ${dateTo} ORDER BY day ASC`
      const res = await fetch(`https://${config.domain}/admin/api/${API_VERSION}/graphql.json`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
        body: JSON.stringify({
          query: `query($q: String!) { shopifyqlQuery(query: $q) { tableData { columns { name dataType } rows } parseErrors } }`,
          variables: { q: shopifyql },
        }),
      })
      if (!res.ok) throw new Error(`${res.status} ${await res.text()}`)
      const json = await res.json()
      if (json.errors?.length) throw new Error(json.errors.map((e: { message: string }) => e.message).join(", "))
      const result = json.data?.shopifyqlQuery
      if (result?.parseErrors?.length) throw new Error(`ShopifyQL: ${result.parseErrors.join(", ")}`)

      for (const r of (result?.tableData?.rows || []) as Record<string, string>[]) {
        const date = String(r.day || "").slice(0, 10)
        const sessions = parseInt(String(r.sessions ?? "0"), 10) || 0
        if (date) rows.push({ date, store: storeName, sessions })
      }
    } catch (err: unknown) {
      errors.push(`${storeName}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return { rows, errors }
}
