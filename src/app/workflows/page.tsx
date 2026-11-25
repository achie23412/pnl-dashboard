"use client"
import { PageShell } from "@/components/PageShell"
import { Panel, Badge, TH, TD, ROW_BORDER } from "@/components/ui"

// Planned automations. Only the daily data refresh runs today; the others aren't built yet.
const WORKFLOWS = [
  { name: "Quality alert", desc: "Flags a product when its quality refund rate hits 10% with 20+ units sold.", runs: "On refund", live: false },
  { name: "Risky product notification", desc: "Tells the supplier when a product gets 2+ complaints in 7 days.", runs: "On complaint", live: false },
  { name: "Refund approval routing", desc: "Sends refunds over €100 to the owner for approval.", runs: "On refund submit", live: false },
  { name: "Daily P&L sync", desc: "Pulls revenue, ad spend and COGS for the daily report.", runs: "Daily ~07:00 Amsterdam", live: true },
]

export default function WorkflowsPage() {
  return (
    <PageShell
      title="Workflows"
      breadcrumb="Workflows"
      description="Automations for refund processing, quality alerts, supplier notifications and the daily data refresh."
      stats={[
        { label: "Active workflows", value: "—" },
        { label: "Runs today", value: "—" },
        { label: "Failed", value: "—" },
        { label: "Last run", value: "—" },
      ]}
    >
      <Panel title="Workflows" sub="Run history isn't connected yet, so there are no run counts." pad={false} className="mb-4">
        <table className="w-full text-[11px]">
          <thead>
            <tr style={{ color: "var(--text-dim)" }}>
              <th className={`${TH} text-left`}>Workflow</th>
              <th className={`${TH} text-left`}>Runs</th>
              <th className={`${TH} text-left`}>Status</th>
            </tr>
          </thead>
          <tbody>
            {WORKFLOWS.map((w) => (
              <tr key={w.name} style={ROW_BORDER}>
                <td className={TD}>
                  <div className="font-medium" style={{ color: "var(--text)" }}>{w.name}</div>
                  <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>{w.desc}</div>
                </td>
                <td className={TD} style={{ color: "var(--text-dim)" }}>{w.runs}</td>
                <td className={TD}>
                  <Badge tone={w.live ? "green" : "grey"}>{w.live ? "Running" : "Not built yet"}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </PageShell>
  )
}
