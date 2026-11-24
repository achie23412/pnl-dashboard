"use client"
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts"
import type { DailyPnL, SpendRow, RevenueRow } from "@/lib/types"
import { STORE_COLORS, CHANNEL_COLORS } from "@/lib/constants"

const tooltipStyle = {
  contentStyle: {
    background: "rgba(13,18,36,0.95)",
    backdropFilter: "blur(20px)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 10,
    fontSize: 12,
    boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
  },
  labelStyle: { color: "#6b7394" },
}

function fmtDate(d: string) {
  const [, m, day] = d.split("-")
  return `${Number(m)}/${Number(day)}`
}

export function DailyTrendChart({ data }: { data: DailyPnL[] }) {
  return (
    <ChartBox title="Daily Trend">
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" tickFormatter={fmtDate} fontSize={11} />
          <YAxis fontSize={11} tickFormatter={(v) => `€${v}`} />
          <Tooltip {...tooltipStyle} formatter={(v: number, name: string) => [`€${v.toFixed(0)}`, name]} />
          <Legend />
          <Line type="monotone" dataKey="revenue" stroke="#4E6AA7" name="Revenue" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="spend" stroke="#E8456B" name="Spend" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="cogs" stroke="#D4903A" name="COGS" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="profit" stroke="#34d399" name="Profit" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </ChartBox>
  )
}

export function SpendByChannelChart({ data }: { data: SpendRow[] }) {
  const byChannel = new Map<string, Map<string, number>>()
  for (const r of data) {
    if (!byChannel.has(r.date)) byChannel.set(r.date, new Map())
    const day = byChannel.get(r.date)!
    day.set(r.channel, (day.get(r.channel) || 0) + r.spend)
  }
  const chartData = Array.from(byChannel.entries())
    .map(([date, channels]) => ({
      date,
      Meta: channels.get("Meta") || 0,
      TikTok: channels.get("TikTok") || 0,
      Google: channels.get("Google") || 0,
    }))
    .sort((a, b) => a.date.localeCompare(b.date))

  return (
    <ChartBox title="Spend by Channel">
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" tickFormatter={fmtDate} fontSize={11} />
          <YAxis fontSize={11} tickFormatter={(v) => `€${v}`} />
          <Tooltip {...tooltipStyle} formatter={(v: number, name: string) => [`€${v.toFixed(2)}`, name]} />
          <Legend />
          <Bar dataKey="Meta" stackId="a" fill={CHANNEL_COLORS.Meta} />
          <Bar dataKey="TikTok" stackId="a" fill={CHANNEL_COLORS.TikTok} />
          <Bar dataKey="Google" stackId="a" fill={CHANNEL_COLORS.Google} />
        </BarChart>
      </ResponsiveContainer>
    </ChartBox>
  )
}

export function RevenueByStoreChart({ data }: { data: RevenueRow[] }) {
  const byStore = new Map<string, Map<string, number>>()
  for (const r of data) {
    if (!byStore.has(r.date)) byStore.set(r.date, new Map())
    const day = byStore.get(r.date)!
    day.set(r.store, (day.get(r.store) || 0) + r.revenue)
  }
  const stores = Array.from(new Set(data.map((r) => r.store)))
  const chartData = Array.from(byStore.entries())
    .map(([date, storeMap]) => {
      const row: Record<string, number | string> = { date }
      for (const s of stores) row[s] = storeMap.get(s) || 0
      return row
    })
    .sort((a, b) => (a.date as string).localeCompare(b.date as string))

  return (
    <ChartBox title="Revenue by Store">
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" tickFormatter={fmtDate} fontSize={11} />
          <YAxis fontSize={11} tickFormatter={(v) => `€${v}`} />
          <Tooltip {...tooltipStyle} formatter={(v: number, name: string) => [`€${v.toFixed(2)}`, name]} />
          <Legend />
          {stores.map((s) => (
            <Bar key={s} dataKey={s} stackId="a" fill={STORE_COLORS[s] || "#666"} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </ChartBox>
  )
}

export function SpendByAccountChart({ data }: { data: SpendRow[] }) {
  const accounts = Array.from(new Set(data.map((r) => `${r.channel}: ${r.account}`)))
  const byDate = new Map<string, Map<string, number>>()
  for (const r of data) {
    if (!byDate.has(r.date)) byDate.set(r.date, new Map())
    const day = byDate.get(r.date)!
    const key = `${r.channel}: ${r.account}`
    day.set(key, (day.get(key) || 0) + r.spend)
  }
  const chartData = Array.from(byDate.entries())
    .map(([date, acctMap]) => {
      const row: Record<string, number | string> = { date }
      for (const a of accounts) row[a] = acctMap.get(a) || 0
      return row
    })
    .sort((a, b) => (a.date as string).localeCompare(b.date as string))

  const palette = ["#4E6AA7", "#E8456B", "#5B9EC7", "#D4903A", "#4CA082", "#8B6BB0"]

  return (
    <ChartBox title="Spend by Ad Account">
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" tickFormatter={fmtDate} fontSize={11} />
          <YAxis fontSize={11} tickFormatter={(v) => `€${v}`} />
          <Tooltip {...tooltipStyle} formatter={(v: number, name: string) => [`€${v.toFixed(2)}`, name]} />
          <Legend />
          {accounts.map((a, i) => (
            <Bar key={a} dataKey={a} stackId="a" fill={palette[i % palette.length]} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </ChartBox>
  )
}

function ChartBox({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="glass rounded-xl p-5">
      <div className="text-[11px] font-semibold uppercase tracking-wider mb-4" style={{ color: "var(--text-dim)" }}>
        {title}
      </div>
      {children}
    </div>
  )
}
