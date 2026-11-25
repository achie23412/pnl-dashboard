"use client"
import { PageShell } from "@/components/PageShell"
import { EmptyState } from "@/components/ui"

export default function TeamHubPage() {
  return (
    <PageShell
      title="Team Hub"
      breadcrumb="Team Hub"
      description="Team members, roles and task assignments, and who has access to what."
      stats={[
        { label: "Team members", value: "—" },
        { label: "Active tasks", value: "—" },
        { label: "Completed today", value: "—" },
        { label: "Pending review", value: "—" },
      ]}
    >
      <EmptyState title="Not connected yet">
        This page will list each team member with their role, open tasks and status. Team members and tasks aren&apos;t stored
        in the dashboard yet, so nothing shows here.
      </EmptyState>
    </PageShell>
  )
}
