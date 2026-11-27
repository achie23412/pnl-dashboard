// Signed login session: "<role>.<expires ms>.<HMAC-SHA256 of role.expires>" in the httpOnly
// pnl_session cookie. Only the server knows the secret, so a made-up or edited cookie fails the
// check in middleware. Uses Web Crypto so the same code runs in middleware (Edge) and API routes.
// owner = DASHBOARD_USER, coach = COACH_USER, cs = CS_USER (customer service: only the pages in
// src/lib/cs-access.ts)
export type Role = "owner" | "coach" | "cs"
const ROLES: readonly string[] = ["owner", "coach", "cs"]
export const SESSION_COOKIE = "pnl_session"
export const SESSION_DAYS = 30

// ROLE_SECRET (a long random string in Vercel) signs sessions; DASHBOARD_PASS is the fallback so
// nobody gets locked out before it is set. With neither, every session is rejected.
function secret(): string | null {
  return process.env.ROLE_SECRET || process.env.DASHBOARD_PASS || null
}

const enc = new TextEncoder()
async function hmac(data: string, key: string): Promise<string> {
  const k = await crypto.subtle.importKey("raw", enc.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode(data)))
  return Array.from(sig, (b) => b.toString(16).padStart(2, "0")).join("")
}

// Same length and every character compared, so the time taken doesn't leak the signature
function sameString(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

export async function createSession(role: Role): Promise<string> {
  const key = secret()
  if (!key) throw new Error("ROLE_SECRET or DASHBOARD_PASS must be set")
  const expires = Date.now() + SESSION_DAYS * 86400000
  return `${role}.${expires}.${await hmac(`${role}.${expires}`, key)}`
}

// The role of a valid, unexpired session; null for anything else
export async function verifySession(value: string | undefined | null): Promise<Role | null> {
  const key = secret()
  if (!key || !value) return null
  const parts = value.split(".")
  if (parts.length !== 3) return null
  const [role, expires, sig] = parts
  if (!ROLES.includes(role)) return null
  if (!/^\d+$/.test(expires) || Number(expires) < Date.now()) return null
  return sameString(sig, await hmac(`${role}.${expires}`, key)) ? (role as Role) : null
}
