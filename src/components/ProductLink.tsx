"use client"
// Clickable product name used everywhere a product is listed.
// Name → the product page in the store. Small ↗ → the product in Shopify admin.
// Clicks don't bubble, so rows that expand on click keep working.

type Props = {
  store: string
  name: string
  productId?: string | number | null
  className?: string
  style?: React.CSSProperties
  maxWidth?: number
}

export function productHref(store: string, name: string, productId?: string | number | null, admin = false) {
  const q = new URLSearchParams({ store, title: name })
  if (productId) q.set("id", String(productId))
  if (admin) q.set("to", "admin")
  return `/api/product-link?${q.toString()}`
}

export function ProductLink({ store, name, productId, className, style, maxWidth = 260 }: Props) {
  const stop = (e: React.MouseEvent) => e.stopPropagation()
  return (
    <span className="inline-flex items-center gap-1 min-w-0" style={{ maxWidth }}>
      <a
        href={productHref(store, name, productId)}
        target="_blank"
        rel="noreferrer"
        onClick={stop}
        title={`Open "${name}" in the ${store} store`}
        className={`truncate hover:underline ${className || "font-medium"}`}
        style={{ color: "var(--text)", ...style }}
      >
        {name}
      </a>
      <a
        href={productHref(store, name, productId, true)}
        target="_blank"
        rel="noreferrer"
        onClick={stop}
        title="Open in Shopify admin"
        aria-label={`Open ${name} in Shopify admin`}
        className="shrink-0 text-[9px] opacity-50 hover:opacity-100"
        style={{ color: "#7dd3fc" }}
      >
        ↗
      </a>
    </span>
  )
}
