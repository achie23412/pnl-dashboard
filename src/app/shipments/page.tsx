"use client"
import { PageShell, GlassTable } from "@/components/PageShell"

export default function ShipmentsPage() {
  return (
    <PageShell
      title="Shipments"
      breadcrumb="Back End → Supply Chain → Shipments"
      description="Track all shipments from suppliers to customers. See which are on time, delayed, or stuck. Each row links to the tracking page."
      filters
      stats={[
        { label: "In Transit", value: "0" },
        { label: "Delivered (7d)", value: "0", color: "var(--green)" },
        { label: "Delayed", value: "0", color: "var(--orange)" },
        { label: "Lost/Stuck", value: "0", color: "var(--red)" },
      ]}
      tabs={[
        { label: "All Shipments", count: 0, active: true },
        { label: "In Transit", count: 0 },
        { label: "Delayed", count: 0 },
        { label: "Delivered", count: 0 },
      ]}
    >
      <GlassTable
        headers={["Order", "Store", "Tracking #", "Carrier", "Shipped", "Est. Delivery", "Status", "Days in Transit", "Last Update"]}
        emptyMessage="No shipment data yet. Tracking data appears once fulfillment is connected."
      />
    </PageShell>
  )
}
