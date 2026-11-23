import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useRuntimeConfig } from '#app'
import { flushPromises } from '@vue/test-utils'
import { createApiClient, type DashboardApi } from '../app/utils/api/client'
import { RequestScope } from '../app/utils/api/scope'
import { useAuthSessionStore } from '../app/stores/authSession'
import { useLiveSessionStore } from '../app/stores/liveSession'

const fixture = vi.hoisted(() => ({ client: undefined as DashboardApi | undefined }))
vi.mock('../app/composables/api/useDashboardApi', () => ({ useDashboardApi: () => fixture.client, useDashboardMode: () => 'live' }))
const first = '11111111-1111-4111-8111-111111111111'
const second = '22222222-2222-4222-8222-222222222222'
const workspace = (id: string) => ({ id, tenantId: first, name: id === first ? 'First company' : 'Second company', countryCode: 'CN', baseCurrency: 'CNY', version: 1, isPersonal: false })
const access = (id: string) => ({ workspaceId: id, tenantId: first, memberId: first, authorizationVersion: 1, role: 'owner', isPersonal: false, permissions: ['masterdata.catalog.read', 'masterdata.item.manage'] })
let gate: ((path: string) => Promise<unknown> | undefined) | undefined
let scope: RequestScope
beforeEach(() => {
  setActivePinia(createPinia())
  useRuntimeConfig().public.dataMode = 'live'
  gate = undefined
  scope = new RequestScope({ mode: 'live', subject: '', workspaceId: '', authorizationVersion: '' })
  fixture.client = createApiClient(scope, async (path) => {
    const held = gate?.(path)
    const id = path.match(/workspaces\/([^/]+)/)?.[1] ?? first
    const data = held
      ? await held
      : path === '/bff/api/me'
        ? { id: first, issuer: 'https://identity.invalid', subject: 'alice', verifiedEmail: null, isActive: true }
        : path === '/bff/api/workspaces'
          ? [workspace(first), workspace(second)]
          : path.endsWith('/access')
            ? access(id)
            : path.endsWith('/billing/entitlements')
              ? { workspaceId: id, planCode: 'pro', planName: 'Pro', effectivePlanCode: 'pro', status: 'active', modules: ['catalog'], warnings: [], periodEndUtc: null,
                  usage: { workspaces: 2, workspacesLimit: 10, members: 2, membersLimit: 20, documentsThisMonth: 0, documentsLimit: 1000, period: '2026-11' } }
              : workspace(id)
    return { status: 200, data, headers: new Headers() }
  })
  useAuthSessionStore().user = { subject: 'alice', name: 'alice' }
})
afterEach(() => {
  useRuntimeConfig().public.dataMode = 'mock'
})

describe('D2 workspace follows the canonical authenticated identity', () => {
  it('loads authorized workspaces and access for the current identity', async () => {
    const session = useLiveSessionStore()
    await flushPromises()
    expect(session.workspaces.map(item => item.id)).toEqual([first, second])
    expect(session.activeWorkspaceId).toBe(first)
    expect(session.account?.subject).toBe('alice')
    expect(session.entitlements?.modules).toContain('catalog')
    expect(session.canVisit('/catalog')).toBe(true)
    expect(scope.identity).toMatchObject({ subject: 'alice', workspaceId: first, authorizationVersion: '1' })
  })

  it('ignores an older workspace selection after switching back', async () => {
    const session = useLiveSessionStore()
    await flushPromises()
    let finish!: (value: unknown) => void
    gate = path => path.endsWith(`/${second}/access`)
      ? new Promise((resolve) => {
          finish = resolve
        })
      : undefined
    const pending = session.selectWorkspace(second)
    const old = scope.capture()
    await session.selectWorkspace(first)
    expect(old.signal.aborted).toBe(true)
    finish(access(second))
    await pending
    expect(session.access?.workspaceId).toBe(first)
    expect(session.error).toBe('')
  })

  it('clears current data immediately when the authenticated account changes', async () => {
    const session = useLiveSessionStore()
    await flushPromises()
    useAuthSessionStore().expire()
    expect(session.workspaces).toEqual([])
    expect(session.access).toBeNull()
    expect(session.activeWorkspaceId).toBe('')
    expect(scope.identity.subject).toBe('')
  })
})
