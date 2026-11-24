"use client"
import { PageShell } from "@/components/PageShell"

export default function TeamHubPage() {
  return (
    <PageShell
      title="Team Hub"
      breadcrumb="Team Hub"
      description="Team members, roles, and task assignments. Manage who has access to what."
      stats={[
        { label: "Team members", value: "3" },
        { label: "Active tasks", value: "7" },
        { label: "Completed today", value: "4" },
        { label: "Pending review", value: "2" },
      ]}
    >
      <div className="space-y-2">
        {[
          { name: "Owner", role: "Admin", tasks: 3, status: "Active" },
          { name: "CS Agent 1", role: "Customer Service", tasks: 3, status: "Active" },
          { name: "CS Agent 2", role: "Customer Service", tasks: 1, status: "Away" },
        ].map((m, i) => (
          <div key={i} className="glass rounded-xl px-4 py-3 flex items-center gap-4">
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-[12px] font-bold" style={{ background: "rgba(99,102,241,0.2)", color: "var(--accent)" }}>
              {m.name[0]}
            </div>
            <div className="flex-1">
              <div className="text-[11px] font-semibold" style={{ color: "var(--text)" }}>{m.name}</div>
              <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>{m.role} — {m.tasks} active tasks</div>
            </div>
            <span className="px-2 py-0.5 rounded-full text-[9px] font-medium" style={{
              background: m.status === "Active" ? "rgba(34,197,94,0.15)" : "rgba(148,163,184,0.15)",
              color: m.status === "Active" ? "#22c55e" : "#94a3b8",
            }}>{m.status}</span>
          </div>
        ))}
      </div>
    </PageShell>
  )
}
