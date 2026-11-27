// What the customer-service login (role "cs") may open. Everything else is blocked in middleware:
// pages redirect to CS_HOME, API routes answer 403. Owner-only actions inside these pages (approving
// refunds, writing dispute evidence, saving hours) keep their own "owner" check in the API route.
// Runs in middleware (Edge), so no Node or next/headers imports here.

export const CS_HOME = "/inbox-queue"

// Pages in the CS menu, in menu order
export const CS_PAGES = [
  "/inbox-queue",
  "/refunds",
  "/store-credit",
  "/cs-reports",
  "/quality-checks",
  "/risky-products",
  "/disputes",
] as const

// API routes those pages (and the components on them) call
const CS_API = [
  "/api/auth",
  "/api/inbox",
  "/api/cs-log",
  "/api/cs-evidence",
  "/api/refund-check",
  "/api/refund-orders",
  "/api/refund-risk",
  "/api/shopify-order",
  "/api/product-catalog",
  "/api/product-flags",
  "/api/product-link",
  "/api/disputes",
  "/api/db",
]

// Tables the generic /api/db route may read for CS (Reports reads refunds, the menu reads refresh_log)
export const CS_DB_TABLES = ["refunds", "refresh_log", "store_settings"]

const under = (path: string, base: string) => path === base || path.startsWith(base + "/")

export function csCanOpen(pathname: string): boolean {
  if (pathname.startsWith("/api/")) return CS_API.some((b) => under(pathname, b))
  return CS_PAGES.some((b) => under(pathname, b))
}
