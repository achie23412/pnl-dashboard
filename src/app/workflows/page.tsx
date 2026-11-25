"use client"
// Workflows: every automation the dashboard runs, with its schedule, last run and what it found.
// Anything that is still done by hand is listed as manual, so nothing looks automated that isn't.
import { useEffect, useState } from "react"
import Link from "next/link"
import { PageShell } from "@/components/PageShell"
import { Panel, Badge, Notice, Loading, TH, TD, ROW_BORDER } from "@/components/ui"

type Run = { id: number; started_at: string; completed_at: string | null; status: string; revenue_rows: number | null; spend_rows: number | null; cogs_rows: number | null; error: string | null }
type Data = {
  refreshRuns: Run[]
  refreshError: string | null
  risky: { now: number; notTold: number }
  qualityOpen: number
  priceAsked: number
  commslayer: number
  scans24h: { total: number; failed: number; last: string | null }
}
type Tone = "green" | "amber" | "red" | "grey" | "blue"
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—")

export default function WorkflowsPage() {
  const [data, setData] = useState<Data | null>(null)
  const [todos, setTodos] = useState<number | null>(null)
  const [disputes, setDisputes] = useState<{ act: number; urgent: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch("/api/workflows").then((r) => r.json()).then((d) => { if (d.error) throw new Error(d.error); setData(d) }).catch((e) => setError(e instanceof Error ? e.message : String(e)))
    fetch("/api/todos").then((r) => r.json()).then((d) => setTodos((d.auto || []).filter((t: { done: boolean }) => !t.done).length)).catch(() => setTodos(null))
    fetch("/api/disputes").then((r) => r.json()).then((d) => {
      const act = (d.disputes || []).filter((x: { status: string; submitted_at: string | null }) => /needs_response/i.test(x.status) && !x.submitted_at)
      const urgent = act.filter((x: { evidence_due_by: string | null }) => x.evidence_due_by && Date.parse(x.evidence_due_by) - Date.now() < 3 * 86400000).length
      setDisputes({ act: act.length, urgent })
    }).catch(() => setDisputes(null))
  }, [])

  const runs = data?.refreshRuns || []
  const today = new Date().toISOString().slice(0, 10)
  const runsToday = runs.filter((r) => r.started_at.slice(0, 10) === today)
  const failed = runs.filter((r) => r.status === "error" || r.status === "partial")
  const last = runs[0]
  const lastTone: Tone = !last ? "grey" : last.status === "success" ? "green" : last.status === "running" ? "blue" : last.status === "partial" ? "amber" : "red"

  const rows: { name: string; what: string; when: string; status: [string, Tone]; result: string; href?: string }[] = data ? [
    {
      name: "Daily data refresh",
      what: "Pulls Shopify revenue and orders, ad spend (Windsor), COGS (ShipGoods), sessions and refunds into the dashboard.",
      when: "Daily 06:00 UTC (07:00 Amsterdam) · Vercel cron",
      status: [last ? (last.status === "success" ? "Ran OK" : last.status === "running" ? "Running" : last.status === "partial" ? "Partly failed" : "Failed") : "No runs", lastTone],
      result: last ? `${when(last.started_at)} · ${last.revenue_rows ?? 0} revenue, ${last.spend_rows ?? 0} spend, ${last.cogs_rows ?? 0} COGS rows${last.error ? ` · ${last.error.slice(0, 120)}` : ""}` : "—",
      href: "/daily-report",
    },
    {
      name: "Competitor and catalogue scan",
      what: "Scans the oldest-scanned competitor stores, refreshes our own catalogues and rebuilds Product Opportunities.",
      when: "Daily 05:30 UTC · Vercel cron",
      status: data.scans24h.total ? [data.scans24h.failed ? `${data.scans24h.failed} failed` : "Ran OK", data.scans24h.failed ? "amber" : "green"] : ["No scan in 24h", "amber"],
      result: data.scans24h.total ? `${data.scans24h.total} stores scanned in 24h · last ${when(data.scans24h.last)}` : "No competitor store scanned in the last 24 hours.",
      href: "/opportunities",
    },
    {
      name: "To-do rules",
      what: "Builds the must-dos from data and SOPs: ROAS below breakeven, drafting reviews, coach report, refresh problems, season keyword refresh.",
      when: "Every time the Calendar opens",
      status: todos == null ? ["Loading", "grey"] : [todos ? `${todos} open` : "All done", todos ? "amber" : "green"],
      result: todos == null ? "" : `${todos} open must-do${todos === 1 ? "" : "s"} today`,
      href: "/calendar",
    },
    {
      name: "Risky product alert",
      what: "Flags a product with 2+ complaints in 7 days (refund log + Inbox Queue complaints) and shows it on the to-do list until the supplier is told.",
      when: "Live, whenever a refund or complaint is logged",
      status: [data.risky.now ? `${data.risky.now} risky` : "None", data.risky.notTold ? "red" : data.risky.now ? "amber" : "green"],
      result: data.risky.now ? `${data.risky.notTold} not told to the supplier yet` : "No product over the threshold",
      href: "/risky-products",
    },
    {
      name: "Quality alert",
      what: "Flags a product at 10%+ quality refunds with 20+ units sold (90 days) for a test unit or supplier check.",
      when: "Live, on Quality Checks",
      status: [data.qualityOpen ? `${data.qualityOpen} in follow-up` : "Nothing open", data.qualityOpen ? "amber" : "green"],
      result: data.qualityOpen ? `${data.qualityOpen} product${data.qualityOpen === 1 ? "" : "s"} being checked` : "",
      href: "/quality-checks",
    },
    {
      name: "Inbox SLA watch",
      what: "Reads open CommsLayer conversations and marks the ones waiting on us for more than 2 hours (CS playbook).",
      when: "Live, on Inbox Queue",
      status: data.commslayer ? ["Connected", "green"] : ["Needs CommsLayer token", "red"],
      result: data.commslayer ? `${data.commslayer} CommsLayer account${data.commslayer === 1 ? "" : "s"} connected` : "Add COMMSLAYER_TOKEN in Vercel (steps on the Inbox Queue page)",
      href: "/inbox-queue",
    },
    {
      name: "Dispute deadline watch",
      what: "Lists Shopify Payments disputes with their respond-by date; due within 3 days counts as P1.",
      when: "Live, on Disputes / Chargebacks",
      status: disputes == null ? ["Loading", "grey"] : [disputes.act ? `${disputes.act} to act` : "None open", disputes.urgent ? "red" : disputes.act ? "amber" : "green"],
      result: disputes == null ? "" : disputes.urgent ? `${disputes.urgent} due within 3 days` : "",
      href: "/disputes",
    },
    {
      name: "Volume discount tracker",
      what: "Shows products at 20 / 60 units in 30 days (ShipGoods) and the asks and agreed prices.",
      when: "Live, on Price Deductions",
      status: [data.priceAsked ? `${data.priceAsked} waiting on supplier` : "Up to date", data.priceAsked ? "amber" : "green"],
      result: "",
      href: "/price-deductions",
    },
    {
      name: "Refund approval",
      what: "Anything beyond goodwill Stage 3 needs management approval (CS playbook). Not automated: CS asks in Slack and logs the refund.",
      when: "Manual",
      status: ["Manual", "grey"],
      result: "",
      href: "/refunds",
    },
  ] : []

  return (
    <PageShell
      title="Workflows"
      breadcrumb="Workflows"
      description="Every automation the dashboard runs, when it runs, and what it found last. Manual steps are marked as manual."
      stats={[
        { label: "Active workflows", value: data ? String(rows.filter((r) => r.when !== "Manual").length) : "—", sub: `${rows.filter((r) => r.when === "Manual").length} manual` },
        { label: "Refresh runs today", value: data ? String(runsToday.length) : "—" },
        { label: "Failed (30d)", value: data ? String(failed.length) : "—", sub: "refresh runs", color: failed.length ? "var(--red)" : undefined },
        { label: "Last refresh", value: last ? new Date(last.started_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "—", sub: last ? when(last.started_at) : "" },
      ]}
    >
      {error && <Notice tone="error">Couldn&apos;t load workflow data: {error}.</Notice>}
      {!data && !error && <Loading>Loading run history…</Loading>}
      {data && (
        <>
          <Panel title="Workflows" pad={false} className="mb-4">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead><tr style={{ color: "var(--text-dim)" }}><th className={`${TH} text-left`}>Workflow</th><th className={`${TH} text-left`}>Runs</th><th className={`${TH} text-left`}>Status</th><th className={`${TH} text-left`}>Last result</th></tr></thead>
                <tbody>
                  {rows.map((w) => (
                    <tr key={w.name} style={ROW_BORDER}>
                      <td className={TD}>
                        <div className="font-medium" style={{ color: "var(--text)" }}>{w.href ? <Link href={w.href} className="hover:underline">{w.name}</Link> : w.name}</div>
                        <div className="text-[10px] max-w-[420px]" style={{ color: "var(--text-muted)" }}>{w.what}</div>
                      </td>
                      <td className={`${TD} text-[10px]`} style={{ color: "var(--text-dim)" }}>{w.when}</td>
                      <td className={TD}><Badge tone={w.status[1]}>{w.status[0]}</Badge></td>
                      <td className={`${TD} text-[10px]`} style={{ color: "var(--text-muted)" }}>{w.result}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
          <Panel title="Daily refresh: last 30 days" pad={false} className="mb-4">
            <div className="overflow-x-auto">
              <table className="w-full whitespace-nowrap">
                <thead><tr style={{ color: "var(--text-dim)" }}><th className={`${TH} text-left`}>Started</th><th className={`${TH} text-left`}>Status</th><th className={`${TH} text-right`}>Took</th><th className={`${TH} text-right`}>Revenue</th><th className={`${TH} text-right`}>Spend</th><th className={`${TH} text-right`}>COGS</th><th className={`${TH} text-left`}>Error</th></tr></thead>
                <tbody>
                  {runs.slice(0, 30).map((r) => (
                    <tr key={r.id} style={ROW_BORDER}>
                      <td className={TD}>{when(r.started_at)}</td>
                      <td className={TD}><Badge tone={r.status === "success" ? "green" : r.status === "partial" ? "amber" : r.status === "running" ? "blue" : "red"}>{r.status}</Badge></td>
                      <td className={`${TD} text-right tabular-nums`} style={{ color: "var(--text-muted)" }}>{r.completed_at ? `${Math.round((Date.parse(r.completed_at) - Date.parse(r.started_at)) / 1000)}s` : "—"}</td>
                      <td className={`${TD} text-right tabular-nums`}>{r.revenue_rows ?? "—"}</td>
                      <td className={`${TD} text-right tabular-nums`}>{r.spend_rows ?? "—"}</td>
                      <td className={`${TD} text-right tabular-nums`}>{r.cogs_rows ?? "—"}</td>
                      <td className={`${TD} text-[10px] whitespace-normal max-w-[360px]`} style={{ color: "var(--red)" }}>{r.error || ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </>
      )}
    </PageShell>
  )
}
