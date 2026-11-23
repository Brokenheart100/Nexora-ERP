// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { createSubmissionStore, type SavedSubmission } from '../app/utils/api/submission'

const workspaceId = '11111111-1111-4111-8111-111111111111'
const original: SavedSubmission = { subject: 'alice', workspaceId, operationId: '22222222-2222-4222-8222-222222222222',
  path: `/bff/api/masterdata/workspaces/${workspaceId}/definitions`, method: 'POST', action: 'catalog.definition.created', payload: { name: 'Original' }, state: 'unknown' }
function fixture() {
  const values = new Map<string, string>()
  return createSubmissionStore('definitions', { getItem: key => values.get(key) ?? null, setItem: (key, value) => {
    values.set(key, value)
  }, removeItem: (key) => {
    values.delete(key)
  } })
}
describe('D3 saved submissions', () => {
  it('retains the frozen payload and isolates the original subject and workspace', () => {
    const store = fixture()
    store.save(original)
    expect(store.read('alice', workspaceId)?.payload).toEqual({ name: 'Original' })
    expect(store.read('bob', workspaceId)).toBeNull()
    expect(() => store.save({ ...original, payload: { name: 'Changed' } })).toThrow()
  })
  it('rejects a path targeting another workspace or a session endpoint', () => {
    const store = fixture()
    expect(() => store.save({ ...original, path: '/bff/login' })).toThrow()
    expect(() => store.save({ ...original, workspaceId: original.operationId })).toThrow()
  })
  it('only removes the exact original operation', () => {
    const store = fixture()
    store.save(original)
    store.remove('alice', workspaceId, workspaceId)
    expect(store.read('alice', workspaceId)).not.toBeNull()
    store.remove('alice', workspaceId, original.operationId)
    expect(store.read('alice', workspaceId)).toBeNull()
  })
})
