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

---

## Instalasi di komputer kasir (untuk pemilik toko/kasir, bukan developer)

Tidak perlu install Node.js atau paham command line — cukup file `.exe` siap pakai.

1. Minta file `kasirku-print-agent.exe` beserta `install.ps1` (satu folder) dari developer.
2. Klik kanan `install.ps1` -> **Run with PowerShell**.
   - Kalau muncul peringatan biru "Windows protected your PC": klik **More info** -> **Run
     anyway**. Ini normal untuk aplikasi internal yang belum didaftarkan ke Microsoft, bukan
     virus.
3. Selesai — agent langsung aktif, dan otomatis nyala lagi tiap komputer ini dinyalakan/login.
   Tidak perlu diinstal ulang, tidak perlu dibuka manual setiap hari.
4. Lanjutkan konfigurasi printer LAN seperti biasa di pengaturan Kasirku.

Untuk menghapus: klik kanan `uninstall.ps1` -> **Run with PowerShell**.

**Satu agent per komputer kasir.** Kalau ada 2 komputer kasir yang keduanya mencetak ke printer
dapur, install di kedua-duanya.

---

## Developer — running from source

```bash
npm install
npm start
```

```bash
npm run dev   # auto-restart on file change
```

## Developer — building the standalone .exe

```bash
npm install
npm run build:exe
```

Produces `dist/kasirku-print-agent.exe` (~90MB, self-contained — no Node.js needed on the target
machine) via Node's built-in Single Executable Application (SEA) feature — bundled with esbuild,
then injected into a copy of the local `node.exe` with `postject`. Must be built *on Windows* — SEA
reuses whichever Node binary builds it, so it only targets that same OS/arch.

(We tried `pkg` first — it needs to download a prebuilt Node binary per target, and none was
available for this Node version, so it fell back to compiling Node from source, which needs a full
native build toolchain we don't have. SEA avoids that by reusing the Node already on this machine.)

To hand off a new build to a shop: copy `dist/kasirku-print-agent.exe`, `install.ps1`, and
`uninstall.ps1` together into one folder (e.g. zip it) and send that.

## Configuration

Environment variables (optional — the packaged `.exe` needs none of this, defaults already cover
production):

- `PRINT_AGENT_PORT` — HTTP port to listen on (default `9123`).
- `PRINT_AGENT_ALLOWED_ORIGINS` — comma-separated list of origins allowed to call this agent
  (default `https://createimpact.id,http://localhost:3000`).

## API

- `GET /health` → `{ ok: true, version: "..." }`
- `POST /print` with `{ ip, port, bytes }` (`bytes` is base64-encoded ESC/POS data) →
  `{ ok: true }` on success, or `{ ok: false, error }` with HTTP 502 if the printer couldn't be
  reached.
