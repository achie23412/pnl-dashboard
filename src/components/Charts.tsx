"use client"
import {
  AreaChart, Area, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts"
import type { DailyPnL, SpendRow, RevenueRow } from "@/lib/types"
import { STORE_COLORS, CHANNEL_COLORS } from "@/lib/constants"

const tooltipStyle = {
  contentStyle: {
    background: "rgba(13,18,36,0.95)",
    backdropFilter: "blur(20px)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 8,
    fontSize: 11,
    padding: "8px 12px",
    boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
  },
  labelStyle: { color: "#6b7394", fontSize: 10 },
}

const gridStyle = { stroke: "rgba(255,255,255,0.04)", strokeDasharray: "none" }
const axisStyle = { fontSize: 10, fill: "rgba(255,255,255,0.3)" }
const axisLine = { stroke: "rgba(255,255,255,0.06)" }

function fmtDate(d: string) {
  const [, m, day] = d.split("-")
  return `${Number(m)}/${Number(day)}`
}

function ChartBox({
  title,
  accentColor,
  children,
}: {
  title: string
  accentColor: string
  children: React.ReactNode
}) {
  return (
    <div className="glass rounded-xl p-3.5 relative overflow-hidden">
      <div
        className="absolute top-0 left-0 w-full h-[2px]"
        style={{ background: `linear-gradient(90deg, ${accentColor}, transparent 60%)` }}
      />
      <div className="flex items-center gap-1.5 mb-3">
        <div className="w-1.5 h-1.5 rounded-full" style={{ background: accentColor }} />
        <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
          {title}
        </div>
      </div>
      {children}
    </div>
  )
}

function CustomLegend({ payload }: { payload?: Array<{ value: string; color: string }> }) {
  if (!payload) return null
  return (
    <div className="flex items-center justify-center gap-4 mt-2">
      {payload.map((entry) => (
        <div key={entry.value} className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full" style={{ background: entry.color }} />
          <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>{entry.value}</span>
        </div>
      ))}
    </div>
  )
}

export function DailyTrendChart({ data }: { data: DailyPnL[] }) {
  return (
    <ChartBox title="Daily Trend" accentColor="#4E6AA7">
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={data}>
          <defs>
            <linearGradient id="gRevenue" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#4E6AA7" stopOpacity={0.2} />
              <stop offset="100%" stopColor="#4E6AA7" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="gProfit" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#34d399" stopOpacity={0.15} />
              <stop offset="100%" stopColor="#34d399" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid {...gridStyle} />
          <XAxis dataKey="date" tickFormatter={fmtDate} {...axisStyle} axisLine={axisLine} tickLine={false} />
          <YAxis {...axisStyle} axisLine={axisLine} tickLine={false} tickFormatter={(v) => `€${v}`} />
          <Tooltip {...tooltipStyle} formatter={(v: number, name: string) => [`€${v.toFixed(0)}`, name]} />
          <Legend content={<CustomLegend />} />
          <Area type="monotone" dataKey="revenue" stroke="#4E6AA7" fill="url(#gRevenue)" name="Revenue" strokeWidth={1.5} dot={false} />
          <Area type="monotone" dataKey="spend" stroke="#E8456B" fill="transparent" name="Spend" strokeWidth={1.5} dot={false} />
          <Line type="monotone" dataKey="cogs" stroke="#D4903A" name="COGS" strokeWidth={1} dot={false} strokeDasharray="4 3" />
          <Area type="monotone" dataKey="profit" stroke="#34d399" fill="url(#gProfit)" name="Profit" strokeWidth={1.5} dot={false} />
        </AreaChart>
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
    <ChartBox title="Spend by Channel" accentColor="#E8456B">
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={chartData} barCategoryGap="20%">
          <CartesianGrid {...gridStyle} />
          <XAxis dataKey="date" tickFormatter={fmtDate} {...axisStyle} axisLine={axisLine} tickLine={false} />
          <YAxis {...axisStyle} axisLine={axisLine} tickLine={false} tickFormatter={(v) => `€${v}`} />
          <Tooltip {...tooltipStyle} formatter={(v: number, name: string) => [`€${v.toFixed(0)}`, name]} />
          <Legend content={<CustomLegend />} />
          <Bar dataKey="Meta" stackId="a" fill={CHANNEL_COLORS.Meta} radius={[0, 0, 0, 0]} />
          <Bar dataKey="TikTok" stackId="a" fill={CHANNEL_COLORS.TikTok} />
          <Bar dataKey="Google" stackId="a" fill={CHANNEL_COLORS.Google} radius={[2, 2, 0, 0]} />
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
    <ChartBox title="Revenue by Store" accentColor="#34d399">
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={chartData} barCategoryGap="20%">
          <CartesianGrid {...gridStyle} />
          <XAxis dataKey="date" tickFormatter={fmtDate} {...axisStyle} axisLine={axisLine} tickLine={false} />
          <YAxis {...axisStyle} axisLine={axisLine} tickLine={false} tickFormatter={(v) => `€${v}`} />
          <Tooltip {...tooltipStyle} formatter={(v: number, name: string) => [`€${v.toFixed(0)}`, name]} />
          <Legend content={<CustomLegend />} />
          {stores.map((s, i) => (
            <Bar
              key={s}
              dataKey={s}
              stackId="a"
              fill={STORE_COLORS[s] || "#666"}
              radius={i === stores.length - 1 ? [2, 2, 0, 0] : [0, 0, 0, 0]}
            />
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
    <ChartBox title="Spend by Ad Account" accentColor="#D4903A">
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={chartData} barCategoryGap="20%">
          <CartesianGrid {...gridStyle} />
          <XAxis dataKey="date" tickFormatter={fmtDate} {...axisStyle} axisLine={axisLine} tickLine={false} />
          <YAxis {...axisStyle} axisLine={axisLine} tickLine={false} tickFormatter={(v) => `€${v}`} />
          <Tooltip {...tooltipStyle} formatter={(v: number, name: string) => [`€${v.toFixed(0)}`, name]} />
          <Legend content={<CustomLegend />} />
          {accounts.map((a, i) => (
            <Bar
              key={a}
              dataKey={a}
              stackId="a"
              fill={palette[i % palette.length]}
              radius={i === accounts.length - 1 ? [2, 2, 0, 0] : [0, 0, 0, 0]}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </ChartBox>
  )
}
