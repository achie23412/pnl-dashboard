"use client"
// GMC Health for the Google stores: weekly disapproved list, counterfeit drafts, Google's
// lower-price suggestions (with the COG% check) and the daily feed change limit.
import { useCallback, useEffect, useMemo, useState } from "react"
import { PageShell } from "@/components/PageShell"
import { Panel, Badge, Button, Notice, Loading, EmptyState, TH, TD, ROW_BORDER } from "@/components/ui"

interface Stats { spend: number; units: number; revenue_eur: number }
interface StoreRow {
  store: string; merchant_id: string | null; max_cog_pct: number; feed_change_pct: number; max_drafts_per_day: number
  feed_products: number | null; feed_items: number | null; last_sync_at: string | null; last_sync_error: string | null
  limit: number; changed: number; drafts: number; queued: number; write_products: boolean | null; first_sync: string | null
}
interface Issue {
  store: string; offer_id: string; issue_code: string; product_id: string | null; title: string | null; description: string | null
  detail: string | null; resolution: string | null; attribute: string | null; countries: string[] | null; documentation: string | null
  first_seen: string; fix: string; counterfeit: boolean; stats: Stats | null
}
interface Counterfeit {
  store: string; product_id: string; title: string | null; offers: string[]; first_seen: string
  shopify_status: string | null; draft: { status: string; planned_for: string } | null; stats: Stats | null
}
interface PriceRow {
  store: string; offer_id: string; product_id: string | null; variant_id: string | null; title: string | null
  price: number; suggested_price: number; currency: string; clicks: number | null; conversions: number | null
  effectiveness: string | null; cogs_local: number | null; cogs_source: string | null
  cog_pct_now: number | null; cog_pct_new: number | null; status: "ok" | "blocked" | "no_cogs"
}
interface Change {
  id: number; store: string; product_id: string; title: string | null; kind: string; old_value: string | null; new_value: string | null
  reason: string | null; status: string; planned_for: string; applied_at: string | null; error: string | null
}
interface Data {
  configured: boolean; service_account: string | null; today: string; monday: string
  stores: StoreRow[]; issues: Issue[]; stats_error: string | null; counterfeit: Counterfeit[]; status_error: string | null
  price_rows: PriceRow[]; price_error: string | null; changes: Change[]
}

const box = { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", color: "var(--text)" }
const SYM: Record<string, string> = { EUR: "€", GBP: "£", USD: "$" }
const money = (v: number, cur = "EUR") => `${SYM[cur] || ""}${v.toFixed(2)}`
const eur = (v: number) => `€${Math.round(v).toLocaleString("en-GB")}`
const dayLabel = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })
const pct = (f: number | null) => (f == null ? "—" : `${f > 0 ? "+" : ""}${Math.round(f * 100)}%`)
const short = (s: string) => ({ "Susan & Allen": "S&A", "Carter & Collins": "C&C", "Walsh & Farley": "W&F" } as Record<string, string>)[s] || s

type Tab = "disapproved" | "draft" | "price" | "log"

export default function GmcHealthPage() {
  const [data, setData] = useState<Data | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [role, setRole] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>("disapproved")
  const [storeFilter, setStoreFilter] = useState("all")
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ tone: "error" | "success" | "warning" | "info"; text: string } | null>(null)
  const [ids, setIds] = useState<Record<string, string>>({})
  const [email, setEmail] = useState("")
  const [selDraft, setSelDraft] = useState<Record<string, boolean>>({})
  const [selPrice, setSelPrice] = useState<Record<string, boolean>>({})
  const [priceFilter, setPriceFilter] = useState<"all" | "ok" | "blocked" | "no_cogs">("all")

  const load = useCallback(async () => {
    setErr(null)
    try {
      const r = await fetch("/api/gmc-health", { cache: "no-store" })
      const j = await r.json()
      if (!r.ok || j.error) throw new Error(j.error || `HTTP ${r.status}`)
      setData(j)
      setIds(Object.fromEntries((j.stores as StoreRow[]).map((s) => [s.store, s.merchant_id || ""])))
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
  }, [])
  useEffect(() => { load(); fetch("/api/auth/me").then((r) => r.json()).then((j) => setRole(j.role)).catch(() => {}) }, [load])
  const owner = role === "owner"

  const post = async (key: string, body: unknown, done?: (j: Record<string, unknown>) => string) => {
    setBusy(key); setMsg(null)
    try {
      const r = await fetch("/api/gmc-health", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok || j.error) throw new Error(j.error || `HTTP ${r.status}`)
      if (done) setMsg({ tone: "success", text: done(j) })
      await load()
    } catch (e) { setMsg({ tone: "error", text: e instanceof Error ? e.message : String(e) }) }
    setBusy(null)
  }
  const summarize = (j: Record<string, unknown>) => {
    const res = (j.results as { status: string; error?: string; planned_for?: string }[]) || []
    const n = (s: string) => res.filter((r) => r.status === s).length
    const fails = res.filter((r) => r.status === "failed").map((r) => r.error).filter(Boolean)
    return `${n("applied")} done now, ${n("queued")} queued for tomorrow (daily limit), ${n("failed")} failed${n("skipped") ? `, ${n("skipped")} already queued` : ""}${j.skipped ? `, ${j.skipped} not allowed` : ""}.${fails.length ? ` ${fails.slice(0, 3).join("; ")}` : ""}`
  }

  const inStore = <T extends { store: string }>(rows: T[]) => (storeFilter === "all" ? rows : rows.filter((r) => r.store === storeFilter))
  const issues = useMemo(() => inStore(data?.issues || []), [data, storeFilter]) // eslint-disable-line react-hooks/exhaustive-deps
  const groups = useMemo(() => {
    const g: Record<string, Issue[]> = {}
    for (const i of issues) (g[i.issue_code] ||= []).push(i)
    return Object.keys(g).map((k) => ({ code: k, rows: g[k] })).sort((a, b) => b.rows.length - a.rows.length)
  }, [issues])
  const counterfeit = inStore(data?.counterfeit || [])
  const prices = inStore(data?.price_rows || []).filter((p) => priceFilter === "all" || p.status === priceFilter)
  const changes = inStore(data?.changes || [])
  const draftable = (c: Counterfeit) => c.shopify_status === "active" && !c.draft

  const stores = data?.stores || []
  const needsSetup = !!data && (!data.configured || stores.some((s) => !s.merchant_id || !s.last_sync_at || s.last_sync_error))

  return (
    <PageShell
      title="GMC Health"
      breadcrumb="Front End → GMC Health"
      description="Google stores (S&A, C&C, W&F): disapproved products every week, counterfeit drafts, Google's lower-price suggestions and the 10% daily feed change limit."
      actions={owner && data?.configured ? <Button size="sm" onClick={() => post("sync", { action: "sync" }, (j) => `Synced: ${((j.results as { store: string; error?: string; open_issues?: number }[]) || []).map((r) => `${short(r.store)} ${r.error ? `error (${r.error})` : `${r.open_issues} issues`}`).join(", ")}`)} disabled={!!busy}>{busy === "sync" ? "Syncing…" : "Sync now"}</Button> : undefined}
    >
      {err ? <Notice tone="error">{err}</Notice> : !data ? <Loading /> : (
        <>
          {msg && <div className="mb-3"><Notice tone={msg.tone}>{msg.text}</Notice></div>}

          {needsSetup && (
            <Panel title="Setup" sub="GMC Health reads Google's Merchant API with a service account. Steps 1–3 are yours (keys never go through chat); then fill in the IDs here." className="mb-3">
              <ol className="text-[11px] list-decimal pl-4 space-y-1 mb-3" style={{ color: "var(--text-muted)" }}>
                <li className={data.configured ? "line-through opacity-60" : ""}>Google Cloud console: create a project (or use one), turn on <b>Merchant API</b>, create a <b>service account</b> and download its JSON key.</li>
                <li className={data.configured ? "line-through opacity-60" : ""}>Vercel → pnl-dashboard → Settings → Environment Variables: add <code>GOOGLE_MERCHANT_SA_JSON</code> with the whole JSON file as the value, then redeploy.</li>
                <li>Merchant Center (each of the 3 accounts) → Settings → People and access: add {data.service_account ? <code>{data.service_account}</code> : "the service account's email"} with <b>Standard</b> access.</li>
                <li>Fill in each store&apos;s Merchant Center ID below, then <b>Register API access</b> once per store with your Google login email, then <b>Sync now</b>.</li>
              </ol>
              <div className="grid sm:grid-cols-3 gap-2">
                {stores.map((s) => (
                  <div key={s.store} className="rounded-lg p-2" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
                    <div className="text-[11px] font-semibold mb-1" style={{ color: "var(--text)" }}>{s.store}</div>
                    <div className="flex gap-1 mb-1">
                      <input value={ids[s.store] || ""} onChange={(e) => setIds({ ...ids, [s.store]: e.target.value })} placeholder="Merchant Center ID" disabled={!owner} className="flex-1 min-w-0 px-2 py-1 rounded-md text-[10px]" style={box} />
                      {owner && <Button size="sm" onClick={() => post(`id-${s.store}`, { action: "settings", store: s.store, merchant_id: ids[s.store] }, () => `Saved ${s.store}'s Merchant Center ID.`)} disabled={!!busy}>Save</Button>}
                    </div>
                    {owner && data.configured && s.merchant_id && (
                      <Button size="sm" variant="ghost" onClick={() => post(`reg-${s.store}`, { action: "register", store: s.store, email }, () => `API access registered for ${s.store}.`)} disabled={!!busy || !email}>Register API access</Button>
                    )}
                    <div className="text-[10px] mt-1" style={{ color: s.last_sync_error ? "var(--red)" : "var(--text-dim)" }}>
                      {s.last_sync_error ? s.last_sync_error : s.last_sync_at ? `Last sync ${new Date(s.last_sync_at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}` : "Not synced yet"}
                    </div>
                    {s.write_products === false && <div className="text-[10px] mt-1" style={{ color: "var(--amber, #fbbf24)" }}>The Shopify app has no write_products permission, so drafts and prices can&apos;t be changed yet.</div>}
                  </div>
                ))}
              </div>
              {owner && data.configured && (
                <div className="flex items-center gap-2 mt-2">
                  <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Your Google login email (for Register API access)" className="flex-1 max-w-sm px-2 py-1 rounded-md text-[10px]" style={box} />
                </div>
              )}
            </Panel>
          )}

          {/* Feed change limit per store */}
          <div className="grid sm:grid-cols-3 gap-2 mb-3">
            {stores.map((s) => {
              const full = s.limit > 0 && s.changed >= s.limit
              return (
                <div key={s.store} className="glass rounded-xl p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold" style={{ color: "var(--text)" }}>{s.store}</span>
                    {full ? <Badge tone="red">Limit reached</Badge> : s.queued > 0 ? <Badge tone="amber">{s.queued} queued</Badge> : null}
                  </div>
                  <div className="text-[18px] font-bold tabular-nums mt-1" style={{ color: full ? "var(--red)" : "var(--text)" }}>
                    {s.limit ? `${s.changed} / ${s.limit}` : "— / —"}
                  </div>
                  <div className="text-[10px]" style={{ color: "var(--text-dim)" }}>
                    {s.limit ? `feed changes used today (${s.feed_change_pct}% of ${s.feed_products} products)` : "limit known after the first sync"}
                    {" · "}drafts {s.drafts} / {s.max_drafts_per_day}
                  </div>
                </div>
              )
            })}
          </div>

          <div className="flex flex-wrap items-center gap-1.5 mb-3">
            {([
              ["disapproved", `Disapproved (${issues.length})`],
              ["draft", `Draft now (${counterfeit.filter(draftable).length})`],
              ["price", `Price suggestions (${inStore(data.price_rows).filter((p) => p.status === "ok").length} OK)`],
              ["log", `Change log (${changes.length})`],
            ] as [Tab, string][]).map(([k, label]) => (
              <Button key={k} size="sm" variant={tab === k ? "primary" : "secondary"} onClick={() => setTab(k)}>{label}</Button>
            ))}
            <select value={storeFilter} onChange={(e) => setStoreFilter(e.target.value)} className="ml-auto px-2 py-1 rounded-md text-[10px]" style={box}>
              <option value="all">All Google stores</option>
              {stores.map((s) => <option key={s.store} value={s.store}>{s.store}</option>)}
            </select>
          </div>

          {tab === "disapproved" && (
            <>
              <div className="text-[10px] mb-2" style={{ color: "var(--text-dim)" }}>
                Weekly check from Monday {dayLabel(data.monday)}. The list updates every morning; <b>New this week</b> = first seen since Monday. Spend and sales are the last 30 days (spend from Google Ads, revenue converted to EUR).
              </div>
              {data.stats_error && <div className="mb-2"><Notice tone="warning">Spend/sales couldn&apos;t be loaded: {data.stats_error}</Notice></div>}
              {groups.length === 0 ? <EmptyState title={stores.some((s) => s.last_sync_at) ? "No disapproved products" : "Not synced yet"}>{stores.some((s) => s.last_sync_at) ? "Merchant Center has no disapproved products for these stores." : "Finish the setup above, then click Sync now."}</EmptyState> : groups.map((g) => {
                const first = g.rows[0]
                const spend = g.rows.reduce((a, r) => a + (r.stats?.spend || 0), 0)
                return (
                  <Panel key={g.code} title={<span>{first.description || g.code} <span style={{ color: "var(--text-dim)", fontWeight: 400 }}>· {g.rows.length} item{g.rows.length > 1 ? "s" : ""} · {eur(spend)} spend</span></span>} sub={g.code} className="mb-3" pad={false}>
                    <div className="px-4 pb-2 text-[10px]" style={{ color: "var(--text-muted)" }}>
                      <div><b style={{ color: "var(--text)" }}>How to fix:</b> {first.fix}</div>
                      {first.resolution && <div className="mt-0.5">Google: {first.resolution}{first.detail ? ` – ${first.detail}` : ""}</div>}
                      {first.documentation && <a href={first.documentation} target="_blank" rel="noreferrer" className="underline" style={{ color: "#a5b4fc" }}>Google help page</a>}
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead><tr style={{ color: "var(--text-dim)" }}>
                          <th className={`${TH} text-left`}>Store</th><th className={`${TH} text-left`}>Product</th><th className={`${TH} text-left`}>Since</th>
                          <th className={`${TH} text-left`}>Countries</th><th className={`${TH} text-right`}>Spend 30d</th><th className={`${TH} text-right`}>Sales 30d</th>
                        </tr></thead>
                        <tbody>
                          {g.rows.map((r) => {
                            const st = stores.find((s) => s.store === r.store)
                            const atFirstSync = st?.first_sync === r.first_seen
                            return (
                              <tr key={`${r.store}|${r.offer_id}`} style={ROW_BORDER}>
                                <td className={TD}>{short(r.store)}</td>
                                <td className={TD} style={{ color: "var(--text)" }}>{r.title || r.offer_id}<div className="text-[9px]" style={{ color: "var(--text-dim)" }}>{r.offer_id}</div></td>
                                <td className={TD}>{atFirstSync ? `on or before ${dayLabel(r.first_seen)}` : dayLabel(r.first_seen)} {r.first_seen >= data.monday && !atFirstSync && <Badge tone="blue">New this week</Badge>}</td>
                                <td className={TD}>{(r.countries || []).join(", ") || "—"}</td>
                                <td className={`${TD} text-right tabular-nums`}>{r.stats ? eur(r.stats.spend) : "—"}</td>
                                <td className={`${TD} text-right tabular-nums`}>{r.stats ? `${r.stats.units} · ${eur(r.stats.revenue_eur)}` : "—"}</td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </Panel>
                )
              })}
            </>
          )}

          {tab === "draft" && (
            <Panel title="Draft now: live products disapproved for counterfeit" sub="You confirm each one. Drafting sets the product to draft in Shopify and logs product, date and reason (GMC: counterfeit). Max drafts per store per day and the 10% feed limit apply; the rest is queued for tomorrow." pad={false}>
              {data.status_error && <div className="px-4 pb-2"><Notice tone="warning">Shopify status couldn&apos;t be read: {data.status_error}</Notice></div>}
              {counterfeit.length === 0 ? <div className="px-4 pb-4 text-[11px]" style={{ color: "var(--text-muted)" }}>No products are disapproved for counterfeit.</div> : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead><tr style={{ color: "var(--text-dim)" }}>
                        <th className={TH}></th><th className={`${TH} text-left`}>Store</th><th className={`${TH} text-left`}>Product</th><th className={`${TH} text-left`}>Since</th>
                        <th className={`${TH} text-left`}>Shopify</th><th className={`${TH} text-right`}>Spend 30d</th><th className={`${TH} text-right`}>Sales 30d</th><th className={`${TH} text-left`}>Draft</th>
                      </tr></thead>
                      <tbody>
                        {counterfeit.map((c) => {
                          const k = `${c.store}|${c.product_id}`
                          return (
                            <tr key={k} style={ROW_BORDER}>
                              <td className={TD}>{owner && draftable(c) && <input type="checkbox" checked={!!selDraft[k]} onChange={(e) => setSelDraft({ ...selDraft, [k]: e.target.checked })} />}</td>
                              <td className={TD}>{short(c.store)}</td>
                              <td className={TD} style={{ color: "var(--text)" }}>{c.title || c.product_id}<div className="text-[9px]" style={{ color: "var(--text-dim)" }}>{c.offers.length} feed item{c.offers.length > 1 ? "s" : ""}</div></td>
                              <td className={TD}>{dayLabel(c.first_seen)}</td>
                              <td className={TD}><Badge tone={c.shopify_status === "active" ? "green" : "grey"}>{c.shopify_status || "unknown"}</Badge></td>
                              <td className={`${TD} text-right tabular-nums`}>{c.stats ? eur(c.stats.spend) : "—"}</td>
                              <td className={`${TD} text-right tabular-nums`}>{c.stats ? `${c.stats.units} · ${eur(c.stats.revenue_eur)}` : "—"}</td>
                              <td className={TD}>{c.draft ? <Badge tone={c.draft.status === "applied" ? "green" : "amber"}>{c.draft.status === "applied" ? `Drafted ${dayLabel(c.draft.planned_for)}` : `Queued for ${dayLabel(c.draft.planned_for)}`}</Badge> : c.shopify_status !== "active" ? "Not live" : "—"}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                  {owner && (
                    <div className="flex items-center gap-2 px-4 py-3">
                      <Button size="sm" variant="ghost" onClick={() => setSelDraft(Object.fromEntries(counterfeit.filter(draftable).map((c) => [`${c.store}|${c.product_id}`, true])))}>Select all live</Button>
                      <Button size="sm" variant="primary" disabled={!!busy || !Object.values(selDraft).some(Boolean)} onClick={() => {
                        const items = counterfeit.filter((c) => selDraft[`${c.store}|${c.product_id}`]).map((c) => ({ store: c.store, product_id: c.product_id, title: c.title }))
                        if (!confirm(`Set ${items.length} product${items.length > 1 ? "s" : ""} to draft in Shopify? They go offline in the store and in Google.`)) return
                        post("draft", { action: "draft", items }, summarize).then(() => setSelDraft({}))
                      }}>{busy === "draft" ? "Drafting…" : `Draft selected (${Object.values(selDraft).filter(Boolean).length})`}</Button>
                    </div>
                  )}
                </>
              )}
            </Panel>
          )}

          {tab === "price" && (
            <Panel title="Google's lower-price suggestions" sub={`OK to apply only when the new price keeps COG% at or below the store's max (${stores.map((s) => `${short(s.store)} ${s.max_cog_pct}%`).join(", ")}). COGS from the 90-day product catalog, converted to the price's currency at today's ECB rate. Price incl. VAT, like the other pages.`} pad={false}
              right={<select value={priceFilter} onChange={(e) => setPriceFilter(e.target.value as typeof priceFilter)} className="px-2 py-1 rounded-md text-[10px]" style={box}>
                <option value="all">All</option><option value="ok">OK to apply</option><option value="blocked">Blocked</option><option value="no_cogs">No COGS</option>
              </select>}>
              {data.price_error && <div className="px-4 pb-2"><Notice tone="warning">{data.price_error}</Notice></div>}
              {prices.length === 0 ? <div className="px-4 pb-4 text-[11px]" style={{ color: "var(--text-muted)" }}>No lower-price suggestions{priceFilter !== "all" ? " in this filter" : ""}. Google only gives them for products with enough clicks.</div> : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead><tr style={{ color: "var(--text-dim)" }}>
                        <th className={TH}></th><th className={`${TH} text-left`}>Store</th><th className={`${TH} text-left`}>Product</th>
                        <th className={`${TH} text-right`}>Price → suggested</th><th className={`${TH} text-right`}>COGS</th><th className={`${TH} text-right`}>COG% now → new</th>
                        <th className={`${TH} text-right`}>Clicks / conv.</th><th className={`${TH} text-left`}>Status</th>
                      </tr></thead>
                      <tbody>
                        {prices.map((p) => {
                          const k = `${p.store}|${p.offer_id}`
                          const logged = data.changes.find((c) => c.kind === "price" && c.store === p.store && c.product_id === p.product_id && (c.status === "queued" || c.status === "applied"))
                          return (
                            <tr key={k} style={ROW_BORDER}>
                              <td className={TD}>{owner && p.status === "ok" && p.variant_id && !logged && <input type="checkbox" checked={!!selPrice[k]} onChange={(e) => setSelPrice({ ...selPrice, [k]: e.target.checked })} />}</td>
                              <td className={TD}>{short(p.store)}</td>
                              <td className={TD} style={{ color: "var(--text)" }}>{p.title || p.offer_id}<div className="text-[9px]" style={{ color: "var(--text-dim)" }}>{p.offer_id}</div></td>
                              <td className={`${TD} text-right tabular-nums`}>{money(p.price, p.currency)} → <b style={{ color: "var(--text)" }}>{money(p.suggested_price, p.currency)}</b><div className="text-[9px]" style={{ color: "var(--text-dim)" }}>{Math.round(((p.suggested_price - p.price) / p.price) * 100)}%</div></td>
                              <td className={`${TD} text-right tabular-nums`}>{p.cogs_local != null ? money(p.cogs_local, p.currency) : "—"}{p.cogs_source && <div className="text-[9px]" style={{ color: "var(--text-dim)" }}>{p.cogs_source}</div>}</td>
                              <td className={`${TD} text-right tabular-nums`}>{p.cog_pct_now != null ? `${p.cog_pct_now}% → ${p.cog_pct_new}%` : "—"}</td>
                              <td className={`${TD} text-right tabular-nums`}>{pct(p.clicks)} / {pct(p.conversions)}</td>
                              <td className={TD}>
                                {logged ? <Badge tone={logged.status === "applied" ? "green" : "amber"}>{logged.status === "applied" ? "Applied" : `Queued ${dayLabel(logged.planned_for)}`}</Badge>
                                  : p.status === "ok" ? <Badge tone="green">OK to apply</Badge>
                                  : p.status === "blocked" ? <Badge tone="red">{`Blocked – COG% too high (${p.cog_pct_new}%)`}</Badge>
                                  : <Badge tone="grey">No COGS – can&apos;t check</Badge>}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                  {owner && (
                    <div className="flex items-center gap-2 px-4 py-3">
                      <Button size="sm" variant="primary" disabled={!!busy || !Object.values(selPrice).some(Boolean)} onClick={() => {
                        const items = prices.filter((p) => selPrice[`${p.store}|${p.offer_id}`]).map((p) => ({ store: p.store, offer_id: p.offer_id }))
                        if (!confirm(`Change ${items.length} price${items.length > 1 ? "s" : ""} in Shopify to Google's suggestion?`)) return
                        post("price", { action: "price", items }, summarize).then(() => setSelPrice({}))
                      }}>{busy === "price" ? "Applying…" : `Apply selected (${Object.values(selPrice).filter(Boolean).length})`}</Button>
                      <span className="text-[10px]" style={{ color: "var(--text-dim)" }}>Changes the variant&apos;s price in Shopify and logs it in Price Suggestions (7-day cooldown).</span>
                    </div>
                  )}
                </>
              )}
            </Panel>
          )}

          {tab === "log" && (
            <Panel title="Feed change log (last 14 days)" sub="Every price, title, draft and publish made from the dashboard. Queued = over the daily limit; it runs the next morning." pad={false}>
              {changes.length === 0 ? <div className="px-4 pb-4 text-[11px]" style={{ color: "var(--text-muted)" }}>No changes yet.</div> : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead><tr style={{ color: "var(--text-dim)" }}>
                      <th className={`${TH} text-left`}>Date</th><th className={`${TH} text-left`}>Store</th><th className={`${TH} text-left`}>Product</th>
                      <th className={`${TH} text-left`}>Change</th><th className={`${TH} text-left`}>Reason</th><th className={`${TH} text-left`}>Status</th><th className={TH}></th>
                    </tr></thead>
                    <tbody>
                      {changes.map((c) => (
                        <tr key={c.id} style={ROW_BORDER}>
                          <td className={TD}>{dayLabel(c.planned_for)}</td>
                          <td className={TD}>{short(c.store)}</td>
                          <td className={TD} style={{ color: "var(--text)" }}>{c.title || c.product_id}</td>
                          <td className={TD}>{c.kind}{c.old_value || c.new_value ? `: ${c.old_value ?? "?"} → ${c.new_value ?? "?"}` : ""}</td>
                          <td className={TD}>{c.reason || "—"}</td>
                          <td className={TD}><Badge tone={c.status === "applied" ? "green" : c.status === "queued" ? "amber" : c.status === "failed" ? "red" : "grey"}>{c.status}</Badge>{c.error && <div className="text-[9px]" style={{ color: "var(--red)" }}>{c.error}</div>}</td>
                          <td className={TD}>{owner && c.status === "queued" && <Button size="sm" variant="ghost" onClick={() => post(`cancel-${c.id}`, { action: "cancel", id: c.id }, () => "Cancelled.")} disabled={!!busy}>Cancel</Button>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>
          )}
        </>
      )}
    </PageShell>
  )
}
