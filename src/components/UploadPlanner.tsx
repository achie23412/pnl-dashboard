"use client"
// Upload batch planner for Product Opportunities.
// Answers, per Google store: how many products to upload next, and which mix of
// categories / products, using only data the dashboard already has:
//  - capacity: Ascend Drafting SOP (publish 10 per store per day) minus what is already in the pipeline
//  - demand: the opportunities themselves (competitor count, evidence + commercial scores, priority)
//  - your own results per category (Google ad spend + sales, last 30 days)
//  - coverage: how many live products you already have per category
//  - deadlines: season/event launch-by dates inside the upload window go first
import { useState } from "react"
import { tokenize, detectCategory, type OppStatus } from "@/lib/opportunity-engine"

export type PlannerOpp = {
  id: number
  title: string
  category: string | null
  gender: string | null
  status: OppStatus
  priority: "high" | "medium" | "low" | null
  evidence_score: number | null
  commercial_score: number | null
  competitor_count: number
  launch_by: string | null
  event_label: string | null
  markets: string[]
  target_store: string | null
  catalogue_match: string | null
}

const STORES: Record<string, string[]> = {
  "Walsh & Farley": ["IE"],
  "Carter & Collins": ["UK", "GB"],
  "Susan & Allen": ["US"],
}
const PUBLISH_PER_DAY = 10 // Ascend Drafting SOP
const PIPELINE: OppStatus[] = ["approved", "queued", "importing", "imported", "adapting", "ready_for_review", "ready_to_publish"]
const TARGET_ROAS = 2.5 // OAK Google Ads SOP
// The Google stores sell fashion: other scanned categories (gifts, toys, garden, gadgets…) are left out
const NON_FASHION = /^(general|home|gifts?|toys?|garden|gadgets?|pets?|crafts?|auto|beauty|health|kitchen|electronics|office|sports? equipment)\b/i
const FASHION = /coat|jacket|knit|cardigan|sweater|jumper|dress|top|shirt|blouse|trouser|pant|jean|shoe|boot|sneaker|loafer|sandal|heel|bag|skirt|short|suit|blazer|hoodie|sweat|jumpsuit|lounge|activewear|set|accessor|scarf|hat|belt|jewel|outerwear|vest|waistcoat|lingerie|swim/i
const isFashion = (c: string) => !NON_FASHION.test(c) && FASHION.test(c)

type CatPlan = {
  category: string
  slots: number
  candidates: number
  urgent: number
  demand: number
  ownSpend: number
  ownRevenue: number
  ownRoas: number | null
  live: number
  why: string[]
}

type Plan = {
  store: string
  days: number
  capacity: number
  pipeline: number
  available: number
  amount: number
  cats: CatPlan[]
  picks: PlannerOpp[]
  notes: string[]
}

const addDays = (d: string, n: number) => new Date(Date.parse(d) + n * 86400000).toISOString().slice(0, 10)
const eur = (n: number) => `€${Math.round(n).toLocaleString("en-IE")}`

export function UploadPlanner({ opps, onApply }: { opps: PlannerOpp[]; onApply: (ids: number[], store: string) => void }) {
  const [open, setOpen] = useState(false)
  const [store, setStore] = useState("Walsh & Farley")
  const [days, setDays] = useState(7)
  const [plan, setPlan] = useState<Plan | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const build = async () => {
    setBusy(true)
    setErr(null)
    try {
      const to = new Date().toISOString().slice(0, 10)
      const from = addDays(to, -30)
      const [catRes, liveRes] = await Promise.all([
        fetch(`/api/product-catalog?store=all&from=${from}&to=${to}`).then((r) => r.json()).catch(() => null),
        fetch(`/api/listings`).then((r) => r.json()).catch(() => null),
      ])
      setPlan(makePlan({ opps, store, days, today: to, catalog: catRes?.products || [], live: liveRes?.listings || [] }))
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    }
    setBusy(false)
  }

  const box = { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }
  const field = { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", color: "var(--text)" }

  return (
    <div className="glass rounded-xl p-4 mb-4" style={{ border: "1px solid rgba(99,102,241,0.25)" }}>
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between text-left" aria-expanded={open}>
        <div>
          <div className="text-[12px] font-semibold" style={{ color: "var(--text)" }}>Plan the next upload</div>
          <div className="text-[10px]" style={{ color: "var(--text-dim)" }}>
            How many products to upload and which mix, worked out from your data. Pre-selects them below; nothing is approved until you click Approve.
          </div>
        </div>
        <span className="text-[11px]" style={{ color: "#a5b4fc" }}>{open ? "Hide" : "Open"}</span>
      </button>

      {open && (
        <div className="mt-3 text-[11px]" style={{ color: "var(--text)" }}>
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <select value={store} onChange={(e) => { setStore(e.target.value); setPlan(null) }} className="px-3 py-1.5 rounded-lg" style={field} aria-label="Store">
              {Object.keys(STORES).map((s) => <option key={s}>{s}</option>)}
            </select>
            <select value={days} onChange={(e) => { setDays(Number(e.target.value)); setPlan(null) }} className="px-3 py-1.5 rounded-lg" style={field} aria-label="Upload window">
              {[1, 3, 7, 14].map((d) => <option key={d} value={d}>Cover the next {d} day{d === 1 ? "" : "s"}</option>)}
            </select>
            <button onClick={build} disabled={busy} className="px-4 py-1.5 rounded-lg font-semibold disabled:opacity-50" style={{ background: "linear-gradient(135deg,#6366f1,#8b5cf6)", color: "#fff" }}>
              {busy ? "Reading your data… (~20s)" : "Build batch"}
            </button>
          </div>
          {err && <div className="rounded-lg px-3 py-2 mb-2" style={{ background: "rgba(239,68,68,0.1)", color: "#f87171" }}>{err}</div>}

          {plan && (
            <>
              <div className="grid gap-2 md:grid-cols-4 mb-3">
                {[
                  { l: "Upload now", v: String(plan.amount), s: `products for ${plan.store}` },
                  { l: "Capacity", v: String(plan.capacity), s: `${PUBLISH_PER_DAY}/day × ${plan.days} day${plan.days === 1 ? "" : "s"} (Drafting SOP)` },
                  { l: "Already in pipeline", v: String(plan.pipeline), s: "approved → ready, not live yet" },
                  { l: "Good candidates", v: String(plan.available), s: "high + medium priority, not in store yet" },
                ].map((k) => (
                  <div key={k.l} className="rounded-lg p-3" style={box}>
                    <div className="text-[9px] uppercase tracking-wider" style={{ color: "var(--text-dim)" }}>{k.l}</div>
                    <div className="text-[18px] font-bold">{k.v}</div>
                    <div className="text-[9px]" style={{ color: "var(--text-dim)" }}>{k.s}</div>
                  </div>
                ))}
              </div>

              {plan.notes.length > 0 && (
                <ul className="mb-3 space-y-0.5 list-disc pl-4" style={{ color: "var(--text-muted)" }}>
                  {plan.notes.map((n, i) => <li key={i}>{n}</li>)}
                </ul>
              )}

              {plan.cats.length > 0 && (
                <div className="rounded-lg p-3 mb-3 overflow-x-auto" style={box}>
                  <div className="text-[9px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-dim)" }}>The mix, and why</div>
                  <table className="w-full">
                    <thead>
                      <tr style={{ color: "var(--text-dim)" }}>
                        <th className="text-left font-medium pb-1">Category</th>
                        <th className="text-right font-medium pb-1 px-2">Upload</th>
                        <th className="text-right font-medium pb-1 px-2">Candidates</th>
                        <th className="text-right font-medium pb-1 px-2">Your live</th>
                        <th className="text-right font-medium pb-1 px-2">Your 30d spend → sales</th>
                        <th className="text-left font-medium pb-1 pl-2">Why</th>
                      </tr>
                    </thead>
                    <tbody>
                      {plan.cats.filter((c) => c.slots > 0).map((c) => (
                        <tr key={c.category} style={{ borderTop: "1px solid rgba(255,255,255,0.05)", opacity: c.slots ? 1 : 0.5 }}>
                          <td className="py-1.5 pr-2 font-medium">{c.category}</td>
                          <td className="py-1.5 px-2 text-right font-bold" style={{ color: c.slots ? "#34d399" : "var(--text-dim)" }}>{c.slots}</td>
                          <td className="py-1.5 px-2 text-right">{c.candidates}{c.urgent ? <span style={{ color: "#f97316" }}> ({c.urgent} deadline)</span> : ""}</td>
                          <td className="py-1.5 px-2 text-right">{c.live}</td>
                          <td className="py-1.5 px-2 text-right">{c.ownSpend > 0 ? `${eur(c.ownSpend)} → ${eur(c.ownRevenue)}${c.ownRoas !== null ? ` (${c.ownRoas.toFixed(1)}x)` : ""}` : "—"}</td>
                          <td className="py-1.5 pl-2" style={{ color: "var(--text-muted)" }}>{c.why.join(" · ")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {plan.cats.some((c) => c.slots === 0) && (
                    <div className="mt-2 text-[10px]" style={{ color: "var(--text-dim)" }}>
                      Not picked this time (weaker demand or results): {plan.cats.filter((c) => c.slots === 0).map((c) => `${c.category} (${c.candidates})`).join(", ")}
                    </div>
                  )}
                  <div className="mt-1 text-[10px]" style={{ color: "var(--text-dim)" }}>
                    Your sales per product come from Shipgoods fulfilment data; spend from Google Ads per product. Rules: ROAS ≥ 2.5 (OAK target) → more, spend with no sales → fewer, no live products in a category → small boost, a category above 30% of the store → less, max 40% of the batch per category.
                  </div>
                </div>
              )}

              {plan.picks.length > 0 ? (
                <div className="flex flex-wrap items-center gap-2">
                  <button onClick={() => onApply(plan.picks.map((p) => p.id), plan.store)} className="px-4 py-2 rounded-lg font-semibold" style={{ background: "#10b981", color: "#fff" }}>
                    Select these {plan.picks.length} for {plan.store}
                  </button>
                  <span style={{ color: "var(--text-dim)" }}>
                    Shows only this batch in the list below with the store set; then click Approve in the bar.
                  </span>
                </div>
              ) : (
                <div style={{ color: "var(--text-dim)" }}>Nothing to upload right now for {plan.store}.</div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

type CatalogRow = { product_name: string; store: string; ad_spend: number | null; sales_revenue: number }
type LiveRow = { store: string; title: string; productType: string }

function makePlan(a: { opps: PlannerOpp[]; store: string; days: number; today: string; catalog: CatalogRow[]; live: LiveRow[] }): Plan {
  const { opps, store, days, today } = a
  const markets = STORES[store]
  const windowEnd = addDays(today, days)
  const notes: string[] = []
  const catOf = (title: string, pt = "") => detectCategory(tokenize(title), pt || null) || "Other"

  // Capacity vs pipeline
  const capacity = PUBLISH_PER_DAY * days
  const pipeline = opps.filter((o) => o.target_store === store && PIPELINE.includes(o.status)).length

  // Candidates: open, for this store (or unassigned but in its market), not already in the store
  const cands = opps.filter((o) =>
    (o.status === "new" || o.status === "under_review") &&
    (o.target_store === store || (!o.target_store && o.markets.some((m) => markets.includes(m)))) &&
    !o.catalogue_match &&
    !!o.category && isFashion(o.category) &&
    (o.priority === "high" || o.priority === "medium"),
  )
  const available = cands.length
  const amount = Math.max(0, Math.min(capacity - pipeline, available))
  if (pipeline >= capacity) notes.push(`${pipeline} products for ${store} are already between approved and ready — that covers the next ${days} day(s) at ${PUBLISH_PER_DAY}/day, so finish those first.`)
  if (available < capacity - pipeline) notes.push(`Only ${available} strong candidates for ${store}; low-priority ones are left out on purpose. Run a new competitor scan to find more.`)

  // Your own results per category (last 30 days)
  const own = new Map<string, { spend: number; revenue: number }>()
  for (const p of a.catalog.filter((p) => p.store === store)) {
    const c = catOf(p.product_name)
    const o = own.get(c) || { spend: 0, revenue: 0 }
    o.spend += p.ad_spend || 0
    o.revenue += p.sales_revenue || 0
    own.set(c, o)
  }
  if (!a.catalog.some((p) => p.store === store && (p.ad_spend || 0) > 0)) notes.push("No per-product ad data for this store came back, so your own results don't weigh in this time.")
  // Live coverage per category
  const liveCount = new Map<string, number>()
  const liveStore = a.live.filter((l) => l.store === store)
  for (const l of liveStore) liveCount.set(catOf(l.title, l.productType), (liveCount.get(catOf(l.title, l.productType)) || 0) + 1)
  const liveTotal = liveStore.length || 1

  // Category weights
  const byCat = new Map<string, PlannerOpp[]>()
  for (const o of cands) byCat.set(o.category!, [...(byCat.get(o.category!) || []), o])
  const cats: CatPlan[] = []
  byCat.forEach((list, category) => {
    const demand = list.reduce((s, o) => s + ((o.commercial_score || 0) / 100) * ((o.evidence_score || 0) / 100) * (o.priority === "high" ? 1.5 : 1), 0)
    const ow = own.get(category) || { spend: 0, revenue: 0 }
    const roas = ow.spend > 0 ? ow.revenue / ow.spend : null
    const live = liveCount.get(category) || 0
    const why: string[] = []
    let mult = 1
    if (ow.spend >= 20) {
      if (roas !== null && roas >= TARGET_ROAS) { mult *= 1.4; why.push(`your ROAS ${roas.toFixed(1)}x ≥ ${TARGET_ROAS} target → more`) }
      else if (ow.revenue === 0) { mult *= 0.5; why.push(`${eur(ow.spend)} spent, no sales → fewer`) }
      else if (roas !== null && roas < 1.8) { mult *= 0.8; why.push(`your ROAS ${roas.toFixed(1)}x below 1.8 → fewer`) }
      else why.push(`your ROAS ${roas?.toFixed(1)}x, ok`)
    } else why.push("not enough of your own data yet")
    if (live === 0) { mult *= 1.2; why.push("gap: none live yet") }
    else if (live / liveTotal >= 0.3) { mult *= 0.8; why.push(`already ${Math.round((live / liveTotal) * 100)}% of the store`) }
    const urgent = list.filter((o) => o.launch_by && o.launch_by <= windowEnd).length
    if (urgent) why.push(`${urgent} with a launch deadline in the window`)
    const comp = list.reduce((s, o) => s + o.competitor_count, 0)
    why.unshift(`${comp} competitor listings`)
    cats.push({ category, slots: 0, candidates: list.length, urgent, demand: demand * mult, ownSpend: ow.spend, ownRevenue: ow.revenue, ownRoas: roas, live, why })
  })

  // Allocate slots: deadline items first, then by weight (largest remainder), max 40% per category
  const cap = Math.max(2, Math.ceil(amount * 0.4))
  let left = amount
  for (const c of cats) {
    const want = Math.min(c.urgent, c.candidates, cap, left)
    c.slots = want
    left -= want
  }
  const totalW = cats.reduce((s, c) => s + c.demand, 0) || 1
  const base = cats.map((c) => ({ c, exact: (amount * c.demand) / totalW }))
  for (const b of base) {
    const add = Math.max(0, Math.min(Math.floor(b.exact) - b.c.slots, b.c.candidates - b.c.slots, cap - b.c.slots, left))
    b.c.slots += add
    left -= add
  }
  base.sort((x, y) => (y.exact % 1) - (x.exact % 1) || y.c.demand - x.c.demand)
  while (left > 0) {
    const next = base.find((b) => b.c.slots < b.c.candidates && b.c.slots < cap)
      || base.find((b) => b.c.slots < b.c.candidates)
    if (!next) break
    next.c.slots++
    left--
  }

  // Pick the best products inside each category
  const pr = { high: 0, medium: 1, low: 2 } as const
  const picks: PlannerOpp[] = []
  for (const c of cats) {
    const ranked = (byCat.get(c.category) || []).slice().sort((x, y) => {
      const ux = x.launch_by && x.launch_by <= windowEnd ? 0 : 1
      const uy = y.launch_by && y.launch_by <= windowEnd ? 0 : 1
      return ux - uy
        || pr[x.priority || "low"] - pr[y.priority || "low"]
        || (y.commercial_score || 0) - (x.commercial_score || 0)
        || (y.evidence_score || 0) - (x.evidence_score || 0)
        || y.competitor_count - x.competitor_count
    })
    picks.push(...ranked.slice(0, c.slots))
  }
  cats.sort((x, y) => y.slots - x.slots || y.demand - x.demand)

  const women = picks.filter((p) => p.gender === "women").length
  const men = picks.filter((p) => p.gender === "men").length
  if (picks.length) notes.push(`Mix: ${women} women · ${men} men · ${picks.length - women - men} unisex/unknown. ${picks.filter((p) => p.launch_by && p.launch_by <= windowEnd).length} have a season deadline inside the window and go first.`)

  return { store, days, capacity, pipeline, available, amount, cats, picks, notes }
}
