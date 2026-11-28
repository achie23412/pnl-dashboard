"use client"
// Front End → Competitor Finder. Step 1: pick a keyword where demand is high but few
// tracked competitors sell it. Step 2: search it (Google Shopping, Shopify stores,
// Meta / Google ads) in that market. Step 3: paste the stores you found, check them,
// add the good ones to the Competitor Tracker.
import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { PageShell } from "@/components/PageShell"
import { PillSelect, FilterBar } from "@/components/PillSelect"
import { FilterSelect, EMPTY_FILTER, passesAny, type FilterValue } from "@/components/FilterSelect"
import { Panel, Badge, Button, Notice, Loading, EmptyState, TH, TD, ROW_BORDER } from "@/components/ui"
import type { FinderKeyword, StoreCheck } from "@/lib/competitor-finder"

const MARKETS = [
  { code: "US", label: "United States", gl: "us", google: "www.google.com", ads: "US" },
  { code: "UK", label: "United Kingdom", gl: "uk", google: "www.google.co.uk", ads: "GB" },
  { code: "IE", label: "Ireland", gl: "ie", google: "www.google.ie", ads: "IE" },
  { code: "DE", label: "Germany", gl: "de", google: "www.google.de", ads: "DE" },
  { code: "NL", label: "Netherlands", gl: "nl", google: "www.google.nl", ads: "NL" },
  { code: "IT", label: "Italy", gl: "it", google: "www.google.it", ads: "IT" },
]
const HL: Record<string, string> = { US: "en", UK: "en", IE: "en", DE: "de", NL: "nl", IT: "it" }
const SOURCE_LABEL: Record<string, string> = { planner: "Keyword Planner", competitors: "Competitor products", base: "Keyword list" }
const NICHES = ["mix clothing", "womens clothing", "mens clothing", "niche"]
const inputCls = "rounded-lg px-3 py-1.5 text-[11px] outline-none"
const inputStyle = { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", color: "var(--text)" }
const fmtVol = (n: number | null) => (n == null ? "—" : n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K` : String(n))

function searchLinks(kw: string, code: string) {
  const m = MARKETS.find((x) => x.code === code) || MARKETS[0]
  const q = encodeURIComponent(kw)
  return {
    shopping: `https://${m.google}/search?q=${q}&tbm=shop&gl=${m.gl}&hl=${HL[code] || "en"}`,
    shopify: `https://${m.google}/search?q=${encodeURIComponent(`${kw} inurl:/products/`)}&gl=${m.gl}&hl=${HL[code] || "en"}`,
    meta: `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=${m.ads}&q=${q}&search_type=keyword_unordered&media_type=all`,
    google: `https://adstransparency.google.com/?region=${m.ads}`,
  }
}

type AddForm = { visits: string; tp: string; niche: string; busy: boolean; done: string | null }

export default function CompetitorFinderPage() {
  const [market, setMarket] = useState("US")
  const [data, setData] = useState<{ keywords: FinderKeyword[]; competitorsInMarket: number; plannerCount: number } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [q, setQ] = useState("")
  const [show, setShow] = useState("gaps")
  const [sort, setSort] = useState("score")
  const [sources, setSources] = useState<FilterValue>(EMPTY_FILTER)
  const [limit, setLimit] = useState(60)
  const [activeKw, setActiveKw] = useState("")
  const [searched, setSearched] = useState<Set<string>>(new Set())

  const [paste, setPaste] = useState("")
  const [checking, setChecking] = useState(false)
  const [checkError, setCheckError] = useState<string | null>(null)
  const [stores, setStores] = useState<StoreCheck[]>([])
  const [forms, setForms] = useState<Record<string, AddForm>>({})

  useEffect(() => {
    setLoading(true)
    setError(null)
    fetch(`/api/competitor-finder?market=${market}`)
      .then(async (r) => {
        const j = await r.json()
        if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`)
        setData(j)
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false))
    try {
      setSearched(new Set(JSON.parse(localStorage.getItem(`finder:searched:${market}`) || "[]")))
    } catch {
      setSearched(new Set())
    }
  }, [market])

  const markSearched = (kw: string) => {
    setActiveKw(kw)
    setSearched((s) => {
      const n = new Set(s).add(kw)
      try {
        localStorage.setItem(`finder:searched:${market}`, JSON.stringify(Array.from(n).slice(-500)))
      } catch {
        // optional
      }
      return n
    })
  }

  const list = useMemo(() => {
    if (!data) return []
    const query = q.toLowerCase().trim()
    let l = data.keywords.filter((k) => (!query || k.keyword.includes(query)) && passesAny(sources, k.sources))
    if (show === "gaps") l = l.filter((k) => k.sellers <= 2)
    if (show === "new") l = l.filter((k) => !searched.has(k.keyword))
    if (sort === "volume") l = [...l].sort((a, b) => (b.volume || 0) - (a.volume || 0))
    if (sort === "sellers") l = [...l].sort((a, b) => a.sellers - b.sellers || (b.volume || 0) - (a.volume || 0))
    return l
  }, [data, q, show, sort, sources, searched])

  const check = async () => {
    setCheckError(null)
    const domains = paste.split(/[\s,;]+/).filter(Boolean)
    if (!domains.length) return setCheckError("Paste one or more store links or domains.")
    setChecking(true)
    try {
      const r = await fetch("/api/competitor-finder", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "check", domains }) })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`)
      setStores(j.stores)
      setForms(Object.fromEntries((j.stores as StoreCheck[]).map((s) => [s.domain, { visits: "", tp: "", niche: "mix clothing", busy: false, done: null }])))
    } catch (e: unknown) {
      setCheckError(e instanceof Error ? e.message : String(e))
    } finally {
      setChecking(false)
    }
  }

  const add = async (s: StoreCheck) => {
    const f = forms[s.domain]
    setForms((x) => ({ ...x, [s.domain]: { ...f, busy: true } }))
    const r = await fetch("/api/competitor-finder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "add", domain: s.domain, name: s.name, market, niche: f.niche, keyword: activeKw, monthly_visits: f.visits, tp_reviews: f.tp, products: s.products }),
    })
    const j = await r.json()
    setForms((x) => ({ ...x, [s.domain]: { ...f, busy: false, done: r.ok ? (j.passes ? "Added · passes the rule" : "Added · check visits / reviews") : `Couldn't add: ${j.error}` } }))
    if (r.ok) setStores((x) => x.map((y) => (y.domain === s.domain ? { ...y, tracked: true, trackedStatus: "new" } : y)))
  }

  const gaps = data ? data.keywords.filter((k) => k.sellers === 0).length : 0
  const m = MARKETS.find((x) => x.code === market)!

  return (
    <PageShell
      title="Competitor Finder"
      breadcrumb="Front End → Competitor Finder"
      description="Find stores you don't track yet: search keywords that sell well but few tracked competitors cover, then check and add the stores you find."
      stats={[
        { label: "Keywords", value: data ? String(data.keywords.length) : "—", sub: m.label },
        { label: "Not covered yet", value: data ? String(gaps) : "—", sub: "no tracked competitor sells it" },
        { label: "Tracked competitors", value: data ? String(data.competitorsInMarket) : "—", sub: `in ${market}` },
        { label: "Searched", value: String(searched.size), sub: "keywords you opened" },
      ]}
      actions={<PillSelect label="Market" value={market} onChange={(v) => { setMarket(v); setLimit(60) }} options={MARKETS.map((x) => ({ value: x.code, label: x.label }))} align="right" />}
    >
      {error && <Notice tone="error">Couldn&apos;t load keywords: {error}</Notice>}
      {data && data.plannerCount === 0 && (
        <Notice tone="info">
          No Keyword Planner data for {market} yet, so volumes come from the keyword list. Upload a Keyword Planner export on the{" "}
          <Link href="/season-board" className="underline">Season Board</Link> for real {market} volumes.
        </Notice>
      )}

      <Panel title="1. Pick a keyword and search it" sub="Gap score = search demand ÷ how many tracked competitors already sell it. Start at the top." pad={false} className="mb-4">
        <div className="px-4 pb-3">
          <FilterBar right={<span className="text-[10px]" style={{ color: "var(--text-dim)" }}>{list.length} keywords</span>}>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter keywords, e.g. coat" className={`${inputCls} w-[200px]`} style={inputStyle} />
            <PillSelect label="Show" value={show} onChange={setShow} options={[{ value: "gaps", label: "Gaps (≤2 tracked sellers)" }, { value: "new", label: "Not searched yet" }, { value: "all", label: "All" }]} />
            <PillSelect label="Sort" value={sort} onChange={setSort} options={[{ value: "score", label: "Gap score" }, { value: "volume", label: "Search volume" }, { value: "sellers", label: "Fewest sellers" }]} />
            <FilterSelect label="Source" options={Object.entries(SOURCE_LABEL).map(([value, label]) => ({ value, label }))} value={sources} onChange={setSources} />
          </FilterBar>
        </div>
        {loading && !data ? (
          <div className="px-4 pb-4"><Loading>Building keywords for {m.label}…</Loading></div>
        ) : list.length === 0 ? (
          <div className="px-4 pb-4"><EmptyState title="No keywords match">Change the filters or pick another market.</EmptyState></div>
        ) : (
          <table className="w-full">
            <thead>
              <tr style={{ color: "var(--text-dim)" }}>
                <th className={`${TH} text-left`}>Keyword</th>
                <th className={`${TH} text-right`}>Searches / mo</th>
                <th className={`${TH} text-right`}>Tracked sellers</th>
                <th className={`${TH} text-left`}>From</th>
                <th className={`${TH} text-right`}>Search in {market}</th>
              </tr>
            </thead>
            <tbody>
              {list.slice(0, limit).map((k) => {
                const l = searchLinks(k.keyword, market)
                const done = searched.has(k.keyword)
                return (
                  <tr key={k.keyword} style={{ ...ROW_BORDER, background: activeKw === k.keyword ? "rgba(99,102,241,0.08)" : undefined }}>
                    <td className={TD}>
                      <span style={{ color: done ? "var(--text-muted)" : "var(--text)" }}>{k.keyword}</span>
                      {done && <span className="ml-2 text-[9px]" style={{ color: "var(--text-dim)" }}>searched</span>}
                      {k.bestsellerHits > 0 && <span className="ml-2"><Badge tone="green">best-seller ×{k.bestsellerHits}</Badge></span>}
                    </td>
                    <td className={`${TD} text-right tabular-nums`} style={{ color: "var(--text-muted)" }}>{fmtVol(k.volume)}</td>
                    <td className={`${TD} text-right`} title={k.sellerDomains.join(", ") || "None"}>
                      <Badge tone={k.sellers === 0 ? "green" : k.sellers <= 2 ? "amber" : "grey"}>{k.sellers === 0 ? "none" : k.sellers}</Badge>
                    </td>
                    <td className={`${TD} text-[10px]`} style={{ color: "var(--text-dim)" }}>{k.sources.map((s) => SOURCE_LABEL[s]).join(", ")}</td>
                    <td className={`${TD} text-right whitespace-nowrap`}>
                      <span className="inline-flex gap-1">
                        <a href={l.shopping} target="_blank" rel="noreferrer" onClick={() => markSearched(k.keyword)}><Button size="sm" variant="primary">Shopping</Button></a>
                        <a href={l.shopify} target="_blank" rel="noreferrer" onClick={() => markSearched(k.keyword)} title="Google results that are product pages (mostly Shopify stores)"><Button size="sm">Shopify stores</Button></a>
                        <a href={l.meta} target="_blank" rel="noreferrer" onClick={() => markSearched(k.keyword)} title="Meta Ad Library: who runs ads on this"><Button size="sm">Meta ads</Button></a>
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
        {list.length > limit && (
          <div className="px-4 py-2" style={ROW_BORDER}>
            <Button variant="ghost" size="sm" onClick={() => setLimit((n) => n + 60)}>Show {Math.min(60, list.length - limit)} more</Button>
          </div>
        )}
      </Panel>

      <Panel
        title="2. Paste the stores you found"
        sub={`Store links or domains, one per line or separated by spaces. ${activeKw ? `They'll be noted as found via "${activeKw}".` : ""}`}
        className="mb-4"
      >
        <textarea value={paste} onChange={(e) => setPaste(e.target.value)} rows={4} className={`${inputCls} w-full mb-2`} style={inputStyle} placeholder={"storename.com\nhttps://another-store.co.uk/products/wool-coat"} />
        <div className="flex items-center gap-2">
          <Button variant="primary" onClick={check} disabled={checking}>{checking ? "Checking…" : "Check stores"}</Button>
          <span className="text-[10px]" style={{ color: "var(--text-dim)" }}>Checks: already tracked, Shopify, country, currency, product count. Max 30 at a time.</span>
        </div>
        {checkError && <div className="mt-2"><Notice tone="warning">{checkError}</Notice></div>}
      </Panel>

      {stores.length > 0 && (
        <Panel
          title="3. Check and add"
          sub="Rule (competitor-check): add a store when it has 20k+ monthly visits OR 50+ Trustpilot reviews and is a Shopify fashion store for this market. Fill in what you find, then add."
          pad={false}
        >
          <table className="w-full">
            <thead>
              <tr style={{ color: "var(--text-dim)" }}>
                <th className={`${TH} text-left`}>Store</th>
                <th className={`${TH} text-left`}>Shopify</th>
                <th className={`${TH} text-left`}>Country · currency</th>
                <th className={`${TH} text-right`}>Products</th>
                <th className={`${TH} text-left`}>Visits / TP reviews</th>
                <th className={`${TH} text-left`}>Niche</th>
                <th className={`${TH} text-right`}></th>
              </tr>
            </thead>
            <tbody>
              {stores.map((s) => {
                const f = forms[s.domain]
                const visits = Number(f?.visits) || 0
                const tp = Number(f?.tp) || 0
                const passes = visits >= 20000 || tp >= 50
                return (
                  <tr key={s.domain} style={ROW_BORDER}>
                    <td className={`${TD} max-w-[260px]`}>
                      <a href={`https://${s.domain}`} target="_blank" rel="noreferrer" className="underline" style={{ color: "var(--text)" }}>{s.name || s.domain}</a>
                      <div className="text-[9px] truncate" style={{ color: "var(--text-dim)" }}>{s.domain}{s.sampleTitles.length ? ` · ${s.sampleTitles.slice(0, 2).join(" · ")}` : ""}</div>
                      {s.error && <div className="text-[9px]" style={{ color: "var(--orange)" }}>{s.error}</div>}
                    </td>
                    <td className={TD}>{s.shopify ? <Badge tone="green">Shopify</Badge> : <Badge tone="grey">no</Badge>}</td>
                    <td className={`${TD} text-[10px]`} style={{ color: "var(--text-muted)" }}>{[s.country, s.currency].filter(Boolean).join(" · ") || "—"}</td>
                    <td className={`${TD} text-right tabular-nums`} style={{ color: "var(--text-muted)" }}>{s.products ?? "—"}</td>
                    <td className={TD}>
                      {s.tracked ? (
                        <Badge tone="blue">already tracked ({s.trackedStatus})</Badge>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <input value={f?.visits || ""} onChange={(e) => setForms((x) => ({ ...x, [s.domain]: { ...f, visits: e.target.value } }))} placeholder="visits/mo" className={`${inputCls} w-[80px]`} style={inputStyle} inputMode="numeric" />
                          <input value={f?.tp || ""} onChange={(e) => setForms((x) => ({ ...x, [s.domain]: { ...f, tp: e.target.value } }))} placeholder="TP reviews" className={`${inputCls} w-[80px]`} style={inputStyle} inputMode="numeric" />
                          <a href={`https://www.trustpilot.com/review/${s.domain}`} target="_blank" rel="noreferrer" className="text-[9px] underline" style={{ color: "var(--text-dim)" }}>Trustpilot</a>
                          {(visits > 0 || tp > 0) && <Badge tone={passes ? "green" : "red"}>{passes ? "passes" : "below rule"}</Badge>}
                        </div>
                      )}
                    </td>
                    <td className={TD}>
                      {!s.tracked && f && <PillSelect value={f.niche} onChange={(v) => setForms((x) => ({ ...x, [s.domain]: { ...f, niche: v } }))} options={NICHES} />}
                    </td>
                    <td className={`${TD} text-right whitespace-nowrap`}>
                      {f?.done ? (
                        <span className="text-[10px]" style={{ color: f.done.startsWith("Couldn") ? "var(--red)" : "var(--green)" }}>{f.done}</span>
                      ) : !s.tracked ? (
                        <Button size="sm" variant={passes ? "primary" : "secondary"} disabled={f?.busy || !s.shopify} onClick={() => add(s)}>Add to tracker</Button>
                      ) : (
                        <Link href="/competitors" className="text-[10px] underline" style={{ color: "var(--accent)" }}>Open tracker</Link>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Panel>
      )}
    </PageShell>
  )
}
