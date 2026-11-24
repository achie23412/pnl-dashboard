"use client"
import { PageShell } from "@/components/PageShell"

export default function CashflowPage() {
  return (
    <PageShell
      title="Cashflow & Balance"
      breadcrumb="Finance → Cashflow & Balance"
      description="Incoming vs outgoing cash across all stores and payment processors. Track Whale Checkout, Shopify Payments, and PayPal balances."
      stats={[
        { label: "Total balance", value: "—" },
        { label: "Incoming (7d)", value: "—" },
        { label: "Outgoing (7d)", value: "—" },
        { label: "Net flow (7d)", value: "—" },
      ]}
    >
      <div className="glass rounded-xl p-6">
        <div className="text-center py-12">
          <div className="text-[13px] font-medium mb-1" style={{ color: "var(--text-muted)" }}>Payment processor data not connected yet</div>
          <div className="text-[11px]" style={{ color: "var(--text-dim)" }}>Connect Whale Checkout and Shopify Payments to see live balances.</div>
        </div>
      </div>
    </PageShell>
  )
}
