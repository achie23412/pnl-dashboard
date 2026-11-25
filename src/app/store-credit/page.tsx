"use client"
import { PageShell } from "@/components/PageShell"

export default function StoreCreditPage() {
  return (
    <PageShell
      title="Store Credit"
      breadcrumb="Customer Service → Store Credit"
      description="Issue and track store credits as an alternative to refunds. Lower refund rates, keep customers."
      stats={[
        { label: "To issue", value: "—" },
        { label: "Active (issued)", value: "—" },
        { label: "Used (30d)", value: "—" },
        { label: "Total value issued", value: "—" },
      ]}
    />
  )
}
