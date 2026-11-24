"use client"
import { PageShell, GlassTable } from "@/components/PageShell"

export default function InboxQueuePage() {
  return (
    <PageShell
      title="Inbox Queue"
      breadcrumb="Back End → Customer Service → Inbox Queue"
      description="All open customer messages waiting for a reply. Sorted by oldest first. Each row shows the customer, store, subject, and how long it has been open. The CS specialist works top to bottom."
      filters
      stats={[
        { label: "Open Tickets", value: "0" },
        { label: "Avg Wait Time", value: "0h" },
        { label: "Replied Today", value: "0", color: "var(--green)" },
        { label: "Overdue (>24h)", value: "0", color: "var(--red)" },
      ]}
      tabs={[
        { label: "Open", count: 0, active: true },
        { label: "Waiting on Customer", count: 0 },
        { label: "Resolved Today", count: 0 },
      ]}
    >
      <GlassTable
        headers={["Ticket", "Customer", "Store", "Subject", "Opened", "Wait Time", "Priority", "Assigned To"]}
        emptyMessage="Inbox is empty. Customer messages appear here once the email/helpdesk is connected."
      />
    </PageShell>
  )
}
