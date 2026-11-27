"use client"
// Preview of the daily coach post (Slack): one "Day by day" P&L image per Google store,
// posted automatically at 09:00 Amsterdam. "Send now" posts the same thing straight away.
import { useEffect, useState } from "react"
import { PageShell } from "@/components/PageShell"
import { Panel, Notice, Loading, Button } from "@/components/ui"

type Data = {
  reportDate: string
  lastDay: string
  slack: { token: boolean; channel: boolean }
  messages: { store: string; text: string }[]
  error?: string
}

export default function CoachReportPage() {
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [stamp] = useState(() => Date.now())

  useEffect(() => {
    fetch("/api/coach-report").then((r) => r.json()).then((j) => (j.error ? setError(j.error) : setData(j))).catch((e) => setError(String(e)))
  }, [])

  const ready = !!data && data.slack.token && data.slack.channel

  async function sendNow() {
    if (!data || !confirm(`Post these ${data.messages.length} messages to the coach's Slack channel now? The automatic post at 09:00 still goes out every day.`)) return
    setSending(true)
    setResult(null)
    try {
      const j = await fetch("/api/coach-report", { method: "POST" }).then((r) => r.json())
      setResult(j.error ? `Error: ${j.error}` : j.skipped ? j.skipped : `Sent: ${j.sent.join(", ") || "nothing"}${j.errors.length ? ` · Failed: ${j.errors.join(" · ")}` : ""}`)
    } catch (e) {
      setResult(`Error: ${String(e)}`)
    } finally {
      setSending(false)
    }
  }

  return (
    <PageShell
      title="Coach Report"
      breadcrumb="Finance → Coach Report"
      description="Every day at 09:00 (Amsterdam) the dashboard posts to the coach's Slack channel: first the Main Hub (all stores, last 30 days up to yesterday), then per Google store “27 November | Walsh & Farley” with the Profit & Loss Day by day table for the month up to and including yesterday."
      actions={<Button variant="primary" onClick={sendNow} disabled={!ready || sending}>{sending ? "Sending…" : "Send to Slack now"}</Button>}
    >
      {error && <Notice tone="error">Couldn&apos;t build the report: {error}</Notice>}
      {result && <Notice tone={result.startsWith("Sent") && !result.includes("Failed") ? "success" : "error"}>{result}</Notice>}
      {data && !ready && (
        <Notice tone="warning">
          Slack isn&apos;t connected yet, so nothing is posted. Missing in Vercel:{" "}
          {[!data.slack.token && "SLACK_BOT_TOKEN", !data.slack.channel && "SLACK_COACH_CHANNEL"].filter(Boolean).join(" and ")}.
        </Notice>
      )}
      {!data && !error && <Loading>Building today&apos;s report…</Loading>}
      {data?.messages.map((m) => (
        <Panel key={m.store} title={m.text} className="mb-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/coach-report/image?store=${encodeURIComponent(m.store)}&t=${stamp}`} alt={`Day by day: ${m.store}`} className="w-full rounded-lg" />
        </Panel>
      ))}
    </PageShell>
  )
}
