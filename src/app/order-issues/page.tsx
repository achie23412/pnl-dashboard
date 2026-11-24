"use client"
import { PageShell } from "@/components/PageShell"

export default function OrderIssuesPage() {
  return (
    <PageShell
      title="Order Issues"
      breadcrumb="Back End → Order Issues"
      description="Orders with problems — wrong items, missing, delayed. Linked to supplier cases."
      stats={[
        { label: "Open issues", value: "—" },
        { label: "Resolved (30d)", value: "—" },
        { label: "Avg resolution", value: "—" },
        { label: "Supplier A issues", value: "—" },
      ]}
    />
  )
}
