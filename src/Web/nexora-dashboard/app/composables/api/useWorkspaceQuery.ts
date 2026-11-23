import { useAuthSessionStore } from '~/stores/authSession'
import { useLiveSessionStore } from '~/stores/liveSession'
import { useDashboardApi } from './useDashboardApi'
import { ApiFailure } from '~/utils/api/client'

export function useWorkspaceQuery<T>(resource: string, pagePath: string, read: (workspaceId: string, signal: AbortSignal) => Promise<T>, filters: () => unknown = () => null) {
  const auth = useAuthSessionStore()
  const session = useLiveSessionStore()
  const api = useDashboardApi()
  const owner = computed(() => JSON.stringify([auth.user?.subject ?? '', session.activeWorkspaceId, session.access?.authorizationVersion, session.epoch]))
  const enabled = computed(() => auth.connected && !!auth.user && !session.denied && session.canVisit(pagePath))
  const key = computed(() => 'dashboard:' + api.scope.key(resource, filters()) + owner.value)
  type Envelope = { owner: string, key: string, data: T | null, problem: string, status: number, traceId: string }
  const query = useAsyncData<Envelope>(key, async (_app, { signal }) => {
    const captured = { owner: owner.value, key: key.value }
    if (!enabled.value) return { ...captured, data: null, problem: '', status: 0, traceId: '' }
    try {
      return { ...captured, data: await read(session.activeWorkspaceId, signal), problem: '', status: 200, traceId: '' }
    } catch (failure) {
      return { ...captured, data: null, problem: failure instanceof ApiFailure ? failure.message : '服务暂不可用，请重试。',
        status: failure instanceof ApiFailure ? failure.status : 0, traceId: failure instanceof ApiFailure ? failure.traceId : '' }
    }
  }, { server: false, lazy: true, enabled, deep: false })
  const visible = computed(() => enabled.value && query.data.value?.owner === owner.value && query.data.value.key === key.value ? query.data.value : null)
  return reactive({ auth, session, owner, enabled, connected: computed(() => auth.connected),
    data: computed(() => visible.value?.data ?? null), problem: computed(() => session.error || visible.value?.problem || ''),
    status: computed(() => visible.value?.status ?? 0), traceId: computed(() => visible.value?.traceId ?? ''),
    loading: computed(() => session.loading || (enabled.value && query.status.value === 'pending')), refresh: () => query.refresh() })
}
