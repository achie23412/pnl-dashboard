// The "Day by day: <store>" P&L table as a PNG (next/og), for the coach's Slack channel.
// Satori layout: every element with more than one child needs display: flex.
import { ImageResponse } from "next/og"
import { eur, xr, pct, longDate, type CoachReport, type StoreReport, type PnlLine } from "@/lib/coach-report"

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
