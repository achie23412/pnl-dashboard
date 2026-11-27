"use client"
import { useEffect, useState } from "react"
import Link from "next/link"
import { PageShell } from "@/components/PageShell"
import { Panel, Badge, Button, Loading, EmptyState, Notice, TH, TD, ROW_BORDER } from "@/components/ui"
import type { ScalingData, StoreScaling, ProductRow, Level } from "@/lib/google-scaling"

// The OAK Media × Ascend "Scaling a Google Ads Account" SOP, per Google store.
// Read-only: it tells you what to do; you make every change in Google Ads yourself.

const STEPS = [
  { n: 1, title: "Tracking", text: "WeTracked purchase = primary conversion, confirmed with a 99% test order", video: "https://www.loom.com/share/3b1d687d0a47478f876ffec38844941d" },
  { n: 2, title: "Test campaign", text: "2 full days, GMC must stay live", video: "https://www.loom.com/share/78e45e32b16c41f7acdd0828161988dd" },
  { n: 3, title: "PMax", text: "Launch day 3 · days 1–4 change nothing · CPC > ~$1.50 = talk to coach", video: "https://www.loom.com/share/3b6f80f2eeb44347ba01cf95c4d9b4aa" },
  { n: 4, title: "Scale budget", text: "2–3 days ≥ 2.5 ROAS → +20% (small: 50→80→120→180) · 50% dip → −15%" },
  { n: 5, title: "Exclude", text: "$25 + ROAS < 1.8 · CPC > $1.50 after $5 · 0 Shopify sales" },
  { n: 6, title: "Re-check", text: "Excluded items back above target → include again" },
  { n: 7, title: "Winners", text: "From ~€250/day · ROAS ≥ 2.2 · 14 days · ≥ 3 conversions" },
  { n: 8, title: "Brand search", text: "Google-only stores from ~$400/day" },
]

const LEVEL: Record<Level, { tone: "green" | "red" | "amber" | "grey"; label: string }> = {
  do: { tone: "green", label: "DO" },
  warn: { tone: "red", label: "CHECK" },
  wait: { tone: "amber", label: "WAIT" },
  ok: { tone: "grey", label: "OK" },
}

const eur = (n: number | null | undefined, d = 2) => (n == null ? "—" : `€${n.toFixed(d)}`)
const x = (n: number | null | undefined) => (n == null ? "—" : n.toFixed(2))
const roasColor = (r: number | null) => (r == null ? "var(--text-dim)" : r >= 2.5 ? "var(--green)" : r >= 1.8 ? "var(--orange)" : "var(--red)")

function brandPrompt(url: string | null) {
  return `Build a Google Ads Brand Search ad group for: ${url || "[URL]"}

STEP 1 - RESEARCH
Fetch the homepage and the returns/shipping pages. Find: the brand name exactly as written, the target country and language, the current offer (exact discount wording), free shipping (yes/no and where), the exact money-back or return window in days, the product categories, all collections with their URLs, and the URLs of the Contact, Track Your Order and About Us pages. Use only offers and policies stated on the site. Leave out heritage claims ("since...", "X years"), customer counts and testimonials.

STEP 2 - ASK ME BEFORE BUILDING
After the research, ask me which collections to feature in the sitelinks and ad copy, and list the collections you found.
- If the store sells to more than one gender, propose "Shop Men" / "Shop Women" (with their collection URLs) and ask me to confirm or change them.
- If it's a one-gender store, ask which collections perform best or are in season (for example coats and jackets), and propose "Shop [Collection]" options.
Wait for my answer before building. Use my answer for the collection sitelinks and give me the full sitelink  link  and the item types in the ad copy.

STEP 3 - OUTPUT (in the language of the target market, notes in English)

1. Campaign structure
- Campaign: Brand - [Brand]
- Ad group: Brand Terms - Exact/Phrase
- Bidding: Manual CPC
- Location and language
- Final URL (https, matching the site's canonical domain)

2. Keywords (keep it compact)
- Exact match, 3-4 only: the store name, the store name written as one word (or the spaced version, if the brand has a hyphen or space), and the store name + clothing
- Phrase match, 5-6 max: the domain (e.g. "brand.com"), the brand + men's / women's (only if the store sells that gender), and common misspellings (only if real ones exist)

3. Negative keywords
Check the brand name for overlap with unrelated brands, place names, famous people and common first or last names. Add negatives for each overlap, plus jobs/careers/hiring in the local language.

4. Responsive Search Ad
- 15 headlines, 30 characters max each. Headline 1 is the store name, to be pinned to position 1. The rest must not be too similar to each other and cover: the store, the offer, free shipping, the money-back guarantee, and the types of items sold. Do not mention Apple Pay, payment methods or secure checkout.
- 4 descriptions, 90 characters max each, simple and easy to read.
- Count the characters. Nothing over the limit.

5. Sitelinks (5-6 total)
- The standard three: Contact, Track Your Order, About Us (real URLs from the site)
- 2-3 collection sitelinks based on my answer in Step 2 (e.g. "Shop Women", "Shop Men", or "Shop Coats & Jackets"), each linking to the matching collection URL
- Link text 25 characters max. Each sitelink gets two 35-character description lines (optional) taken from the offer or the shipping and return policy.

6. Callouts (4)
Short callouts based on free shipping, the money-back guarantee, the offer and the items.

FORMAT
Plain text keywords with straight quotes (") and square brackets only, no curly quotes, so they paste into Google Ads without errors.`
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false)
  return (
    <Button
      size="sm"
      onClick={() => {
        navigator.clipboard.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 1500) }).catch(() => {})
      }}
    >
      {done ? "Copied" : label}
    </Button>
  )
}

function ProductTable({ rows, show14 = false }: { rows: ProductRow[]; show14?: boolean }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[11px]">
        <thead>
          <tr style={{ color: "var(--text-dim)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            <th className={`${TH} text-left`}>Product · Item ID</th>
            <th className={`${TH} text-right`}>Spend 30d</th>
            <th className={`${TH} text-right`}>ROAS 30d</th>
            <th className={`${TH} text-right`}>CPC</th>
            <th className={`${TH} text-right`}>Spend 7d</th>
            <th className={`${TH} text-right`}>ROAS 7d</th>
            {show14 && <th className={`${TH} text-right`}>ROAS 14d</th>}
            {show14 && <th className={`${TH} text-right`}>Conv. 14d</th>}
            <th className={`${TH} text-right`} title="Units sold in Shopify in the last 30 days (whole product, all variants)">Shopify 30d</th>
            <th className={`${TH} text-left`}>Why</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.itemId} style={ROW_BORDER}>
              <td className={TD} style={{ color: "var(--text)", maxWidth: 360 }}>
                <div className="truncate" title={p.title}>{p.title}</div>
                <div className="font-mono text-[9px]" style={{ color: "var(--text-dim)" }}>{p.itemId}</div>
              </td>
              <td className={`${TD} text-right tabular-nums`} style={{ color: "var(--text-muted)" }}>{eur(p.spend30)}</td>
              <td className={`${TD} text-right tabular-nums`} style={{ color: roasColor(p.roas30) }}>{x(p.roas30)}</td>
              <td className={`${TD} text-right tabular-nums`} style={{ color: "var(--text-muted)" }}>{eur(p.cpc30)}</td>
              <td className={`${TD} text-right tabular-nums`} style={{ color: "var(--text-muted)" }}>{eur(p.spend7)}</td>
              <td className={`${TD} text-right tabular-nums`} style={{ color: roasColor(p.roas7) }}>{x(p.roas7)}</td>
              {show14 && <td className={`${TD} text-right tabular-nums`} style={{ color: roasColor(p.roas14) }}>{x(p.roas14)}</td>}
              {show14 && <td className={`${TD} text-right tabular-nums`} style={{ color: "var(--text)" }}>{Math.round(p.conv14)}</td>}
              <td className={`${TD} text-right tabular-nums`} style={{ color: p.shopifyUnits30 === 0 ? "var(--red)" : "var(--text-muted)" }}>{p.shopifyUnits30 ?? "—"}</td>
              <td className={`${TD} text-[10px]`} style={{ color: "var(--text-muted)" }}>{p.reason}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function StoreView({ s, th, today }: { s: StoreScaling; th: ScalingData["thresholds"]; today: string }) {
  const [showHow, setShowHow] = useState(false)
  const trackingBad = s.actions.some((a) => a.level === "warn" && a.rule.startsWith("SOP 1:"))
  return (
    <div className="space-y-4">
      {/* 1. What to do today */}
      <Panel title="Do this today" sub={`${s.store} · ${s.stage} · every change is made by you in Google Ads`}>
        <div className="space-y-2">
          {s.actions.map((a, i) => (
            <div key={i} className="rounded-lg p-3" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
              <div className="flex items-center gap-2 flex-wrap">
                <Badge tone={LEVEL[a.level].tone}>{LEVEL[a.level].label}</Badge>
                <span className="text-[12px] font-semibold" style={{ color: "var(--text)" }}>{a.title}</span>
              </div>
              <div className="text-[11px] mt-1.5" style={{ color: "var(--text-muted)" }}>{a.detail}</div>
              <div className="text-[9px] mt-1" style={{ color: "var(--text-dim)" }}>{a.rule}</div>
            </div>
          ))}
        </div>
      </Panel>

      {/* 2. Where you are in the SOP */}
      <Panel title="Where you are in the SOP">
        <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
          {STEPS.map((st) => {
            // Step 1 is only done when the tracking check passes, whatever stage the campaigns are in
            const failing = st.n === 1 && trackingBad
            const current = st.n === s.stageStep
            const done = st.n < s.stageStep && !failing
            return (
              <div key={st.n} className="rounded-lg p-2.5" style={{ border: `1px solid ${failing ? "rgba(239,68,68,0.5)" : current ? "rgba(99,102,241,0.6)" : "rgba(255,255,255,0.06)"}`, background: failing ? "rgba(239,68,68,0.1)" : current ? "rgba(99,102,241,0.12)" : "transparent", opacity: done ? 0.6 : 1 }}>
                <div className="text-[10px] font-semibold" style={{ color: failing ? "#f87171" : current ? "#c7d2fe" : "var(--text)" }}>{failing ? "! " : done ? "✓ " : ""}{st.n}. {st.title}{failing ? ": not confirmed" : ""}</div>
                <div className="text-[9px] mt-1" style={{ color: "var(--text-dim)" }}>{st.text}</div>
                {st.video && <a href={st.video} target="_blank" rel="noreferrer" className="text-[9px] underline mt-1 inline-block" style={{ color: "var(--text-muted)" }}>Video ▶</a>}
              </div>
            )
          })}
        </div>
        <div className="text-[10px] mt-3" style={{ color: "var(--text-dim)" }}>
          Tracking check (last 3 full days): Google counted {s.tracking.googleConv} conversions, Shopify has {s.tracking.shopifyOrders} orders. Merchant Center: {s.gmc.error ? "last sync failed" : s.gmc.lastSync ? `synced ${new Date(s.gmc.lastSync).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}` : "not synced"} · {s.gmc.disapproved} disapproved item(s) (<Link href="/gmc-health" className="underline">GMC Health</Link>).
        </div>
      </Panel>

      {/* 3. Last 14 days */}
      <Panel title="Last 14 days (whole account)" sub="Target ROAS 2.5 · scaling counts only full days of the main campaign after its last budget change" pad={false}>
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead>
              <tr style={{ color: "var(--text-dim)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                {["Day", "Budget", "Spend", "Clicks", "CPC", "Conv.", "Conv. value", "ROAS", "On target"].map((h, i) => (
                  <th key={h} className={`${TH} ${i === 0 ? "text-left" : "text-right"}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {s.days.slice().reverse().map((d) => (
                <tr key={d.date} style={ROW_BORDER}>
                  <td className={TD} style={{ color: "var(--text)" }}>
                    {new Date(d.date + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}
                    {d.date === today && <span className="ml-1 text-[9px]" style={{ color: "var(--orange)" }}>(today, not complete)</span>}
                    {s.main?.lastChange === d.date && <span className="ml-1"><Badge tone="blue">budget changed</Badge></span>}
                    {s.main?.launchDay === d.date && s.main.launchKnown && <span className="ml-1"><Badge tone="accent">PMax launch</Badge></span>}
                  </td>
                  <td className={`${TD} text-right tabular-nums`} style={{ color: "var(--text-muted)" }}>{d.budget ? `€${Math.round(d.budget)}` : "—"}</td>
                  <td className={`${TD} text-right tabular-nums`} style={{ color: "var(--text-muted)" }}>{eur(d.spend)}</td>
                  <td className={`${TD} text-right tabular-nums`} style={{ color: "var(--text)" }}>{d.clicks}</td>
                  <td className={`${TD} text-right tabular-nums`} style={{ color: d.cpc != null && d.cpc > th.cpcMax ? "var(--red)" : "var(--text-muted)" }}>{eur(d.cpc)}</td>
                  <td className={`${TD} text-right tabular-nums`} style={{ color: "var(--text)" }}>{Math.round(d.conversions)}</td>
                  <td className={`${TD} text-right tabular-nums`} style={{ color: "var(--text-muted)" }}>{eur(d.value)}</td>
                  <td className={`${TD} text-right tabular-nums font-medium`} style={{ color: roasColor(d.roas) }}>{x(d.roas)}</td>
                  <td className={`${TD} text-right`}>{d.date === today ? "" : d.onTarget ? <span style={{ color: "var(--green)" }}>✓</span> : <span style={{ color: "var(--text-dim)" }}>✗</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      {/* 4. Campaigns */}
      <Panel title="Campaigns" sub='Names with "TEST" count as the test campaign, unless it is the only PMax and has run more than 2 full days: then it is the main campaign. "WINNER" = winner campaign, "BRAND" or Search = brand search, any other PMax = main campaign' pad={false}>
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead>
              <tr style={{ color: "var(--text-dim)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                {["Campaign", "Role", "Status", "First spend", "Budget/day", "Spend 7d", "ROAS 7d"].map((h, i) => (
                  <th key={h} className={`${TH} ${i < 3 ? "text-left" : "text-right"}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {s.campaigns.map((c) => (
                <tr key={c.name} style={ROW_BORDER}>
                  <td className={TD} style={{ color: "var(--text)" }}>{c.name}</td>
                  <td className={TD}><Badge tone={c.kind === "main" ? "accent" : c.kind === "test" ? "amber" : c.kind === "winner" ? "green" : "grey"}>{c.kind}</Badge>{c.namedTest && <span className="ml-1 text-[9px]" style={{ color: "var(--text-dim)" }}>(named TEST, running as main)</span>}</td>
                  <td className={TD} style={{ color: c.status === "ENABLED" ? "var(--green)" : "var(--text-dim)" }}>{c.status.toLowerCase()}</td>
                  <td className={`${TD} text-right tabular-nums`} style={{ color: "var(--text-muted)" }}>{c.firstDay}</td>
                  <td className={`${TD} text-right tabular-nums`} style={{ color: "var(--text-muted)" }}>{c.budget != null ? `€${Math.round(c.budget)}` : "—"}</td>
                  <td className={`${TD} text-right tabular-nums`} style={{ color: "var(--text-muted)" }}>{eur(c.spend7)}</td>
                  <td className={`${TD} text-right tabular-nums`} style={{ color: roasColor(c.roas7) }}>{x(c.roas7)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      {/* 5. Exclude */}
      <Panel
        title={`Exclude (${s.exclude.length})`}
        sub={`SOP 5 · €${th.excludeSpend.toFixed(2)} ($25) spent and ROAS < 1.8 · CPC > €${th.cpcMax.toFixed(2)} ($1.50) after €${th.cpcMinSpend.toFixed(2)} ($5), unless ROAS ≥ 2.5 · 0 Shopify sales · last 30 full days · check daily, exclude every 2 days`}
        right={
          <>
            <Button size="sm" onClick={() => setShowHow((v) => !v)}>{showHow ? "Hide how" : "How to exclude"}</Button>
            {s.exclude.length > 0 && <CopyButton text={s.exclude.map((p) => p.itemId).join("\n")} label={`Copy ${s.exclude.length} Item IDs`} />}
          </>
        }
        pad={false}
      >
        {showHow && (
          <ol className="px-4 pb-3 text-[11px] list-decimal list-inside space-y-1" style={{ color: "var(--text-muted)" }}>
            <li>Campaigns → Products → All campaigns. Date range: last 30 days (check the last 7 days as well).</li>
            <li>Filter: Cost ≥ $25 and ROAS &lt; 2. Rows per page: 100.</li>
            <li>1.8–2.2 ROAS: optimise first. Under 1.8: exclude.</li>
            <li>One product: double-click the Item ID → copy → Listing groups → add Item ID → Exclude → Save.</li>
            <li>Many products: open the campaign in a new tab → Asset groups → View listing groups → subdivide by Item ID → Bulk add → paste the IDs (button above) → Save.</li>
            <li>Google adds them as Included. Select all → Exclude the pasted IDs → Include &quot;Everything else in All products&quot; → Save.</li>
          </ol>
        )}
        {s.exclude.length ? <ProductTable rows={s.exclude} /> : <div className="px-4 pb-4 text-[11px]" style={{ color: "var(--text-dim)" }}>Nothing to exclude right now.</div>}
      </Panel>

      {/* 5b. Optimise */}
      {s.optimise.length > 0 && (
        <Panel title={`Optimise first, don't exclude yet (${s.optimise.length})`} sub="SOP 5 · ROAS between 1.8 and 2.2 after €25+: give them a chance (title, images, price)" pad={false}>
          <ProductTable rows={s.optimise} />
        </Panel>
      )}

      {/* 6. Re-check */}
      <Panel title={`Re-check exclusions (${s.recheck.length})`} sub="SOP 6 · had sales and are above 2.5 ROAS over 30 days, but got no spend in the last 3 days. If one is on your excluded list in the asset group, remove the exclusion." pad={false}>
        {s.recheck.length ? <ProductTable rows={s.recheck} /> : <div className="px-4 pb-4 text-[11px]" style={{ color: "var(--text-dim)" }}>Nothing to re-check right now.</div>}
      </Panel>

      {/* 7. Winners */}
      <Panel
        title={`Winners (${s.winners.length})`}
        sub={`SOP 7 · ROAS ≥ 2.2, last 14 days, ≥ 3 conversions · winner campaign from ~€250/day: you're at €${Math.round(s.avgSpend3)}/day (3-day average) · add new winners every 4 days, remove a SKU only on ≥ 2 days of data`}
        right={
          <>
            <Badge tone={s.winnerReady ? "green" : "grey"}>{s.winnerReady ? "Ready for a winner campaign" : `Not yet: €${Math.round(s.avgSpend3)} of €250/day`}</Badge>
            {s.winners.length > 0 && <CopyButton text={s.winners.map((p) => p.itemId).join("\n")} label={`Copy ${s.winners.length} Item IDs`} />}
          </>
        }
        pad={false}
      >
        {s.winners.length ? <ProductTable rows={s.winners} show14 /> : <div className="px-4 pb-4 text-[11px]" style={{ color: "var(--text-dim)" }}>No product meets ROAS ≥ 2.2 with 3+ conversions over 14 days yet.</div>}
      </Panel>

      {/* 8. Brand search */}
      <Panel
        title="Brand search"
        sub={`SOP 8 · Google-only store: worth it from ~$400/day (≈ €${th.brandSpend}). You average €${Math.round(s.avgSpend7)}/day over 7 days. Paste the prompt into Claude; it asks you which collections to feature before it builds.`}
        right={
          <>
            <Badge tone={s.brandReady ? "green" : "grey"}>{s.brandReady ? "Ready" : "Not yet"}</Badge>
            <CopyButton text={brandPrompt(s.url)} label="Copy brand search prompt" />
          </>
        }
      >
        <div className="text-[10px]" style={{ color: "var(--text-dim)" }}>Store URL in the prompt: {s.url || "[URL] (fill it in yourself)"}</div>
      </Panel>
    </div>
  )
}

export default function GoogleScalingPage() {
  const [data, setData] = useState<ScalingData | null>(null)
  const [loading, setLoading] = useState(true)
  const [store, setStore] = useState<string>("")

  const load = () => {
    setLoading(true)
    fetch("/api/google-scaling")
      .then((r) => r.json())
      .then((d: ScalingData) => {
        setData(d)
        setStore((cur) => cur || d.stores?.[0]?.store || "")
      })
      .catch((e) => setData({ today: "", usdPerEur: 0, thresholds: { excludeSpend: 0, cpcMax: 0, cpcMinSpend: 0, brandSpend: 0 }, stores: [], error: String(e) }))
      .finally(() => setLoading(false))
  }
  useEffect(load, [])

  const s = data?.stores.find((x) => x.store === store) || null
  const todo = (st: StoreScaling) => st.actions.filter((a) => a.level === "do" || a.level === "warn").length

  return (
    <PageShell
      title="Google Ads Scaling"
      breadcrumb="Home → Front End → Google Ads Scaling"
      description="What to do today in each Google store's ad account, following the OAK Media × Ascend SOP: tracking, test campaign, PMax, scaling the budget, exclusions, winners and brand search. Data from Google Ads (via Windsor), Shopify and Merchant Center. This page changes nothing; you make every change in Google Ads yourself."
      stats={s ? [
        { label: "Stage", value: s.stage || "—", sub: `SOP step ${s.stageStep} of 8` },
        { label: "Main budget", value: s.main?.budget != null ? `€${Math.round(s.main.budget)}/day` : "—", sub: s.main?.nextBudget ? `Next step: €${s.main.nextBudget}` : undefined },
        { label: "On-target days", value: s.main ? `${s.main.streak} of 2–3` : "—", sub: "ROAS ≥ 2.5, in a row", color: s.main && s.main.streak >= 2 ? "var(--green)" : undefined },
        { label: "Spend / day", value: `€${Math.round(s.avgSpend3)}`, sub: "3-day average" },
        { label: "CPC (3 days)", value: s.cpc3 != null ? `€${s.cpc3.toFixed(2)}` : "—", sub: data ? `limit €${data.thresholds.cpcMax.toFixed(2)} ($1.50)` : undefined, color: s.cpc3 != null && data && s.cpc3 > data.thresholds.cpcMax ? "var(--red)" : undefined },
      ] : undefined}
      actions={
        <>
          {data?.stores.map((st) => (
            <Button key={st.store} size="sm" variant={st.store === store ? "primary" : undefined} onClick={() => setStore(st.store)}>
              {st.store}{todo(st) ? ` · ${todo(st)}` : ""}
            </Button>
          ))}
          <Button size="sm" onClick={load}>Refresh</Button>
        </>
      }
    >
      {loading && !data ? (
        <Loading>Loading Google Ads, Shopify and Merchant Center data…</Loading>
      ) : data?.error && !data.stores.length ? (
        <Notice tone="error">Couldn&apos;t load the data: {data.error}</Notice>
      ) : !s ? (
        <EmptyState title="No Google stores found" />
      ) : (
        <>
          <StoreView s={s} th={data!.thresholds} today={data!.today} />
          <div className="text-[9px] mt-4" style={{ color: "var(--text-dim)" }}>
            The Google Ads accounts run in EUR, so the SOP&apos;s dollar amounts are converted at today&apos;s ECB rate (1 EUR = {data!.usdPerEur.toFixed(4)} USD). Days follow the ad accounts&apos; Amsterdam time; today is never counted as a full day. Google data can be a few hours behind and conversions land late, so ROAS of the last 1–2 days can still rise.
          </div>
        </>
      )}
    </PageShell>
  )
}
