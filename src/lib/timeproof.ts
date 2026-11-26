// Reads OnlineJobs.ph Timeproof hours from pasted text (OnlineJobs.ph has no API or export).
// Two formats:
// 1. The worker's Timeproof calendar, copied with Cmd+A / Cmd+C: "November 2026", then each day
//    number with its hours under it. Week totals (after Saturday) and the month total (after the
//    last day) sit between the days, so they are told apart by checking them against the sums.
// 2. Plain lines: "2026-11-01 08:55" (one day per line).

export interface TimeproofParse {
  worker: string | null
  month: string | null // YYYY-MM
  days: { date: string; minutes: number }[]
  ojMonthTotal: number | null // minutes, as OnlineJobs.ph shows it
  parsedTotal: number
  warnings: string[]
}

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"]
const HM = /^(\d{1,3}):(\d{2})$/
const ISO_LINE = /^(\d{4}-\d{2}-\d{2})[\s,;]+(\d{1,3}):(\d{2})\b/

export const fmtMinutes = (m: number) => `${Math.floor(m / 60)}:${String(Math.round(m % 60)).padStart(2, "0")}`
const pad = (n: number) => String(n).padStart(2, "0")

function titleCase(s: string) {
  return s.toLowerCase().replace(/(^|[\s'-])[a-zà-ÿ]/g, (c) => c.toUpperCase())
}

// today = last day that can have hours (YYYY-MM-DD); later days in the calendar are skipped
export function parseTimeproof(text: string, opts: { month?: string; today: string }): TimeproofParse {
  const warnings: string[] = []
  const rawLines = text.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)

  let worker: string | null = null
  for (const l of rawLines) {
    const m = l.match(/^(.+?)['’]s\s+timeproof$/i)
    if (m) { worker = titleCase(m[1].trim()); break }
  }

  // Format 2: plain date lines
  const isoDays = rawLines.map((l) => l.match(ISO_LINE)).filter(Boolean) as RegExpMatchArray[]
  if (isoDays.length) {
    const byDate = new Map<string, number>()
    for (const m of isoDays) {
      const mins = Number(m[2]) * 60 + Number(m[3])
      if (mins > 1440) { warnings.push(`${m[1]}: ${m[2]}:${m[3]} is more than 24 hours, skipped`); continue }
      if (m[1] > opts.today) continue
      byDate.set(m[1], mins)
    }
    const days = Array.from(byDate.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([date, minutes]) => ({ date, minutes }))
    return { worker, month: days[0]?.date.slice(0, 7) ?? null, days, ojMonthTotal: null, parsedTotal: days.reduce((a, d) => a + d.minutes, 0), warnings }
  }

  // Format 1: the calendar. Find "<Month> <Year>", or use the month picked on the page
  let month: string | null = null
  let start = 0
  for (let i = 0; i < rawLines.length; i++) {
    const m = rawLines[i].match(/^([a-z]+)\s+(\d{4})$/i)
    const mi = m ? MONTHS.indexOf(m[1].toLowerCase()) : -1
    if (m && mi >= 0) { month = `${m[2]}-${pad(mi + 1)}`; start = i + 1; break }
  }
  if (!month && opts.month && /^\d{4}-\d{2}$/.test(opts.month)) month = opts.month
  if (!month) return { worker, month: null, days: [], ojMonthTotal: null, parsedTotal: 0, warnings: ["No month found. Copy the whole calendar page (with \"November 2026\" at the top) or pick the month."] }

  const [y, mo] = month.split("-").map(Number)
  const lastDay = new Date(Date.UTC(y, mo, 0)).getUTCDate()

  // Cells: a day number followed by its hh:mm values. Tabs separate cells in some copies.
  const tokens = rawLines.slice(start).flatMap((l) => l.split(/\t+/)).map((s) => s.trim()).filter(Boolean)
  const cells: { day: number; values: number[] }[] = []
  for (const t of tokens) {
    if (/^day total|^week total|^month total|^footer$/i.test(t)) break
    if (/^\d{1,2}$/.test(t) && Number(t) >= 1 && Number(t) <= 31) { cells.push({ day: Number(t), values: [] }); continue }
    const hm = t.match(HM)
    if (hm && cells.length) cells[cells.length - 1].values.push(Number(hm[1]) * 60 + Number(hm[2]))
  }

  // Keep this month's cells: from the first "1" up to the last day (the grid also shows days of
  // the months before and after)
  const firstIdx = cells.findIndex((c) => c.day === 1)
  if (firstIdx < 0) return { worker, month, days: [], ojMonthTotal: null, parsedTotal: 0, warnings: ["No days found in the pasted text."] }
  const monthCells: typeof cells = []
  for (let i = firstIdx; i < cells.length; i++) {
    if (cells[i].day !== monthCells.length + 1) break
    monthCells.push(cells[i])
    if (cells[i].day === lastDay) break
  }

  const days: { date: string; minutes: number }[] = []
  const firstDow = new Date(Date.UTC(y, mo - 1, 1)).getUTCDay()
  let monthSum = 0, weekSum = 0, weekDays = 0
  let ojMonthTotal: number | null = null
  for (const c of monthCells) {
    const date = `${month}-${pad(c.day)}`
    const dow = new Date(Date.UTC(y, mo - 1, c.day)).getUTCDay()
    if (dow === 0) { weekSum = 0; weekDays = 0 }
    const isSat = dow === 6, isLast = c.day === lastDay
    // The first week's total can include days of the month before
    const partialWeek = firstDow > 0 && c.day <= 7 - firstDow
    // OnlineJobs.ph rounds each day but totals the seconds, so allow 1 minute per day
    const near = (a: number, b: number, n: number) => Math.abs(a - b) <= n + 1
    // Are these values (all of them) the week and/or month total, given this day's hours h?
    // Returns the month total it found (or -1 for none), or null if they don't fit.
    const totalsFit = (rest: number[], h: number): number | null => {
      if (rest.length > (isSat ? 1 : 0) + (isLast ? 1 : 0)) return null
      let usedWeek = false, monthTotal = -1
      for (const t of rest) {
        const week = weekSum + h
        if (isSat && !usedWeek && (week > 0 || partialWeek) && (near(t, week, weekDays + 1) || (partialWeek && t > week))) usedWeek = true
        else if (isLast && monthTotal < 0 && monthSum + h > 0 && near(t, monthSum + h, monthCells.length)) monthTotal = t
        else return null
      }
      return monthTotal
    }
    const v = c.values
    let hours = 0
    let fit: number | null = null
    if (v.length === 0) hours = 0
    else if ((fit = totalsFit(v, 0)) != null) hours = 0
    else if (v[0] <= 1440 && (fit = totalsFit(v.slice(1), v[0])) != null) hours = v[0]
    else {
      hours = v[0] <= 1440 ? v[0] : 0
      warnings.push(`${date}: couldn't tell the day's hours from the totals, used ${fmtMinutes(hours)}. Check it on OnlineJobs.ph.`)
    }
    if (fit != null && fit >= 0) ojMonthTotal = fit
    weekSum += hours; weekDays++; monthSum += hours
    if (date <= opts.today) days.push({ date, minutes: hours })
  }
  if (monthCells.length < lastDay && opts.today.startsWith(month) && monthCells.length < Number(opts.today.slice(8))) {
    warnings.push(`Only days 1–${monthCells.length} were found in the paste.`)
  }

  const parsedTotal = days.reduce((a, d) => a + d.minutes, 0)
  if (ojMonthTotal != null && Math.abs(ojMonthTotal - parsedTotal) > days.length + 1) {
    warnings.push(`The days add up to ${fmtMinutes(parsedTotal)}, but OnlineJobs.ph shows a month total of ${fmtMinutes(ojMonthTotal)}.`)
  }
  return { worker, month, days, ojMonthTotal, parsedTotal, warnings }
}
