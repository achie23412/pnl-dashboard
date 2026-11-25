"use client"
import { PageShell } from "@/components/PageShell"

export default function QualityChecksPage() {
  return (
    <PageShell
      title="Quality Checks"
      breadcrumb="Customer Service → Quality Checks"
      description="Products flagged for quality issues based on refund patterns. Order test units or contact supplier."
      stats={[
        { label: "Flagged products", value: "—" },
        { label: "Awaiting supplier", value: "—" },
        { label: "Resolved (30d)", value: "—" },
        { label: "Min units to flag", value: "—" },
      ]}
    />
  )
}
