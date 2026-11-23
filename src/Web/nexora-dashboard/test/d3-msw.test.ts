// @vitest-environment node
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { setupServer } from 'msw/node'
import { createDashboardHandlers, mockWorkspaceId, mockSecondWorkspaceId } from '../app/mocks/api/handlers'
import { tradeMappingFields } from '../app/utils/api/account-mappings'

const server = setupServer()
const root = `https://dashboard.invalid/bff/api/masterdata/workspaces/${mockWorkspaceId}`
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
beforeEach(() => server.use(...createDashboardHandlers()))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())
async function write(path: string, payload: object, method = 'POST', etag?: string) {
  const operationId = crypto.randomUUID()
  return fetch(root + path, { method, body: JSON.stringify({ ...payload, operationId }), headers: { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': 'msw-only-csrf', 'Idempotency-Key': operationId, ...(etag ? { 'If-Match': etag } : {}) } })
}
describe('D3 MSW master data contracts', () => {
  it('isolates account IDs and rejects foreign mapping inputs before one-time configuration', async () => {
    const finance = `https://dashboard.invalid/bff/api/finance/workspaces/${mockWorkspaceId}`
    const chart = await (await fetch(finance + '/chart')).json()
    const foreign = await (await fetch(finance.replace(mockWorkspaceId, mockSecondWorkspaceId) + '/chart')).json()
    expect(foreign.accounts.some((value: { id: string }) => chart.accounts.some((account: { id: string }) => account.id === value.id))).toBe(false)
    const accounts = (rows: { id: string, name: string }[]) => Object.fromEntries(tradeMappingFields.filter(field => !field.optional).map(field => [field.key, rows.find(value => value.name === field.label)!.id]))
    const submit = async (values: object, operationId = crypto.randomUUID()) => fetch(finance + '/trade/setup', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': 'msw-only-csrf', 'Idempotency-Key': operationId }, body: JSON.stringify({ operationId, accounts: values }) })
    expect((await submit(accounts(foreign.accounts))).status).toBe(400)
    const operationId = crypto.randomUUID()
    expect((await submit(accounts(chart.accounts), operationId)).status).toBe(200)
    expect((await submit(accounts(chart.accounts), operationId)).status).toBe(200)
    expect((await submit(accounts(chart.accounts))).status).toBe(409)
  })
  it('creates and revises definitions with the published ETag contract', async () => {
    const made = await write('/definitions', { code: 'D3-CAT', name: 'New category', kind: 'category' })
    expect(made.status).toBe(201)
    const receipt = await made.json()
    const detail = await fetch(root + '/definitions/' + receipt.id)
    expect(detail.headers.get('etag')).toBe('"1"')
    expect((await write('/definitions/' + receipt.id, { name: 'Updated', isActive: false }, 'PUT', '"1"')).status).toBe(200)
    expect((await write('/definitions/' + receipt.id, { name: 'Stale', isActive: true }, 'PUT', '"1"')).status).toBe(412)
  })
  it('checks active and cross-workspace category references before creating an item', async () => {
    const catalog = await (await fetch(root + '/catalog')).json()
    const category = catalog.definitions.find((value: { kind: string }) => value.kind === 'category')
    const unit = catalog.definitions.find((value: { kind: string }) => value.kind === 'unit')
    const payload = { code: 'D3-ITEM', name: 'Real shape', kind: 'product', categoryId: category.id, unitId: unit.id, tracksInventory: true }
    expect((await write('/items', payload)).status).toBe(201)
    await write('/definitions/' + category.id, { name: category.name, isActive: false }, 'PUT', '"1"')
    expect((await write('/items', { ...payload, code: 'D3-INACTIVE' })).status).toBe(409)
    const foreign = await (await fetch(root.replace(mockWorkspaceId, mockSecondWorkspaceId) + '/catalog')).json()
    expect((await write('/items', { ...payload, categoryId: foreign.definitions[0].id, code: 'D3-FOREIGN' })).status).toBe(400)
  })
  it('preserves multiple partner roles and nullable contact fields in the wire DTO', async () => {
    const made = await write('/partners', { code: 'D3-PARTNER', profile: { name: 'Partner', roles: ['customer', 'supplier'], taxNumber: null, address: 'An address', contacts: [{ id: null, name: 'Contact', email: null, phone: null }] } })
    expect(made.status).toBe(201)
    const id = (await made.json()).id
    const response = await fetch(root + '/partners/' + id)
    const partner = await response.json()
    expect(partner.roles).toEqual(['customer', 'supplier'])
    expect(partner.contacts[0].id).toMatch(/^[a-f0-9-]{36}$/)
    expect(partner.contacts[0].email).toBeNull()
    expect((await fetch(root + `/partners/${id}/reference?role=customer`)).status).toBe(200)
  })
})
