"use client"
import { PageShell } from "@/components/PageShell"

export default function RefundReportPage() {
  return (
    <PageShell
      title="Refund Report"
      breadcrumb="Finance → Refund Report"
      description="Refund rate by cause, store and product. Target: stay below 5%."
      stats={[
        { label: "Overall refund rate", value: "—" },
        { label: "Total refunds (30d)", value: "—" },
        { label: "Refund value", value: "—" },
        { label: "Target", value: "—" },
      ]}
    />
  )
}
