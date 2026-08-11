import net from 'node:net'

export type PrintResult = { ok: true } | { ok: false; error: string }

export function sendToPrinter(ip: string, port: number, bytes: Buffer, timeoutMs = 3000): Promise<PrintResult> {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: ip, port, timeout: timeoutMs })

    socket.on('connect', () => {
      socket.setNoDelay(true)
      socket.write(bytes, () => socket.end())
    })
    socket.on('close', () => resolve({ ok: true }))
    socket.on('error', (err) => resolve({ ok: false, error: err.message }))
    socket.on('timeout', () => {
      socket.destroy()
      resolve({ ok: false, error: 'connect_timeout' })
    })
  })
}
