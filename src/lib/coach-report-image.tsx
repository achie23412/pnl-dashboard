// The "Day by day: <store>" P&L table as a PNG (next/og), for the coach's Slack channel.
// Satori layout: every element with more than one child needs display: flex.
import { ImageResponse } from "next/og"
import { eur, eur0, xr, pct, longDate, type CoachReport, type StoreReport, type PnlLine } from "@/lib/coach-report"
import type { HubReport } from "@/lib/coach-hub"

const C = { bg: "#0b0e17", panel: "#111522", line: "#1d2233", text: "#e6e8ef", muted: "#a3a8b8", dim: "#5f6577", green: "#34d399", red: "#f87171", hi: "#17203a" }

const COLS: { label: string; fmt: (l: PnlLine) => string; color?: (l: PnlLine) => string | undefined }[] = [
  { label: "Gross revenue", fmt: (l) => eur(l.gross) },
  { label: "Refunds", fmt: (l) => eur(l.refunds), color: (l) => (l.refunds > 0 ? C.red : undefined) },
  { label: "Net revenue", fmt: (l) => eur(l.net) },
  { label: "Cost of goods", fmt: (l) => eur(l.cogs) + (l.cogsEst > 0.005 ? "*" : "") },
  { label: "Ad spend", fmt: (l) => eur(l.ad) },
  { label: "Media buyer fee", fmt: (l) => eur(l.mb) },
  { label: "Transaction fee", fmt: (l) => eur(l.txn) },
  { label: "Profit before refunds", fmt: (l) => eur(l.profitBefore) },
  { label: "Profit", fmt: (l) => eur(l.profit), color: (l) => (l.profit > 0.005 ? C.green : l.profit < -0.005 ? C.red : undefined) },
  { label: "ROAS", fmt: (l) => xr(l.roas) },
  { label: "Gross ROAS", fmt: (l) => xr(l.grossRoas) },
  { label: "Profit %", fmt: (l) => pct(l.profitPct), color: (l) => (l.profitPct === null ? undefined : l.profitPct >= 0 ? C.green : C.red) },
  { label: "COG %", fmt: (l) => pct(l.cogPct) },
]
const DATE_W = 150
const COL_W = 128
const PAD = 36
const ROW_H = 32
const WIDTH = PAD * 2 + DATE_W + COL_W * COLS.length

const ddmmyyyy = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`
const monthName = (m: string) => new Date(m + "-01T00:00:00Z").toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" })

function Row({ label, line, bold, dim, highlight }: { label: string; line: PnlLine; bold?: boolean; dim?: boolean; highlight?: boolean }) {
  return (
    <div style={{ display: "flex", height: ROW_H, alignItems: "center", borderTop: `${bold ? 2 : 1}px solid ${bold ? "#2a3048" : C.line}`, background: highlight ? C.hi : "transparent", opacity: dim ? 0.45 : 1, fontWeight: bold ? 700 : 400 }}>
      <div style={{ display: "flex", width: DATE_W, paddingLeft: 10, color: C.text }}>{label}</div>
      {COLS.map((c) => (
        <div key={c.label} style={{ display: "flex", justifyContent: "flex-end", width: COL_W, paddingRight: 10, color: c.color?.(line) || (bold ? C.text : C.muted) }}>{c.fmt(line)}</div>
      ))}
    </div>
  )
}

export function renderStoreImage(r: CoachReport, s: StoreReport): ImageResponse {
  const height = PAD * 2 + 64 + 46 + ROW_H * (s.days.length + 1) + 40
  return new ImageResponse(
    (
      <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", background: C.bg, padding: PAD, fontSize: 15, color: C.text }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", height: 64 }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontSize: 24, fontWeight: 700 }}>{`Day by day: ${s.store}`}</div>
            <div style={{ display: "flex", fontSize: 14, color: C.dim, marginTop: 4 }}>{`${monthName(r.month)} · up to and including ${ddmmyyyy(r.lastDay)} · in EUR`}</div>
          </div>
          <div style={{ display: "flex", fontSize: 18, color: C.muted }}>{longDate(r.reportDate)}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", background: C.panel, borderRadius: 12, padding: "0 6px" }}>
          <div style={{ display: "flex", height: 46, alignItems: "center", fontSize: 11, color: C.dim, textTransform: "uppercase", letterSpacing: 0.5 }}>
            <div style={{ display: "flex", width: DATE_W, paddingLeft: 10 }}>Date</div>
            {COLS.map((c) => <div key={c.label} style={{ display: "flex", justifyContent: "flex-end", textAlign: "right", width: COL_W, paddingRight: 10 }}>{c.label}</div>)}
          </div>
          {s.days.map((d) => (
            <Row key={d.date} label={ddmmyyyy(d.date)} line={d.line} dim={d.line.gross === 0 && d.line.ad === 0} highlight={d.date === r.lastDay} />
          ))}
          <Row label="Month to date" line={s.total} bold />
        </div>
        <div style={{ display: "flex", fontSize: 12, color: C.dim, marginTop: 12 }}>
          Profit = gross − cost of goods − ad spend − media buyer fee − transaction fee (6%) − refunds · ROAS = net ÷ ad spend · * includes an estimated COGS
        </div>
      </div>
    ),
    { width: WIDTH, height },
  )
}

// ---- Main Hub (Overall) ----
const dm = (d: string) => new Date(d + "T00:00:00Z").toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "2-digit", timeZone: "UTC" }).replace(",", "")
const dShort = (d: string) => new Date(d + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })
const signed = (n: number) => (n >= 0 ? C.green : C.red)

function Card({ label, value, sub, color }: { label: string; value: string; sub: string; color?: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, background: C.panel, borderRadius: 12, padding: "14px 16px", marginRight: 12 }}>
      <div style={{ display: "flex", fontSize: 12, color: C.dim, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
      <div style={{ display: "flex", fontSize: 28, fontWeight: 700, color: color || C.text, marginTop: 6 }}>{value}</div>
      <div style={{ display: "flex", fontSize: 12, color: C.dim, marginTop: 6 }}>{sub}</div>
    </div>
  )
}

const HUB_COLS: { label: string; w: number }[] = [
  { label: "Date", w: 160 }, { label: "Revenue", w: 150 }, { label: "Orders", w: 110 }, { label: "CVR", w: 170 }, { label: "ROAS", w: 120 },
  { label: "BE ROAS", w: 190 }, { label: "Ad spend", w: 150 }, { label: "COGS", w: 140 }, { label: "COGS %", w: 130 }, { label: "Refunds", w: 130 },
  { label: "Fees", w: 120 }, { label: "Net profit", w: 230 },
]

function Cell({ i, top, bottom, color, bottomColor }: { i: number; top: string; bottom?: string; color?: string; bottomColor?: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: i === 0 ? "flex-start" : "flex-end", width: HUB_COLS[i].w, paddingLeft: i === 0 ? 10 : 0, paddingRight: 10 }}>
      <div style={{ display: "flex", color: color || C.muted }}>{top}</div>
      {bottom ? <div style={{ display: "flex", fontSize: 12, color: bottomColor || C.dim }}>{bottom}</div> : null}
    </div>
  )
}

export function renderHubImage(h: HubReport): ImageResponse {
  const k = h.kpi
  const roasColor = k.be === null ? C.text : k.roas >= k.be ? C.green : C.red
  const height = PAD * 2 + 64 + 116 + 24 + 30 + 256 + 24 + 30 + 40 + 7 * 48 + 36
  return new ImageResponse(
    (
      <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", background: C.bg, padding: PAD, fontSize: 15, color: C.text }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", height: 64 }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontSize: 24, fontWeight: 700 }}>Main Hub · all stores</div>
            <div style={{ display: "flex", fontSize: 14, color: C.dim, marginTop: 4 }}>{`Last 30 days · ${dShort(h.from)} – ${dShort(h.to)} · in EUR · fees included (profit sheet)`}</div>
          </div>
          <div style={{ display: "flex", fontSize: 18, color: C.muted }}>{longDate(h.reportDate)}</div>
        </div>

        <div style={{ display: "flex", height: 116 }}>
          <Card label="Revenue" value={eur0(k.revenue)} sub={`${k.orders} orders · ${k.orders ? eur0(k.revenue / k.orders) : "–"}/order`} />
          <Card label="Ad spend" value={eur0(k.spend)} sub={`ROAS ${k.roas.toFixed(2)}x`} />
          <Card label="ROAS" value={`${k.roas.toFixed(2)}x`} color={roasColor} sub={k.be === null ? "" : `BE: ${k.be.toFixed(2)}x`} />
          <Card label="Refund rate" value={`${k.refundRate.toFixed(1)}%`} color={k.refundRate < 5 ? C.green : C.red} sub={`${eur0(k.refunds)} refunded · Target <5%`} />
          <Card label="CVR" value={k.cvr === null ? "–" : `${k.cvr.toFixed(2)}%`} sub={`Orders ÷ ${k.sessions.toLocaleString("en-IE")} human sessions`} />
          <Card label="COGS" value={eur0(k.cogs)} color="#f0a35e" sub={`${k.cogsPct.toFixed(1)}% of rev${k.cogsEst > 0.5 ? ` · ~${eur0(k.cogsEst)} est.` : ""}`} />
          <Card label="Net profit" value={eur0(k.profit)} color={signed(k.profit)} sub={`${k.margin === null ? "–" : k.margin.toFixed(1)}% margin · Fees −${eur0(k.fees)}`} />
        </div>

        <div style={{ display: "flex", fontSize: 13, color: C.dim, marginTop: 24, height: 30, letterSpacing: 1 }}>COMPARE STORES</div>
        <div style={{ display: "flex", height: 256 }}>
          {h.stores.map((s) => (
            <div key={s.store} style={{ display: "flex", flexDirection: "column", flex: 1, background: C.panel, borderRadius: 12, padding: "14px 16px", marginRight: 12 }}>
              <div style={{ display: "flex", fontSize: 15, fontWeight: 700 }}>{s.store}</div>
              <div style={{ display: "flex", fontSize: 28, fontWeight: 700, color: signed(s.profit), marginTop: 6 }}>{eur0(s.profit)}</div>
              <div style={{ display: "flex", fontSize: 11, color: C.dim, letterSpacing: 1, marginBottom: 8 }}>NET PROFIT</div>
              {([
                ["Revenue", eur0(s.revenue), C.text],
                ["Ad spend", eur0(s.spend), C.text],
                ["Orders", String(s.orders), C.text],
                ["ROAS", `${s.roas.toFixed(2)}x`, s.roas >= 2 ? C.green : s.roas >= 1.5 ? "#f0a35e" : C.red],
                ["Refund rate", `${s.refundRate.toFixed(1)}%`, s.refundRate < 5 ? C.green : C.red],
              ] as [string, string, string][]).map(([l, v, col]) => (
                <div key={l} style={{ display: "flex", justifyContent: "space-between", borderTop: `1px solid ${C.line}`, padding: "5px 0", fontSize: 14 }}>
                  <div style={{ display: "flex", color: C.dim }}>{l}</div>
                  <div style={{ display: "flex", color: col }}>{v}</div>
                </div>
              ))}
            </div>
          ))}
        </div>

        <div style={{ display: "flex", fontSize: 13, color: C.dim, marginTop: 24, height: 30, letterSpacing: 1 }}>PER-DAY BREAKDOWN · LAST 7 DAYS</div>
        <div style={{ display: "flex", flexDirection: "column", background: C.panel, borderRadius: 12, padding: "0 6px" }}>
          <div style={{ display: "flex", height: 40, alignItems: "center", fontSize: 11, color: C.dim, textTransform: "uppercase", letterSpacing: 0.5 }}>
            {HUB_COLS.map((c, i) => <div key={c.label} style={{ display: "flex", justifyContent: i === 0 ? "flex-start" : "flex-end", width: c.w, paddingLeft: i === 0 ? 10 : 0, paddingRight: 10 }}>{c.label}</div>)}
          </div>
          {h.days.map((d) => {
            const beDiff = d.be !== null && d.be > 0 ? ((d.roas - d.be) / d.be) * 100 : null
            return (
              <div key={d.date} style={{ display: "flex", height: 48, alignItems: "center", borderTop: `1px solid ${C.line}` }}>
                <Cell i={0} top={dm(d.date)} color={C.text} />
                <Cell i={1} top={eur0(d.revenue)} />
                <Cell i={2} top={String(d.orders)} />
                <Cell i={3} top={d.cvr === null ? "–" : `${d.cvr.toFixed(2)}%`} bottom={d.sessions === null ? undefined : `${d.sessions.toLocaleString("en-IE")} sess.`} />
                <Cell i={4} top={`${d.roas.toFixed(2)}x`} color={d.be !== null && d.roas >= d.be ? C.green : "#f0a35e"} />
                <Cell i={5} top={d.be === null ? "–" : `${d.be.toFixed(2)}x`} bottom={beDiff === null ? undefined : `${beDiff >= 0 ? "above" : "below"} (${beDiff >= 0 ? "+" : ""}${beDiff.toFixed(0)}%)`} bottomColor={beDiff === null ? undefined : signed(beDiff)} />
                <Cell i={6} top={eur0(d.spend)} />
                <Cell i={7} top={eur0(d.cogs)} color="#f0a35e" />
                <Cell i={8} top={d.cogsPct === null ? "–" : `${d.cogsPct.toFixed(1)}%`} color={d.cogsPct !== null && d.cogsPct > 35 ? C.red : C.muted} />
                <Cell i={9} top={eur0(d.refunds)} color={d.refunds > 0.5 ? C.red : C.dim} />
                <Cell i={10} top={eur0(d.fees)} />
                <Cell i={11} top={`${eur0(d.profit)}  ${d.margin === null ? "" : `${d.margin.toFixed(1)}%`}`} color={signed(d.profit)} />
              </div>
            )
          })}
        </div>
        <div style={{ display: "flex", fontSize: 12, color: C.dim, marginTop: 12 }}>
          Net profit = revenue − refunds − ad spend − COGS − transaction fee − media buyer fee · BE ROAS = break-even ROAS · CVR = orders ÷ human sessions
        </div>
      </div>
    ),
    { width: WIDTH, height },
  )
}
