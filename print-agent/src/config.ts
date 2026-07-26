const DEFAULT_ORIGINS = ['http://localhost:3000']

export const ALLOWED_ORIGINS = (process.env.PRINT_AGENT_ALLOWED_ORIGINS ?? DEFAULT_ORIGINS.join(','))
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

export const PORT = Number(process.env.PRINT_AGENT_PORT ?? 9123)

// Deliberately 127.0.0.1 only — the HTTP port must never be reachable from the LAN,
// only from the browser running on this same cashier PC.
export const HOST = '127.0.0.1'

export const VERSION = '0.1.0'
