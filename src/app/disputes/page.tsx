"use client"
import { PageShell } from "@/components/PageShell"

export default function DisputesPage() {
  return (
    <PageShell
      title="Disputes / Chargebacks"
      breadcrumb="Disputes & Chargebacks → Disputes / Chargebacks"
      description="Payment disputes and chargebacks. Fight or accept — track outcomes."
      stats={[
        { label: "To fight", value: "—" },
        { label: "Waiting", value: "—" },
        { label: "Won (90d)", value: "—" },
        { label: "Lost (90d)", value: "—" },
      ]}
    />
  )
}
