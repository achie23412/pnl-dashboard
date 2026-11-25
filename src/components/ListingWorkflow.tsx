"use client"
import { useCallback, useEffect, useMemo, useState } from "react"
import { checkListing, isReady, type GmcIssue } from "@/lib/gmc-check"
import type { SourceProduct, GeneratedListing } from "@/lib/listing-workflow"

export type Job = {
  id: number
  created_at: string
  store: string
  source_url: string
  status: "working" | "review" | "approved" | "rejected" | "in_shopify" | "published" | "error"
  before: SourceProduct | null
  after: GeneratedListing | null
  price: number | null
  error: string | null
  shopify_admin_url: string | null
  published_at: string | null
  notes: string | null
}

const STORES = ["Walsh & Farley", "Carter & Collins", "Susan & Allen"]
const STAGES: { key: string; label: string; statuses: Job["status"][] }[] = [
  { key: "review", label: "Check", statuses: ["review", "working", "error"] },
  { key: "approved", label: "Approved", statuses: ["approved"] },
  { key: "in_shopify", label: "In Shopify (draft)", statuses: ["in_shopify"] },
  { key: "published", label: "Live", statuses: ["published"] },
  { key: "rejected", label: "Rejected", statuses: ["rejected"] },
]
const STATUS_STYLE: Record<Job["status"], { label: string; color: string }> = {
  working: { label: "Working…", color: "#818cf8" },
  review: { label: "Ready to check", color: "#facc15" },
  approved: { label: "Approved", color: "#34d399" },
  rejected: { label: "Rejected", color: "#94a3b8" },
  in_shopify: { label: "Draft in Shopify", color: "#0ea5e9" },
  published: { label: "Live", color: "#22c55e" },
  error: { label: "Error", color: "#f87171" },
}
const box = { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }
const input = { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", color: "var(--text)" }

export type WorkflowStats = { review: number; approved: number; inShopify: number; publishedToday: number }

export function ListingWorkflow({ onStats }: { onStats?: (s: WorkflowStats) => void }) {
  const [jobs, setJobs] = useState<Job[]>([])
  const [publishedToday, setPublishedToday] = useState<Record<string, number>>({})
  const [limit, setLimit] = useState(10)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [urls, setUrls] = useState("")
  const [store, setStore] = useState(STORES[0])
  const [notes, setNotes] = useState("")
  const [running, setRunning] = useState<{ done: number; total: number } | null>(null)
  const [stage, setStage] = useState("review")
  const [openId, setOpenId] = useState<number | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/listing-workflow", { cache: "no-store" })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      setJobs(data.jobs)
      setPublishedToday(data.publishedToday)
      setLimit(data.limit)
      setLoadError(null)
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e))
    }
  }, [])
  useEffect(() => { load() }, [load])

  useEffect(() => {
    const pubToday = Object.values(publishedToday).reduce((a, b) => a + b, 0)
    onStats?.({
      review: jobs.filter((j) => j.status === "review").length,
      approved: jobs.filter((j) => j.status === "approved").length,
      inShopify: jobs.filter((j) => j.status === "in_shopify").length,
      publishedToday: pubToday,
    })
  }, [jobs, publishedToday, onStats])

  const replace = (j: Job) => setJobs((xs) => xs.map((x) => (x.id === j.id ? j : x)))

  const run = async () => {
    const list = urls.split(/\s+/).map((u) => u.trim()).filter((u) => /^https?:\/\//.test(u))
    if (!list.length) return
    setRunning({ done: 0, total: list.length })
    setStage("review")
    // One at a time so each product gets the full time budget
    for (let i = 0; i < list.length; i++) {
      try {
        const res = await fetch("/api/listing-workflow", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: list[i], store, notes: notes || undefined }),
        })
        const job = await res.json()
        if (res.ok && job?.id) setJobs((xs) => [job, ...xs.filter((x) => x.id !== job.id)])
      } catch { /* the job row shows the error */ }
      setRunning({ done: i + 1, total: list.length })
    }
    setRunning(null)
    setUrls("")
    load()
  }

  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const s of STAGES) c[s.key] = jobs.filter((j) => s.statuses.includes(j.status)).length
    return c
  }, [jobs])
  const current = STAGES.find((s) => s.key === stage) || STAGES[0]
  const visible = jobs.filter((j) => current.statuses.includes(j.status))

  return (
    <div className="space-y-4">
      {/* Step strip */}
      <div className="glass rounded-xl p-4">
        <div className="flex flex-wrap items-center gap-2 text-[10px] mb-3" style={{ color: "var(--text-dim)" }}>
          {["1 Paste product links", "2 New listing (Ascend SOP)", "3 GMC check", "4 You check before / after", "5 Shopify draft", "6 Publish (max 10/day)"].map((s, i) => (
            <span key={i} className="flex items-center gap-2">
              <span className="px-2 py-1 rounded-md" style={{ background: "rgba(99,102,241,0.1)", color: "#a5b4fc" }}>{s}</span>
              {i < 5 && <span>→</span>}
            </span>
          ))}
        </div>
        <div className="text-[12px] font-semibold mb-2" style={{ color: "var(--text)" }}>New products</div>
        <textarea
          rows={3}
          value={urls}
          onChange={(e) => setUrls(e.target.value)}
          placeholder={"Paste Shopify product links, one per line\nhttps://store.com/products/linen-midi-dress"}
          className="w-full rounded-lg px-3 py-2 text-[11px] resize-y mb-2"
          style={input}
        />
        <div className="flex flex-wrap gap-2">
          <select value={store} onChange={(e) => setStore(e.target.value)} className="px-3 py-2 rounded-lg text-[11px]" style={input} aria-label="Target store">
            {STORES.map((s) => <option key={s}>{s}</option>)}
          </select>
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional notes for the listing (e.g. real fabric: 100% linen)"
            className="flex-1 min-w-[200px] px-3 py-2 rounded-lg text-[11px]"
            style={input}
          />
          <button
            onClick={run}
            disabled={!!running || !urls.trim()}
            className="px-4 py-2 rounded-lg text-[11px] font-semibold disabled:opacity-50"
            style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)", color: "#fff" }}
          >
            {running ? `Working… ${running.done}/${running.total}` : "Run workflow"}
          </button>
        </div>
        <div className="text-[10px] mt-2" style={{ color: "var(--text-dim)" }}>
          Nothing goes to Shopify until you approve it. Approved products go in as a draft first; publishing is a separate click, max {limit} per store per day.
        </div>
      </div>

      {loadError && (
        <div className="rounded-lg px-3 py-2 text-[11px]" style={{ background: "rgba(239,68,68,0.1)", color: "#f87171" }}>
          Couldn&apos;t load the workflow: {loadError}
        </div>
      )}

      {/* Queue */}
      <div className="glass rounded-xl p-4">
        <div className="flex flex-wrap items-center gap-1.5 mb-3">
          {STAGES.map((s) => (
            <button
              key={s.key}
              onClick={() => setStage(s.key)}
              className="px-3 py-1.5 rounded-lg text-[11px] font-medium"
              style={{
                background: stage === s.key ? "rgba(99,102,241,0.2)" : "rgba(255,255,255,0.03)",
                color: stage === s.key ? "#c7d2fe" : "var(--text-muted)",
                border: `1px solid ${stage === s.key ? "rgba(99,102,241,0.4)" : "rgba(255,255,255,0.06)"}`,
              }}
            >
              {s.label} <span style={{ opacity: 0.6 }}>{counts[s.key]}</span>
            </button>
          ))}
          <div className="ml-auto text-[10px]" style={{ color: "var(--text-dim)" }}>
            Published today: {STORES.map((s) => `${s.split(" ")[0]} ${publishedToday[s] || 0}/${limit}`).join(" · ")}
          </div>
        </div>
        {visible.length === 0 && (
          <div className="text-[11px] py-4" style={{ color: "var(--text-dim)" }}>Nothing here.</div>
        )}
        <div className="space-y-2">
          {visible.map((j) => (
            <JobCard key={j.id} job={j} open={openId === j.id} onToggle={() => setOpenId(openId === j.id ? null : j.id)} onChange={replace} onReload={load} />
          ))}
        </div>
      </div>
    </div>
  )
}

function JobCard({ job, open, onToggle, onChange, onReload }: {
  job: Job; open: boolean; onToggle: () => void; onChange: (j: Job) => void; onReload: () => void
}) {
  const st = STATUS_STYLE[job.status]
  const issues = job.before && job.after
    ? checkListing({ ...job.after, price: job.price, images: job.before.images, variants: job.before.variants },
      `${job.before.title} ${job.before.description} ${job.before.productType} ${job.before.tags.join(" ")}`)
    : []
  const critical = issues.filter((i) => i.level === "critical").length
  const warnings = issues.length - critical

  return (
    <div className="rounded-xl" style={box}>
      <button onClick={onToggle} className="w-full flex items-center gap-3 p-2.5 text-left" aria-expanded={open}>
        {job.before?.images[0] ? (
          <img src={job.before.images[0]} alt="" className="w-11 h-11 rounded-lg object-cover shrink-0" />
        ) : (
          <div className="w-11 h-11 rounded-lg shrink-0" style={{ background: "rgba(255,255,255,0.05)" }} />
        )}
        <div className="flex-1 min-w-0">
          <div className="text-[12px] font-medium truncate" style={{ color: "var(--text)" }}>
            {job.after?.title || job.before?.title || job.source_url}
          </div>
          <div className="text-[10px] truncate" style={{ color: "var(--text-dim)" }}>
            {job.store} · {job.price ? `price ${job.price}` : "no price"} · {new URL(job.source_url).hostname}
          </div>
        </div>
        {job.after && (
          <span className="text-[10px] px-2 py-0.5 rounded-full shrink-0" style={{
            background: critical ? "rgba(248,113,113,0.15)" : "rgba(52,211,153,0.12)",
            color: critical ? "#f87171" : "#34d399",
          }}>
            {critical ? `GMC: ${critical} to fix` : warnings ? `GMC ok · ${warnings} tips` : "GMC ok"}
          </span>
        )}
        <span className="text-[10px] px-2 py-0.5 rounded-full shrink-0" style={{ background: `${st.color}22`, color: st.color }}>{st.label}</span>
      </button>
      {open && <JobDetail job={job} issues={issues} onChange={onChange} onReload={onReload} />}
    </div>
  )
}

function JobDetail({ job, issues, onChange, onReload }: { job: Job; issues: GmcIssue[]; onChange: (j: Job) => void; onReload: () => void }) {
  const [title, setTitle] = useState(job.after?.title || "")
  const [description, setDescription] = useState(job.after?.description || "")
  const [features, setFeatures] = useState((job.after?.features || []).join("\n"))
  const [price, setPrice] = useState(job.price != null ? String(job.price) : "")
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(job.status === "error" ? job.error : null)
  const [regenNotes, setRegenNotes] = useState("")

  useEffect(() => {
    setTitle(job.after?.title || "")
    setDescription(job.after?.description || "")
    setFeatures((job.after?.features || []).join("\n"))
    setPrice(job.price != null ? String(job.price) : "")
  }, [job.after, job.price])

  const draft: GeneratedListing = {
    title,
    description,
    features: features.split("\n").map((f) => f.trim()).filter(Boolean),
    fileNames: job.after?.fileNames || [],
  }
  const dirty = !!job.after && (title !== job.after.title || description !== job.after.description ||
    features !== job.after.features.join("\n") || price !== (job.price != null ? String(job.price) : ""))
  const liveIssues = job.before ? checkListing({ ...draft, price: price ? Number(price) : null, images: job.before.images, variants: job.before.variants },
    `${job.before.title} ${job.before.description} ${job.before.productType} ${job.before.tags.join(" ")}`) : issues
  const ready = isReady(liveIssues)
  const editable = job.status === "review" || job.status === "approved"

  const act = async (action: string, extra: Record<string, unknown> = {}) => {
    setBusy(action)
    setErr(null)
    try {
      const res = await fetch("/api/listing-workflow", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: job.id, action, ...extra }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      onChange(data)
      if (data.status === "error") setErr(data.error)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    }
    setBusy(null)
  }
  const save = () => act("save", { after: draft, price: price === "" ? null : Number(price) })
  const saveThen = async (next: string) => {
    if (dirty) await save()
    await act(next)
  }
  const remove = async () => {
    if (!confirm("Delete this product from the workflow? (Nothing in Shopify is touched.)")) return
    await fetch(`/api/listing-workflow?id=${job.id}`, { method: "DELETE" })
    onReload()
  }

  const b = job.before
  const field = "text-[9px] font-semibold uppercase tracking-wider mb-1"
  const btn = (bg: string, color: string) => ({ background: bg, color })

  return (
    <div className="px-3 pb-3 text-[11px]" style={{ color: "var(--text)" }}>
      {err && <div className="rounded-lg px-3 py-2 mb-3" style={{ background: "rgba(239,68,68,0.1)", color: "#f87171" }}>{err}</div>}

      {b && (
        <>
          {/* Images */}
          <div className="flex gap-1.5 overflow-x-auto mb-3 pb-1">
            {b.images.slice(0, 12).map((src, i) => (
              <div key={src} className="shrink-0 text-center">
                <img src={src} alt="" className="w-20 h-20 rounded-lg object-cover" />
                <div className="text-[8px] mt-0.5 w-20 truncate" style={{ color: "var(--text-dim)" }} title={draft.fileNames[i]}>
                  {draft.fileNames[i] || "—"}
                </div>
              </div>
            ))}
          </div>

          {/* Before / After */}
          <div className="grid gap-3 md:grid-cols-2 mb-3">
            <div className="rounded-lg p-3" style={box}>
              <div className={field} style={{ color: "var(--text-dim)" }}>Before · <a href={b.url} target="_blank" rel="noreferrer" className="underline">source</a></div>
              <div className="font-medium mb-1">{b.title}</div>
              <div className="text-[9px] mb-2" style={{ color: "var(--text-dim)" }}>{b.title.length} characters</div>
              <div className="leading-relaxed mb-2 max-h-[180px] overflow-y-auto" style={{ color: "var(--text-muted)" }}>{b.description || "(no description)"}</div>
              <div className="text-[10px]" style={{ color: "var(--text-dim)" }}>
                Price {b.price ?? "—"} · {b.variants.length} variant{b.variants.length === 1 ? "" : "s"}
                {b.options.length ? ` · ${b.options.map((o) => `${o.name}: ${o.values.slice(0, 6).join(", ")}${o.values.length > 6 ? "…" : ""}`).join(" | ")}` : ""}
              </div>
            </div>

            <div className="rounded-lg p-3" style={{ ...box, border: "1px solid rgba(99,102,241,0.3)" }}>
              <div className={field} style={{ color: "#a5b4fc" }}>After · Ascend SOP {editable ? "(you can edit)" : ""}</div>
              {job.after ? (
                <>
                  <input value={title} onChange={(e) => setTitle(e.target.value)} disabled={!editable} className="w-full rounded-md px-2 py-1.5 font-medium mb-1" style={input} />
                  <div className="text-[9px] mb-2" style={{ color: title.length > 100 || title.length < 70 ? "#facc15" : "var(--text-dim)" }}>{title.length} characters (SOP 70–100)</div>
                  <textarea value={description} onChange={(e) => setDescription(e.target.value)} disabled={!editable} rows={5} className="w-full rounded-md px-2 py-1.5 leading-relaxed mb-2" style={input} />
                  <div className={field} style={{ color: "var(--text-dim)" }}>Key features (one per line)</div>
                  <textarea value={features} onChange={(e) => setFeatures(e.target.value)} disabled={!editable} rows={3} className="w-full rounded-md px-2 py-1.5 mb-2" style={input} />
                  <div className="flex items-center gap-2">
                    <span className={field} style={{ color: "var(--text-dim)", marginBottom: 0 }}>Your price</span>
                    <input value={price} onChange={(e) => setPrice(e.target.value)} disabled={!editable} inputMode="decimal" className="w-24 rounded-md px-2 py-1" style={input} />
                    <span className="text-[9px]" style={{ color: "var(--text-dim)" }}>
                      Starts at the source price. Coach rule: competitor-based (median of lookalike stores), UK ends in .95. Other variants keep the source&apos;s price gaps.
                    </span>
                  </div>
                </>
              ) : (
                <div style={{ color: "var(--text-dim)" }}>{job.status === "working" ? "Writing the new listing…" : "No listing yet."}</div>
              )}
            </div>
          </div>

          {/* GMC check */}
          {job.after && (
            <div className="rounded-lg p-3 mb-3" style={{ ...box, border: `1px solid ${ready ? "rgba(52,211,153,0.25)" : "rgba(248,113,113,0.3)"}` }}>
              <div className={field} style={{ color: ready ? "#34d399" : "#f87171" }}>
                GMC pre-launch check · {ready ? "ready to list" : "fix the red items before approving"}
              </div>
              {liveIssues.length === 0 ? (
                <div style={{ color: "#34d399" }}>No issues found.</div>
              ) : (
                <ul className="space-y-1">
                  {liveIssues.map((i, k) => (
                    <li key={k} className="flex gap-2">
                      <span style={{ color: i.level === "critical" ? "#f87171" : "#facc15" }}>{i.level === "critical" ? "●" : "○"}</span>
                      <span><b>{i.field}:</b> {i.message} <span style={{ color: "var(--text-dim)" }}>({i.source})</span></span>
                    </li>
                  ))}
                </ul>
              )}
              <div className="text-[9px] mt-2" style={{ color: "var(--text-dim)" }}>
                Checked here: text, title, price, images. Not checked: GTIN/brand, shipping settings, landing page — Merchant Center checks those after the feed syncs.
              </div>
            </div>
          )}
        </>
      )}

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2">
        {job.status === "error" && (
          <button onClick={() => act("retry")} disabled={!!busy} className="px-3 py-1.5 rounded-lg font-medium" style={btn("rgba(99,102,241,0.2)", "#c7d2fe")}>
            {busy === "retry" ? "Retrying…" : "Retry"}
          </button>
        )}
        {editable && (
          <>
            <button onClick={save} disabled={!dirty || !!busy} className="px-3 py-1.5 rounded-lg font-medium disabled:opacity-40" style={btn("rgba(255,255,255,0.06)", "var(--text)")}>
              {busy === "save" ? "Saving…" : "Save edits"}
            </button>
            <input value={regenNotes} onChange={(e) => setRegenNotes(e.target.value)} placeholder="What to change (optional)" className="px-2 py-1.5 rounded-lg min-w-[160px]" style={input} />
            <button onClick={() => act("regenerate", { notes: regenNotes || undefined })} disabled={!!busy} className="px-3 py-1.5 rounded-lg font-medium" style={btn("rgba(139,92,246,0.15)", "#c4b5fd")}>
              {busy === "regenerate" ? "Rewriting…" : "Rewrite"}
            </button>
          </>
        )}
        {job.status === "review" && (
          <>
            <button onClick={() => act("reject")} disabled={!!busy} className="px-3 py-1.5 rounded-lg font-medium" style={btn("rgba(148,163,184,0.12)", "#cbd5e1")}>Reject</button>
            <button
              onClick={() => saveThen("approve")}
              disabled={!!busy || !ready || !price}
              title={!ready ? "Fix the red GMC items first" : !price ? "Set a price first" : ""}
              className="px-4 py-1.5 rounded-lg font-semibold disabled:opacity-40"
              style={btn("#10b981", "#fff")}
            >
              {busy === "approve" ? "Approving…" : "Approve"}
            </button>
          </>
        )}
        {job.status === "approved" && (
          <>
            <button onClick={() => act("reopen")} disabled={!!busy} className="px-3 py-1.5 rounded-lg font-medium" style={btn("rgba(255,255,255,0.06)", "var(--text)")}>Back to check</button>
            <button onClick={() => saveThen("draft")} disabled={!!busy} className="px-4 py-1.5 rounded-lg font-semibold" style={btn("#0ea5e9", "#fff")}>
              {busy === "draft" ? "Creating…" : "Put in Shopify as draft"}
            </button>
          </>
        )}
        {job.status === "in_shopify" && (
          <button onClick={() => act("publish")} disabled={!!busy} className="px-4 py-1.5 rounded-lg font-semibold" style={btn("#22c55e", "#fff")}>
            {busy === "publish" ? "Publishing…" : "Publish (put live)"}
          </button>
        )}
        {job.status === "rejected" && (
          <button onClick={() => act("reopen")} disabled={!!busy} className="px-3 py-1.5 rounded-lg font-medium" style={btn("rgba(255,255,255,0.06)", "var(--text)")}>Back to check</button>
        )}
        {job.shopify_admin_url && (
          <a href={job.shopify_admin_url} target="_blank" rel="noreferrer" className="px-3 py-1.5 rounded-lg font-medium underline" style={{ color: "#7dd3fc" }}>
            Open in Shopify ↗
          </a>
        )}
        {job.status !== "published" && job.status !== "in_shopify" && (
          <button onClick={remove} className="ml-auto text-[10px] px-2 py-1 rounded" style={{ color: "#f87171" }}>Delete</button>
        )}
        {job.notes && job.status === "published" && <span className="text-[10px]" style={{ color: "var(--text-dim)" }}>{job.notes}</span>}
      </div>
    </div>
  )
}
