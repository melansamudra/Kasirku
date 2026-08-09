---
name: kitchen-printer-lan-bluetooth
description: "How kitchen/bar + receipt printing actually works on Android/print-agent, and the SOP for finding/setting a new client's printer IP"
metadata: 
  node_type: memory
  type: project
  originSessionId: 813a231d-ee20-4309-a3d8-302f9ddd53fe
  modified: 2026-07-27T14:42:24.587Z
---

Printing architecture (built 2026-07-26/27, verified against real hardware — an Epson TM-T82II-i on LAN and an RPP02N on Bluetooth):

- Server only builds ESC/POS ticket bytes (`buildKitchenTicket` / `buildReceiptTicket` in `src/lib/escpos.ts`) — it can never reach a printer's private LAN IP or Bluetooth. The **client** (Android app's native `KitchenPrinterPlugin.kt`, or `print-agent/` on PC) sends the bytes. See `src/lib/dispatch-print-jobs.ts`.
- `kitchen_printers.prints_receipt` (bool) marks a printer as the **cashier's receipt printer**: it auto-gets the priced customer receipt at checkout (bypasses `window.print()`, which doesn't work for cheap Bluetooth ESC/POS printers — Android's OS print framework generally can't drive them) and is *excluded* from the automatic kitchen-ticket fan-out even if its categories match everything. Toggle lives in Settings next to each printer.
- Receipt jobs dispatch and complete before kitchen jobs (`dispatchReceiptThenKitchenJobs`) since one physical printer often does both roles and Bluetooth sockets don't like concurrent writes.
- Known fixed bug: `KitchenPrinterPlugin.kt`'s Bluetooth path used to call `adapter.cancelDiscovery()`, which throws without `BLUETOOTH_SCAN` permission (deliberately never requested — app only reads paired devices). Removed; don't re-add it.

**SOP for a new client's LAN printer IP** — full illustrated version published as an Artifact: https://claude.ai/code/artifact/c9c32eab-6ff7-46c9-814c-ba04fa081edd (source file was in this session's scratchpad, so re-publish from that URL if it needs updating from a future session — pass it as `url` to Artifact).

Condensed steps:
1. Printer reset button (usually rear, pen-tip), hold **3–4 sec** → prints a network settings report (IP, DHCP status, MAC). **Never >10 sec** (factory reset).
2. Check the `DHCP` line: **Enable** → find the IP via the client's router admin page (connected devices / DHCP client list, match by MAC). **Disable** → printer sits at its factory-default IP (Epson default: `192.168.192.168`), a different subnet than the client's WiFi — go to step 3.
3. If `ARP+Ping: Enable` on the report (near-universal on Epson), set a new static IP with zero risk to the PC's own network config:
   ```
   netsh interface ipv4 add neighbors "<WiFi adapter name>" <chosen free IP> <printer MAC, hyphens>
   ping <chosen IP> -n 4
   ```
   First ping often times out (printer still switching) — retry. Confirm the chosen IP is free first with a plain `ping` (unreachable/timeout = free).
4. Enter the new IP in Kasirku → Pengaturan → Printer Dapur & Bar, then Tes Cetak to confirm.

**Why:** direct `Test-NetConnection`/browser access to the Epson's WebConfig (`/PrinterConfigurationPage/`) failed on every common port (80/443/8080/8000) even though ICMP ping worked — EpsonNet Config also isn't offered for `-i` (Intelligent) model variants on Epson's download center. ARP+Ping turned out to be the only reliable no-software path for this printer class.

**How to apply:** don't suggest `New-NetIPAddress` / changing the PC's own WiFi adapter IP to reach a mismatched-subnet printer — it broke the user's WiFi entirely on the first attempt (2026-07-27) and required a phone/Gemini fallback to recover. `netsh ... add neighbors` + `route add` (a narrow host route, if ever needed again for reaching a printer's *original* default IP e.g. to read its WebConfig) don't touch the adapter's own IP/gateway/DNS and are the safe alternative.
