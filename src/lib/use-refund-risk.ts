"use client"
// Products that get refunded too often (refund rate rule in src/lib/refund-loss.ts), for the
// "Risky" badge on every page that lists products. One request per page load, shared.
import { useEffect, useState } from "react"
import type { ProductRisk } from "@/lib/refund-loss"

export type RiskLookup = (store: string, productIds?: (string | number | null | undefined)[] | null, title?: string | null) => ProductRisk | null

let pending: Promise<ProductRisk[]> | null = null
const load = () =>
  (pending ??= fetch("/api/refund-risk")
    .then((r) => r.json())
    .then((j) => ((j.products || []) as ProductRisk[]).filter((p) => p.risky))
    .catch(() => {
      pending = null
      return [] as ProductRisk[]
    }))

export function useRefundRisk(): { risky: ProductRisk[]; find: RiskLookup } {
  const [risky, setRisky] = useState<ProductRisk[]>([])
  useEffect(() => {
    let live = true
    load().then((r) => live && setRisky(r))
    return () => {
      live = false
    }
  }, [])
  const find: RiskLookup = (store, productIds, title) => {
    const ids = (productIds || []).filter(Boolean).map(String)
    const t = (title || "").trim().toLowerCase()
    return (
      risky.find((p) => p.store === store && ((p.product_id && ids.includes(p.product_id)) || (!!t && p.title.trim().toLowerCase() === t))) || null
    )
  }
  return { risky, find }
}
