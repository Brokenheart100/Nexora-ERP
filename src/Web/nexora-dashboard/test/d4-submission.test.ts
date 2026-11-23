// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { createSubmissionStore, type SavedSubmission } from '../app/utils/api/submission'

const workspace = '11111111-1111-4111-8111-111111111111'
const resource = '22222222-2222-4222-8222-222222222222'
function fixture() {
  const values = new Map<string, string>()
  return createSubmissionStore('d4', {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value)
    },
    removeItem: (key) => {
      values.delete(key)
    }
  })
}
const record = (path: string): SavedSubmission => ({
  subject: 'maker',
  workspaceId: workspace,
  operationId: resource,
  path,
  method: 'POST',
  action: 'd4',
  state: 'unknown',
  payload: { quantity: '9007199254740993.000001' }
})
describe('D4 frozen submissions across service owners', () => {
  it('can recover a receipt using its warehouse revision and exact decimal quantity', () => {
    const saved = fixture(),
      input = record(`/bff/api/inventory/workspaces/${workspace}/receipts/${resource}/receive`)
    input.payload.expectedRevision = '9007199254740993'
    input.warehouseId = resource
    saved.save(input)
    expect(saved.read('maker', workspace)?.payload).toEqual(input.payload)
    expect(saved.read('maker', workspace)?.warehouseId).toBe(resource)
    expect(() => saved.save({ ...input, payload: { ...input.payload, expectedRevision: '2' } })).toThrow()
  })
  it('retains original bill input and tax snapshots without adding them to the HTTP payload', () => {
    const saved = fixture(),
      input = record(`/bff/api/finance/workspaces/${workspace}/trade/documents`)
    input.draft = { form: { number: 'BILL', on: '2026-01-03' }, lines: [{ unitPrice: '10.000001', assessment: { id: resource } }] }
    saved.save(input)
    expect(saved.read('maker', workspace)?.draft).toEqual(input.draft)
    expect(saved.read('maker', workspace)?.payload).not.toHaveProperty('draft')
    expect(() => saved.save({ ...input, draft: { changed: true } })).toThrow()
  })
  it.each([
    ['purchasing', 'orders'],
    ['purchasing', `orders/${resource}`],
    ['purchasing', `orders/${resource}/decision`],
    ['purchasing', `orders/${resource}/receipts`],
    ['purchasing', `orders/${resource}/receipts/${resource}/cancel`],
    ['purchasing', `orders/${resource}/receipts/close`],
    ['finance', 'trade/documents'],
    ['finance', `trade/documents/${resource}/decision`],
    ['finance', `trade/receipts/${resource}/accrue`],
    ['finance', 'tax/assessments']
  ])('accepts the published %s/%s write path', (area, path) => {
    const saved = fixture(),
      input = record(`/bff/api/${area}/workspaces/${workspace}/${path}`)
    saved.save(input)
    expect(saved.read('maker', workspace)?.path).toBe(input.path)
    expect(saved.read('reviewer', workspace)).toBeNull()
  })
  it.each(['finance/items', 'purchasing/warehouses', 'inventory/trade/setup'])(
    'rejects a route owned by a different service: %s',
    (value) => {
      const [area, ...path] = value.split('/')
      expect(() => fixture().save(record(`/bff/api/${area}/workspaces/${workspace}/${path.join('/')}`))).toThrow()
    }
  )
})
