// Shared date-preset logic (Main Hub, Product Performance).
export function getDateRange(preset: string, customFrom: string, customTo: string): [string, string] {
  const today = new Date()
  const fmt = (d: Date) => d.toISOString().slice(0, 10)

  switch (preset) {
    case "today":
      return [fmt(today), fmt(today)]
    case "yesterday": {
      const y = new Date(today)
      y.setDate(y.getDate() - 1)
      return [fmt(y), fmt(y)]
    }
    case "last_7d": {
      const d = new Date(today)
      d.setDate(d.getDate() - 6)
      return [fmt(d), fmt(today)]
    }
    case "last_30d": {
      const d = new Date(today)
      d.setDate(d.getDate() - 29)
      return [fmt(d), fmt(today)]
    }
    case "this_month": {
      const d = new Date(today.getFullYear(), today.getMonth(), 1)
      return [fmt(d), fmt(today)]
    }
    case "last_month": {
      const start = new Date(today.getFullYear(), today.getMonth() - 1, 1)
      const end = new Date(today.getFullYear(), today.getMonth(), 0)
      return [fmt(start), fmt(end)]
    }
    case "all_time":
      return ["2020-01-01", fmt(today)]
    case "custom":
      return [customFrom || fmt(today), customTo || fmt(today)]
    default:
      return [fmt(new Date(today.getTime() - 29 * 86400000)), fmt(today)]
  }
}
