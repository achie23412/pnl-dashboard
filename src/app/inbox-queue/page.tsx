"use client"
import { PageShell } from "@/components/PageShell"

export default function InboxQueuePage() {
  return (
    <PageShell
      title="Inbox Queue"
      breadcrumb="Customer Service → Inbox Queue"
      description="Customer support tickets across all stores. Track SLA, response times and resolution."
      stats={[
        { label: "Open tickets", value: "—" },
        { label: "Avg response time", value: "—" },
        { label: "SLA breached", value: "—" },
        { label: "Resolved today", value: "—" },
      ]}
    />
  )
}
