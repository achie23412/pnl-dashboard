const STALE_MS = 5 * 60 * 1000

interface Entry<T> {
  data: T
  ts: number
}

const store = new Map<string, Entry<unknown>>()

export function getCached<T>(key: string): T | null {
  const e = store.get(key) as Entry<T> | undefined
  if (!e) return null
  if (Date.now() - e.ts > STALE_MS) {
    store.delete(key)
    return null
  }
  return e.data
}

export function setCache<T>(key: string, data: T): void {
  store.set(key, { data, ts: Date.now() })
}
