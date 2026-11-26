"use client"
// Store Settings: switch the media buyer fee on per store from a start date.
// No start date = no fee. From that date the fee (% of ad spend) is taken off profit everywhere.
import { useEffect, useState } from "react"
import { PageShell } from "@/components/PageShell"
import { Panel, Badge, Button, Notice, Loading, TH, TD, ROW_BORDER } from "@/components/ui"
import { STORES, TRANSACTION_FEE_RATE } from "@/lib/constants"
import { DEFAULT_MEDIA_BUYER_PCT } from "@/lib/fee-settings"

type Row = { store: string; media_buyer_fee_pct: number | null; media_buyer_fee_from: string | null }
type Draft = { on: boolean; pct: string; from: string }

const inputStyle = { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", color: "var(--text)" }
const today = () => new Date().toISOString().slice(0, 10)
const nice = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })

export default function StoreSettingsPage() {
  const stores = STORES.filter((s) => s !== "Overall")
  const [saved, setSaved] = useState<Record<string, Row>>({})
  const [draft, setDraft] = useState<Record<string, Draft>>({})
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState<Record<string, { ok: boolean; text: string }>>({})
  const [error, setError] = useState<string | null>(null)

  const load = () =>
    fetch("/api/store-settings")
      .then((r) => r.json())
      .then((j) => {
        if (j.error) setError(j.error)
        const m: Record<string, Row> = {}
        for (const r of (j.rows || []) as Row[]) m[r.store] = r
        setSaved(m)
        const d: Record<string, Draft> = {}
        for (const s of stores) {
          const r = m[s]
          d[s] = { on: !!r?.media_buyer_fee_from, pct: String(r?.media_buyer_fee_pct ?? DEFAULT_MEDIA_BUYER_PCT), from: r?.media_buyer_fee_from?.slice(0, 10) || today() }
        }
        setDraft(d)
        setLoading(false)
      })
  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const save = async (store: string) => {
    const d = draft[store]
    const r = await fetch("/api/store-settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ store, media_buyer_fee_pct: Number(d.pct.replace(",", ".")), media_buyer_fee_from: d.on ? d.from : null }),
    })
    const j = await r.json()
    setMsg({ ...msg, [store]: r.ok ? { ok: true, text: "Saved" } : { ok: false, text: j.error || "Couldn't save" } })
    if (r.ok) setSaved({ ...saved, [store]: j.row })
  }

  return (
    <PageShell
      title="Store Settings"
      breadcrumb="Settings → Store Settings"
      description="Switch the media buyer fee on per store. Until the start date the fee is €0; from that date it's taken off profit automatically on Daily Report, Main Hub, Profit & Loss and the break-even ROAS."
    >
      {error && <Notice tone="error">Couldn&apos;t read the settings: {error}. Run supabase/store-settings.sql once in Supabase.</Notice>}
      {loading ? (
        <Loading>Loading store settings…</Loading>
      ) : (
        <Panel title="Media buyer fee" sub="% of ad spend, from the start date onwards" pad={false}>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr style={{ color: "var(--text-dim)" }}>
                  <th className={`${TH} text-left`}>Store</th>
                  <th className={`${TH} text-left`}>Media buyer fee</th>
                  <th className={`${TH} text-left`}>Fee %</th>
                  <th className={`${TH} text-left`}>Starts on</th>
                  <th className={`${TH} text-left`}>Now</th>
                  <th className={`${TH} text-left`}>Transaction fee</th>
                  <th className={`${TH} text-right`} />
                </tr>
              </thead>
              <tbody>
                {stores.map((s) => {
                  const d = draft[s]
                  if (!d) return null
                  const cur = saved[s]
                  const from = cur?.media_buyer_fee_from?.slice(0, 10) || null
                  const status = !from ? <Badge tone="grey">Off</Badge> : from > today() ? <Badge tone="amber">Starts {nice(from)}</Badge> : <Badge tone="green">{Number(cur?.media_buyer_fee_pct)}% since {nice(from)}</Badge>
                  return (
                    <tr key={s} style={ROW_BORDER}>
                      <td className={TD} style={{ color: "var(--text)" }}>{s}</td>
                      <td className={TD}>
                        <label className="inline-flex items-center gap-2 cursor-pointer" style={{ color: "var(--text-muted)" }}>
                          <input type="checkbox" checked={d.on} onChange={(e) => setDraft({ ...draft, [s]: { ...d, on: e.target.checked } })} />
                          {d.on ? "On" : "Off"}
                        </label>
                      </td>
                      <td className={TD}>
                        <input value={d.pct} disabled={!d.on} onChange={(e) => setDraft({ ...draft, [s]: { ...d, pct: e.target.value } })} inputMode="decimal" className="w-16 rounded-lg px-2 py-1 text-[11px] outline-none disabled:opacity-40" style={inputStyle} />
                      </td>
                      <td className={TD}>
                        <input type="date" value={d.from} disabled={!d.on} onChange={(e) => setDraft({ ...draft, [s]: { ...d, from: e.target.value } })} className="rounded-lg px-2 py-1 text-[11px] outline-none disabled:opacity-40" style={inputStyle} />
                      </td>
                      <td className={TD}>{status}</td>
                      <td className={TD} style={{ color: "var(--text-dim)" }}>{((TRANSACTION_FEE_RATE[s] ?? 0.035) * 100).toFixed(1)}% of revenue</td>
                      <td className={`${TD} text-right whitespace-nowrap`}>
                        {msg[s] && <span className="mr-2 text-[10px]" style={{ color: msg[s].ok ? "var(--green)" : "var(--red)" }}>{msg[s].text}</span>}
                        <Button size="sm" variant="primary" onClick={() => save(s)}>Save</Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="px-3 py-2 text-[9px]" style={{ color: "var(--text-dim)", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
            Only the Owner can save. Days before the start date keep €0 media buyer fee, so past profit doesn&apos;t change.
          </div>
        </Panel>
      )}
    </PageShell>
  )
}
