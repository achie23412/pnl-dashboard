"use client"
// Team Hub: OnlineJobs.ph Timeproof hours next to Hubstaff, per day. OnlineJobs.ph has no API,
// so the hours come from the worker's Timeproof calendar, copied and pasted here.
import { useCallback, useEffect, useMemo, useState } from "react"
import { Panel, Badge, Button, Notice, Loading, TH, TD, ROW_BORDER } from "@/components/ui"
import { fmtMinutes } from "@/lib/timeproof"

interface Data {
  month: string
  from: string
  to: string
  workers: Record<string, { days: Record<string, number>; imported_at: string }>
  hubstaff: { user_id: number; name: string; days: Record<string, number> }[]
  hubstaffError: string | null
}
interface Preview {
  worker: string | null
  month: string | null
  days: { date: string; minutes: number }[]
  ojMonthTotal: number | null
  parsedTotal: number
  warnings: string[]
}

const OJ_WORKERS_URL = "https://v2.onlinejobs.ph/myaccount"
const box = { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", color: "var(--text)" }
const amsterdamMonth = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam" }).format(new Date()).slice(0, 7)
const firstName = (s: string) => s.trim().split(/\s+/)[0]?.toLowerCase() || ""
const hm = (m: number | undefined) => (m == null ? "—" : fmtMinutes(m))
const dayLabel = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })

export function TimeproofPanel() {
  const [month, setMonth] = useState(amsterdamMonth())
  const [data, setData] = useState<Data | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [worker, setWorker] = useState<string>("")
  const [hsUser, setHsUser] = useState<number | "">("")
  const [showImport, setShowImport] = useState(false)
  const [text, setText] = useState("")
  const [preview, setPreview] = useState<Preview | null>(null)
  const [importName, setImportName] = useState("")
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ tone: "error" | "success" | "warning"; text: string } | null>(null)

  const load = useCallback(async () => {
    setErr(null)
    try {
      const r = await fetch(`/api/timeproof?month=${month}`, { cache: "no-store" })
      const j = await r.json()
      if (!r.ok || j.error) throw new Error(j.error || `HTTP ${r.status}`)
      setData(j)
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
  }, [month])
  useEffect(() => { setData(null); load() }, [load])

  const workerNames = useMemo(() => Object.keys(data?.workers || {}).sort(), [data])
  const activeWorker = worker && workerNames.includes(worker) ? worker : workerNames[0] || ""
  // Hubstaff member to compare with: picked, or the one with the same first name
  const matched = data?.hubstaff.find((h) => firstName(h.name) === firstName(activeWorker))
  const hs = data?.hubstaff.find((h) => h.user_id === hsUser) || (hsUser === "" ? matched : undefined)

  const rows = useMemo(() => {
    if (!data || !activeWorker) return []
    const out: { date: string; oj?: number; hs?: number }[] = []
    for (let d = new Date(`${data.from}T12:00:00Z`); d.toISOString().slice(0, 10) <= data.to; d.setUTCDate(d.getUTCDate() + 1)) {
      const date = d.toISOString().slice(0, 10)
      out.push({ date, oj: data.workers[activeWorker]?.days[date], hs: hs ? hs.days[date] ?? 0 : undefined })
    }
    return out
  }, [data, activeWorker, hs])
  const totOj = rows.reduce((a, r) => a + (r.oj || 0), 0)
  const totHs = rows.reduce((a, r) => a + (r.hs || 0), 0)
  const missingDays = rows.filter((r) => r.oj == null).length

  const read = async () => {
    setBusy(true); setMsg(null); setPreview(null)
    const r = await fetch("/api/timeproof", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, month }) })
    const j = await r.json().catch(() => ({}))
    if (!r.ok || j.error) setMsg({ tone: "error", text: j.error || `HTTP ${r.status}` })
    else { setPreview(j); setImportName(j.worker || activeWorker || "") }
    setBusy(false)
  }
  const save = async () => {
    setBusy(true); setMsg(null)
    const r = await fetch("/api/timeproof", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, month, worker: importName, save: true }) })
    const j = await r.json().catch(() => ({}))
    if (!r.ok || j.error) setMsg({ tone: "error", text: j.error || `HTTP ${r.status}` })
    else {
      setMsg({ tone: j.warnings?.length ? "warning" : "success", text: `Saved ${j.saved} days for ${j.worker} (${fmtMinutes(j.parsedTotal)} in total).${j.warnings?.length ? ` ${j.warnings.join(" ")}` : ""}` })
      setText(""); setPreview(null); setShowImport(false); setWorker(j.worker)
      if (j.month && j.month !== month) setMonth(j.month); else load()
    }
    setBusy(false)
  }

  const right = (
    <>
      <input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} className="px-2 py-1 rounded-md text-[10px]" style={box} />
      <Button size="sm" variant={showImport ? "secondary" : "primary"} onClick={() => { setShowImport(!showImport); setMsg(null) }}>{showImport ? "Close" : "Import hours"}</Button>
      <a href={OJ_WORKERS_URL} target="_blank" rel="noopener noreferrer" className="text-[10px] underline" style={{ color: "#a5b4fc" }}>Open OnlineJobs.ph</a>
    </>
  )

  return (
    <Panel title="OnlineJobs.ph Timeproof" sub="Hours from OnlineJobs.ph next to Hubstaff. OnlineJobs.ph has no API, so paste the Timeproof calendar to update." right={right}>
      {showImport && (
        <div className="mb-3 rounded-lg p-3" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
          <ol className="text-[10px] mb-2 list-decimal pl-4 space-y-0.5" style={{ color: "var(--text-muted)" }}>
            <li>On OnlineJobs.ph, open <b>My Account → Your Workers → Show Timeproof</b> for the worker and pick the month.</li>
            <li>Press <b>Cmd+A</b>, then <b>Cmd+C</b>, and paste the whole page below. Lines like <code>2026-11-01 08:55</code> work too.</li>
            <li>Click <b>Read paste</b>, check the days, then <b>Save</b>. Saving again replaces the same days.</li>
          </ol>
          <textarea value={text} onChange={(e) => { setText(e.target.value); setPreview(null) }} rows={6} placeholder="Paste the Timeproof calendar here" className="w-full px-2 py-1.5 rounded-md text-[11px] font-mono" style={box} />
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <Button size="sm" onClick={read} disabled={busy || !text.trim()}>{busy && !preview ? "Reading…" : "Read paste"}</Button>
            {preview && preview.days.length > 0 && (
              <>
                <input value={importName} onChange={(e) => setImportName(e.target.value)} placeholder="Worker name" className="px-2 py-1 rounded-md text-[10px]" style={box} />
                <Button size="sm" variant="primary" onClick={save} disabled={busy || !importName.trim()}>{busy ? "Saving…" : `Save ${preview.days.length} days`}</Button>
              </>
            )}
          </div>
          {preview && (
            <div className="mt-2 text-[10px]" style={{ color: "var(--text-muted)" }}>
              {preview.days.length > 0 ? (
                <>
                  Read <b>{preview.days.length} days</b>{preview.month ? ` of ${preview.month}` : ""}, total <b>{fmtMinutes(preview.parsedTotal)}</b>
                  {preview.ojMonthTotal != null && <> (OnlineJobs.ph month total {fmtMinutes(preview.ojMonthTotal)} {Math.abs(preview.ojMonthTotal - preview.parsedTotal) <= preview.days.length + 1 ? "✓" : "✗"})</>}.
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 font-mono">
                    {preview.days.map((d) => <span key={d.date}>{d.date.slice(8)}: {fmtMinutes(d.minutes)}</span>)}
                  </div>
                </>
              ) : "No days found."}
              {preview.warnings.length > 0 && <div className="mt-1"><Notice tone="warning">{preview.warnings.join(" ")}</Notice></div>}
            </div>
          )}
        </div>
      )}
      {msg && <div className="mb-2"><Notice tone={msg.tone}>{msg.text}</Notice></div>}
      {err ? <Notice tone="error">{err}</Notice> : !data ? <Loading /> : workerNames.length === 0 ? (
        <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>No Timeproof hours saved for {month} yet. Click <b>Import hours</b> to paste them.</div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 mb-2 text-[10px]">
            {workerNames.length > 1 && (
              <select value={activeWorker} onChange={(e) => { setWorker(e.target.value); setHsUser("") }} className="px-2 py-1 rounded-md" style={box}>
                {workerNames.map((w) => <option key={w} value={w}>{w}</option>)}
              </select>
            )}
            {workerNames.length === 1 && <span style={{ color: "var(--text)" }}>{activeWorker}</span>}
            <span style={{ color: "var(--text-dim)" }}>compared with Hubstaff:</span>
            <select value={hsUser} onChange={(e) => setHsUser(e.target.value ? Number(e.target.value) : "")} className="px-2 py-1 rounded-md" style={box}>
              <option value="">{matched ? matched.name : "No match"}</option>
              {data.hubstaff.filter((h) => h.user_id !== matched?.user_id).map((h) => <option key={h.user_id} value={h.user_id}>{h.name}</option>)}
            </select>
            <span style={{ color: "var(--text-dim)" }}>Last import {new Date(data.workers[activeWorker].imported_at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
            {missingDays > 0 && <Badge tone="amber">{missingDays} day{missingDays > 1 ? "s" : ""} not imported</Badge>}
          </div>
          {data.hubstaffError && <div className="mb-2"><Notice tone="warning">Hubstaff couldn&apos;t be read: {data.hubstaffError}</Notice></div>}
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead><tr style={{ color: "var(--text-dim)" }}>
                <th className={`${TH} text-left`}>Day</th>
                <th className={`${TH} text-right`}>OnlineJobs.ph</th>
                <th className={`${TH} text-right`}>Hubstaff</th>
                <th className={`${TH} text-right`}>Difference</th>
              </tr></thead>
              <tbody>
                {rows.map((r) => {
                  const diff = r.oj != null && r.hs != null ? r.oj - r.hs : null
                  const big = diff != null && Math.abs(diff) > 30
                  return (
                    <tr key={r.date} style={ROW_BORDER}>
                      <td className={TD} style={{ color: "var(--text-muted)" }}>{dayLabel(r.date)}</td>
                      <td className={`${TD} text-right tabular-nums`} style={{ color: "var(--text)" }}>{hm(r.oj)}</td>
                      <td className={`${TD} text-right tabular-nums`} style={{ color: "var(--text-muted)" }}>{hs ? hm(r.hs) : "—"}</td>
                      <td className={`${TD} text-right tabular-nums`} style={{ color: big ? "var(--amber, #fbbf24)" : "var(--text-dim)" }}>{diff == null ? "—" : `${diff > 0 ? "+" : diff < 0 ? "−" : ""}${fmtMinutes(Math.abs(diff))}`}</td>
                    </tr>
                  )
                })}
                <tr style={{ borderTop: "1px solid rgba(255,255,255,0.12)" }}>
                  <td className={`${TD} font-semibold`} style={{ color: "var(--text)" }}>Total</td>
                  <td className={`${TD} text-right tabular-nums font-semibold`} style={{ color: "var(--text)" }}>{fmtMinutes(totOj)}</td>
                  <td className={`${TD} text-right tabular-nums font-semibold`} style={{ color: "var(--text)" }}>{hs ? fmtMinutes(totHs) : "—"}</td>
                  <td className={`${TD} text-right tabular-nums font-semibold`} style={{ color: "var(--text)" }}>{hs ? `${totOj - totHs > 0 ? "+" : totOj - totHs < 0 ? "−" : ""}${fmtMinutes(Math.abs(totOj - totHs))}` : "—"}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="text-[9px] mt-2" style={{ color: "var(--text-dim)" }}>
            OnlineJobs.ph shows days in your timezone; Hubstaff uses the worker&apos;s, so hours can shift to the day before or after. Compare the totals. Differences over 30 minutes are amber.
          </div>
        </>
      )}
    </Panel>
  )
}
