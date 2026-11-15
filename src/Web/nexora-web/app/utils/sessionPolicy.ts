export interface SessionPolicySource {
  workspaceId: string
  workspaceName: string
  idleTimeoutMinutes: number
}

export interface SessionPolicy {
  idleTimeoutMinutes: number
  sources: SessionPolicySource[]
  workspaceCount: number
  checkedAt: string
  lastSeenAt: number
  cached?: boolean
  stale?: boolean
  unavailable?: boolean
}

export interface SessionActivity {
  lastSeenAt: number
  idleTimeoutMinutes: number
}

export const sessionWarningWindowMs = 2 * 60_000

export function idleWarningWindow(idleTimeoutMinutes: number) {
  return Math.min(sessionWarningWindowMs, Math.max(15_000, idleTimeoutMinutes * 60_000 / 4))
}

export function sessionPolicyKey(policy: Pick<SessionPolicy, 'idleTimeoutMinutes' | 'sources'>) {
  return [String(policy.idleTimeoutMinutes), ...policy.sources.map(source => source.workspaceId + ':' + source.idleTimeoutMinutes)].join('|')
}

export function idleDeadline(lastSeenAt: number, idleTimeoutMinutes: number) {
  return lastSeenAt + idleTimeoutMinutes * 60_000
}

export function idleRemaining(deadline: number, now: number) {
  return Math.max(0, deadline - now)
}

export function formatIdleRemaining(milliseconds: number) {
  const total = Math.max(0, Math.ceil(milliseconds / 1000))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  const pad = (value: number) => String(value).padStart(2, '0')
  return hours > 0 ? hours + ':' + pad(minutes) + ':' + pad(seconds) : pad(minutes) + ':' + pad(seconds)
}

export function sessionSourceSummary(policy: SessionPolicy) {
  if (!policy.sources.length)
    return policy.unavailable ? '策略服务暂不可用，按默认 30 分钟执行' : '默认 30 分钟'
  if (policy.sources.length === 1)
    return policy.sources[0]!.workspaceName + '（' + policy.sources[0]!.idleTimeoutMinutes + ' 分钟）'
  return policy.sources
    .map(source => source.workspaceName + '（' + source.idleTimeoutMinutes + ' 分钟）')
    .join('、')
}

export function sessionIdleError(error: unknown) {
  const value = error as { statusCode?: number, data?: { code?: string } }
  return value?.statusCode === 401 && value?.data?.code === 'session.idle_timeout'
}

export function sessionUnauthorized(error: unknown) {
  return (error as { statusCode?: number })?.statusCode === 401
}
