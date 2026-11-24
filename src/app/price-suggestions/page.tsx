"use client"
import { PageShell } from "@/components/PageShell"

export default function PriceSuggestionsPage() {
  return (
    <PageShell
      title="Price Suggestions"
      breadcrumb="Front End → Price Suggestions"
      description="AI-generated pricing suggestions based on competitor pricing, refund rates and demand. Review before applying."
      stats={[
        { label: "Suggestions", value: "—" },
        { label: "Price increases", value: "—" },
        { label: "Price decreases", value: "—" },
        { label: "Est. margin impact", value: "—" },
      ]}
    />
  )
}
