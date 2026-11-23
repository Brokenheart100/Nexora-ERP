// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest'
import { createCatalogRecoveryStore, type CatalogRecovery } from '../app/utils/catalog/recovery'

const workspaceId = '11111111-1111-4111-8111-111111111111'
const itemId = '22222222-2222-4222-8222-222222222222'
const record: CatalogRecovery = { subject: 'alice', workspaceId, itemId, operationId: '33333333-3333-4333-8333-333333333333', etag: '"1"',
  payload: { name: 'Original input', categoryId: itemId, isActive: true }, createdAt: Date.now() }
const memory = new Map<string, string>()
const storage = { getItem: (key: string) => memory.get(key) ?? null, setItem: (key: string, value: string) => {
  memory.set(key, value)
}, removeItem: (key: string) => {
  memory.delete(key)
} }
beforeEach(() => memory.clear())

describe('catalog unknown-write recovery', () => {
  it('persists an immutable original submission through a new store instance', () => {
    const input = structuredClone(record)
    createCatalogRecoveryStore(storage).save(input)
    input.payload.name = 'Later edits'
    expect(createCatalogRecoveryStore(storage).read('alice', workspaceId)?.payload.name).toBe('Original input')
  })

  it('does not reveal or remove another account or workspace submission', () => {
    const store = createCatalogRecoveryStore(storage)
    store.save(record)
    expect(store.read('bob', workspaceId)).toBeNull()
    expect(store.read('alice', itemId)).toBeNull()
    store.remove('bob', workspaceId, record.operationId)
    expect(store.read('alice', workspaceId)?.operationId).toBe(record.operationId)
  })

  it('blocks replacing an unresolved operation and only clears the matching receipt', () => {
    const store = createCatalogRecoveryStore(storage)
    store.save(record)
    expect(() => store.save({ ...record, operationId: itemId })).toThrow()
    expect(() => store.save({ ...record, payload: { ...record.payload, name: 'Changed retry input' } })).toThrow()
    store.remove('alice', workspaceId, itemId)
    expect(store.read('alice', workspaceId)).not.toBeNull()
    store.remove('alice', workspaceId, record.operationId)
    expect(store.read('alice', workspaceId)).toBeNull()
  })
})
