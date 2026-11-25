"use client"
import { PageShell } from "@/components/PageShell"
import { EmptyState } from "@/components/ui"

export default function FulfillmentRisksPage() {
  return (
    <PageShell
      title="Fulfillment Risks"
      breadcrumb="Supply Chain → Fulfillment Risks"
      description="Products and suppliers at risk of fulfillment problems: low stock, shipping delays and unreliable suppliers."
      stats={[
        { label: "High risk", value: "—" },
        { label: "Medium risk", value: "—" },
        { label: "Low risk", value: "—" },
        { label: "Avg risk score", value: "—" },
      ]}
    >
      <EmptyState title="Not connected yet">
        This page will list products with a risk level and what to do about each (for example, pause sales until a supplier
        dispute is solved). It needs shipment, stock and complaint data, which isn&apos;t connected yet.
      </EmptyState>
    </PageShell>
  )
}
