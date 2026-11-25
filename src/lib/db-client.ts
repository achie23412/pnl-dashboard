// Browser-side stand-in for the Supabase client: the same chained style
// (from().select().eq().order().limit(), insert, update().eq(), delete().eq()), but every query
// goes to /api/db on our own logged-in server, so the database itself can stay closed to the
// public key. Supports only what the pages use: select, insert, update, delete, eq, gte, lte, in,
// order and limit.
type Op = "select" | "insert" | "update" | "delete"
type Result<T> = { data: T | null; error: { message: string; code?: string } | null }

class Query<T = any> implements PromiseLike<Result<T>> { // eslint-disable-line @typescript-eslint/no-explicit-any
  private body: {
    table: string
    op: Op
    columns?: string
    filters: [string, string, unknown][]
    order: { column: string; ascending?: boolean; nullsFirst?: boolean }[]
    limit?: number
    values?: unknown
  }
  constructor(table: string) {
    this.body = { table, op: "select", filters: [], order: [] }
  }
  select(columns = "*") { this.body.op = "select"; this.body.columns = columns; return this }
  insert(values: unknown) { this.body.op = "insert"; this.body.values = values; return this }
  update(values: unknown) { this.body.op = "update"; this.body.values = values; return this }
  delete() { this.body.op = "delete"; return this }
  eq(column: string, value: unknown) { this.body.filters.push(["eq", column, value]); return this }
  gte(column: string, value: unknown) { this.body.filters.push(["gte", column, value]); return this }
  lte(column: string, value: unknown) { this.body.filters.push(["lte", column, value]); return this }
  in(column: string, values: unknown[]) { this.body.filters.push(["in", column, values]); return this }
  order(column: string, opts: { ascending?: boolean; nullsFirst?: boolean } = {}) { this.body.order.push({ column, ...opts }); return this }
  limit(n: number) { this.body.limit = n; return this }

  private async run(): Promise<Result<T>> {
    try {
      const res = await fetch("/api/db", { method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store", body: JSON.stringify(this.body) })
      const json = await res.json().catch(() => null)
      if (!json) return { data: null, error: { message: `HTTP ${res.status}` } }
      return { data: json.data ?? null, error: json.error ?? (res.ok ? null : { message: `HTTP ${res.status}` }) }
    } catch (e) {
      return { data: null, error: { message: e instanceof Error ? e.message : String(e) } }
    }
  }
  then<A = Result<T>, B = never>(onfulfilled?: ((v: Result<T>) => A | PromiseLike<A>) | null, onrejected?: ((r: unknown) => B | PromiseLike<B>) | null): PromiseLike<A | B> {
    return this.run().then(onfulfilled, onrejected)
  }
}

export const db = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: <T = any>(table: string) => new Query<T>(table),
}
