import { defineEventHandler, getHeader } from 'h3'
import type { H3Event } from 'h3'
import { invoiceShareTokenSchema } from '../../../shared/types/invoicing'
import { bffConfig } from '../../utils/runtime/bff-config'

const bodyLimit = 512
const responseHeaders = {
  'Cache-Control': 'no-store',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff'
}

function unavailable(status: number) {
  return new Response(null, { status, headers: responseHeaders })
}

async function readToken(event: H3Event) {
  if (getHeader(event, 'content-type')?.split(';')[0]?.trim().toLowerCase() !== 'application/json')
    return unavailable(415)
  if (Number(getHeader(event, 'content-length')) > bodyLimit)
    return unavailable(413)
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of event.node.req.iterator({ destroyOnReturn: false }) as AsyncIterable<Buffer>) {
    size += chunk.length
    if (size > bodyLimit) return unavailable(413)
    chunks.push(chunk)
  }
  let value: unknown
  try { value = JSON.parse(Buffer.concat(chunks).toString('utf8')) }
  catch { return unavailable(400) }
  if (value === null || typeof value !== 'object' || Object.keys(value).length !== 1 || !('token' in value))
    return unavailable(400)
  const parsed = invoiceShareTokenSchema.safeParse(value.token)
  return parsed.success ? parsed.data : unavailable(404)
}

export default defineEventHandler(async (event) => {
  let config: ReturnType<typeof bffConfig>
  try { config = bffConfig(event) }
  catch { return unavailable(503) }
  if (getHeader(event, 'host') !== config.origin.host) return unavailable(404)
  const token = await readToken(event)
  if (typeof token !== 'string') return token
  let response: Response
  try {
    response = await fetch(new URL('/public/invoice-pdf', config.gateway.origin), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/pdf, application/problem+json' },
      body: JSON.stringify({ token }),
      redirect: 'manual',
      signal: AbortSignal.timeout(30000)
    })
  } catch { return unavailable(503) }
  if (response.status === 200 && response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() === 'application/pdf' && response.body) {
    return new Response(response.body, { headers: {
      ...responseHeaders,
      'Content-Type': 'application/pdf',
      'Content-Disposition': response.headers.get('content-disposition') ?? 'attachment; filename="invoice.pdf"'
    } })
  }
  await response.body?.cancel()
  if (response.status === 404 || response.status === 410) return unavailable(404)
  return unavailable(response.status === 429 ? 429 : 503)
})
