# Kasirku Print Agent

Runs on the cashier's PC to relay kitchen/bar print jobs from the browser to LAN thermal
printers. Browsers can't open raw TCP sockets, and Kasirku's server (Vercel) can't reach a
printer's private LAN IP (`192.168.x.x`) either — so this small local service does it instead.

## Why this exists

The POS page (running in the cashier's browser, physically on the shop's own network) can't
talk to a printer at `192.168.1.50:9100` directly — this agent listens on `127.0.0.1:9123`
(loopback only, never reachable from the network), accepts a print job over local HTTP from the
browser, and opens the raw TCP socket to the printer on the agent's behalf, since the agent is on
the same LAN as the printer.

Previously, print dispatch ran as a Next.js Server Action on Vercel — which can never reach a
shop's private LAN IP from the cloud. That's why LAN kitchen printing has never actually worked.

## Running

```bash
npm install
npm start
```

Leave this running on the cashier PC for as long as the POS is in use. Add it to Windows startup
(Task Scheduler, or a Startup folder shortcut) so it comes back after a reboot.

## Configuration

Environment variables (optional):

- `PRINT_AGENT_PORT` — HTTP port to listen on (default `9123`).
- `PRINT_AGENT_ALLOWED_ORIGINS` — comma-separated list of origins allowed to call this agent
  (default `http://localhost:3000`). **Must** be set to the real production POS URL on cashier
  PCs, e.g. `PRINT_AGENT_ALLOWED_ORIGINS=https://createimpact.id`.

## API

- `GET /health` → `{ ok: true, version: "..." }`
- `POST /print` with `{ ip, port, bytes }` (`bytes` is base64-encoded ESC/POS data) →
  `{ ok: true }` on success, or `{ ok: false, error }` with HTTP 502 if the printer couldn't be
  reached.

## Packaging (later)

For now this runs via `tsx` from source. To hand cashiers a double-clickable `.exe` instead of
asking them to run npm commands, package with `pkg` or Node's Single Executable Applications
(SEA) feature — not done yet, out of scope for the initial build.
