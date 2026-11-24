"use client"
import { PageShell } from "@/components/PageShell"

const ROLES = [
  { name: "CS Specialist", tasks: ["Inbox Queue", "Refunds", "Store Credit", "Disputes (To Fight)"], color: "#6366f1" },
  { name: "Product Manager", tasks: ["Product Rules", "Product Performance", "Price Suggestions", "Season Board"], color: "#22c55e" },
  { name: "Supply Chain", tasks: ["Order Issues", "Supplier Cases", "Shipments", "COGS Invoices"], color: "#f97316" },
  { name: "Owner", tasks: ["Daily Briefing", "Profit & Loss", "Quality Checks", "Risky Products", "Price Deductions"], color: "#ef4444" },
]

export default function TeamHubPage() {
  return (
    <PageShell
      title="Team Hub"
      breadcrumb="Team Hub"
      description="Who does what. Each role sees their work list from the sidebar. Assign team members to roles, and they see only their pages."
    >
      <div className="p-6">
        <div className="grid grid-cols-2 gap-4">
          {ROLES.map((role) => (
            <div
              key={role.name}
              className="rounded-xl p-5"
              style={{
                background: "rgba(255,255,255,0.02)",
                border: "1px solid rgba(255,255,255,0.06)",
              }}
            >
              <div className="flex items-center gap-2 mb-3">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ background: role.color }}
                />
                <div className="text-[13px] font-semibold" style={{ color: "var(--text)" }}>
                  {role.name}
                </div>
              </div>
              <div className="text-[10px] mb-3" style={{ color: "var(--text-dim)" }}>Assigned: —</div>
              <div className="space-y-1">
                {role.tasks.map((task) => (
                  <div
                    key={task}
                    className="px-3 py-1.5 rounded-md text-[10px]"
                    style={{ background: "rgba(255,255,255,0.03)", color: "var(--text-muted)" }}
                  >
                    {task}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-6">
          <button
            className="px-4 py-2 rounded-lg text-[11px] font-medium"
            style={{ background: "var(--accent)", color: "#fff" }}
          >
            + Invite Team Member
          </button>
        </div>
      </div>
    </PageShell>
  )
}
