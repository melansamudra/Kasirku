// Kasirku production, plus localhost for local dev against `npm run dev`.
// Packaged as a standalone .exe for cashier PCs, so these need to work with
// zero configuration — most cashiers will never set PRINT_AGENT_ALLOWED_ORIGINS.
const DEFAULT_ORIGINS = ['https://createimpact.id', 'http://localhost:3000']

export const ALLOWED_ORIGINS = (process.env.PRINT_AGENT_ALLOWED_ORIGINS ?? DEFAULT_ORIGINS.join(','))
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

export const PORT = Number(process.env.PRINT_AGENT_PORT ?? 9123)

// Deliberately 127.0.0.1 only — the HTTP port must never be reachable from the LAN,
// only from the browser running on this same cashier PC.
export const HOST = '127.0.0.1'

export const VERSION = '0.1.0'
