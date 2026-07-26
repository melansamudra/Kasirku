import http from 'node:http'
import { ALLOWED_ORIGINS, HOST, PORT, VERSION } from './config'
import { sendToPrinter } from './printSocket'

const MAX_BODY_BYTES = 256 * 1024

function setCors(req: http.IncomingMessage, res: http.ServerResponse) {
  const origin = req.headers.origin ?? ''
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin)
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
}

function readJsonBody(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        reject(new Error('payload_too_large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'))
      } catch {
        reject(new Error('invalid_json'))
      }
    })
    req.on('error', reject)
  })
}

function sendJson(res: http.ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(body))
}

const server = http.createServer(async (req, res) => {
  setCors(req, res)

  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  if (req.method === 'GET' && req.url === '/health') {
    sendJson(res, 200, { ok: true, version: VERSION })
    return
  }

  if (req.method === 'POST' && req.url === '/print') {
    let body: unknown
    try {
      body = await readJsonBody(req)
    } catch (err) {
      sendJson(res, 400, { ok: false, error: err instanceof Error ? err.message : 'bad_request' })
      return
    }

    const { ip, port, bytes } = (body ?? {}) as { ip?: string; port?: number; bytes?: string }
    if (!ip || typeof ip !== 'string') {
      sendJson(res, 400, { ok: false, error: 'missing_ip' })
      return
    }
    const resolvedPort = Number(port ?? 9100)
    if (!Number.isInteger(resolvedPort) || resolvedPort <= 0 || resolvedPort > 65535) {
      sendJson(res, 400, { ok: false, error: 'invalid_port' })
      return
    }
    if (!bytes || typeof bytes !== 'string') {
      sendJson(res, 400, { ok: false, error: 'missing_bytes' })
      return
    }

    let buffer: Buffer
    try {
      buffer = Buffer.from(bytes, 'base64')
    } catch {
      sendJson(res, 400, { ok: false, error: 'invalid_bytes' })
      return
    }

    const result = await sendToPrinter(ip, resolvedPort, buffer)
    sendJson(res, result.ok ? 200 : 502, result)
    return
  }

  sendJson(res, 404, { ok: false, error: 'not_found' })
})

server.listen(PORT, HOST, () => {
  console.log(`kasirku-print-agent listening on http://${HOST}:${PORT}`)
})
