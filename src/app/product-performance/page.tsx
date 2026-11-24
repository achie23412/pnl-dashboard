"use client"
import { PageShell } from "@/components/PageShell"

export default function ProductPerformancePage() {
  return (
    <PageShell
      title="Product Performance"
      breadcrumb="Front End → Product Performance"
      description="Every product ranked by contribution margin. Click a row to see its daily trend, refund breakdown and ad sets."
      stats={[
        { label: "Total products", value: "—" },
        { label: "Live", value: "—" },
        { label: "Top performer", value: "—" },
        { label: "Avg refund rate", value: "—" },
      ]}
    />
  )
}
