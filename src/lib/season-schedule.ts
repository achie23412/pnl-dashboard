// Rolling fashion season schedule: every season's "list products by" date,
// generated for the coming 12 months so the calendar, the to-do list and
// Product Opportunities always have timing for the next seasons, year after
// year. Hand-written calendar events for the same season win (see merge below).
//
// Listing dates follow the course rule: list ~6 weeks before the demand peak so
// Google Shopping has time to index and learn (catch the ramp-up, not the top).

export interface ScheduleEvent {
  date: string
  label: string
  type: "prep"
  note: string
}

interface SeasonDef {
  key: string // lower-case word that must appear in a matching label
  label: string // must contain the engine's eventMatch text for that season
  listMonth: number
  listDay: number
  peak: string
  note: string
}

export const SEASON_SCHEDULE: SeasonDef[] = [
  { key: "valentine", label: "List Valentine's products", listMonth: 1, listDay: 3, peak: "14 Feb", note: "Red/romantic dresses, lingerie-style tops, date-night outfits, gift sets. List now so Google indexes them before mid-January searches." },
  { key: "spring", label: "List spring products", listMonth: 2, listDay: 1, peak: "March–April", note: "Light layers, trench coats, pastels, blouses, rain jackets. Start moving winter stock out." },
  { key: "summer", label: "List summer products", listMonth: 4, listDay: 1, peak: "June–July", note: "Linen, dresses, swimwear, sandals, shorts. Google needs 4–6 weeks before the summer peak." },
  { key: "autumn", label: "List autumn products", listMonth: 8, listDay: 1, peak: "September–October", note: "Knits, boots, jackets, corduroy, earthy tones. Don't wait until September: the dip after summer hits stores that are late." },
  { key: "winter", label: "List winter products", listMonth: 10, listDay: 15, peak: "December", note: "Coats, puffers, knitwear, boots, scarves." },
  { key: "christmas", label: "List Christmas gifting products", listMonth: 11, listDay: 10, peak: "Before 25 Dec", note: "Pyjamas, slippers, robes, gift-able accessories. Check each store's shipping cutoff." },
  { key: "party", label: "List NYE & party products", listMonth: 12, listDay: 5, peak: "Late December", note: "Sequins, velvet, satin, party dresses, sparkly accessories." },
  { key: "jan trending", label: "List Jan trending products", listMonth: 12, listDay: 10, peak: "January", note: "Activewear, gym wear, loungewear for 'New Year, new me'." },
]

const pad = (n: number) => String(n).padStart(2, "0")

// Occurrences in the window [today, today + 12 months].
export function seasonScheduleEvents(today: string): ScheduleEvent[] {
  const year = Number(today.slice(0, 4))
  const end = `${year + 1}${today.slice(4)}`
  const out: ScheduleEvent[] = []
  for (const s of SEASON_SCHEDULE) {
    for (const y of [year, year + 1]) {
      const date = `${y}-${pad(s.listMonth)}-${pad(s.listDay)}`
      if (date >= today && date <= end) {
        out.push({ date, label: s.label, type: "prep", note: `${s.note} Demand peak: ${s.peak}. (Season schedule)` })
      }
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date))
}

// Add schedule events unless the calendar already has a hand-written "prep"
// event for the same season within 45 days of it.
export function mergeWithSchedule<T extends { date: string; label: string; type: string }>(events: T[], today: string): (T | ScheduleEvent)[] {
  const days = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 86400000
  const extra = seasonScheduleEvents(today).filter((s) => {
    const key = SEASON_SCHEDULE.find((d) => d.label === s.label)?.key || ""
    return !events.some((e) => e.type === "prep" && e.label.toLowerCase().includes(key) && days(e.date, s.date) <= 45)
  })
  return [...events, ...extra].sort((a, b) => a.date.localeCompare(b.date))
}
