// @vitest-environment node
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { setupServer } from 'msw/node'
import { createDashboardHandlers, mockWorkspaceId } from '../app/mocks/api/handlers'
import { catalogSchema } from '../shared/types/wire'
import { accrualSchema, tradeDocumentSchema } from '../shared/types/trade'
import { taxSnapshotSchema } from '../shared/types/tax'

let scenario = 'normal'
const server = setupServer(...createDashboardHandlers({ scenario: () => scenario }))
const origin = 'http://nexora-msw.test'
beforeAll(() => server.listen({ onUnhandledFrame: 'error' }))
afterEach(() => {
  scenario = 'normal'
  server.resetHandlers(...createDashboardHandlers({ scenario: () => scenario }))
})
afterAll(() => server.close())

describe('shared MSW API scenarios', () => {
  it('serves the published catalog shape through ordinary fetch', async () => {
    const response = await fetch(`${origin}/bff/api/masterdata/workspaces/${mockWorkspaceId}/catalog`)
    expect(response.status).toBe(200)
    const catalog = catalogSchema.parse(await response.json())
    expect(catalog.page.items[0]?.code).toBe('MSW-SKU-001')
    expect(catalog.canManage).toBe(true)
  })

  it('keeps empty, forbidden and unavailable responses distinct', async () => {
    const path = `${origin}/bff/api/masterdata/workspaces/${mockWorkspaceId}/catalog`
    scenario = 'empty'
    expect(catalogSchema.parse(await (await fetch(path)).json()).page.items).toEqual([])
    scenario = 'forbidden'
    expect((await fetch(path)).status).toBe(403)
    scenario = 'unavailable'
    expect((await fetch(path)).status).toBe(503)
  })

  it('rejects unknown business requests instead of contacting a real BFF', async () => {
    expect((await fetch(origin + '/bff/api/unhandled')).status).toBe(501)
  })
  it('serves typed purchase accounting examples and an immutable tax assessment receipt', async () => {
    const finance = `${origin}/bff/api/finance/workspaces/${mockWorkspaceId}`
    const receipts = (await (await fetch(finance + '/trade/receipts')).json() as unknown[]).map(receipt => accrualSchema.parse(receipt))
    expect(receipts.filter(receipt => receipt.matchedQuantity === '0')).toHaveLength(1)
    const documents = (await (await fetch(finance + '/trade/documents')).json() as unknown[]).map(document => tradeDocumentSchema.parse(document))
    expect(documents.find(document => document.terms.kind === 1)?.outstanding).toBe('530')
    const input = { operationId: crypto.randomUUID(), on: '2026-01-04', groupCode: 'MSW-VAT13', itemId: receipts[0]!.fact.itemId, partnerId: receipts[0]!.fact.supplierId, quantity: '5', unitPrice: '10', discount: '0', includesTax: false }
    const assess = async () => taxSnapshotSchema.parse(await (await fetch(finance + '/tax/assessments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) })).json())
    const first = await assess()
    expect(first.amounts).toEqual({ net: '50', tax: '6.5', total: '56.5', components: [] })
    expect((await assess()).id).toBe(first.id)
  })
})
