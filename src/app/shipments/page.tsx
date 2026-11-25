"use client"
import { PageShell } from "@/components/PageShell"
import { EmptyState } from "@/components/ui"

export default function ShipmentsPage() {
  return (
    <PageShell
      title="Shipments"
      breadcrumb="Supply Chain → Shipments"
      description="Shipments from suppliers across all stores: delivery times, delays and fulfillment status."
      stats={[
        { label: "In transit", value: "—" },
        { label: "Delivered (7d)", value: "—" },
        { label: "Delayed", value: "—" },
        { label: "Avg delivery", value: "—" },
      ]}
    >
      <EmptyState title="Not connected yet">
        This page will show shipment tracking from ShipGoods once its shipment data is synced. That sync isn&apos;t set up yet,
        so there are no numbers.
      </EmptyState>
    </PageShell>
  )
}
