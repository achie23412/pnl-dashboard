"use client"
import { PageShell } from "@/components/PageShell"

export default function ShipmentsPage() {
  return (
    <PageShell
      title="Shipments"
      breadcrumb="Supply Chain → Shipments"
      description="Track all shipments from suppliers. Monitor delivery times, delays, and fulfillment status across stores."
      stats={[
        { label: "In transit", value: "—" },
        { label: "Delivered (7d)", value: "—" },
        { label: "Delayed", value: "—" },
        { label: "Avg delivery", value: "—" },
      ]}
    >
      <div className="glass rounded-xl p-6">
        <div className="text-center py-8">
          <div className="text-[13px] font-medium mb-1" style={{ color: "var(--text-muted)" }}>Shipment tracking from ShipGoods</div>
          <div className="text-[11px]" style={{ color: "var(--text-dim)" }}>Shipment data will sync from the ShipGoods API once connected.</div>
        </div>
      </div>
    </PageShell>
  )
}
