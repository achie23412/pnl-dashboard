// Season Board engine (Dashboard Guide §7). Pure functions, used on server and client.
//
// Timing rule from the guide: a keyword's season starts at its "climb onset", the
// first month demand crosses 15% of its peak. List by = onset minus a 1-month buffer
// (get indexed with low spend); Push budget = from the onset month.
import { tokenize, detectCategory } from "@/lib/opportunity-engine"

export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
export const ONSET_SHARE = 0.15
export const LIST_BUFFER_MONTHS = 1

// Country → the store(s) selling there (Google fashion stores)
export const COUNTRY_STORES: Record<string, string[]> = {
  US: ["Susan & Allen"],
  UK: ["Carter & Collins"],
  IE: ["Walsh & Farley"],
}
export const COUNTRIES = [
  { code: "US", label: "US — United States" },
  { code: "UK", label: "UK — United Kingdom" },
  { code: "IE", label: "IE — Ireland" },
]

export type KeywordRow = { keyword: string; months: number[]; avg: number }
export type Status = "list_now" | "indexing" | "push_budget" | "at_peak" | "phase_out" | "off_season" | "evergreen"
export const STATUS_LABEL: Record<Status, string> = {
  list_now: "List now",
  indexing: "Indexing",
  push_budget: "Push budget",
  at_peak: "At peak",
  phase_out: "Phase out",
  off_season: "Off-season",
  evergreen: "Evergreen",
}

const mod = (n: number) => ((n % 12) + 12) % 12

// ── Google Ads Keyword Planner export (CSV/TSV, UTF-16 or UTF-8)
export function decodeExport(buf: ArrayBuffer): string {
  const b = new Uint8Array(buf)
  if (b[0] === 0xff && b[1] === 0xfe) return new TextDecoder("utf-16le").decode(buf)
  if (b[0] === 0xfe && b[1] === 0xff) return new TextDecoder("utf-16be").decode(buf)
  return new TextDecoder("utf-8").decode(buf)
}

function splitLine(line: string, sep: string): string[] {
  if (sep === "\t") return line.split("\t").map((c) => c.replace(/^"|"$/g, "").trim())
  const out: string[] = []
  let cur = ""
  let q = false
  for (const ch of line) {
    if (ch === '"') q = !q
    else if (ch === sep && !q) { out.push(cur.trim()); cur = "" }
    else cur += ch
  }
  out.push(cur.trim())
  return out
}

const num = (s: string | undefined) => {
  if (!s) return 0
  const t = s.replace(/[^\d.,kKmM]/g, "")
  if (/k$/i.test(t)) return parseFloat(t) * 1000
  if (/m$/i.test(t)) return parseFloat(t) * 1_000_000
  return parseInt(t.replace(/[.,]/g, ""), 10) || 0
}

export function parseKeywordPlanner(text: string): { rows: KeywordRow[]; monthsFound: number; error?: string } {
  const lines = text.replace(/\r/g, "").split("\n").filter((l) => l.trim())
  const hIdx = lines.findIndex((l) => /keyword/i.test(l) && (/avg\.? monthly searches/i.test(l) || /searches:/i.test(l)))
  if (hIdx < 0) return { rows: [], monthsFound: 0, error: "No header row found. Use Keyword Planner → Download keyword ideas (CSV)." }
  const sep = lines[hIdx].includes("\t") ? "\t" : lines[hIdx].includes(";") && !lines[hIdx].includes(",") ? ";" : ","
  const head = splitLine(lines[hIdx], sep)
  const kCol = head.findIndex((h) => /^keyword$/i.test(h) || /^keyword\b/i.test(h))
  const avgCol = head.findIndex((h) => /avg\.? monthly searches/i.test(h))
  const monthCols: { col: number; month: number }[] = []
  head.forEach((h, i) => {
    const m = h.match(/searches:\s*([A-Za-z]{3})[a-z]*\s+(\d{4})/i)
    if (m) {
      const idx = MONTHS.findIndex((x) => x.toLowerCase() === m[1].slice(0, 3).toLowerCase())
      if (idx >= 0) monthCols.push({ col: i, month: idx })
    }
  })
  if (monthCols.length < 12) {
    return { rows: [], monthsFound: monthCols.length, error: `This export has ${monthCols.length} monthly columns; 12 are needed. In Keyword Planner pick the last 12 months before downloading.` }
  }
  const rows: KeywordRow[] = []
  for (const line of lines.slice(hIdx + 1)) {
    const c = splitLine(line, sep)
    const keyword = (c[kCol] || "").toLowerCase().trim()
    if (!keyword) continue
    const months = new Array(12).fill(0)
    // the last 12 monthly columns win (exports can hold more than a year)
    for (const mc of monthCols.slice(-12)) months[mc.month] = num(c[mc.col])
    const avg = avgCol >= 0 ? num(c[avgCol]) : Math.round(months.reduce((a, b) => a + b, 0) / 12)
    if (months.some((v) => v > 0)) rows.push({ keyword, months, avg })
  }
  return { rows, monthsFound: monthCols.length }
}

// ── Timing per keyword
export type Timing = { peak: number; peakVol: number; onset: number; listBy: number; pushFrom: number; evergreen: boolean }

export function timing(months: number[]): Timing {
  let peak = 0
  for (let i = 1; i < 12; i++) if (months[i] > months[peak]) peak = i
  const peakVol = months[peak]
  const min = Math.min(...months)
  const evergreen = peakVol > 0 && min >= peakVol * 0.6
  // Climb onset = first month (walking back from the peak) that is 15% of the way from the
  // low point up to the peak. With a near-zero off-season this equals the guide's "15% of
  // peak"; for keywords that never go quiet (sandals, swimwear) it avoids flagging them
  // right after the low point.
  const threshold = min + ONSET_SHARE * (peakVol - min)
  let onset = peak
  for (let s = 0; s < 11 && months[mod(onset - 1)] >= threshold && months[mod(onset - 1)] > min; s++) onset = mod(onset - 1)
  return { peak, peakVol, onset, listBy: mod(onset - LIST_BUFFER_MONTHS), pushFrom: onset, evergreen }
}

// Is month m inside the cyclic range [from, to] ?
const inRange = (m: number, from: number, to: number) => (from <= to ? m >= from && m <= to : m >= from || m <= to)

export function statusFor(t: Timing, month: number, covered: boolean): Status {
  if (t.evergreen) return "evergreen"
  if (month === t.listBy) return covered ? "indexing" : "list_now"
  if (month === t.peak) return "at_peak"
  if (t.onset !== t.peak && inRange(month, t.onset, mod(t.peak - 1))) return "push_budget"
  if (inRange(month, mod(t.peak + 1), mod(t.peak + 2))) return "phase_out"
  return "off_season"
}

// ── Category + store coverage
export const categoryOf = (keyword: string) => detectCategory(tokenize(keyword), null) || "Other"

const STOP = new Set(["for", "the", "and", "with", "a", "of", "in", "to", "men", "mens", "women", "womens", "woman", "ladies", "man", "s"])
const stem = (w: string) => w.replace(/(ies)$/, "y").replace(/(es|s)$/, "")
const genderOf = (tokens: string[]) => tokens.some((t) => /^(women|womens|woman|ladies)$/.test(t)) ? "w" : tokens.some((t) => /^(men|mens|man)$/.test(t)) ? "m" : null

export type TitleIndex = { tokens: Set<string>; gender: string | null }[]
export const indexTitles = (titles: string[]): TitleIndex =>
  titles.map((t) => {
    const tk = tokenize(t)
    return { tokens: new Set(tk.map(stem)), gender: genderOf(tk) }
  })

// A store "has" a keyword when one live product title contains every meaningful word of it
// (and isn't for the other gender).
export function coveredBy(keyword: string, idx: TitleIndex): number {
  const tk = tokenize(keyword)
  const want = tk.filter((w) => !STOP.has(w)).map(stem)
  if (!want.length) return 0
  const g = genderOf(tk)
  return idx.filter((p) => want.every((w) => p.tokens.has(w)) && (!g || !p.gender || p.gender === g)).length
}

// Season band for the year strip (northern hemisphere)
export const seasonOfMonth = (m: number) => (m === 11 || m <= 1 ? "Winter" : m <= 4 ? "Spring" : m <= 7 ? "Summer" : "Autumn")
export const SEASON_COLOR: Record<string, string> = { Winter: "#94a3b8", Spring: "#34d399", Summer: "#f59e0b", Autumn: "#f472b6" }
