import type { SessionPolicy } from '#shared/types/auth'
import { ApiFailure } from '~/utils/api/client'
import { useAccountSecurityApi } from './api/useAccountSecurityApi'

export function useBrowserSessionPolicy() {
  const auth = useAuthSessionStore()
  const api = useAccountSecurityApi()
  const snapshot = useState<SessionPolicy | null>('dashboard-session-policy', () => null)
  const problem = useState<string>('dashboard-session-policy-error', () => '')
  const loading = useState<boolean>('dashboard-session-policy-loading', () => false)
  const revision = useState<number>('dashboard-session-policy-revision', () => 0)

  async function refresh(force = false) {
    const subject = auth.user?.subject
    if (!subject || (loading.value && !force)) return
    const requested = ++revision.value
    const isCurrent = () => requested === revision.value && subject === auth.user?.subject
    loading.value = true
    problem.value = ''
    try {
      const policy = await api.policy(force)
      if (!isCurrent()) return
      snapshot.value = { ...policy, lastSeenAt: Math.max(policy.lastSeenAt, snapshot.value?.lastSeenAt ?? 0) }
    } catch (failure) {
      if (isCurrent()) problem.value = failure instanceof ApiFailure ? failure.message : '暂时无法读取会话策略。'
    } finally {
      if (isCurrent()) loading.value = false
    }
  }

  function recordActivity(result: Pick<SessionPolicy, 'lastSeenAt' | 'idleTimeoutMinutes'>) {
    if (snapshot.value && result.lastSeenAt >= snapshot.value.lastSeenAt) snapshot.value = { ...snapshot.value, ...result }
  }

  function clear() {
    revision.value++
    snapshot.value = null
    problem.value = ''
    loading.value = false
  }

  return { snapshot, problem, loading, refresh, recordActivity, clear }
}
