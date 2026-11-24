"use client"
import { PageShell } from "@/components/PageShell"

export default function ProductRulesPage() {
  return (
    <PageShell
      title="Product Rules"
      breadcrumb="Front End → Product Rules"
      description="Decide what stays live, what gets drafted, and what scales. Based on margin, ROAS and refund rate."
      stats={[
        { label: "Live products", value: "—" },
        { label: "To review", value: "—" },
        { label: "Drafted this week", value: "—" },
        { label: "Avg margin", value: "—" },
      ]}
    />
  )
}
