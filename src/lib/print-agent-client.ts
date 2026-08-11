const AGENT_URL = process.env.NEXT_PUBLIC_PRINT_AGENT_URL ?? "http://127.0.0.1:9123";

export type PrintAgentResult =
  | { ok: true }
  | { ok: false; reason: "agent_unreachable" | "printer_unreachable"; error: string };

// Called from the browser — the cashier's PC is on the same LAN as the
// printer, unlike the Vercel server, so this is the only place that can
// actually reach a printer at e.g. 192.168.1.50:9100. See print-agent/.
export async function printViaAgent(address: string, bytesBase64: string): Promise<PrintAgentResult> {
  const [ip, portStr] = address.split(":");
  const port = portStr ? Number(portStr) : 9100;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`${AGENT_URL}/print`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ip, port, bytes: bytesBase64 }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    const data = (await res.json()) as { ok: boolean; error?: string };
    if (data.ok) return { ok: true };
    return { ok: false, reason: "printer_unreachable", error: data.error ?? "unknown_error" };
  } catch {
    clearTimeout(timer);
    // fetch throws on network failure or abort — the agent isn't running or isn't reachable.
    return { ok: false, reason: "agent_unreachable", error: "print_agent_not_running" };
  }
}
