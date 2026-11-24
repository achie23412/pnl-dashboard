"use client"
import { PageShell } from "@/components/PageShell"

export default function CSReportsPage() {
  const sections = [
    { title: "Refund Rate per Store", desc: "Refund amount / revenue. Target: under 5%." },
    { title: "Refund Breakdown by Reason", desc: "Quality, sizing, not received, changed mind, etc." },
    { title: "Funnel Acceptance Rate", desc: "How many refund requests were accepted vs. offered store credit or denied." },
    { title: "Store Credit Percentage", desc: "How much of refund value was given as store credit instead of cash." },
    { title: "Refund Rate by Collection", desc: "Which collections have the highest refund rates." },
    { title: "CS Response Time", desc: "Average time to first reply, by store and day." },
  ]

  return (
    <PageShell
      title="Reports"
      breadcrumb="Back End → Customer Service → Reports"
      description="Weekly CS reports with charts. Refund rate per store, refund breakdown by reason, funnel acceptance rate, store credit stats, and more. Download as a slide deck for the weekly meeting."
      filters
    >
      <div className="p-6">
        <div className="flex justify-between items-center mb-6">
          <div className="text-[13px] font-semibold" style={{ color: "var(--text)" }}>This Week&apos;s Report</div>
          <button
            className="px-4 py-2 rounded-lg text-[11px] font-medium"
            style={{ background: "var(--accent)", color: "#fff" }}
          >
            Download Slide Deck
          </button>
        </div>
        <div className="grid grid-cols-2 gap-4">
          {sections.map((s) => (
            <div
              key={s.title}
              className="rounded-xl p-5"
              style={{
                background: "rgba(255,255,255,0.02)",
                border: "1px solid rgba(255,255,255,0.06)",
              }}
            >
              <div className="text-[12px] font-semibold mb-1" style={{ color: "var(--text)" }}>{s.title}</div>
              <div className="text-[10px] mb-4" style={{ color: "var(--text-dim)" }}>{s.desc}</div>
              <div
                className="h-32 rounded-lg flex items-center justify-center text-[10px]"
                style={{ background: "rgba(255,255,255,0.02)", color: "var(--text-dim)" }}
              >
                Chart placeholder
              </div>
            </div>
          ))}
        </div>
      </div>
    </PageShell>
  )
}
