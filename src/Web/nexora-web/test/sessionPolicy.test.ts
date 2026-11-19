import { describe, expect, it } from 'vitest'
import {
  formatIdleRemaining, idleDeadline, idleRemaining, idleWarningWindow, sessionIdleError,
  sessionPolicyKey, sessionSourceSummary, sessionUnauthorized, type SessionPolicy,
} from '../app/utils/account/sessionPolicy'

function policy(overrides: Partial<SessionPolicy> = {}): SessionPolicy {
  return {
    idleTimeoutMinutes: 30,
    sources: [{ workspaceId: 'a', workspaceName: '阿尔法', idleTimeoutMinutes: 30 }],
    workspaceCount: 1,
    checkedAt: '2026-11-14T12:00:00Z',
    lastSeenAt: 1000,
    ...overrides,
  }
}

describe('session policy helpers', () => {
  it('computes deadlines and clamps remaining time at zero', () => {
    expect(idleDeadline(1_000, 15)).toBe(1_000 + 15 * 60_000)
    expect(idleRemaining(1_000 + 15 * 60_000, 1_000)).toBe(15 * 60_000)
    expect(idleRemaining(1_000, 2_000)).toBe(0)
  })

  it('formats countdowns under and over an hour', () => {
    expect(formatIdleRemaining(119_000)).toBe('01:59')
    expect(formatIdleRemaining(3_661_000)).toBe('1:01:01')
    expect(formatIdleRemaining(-1)).toBe('00:00')
  })

  it('names the shortest policy and all tying sources', () => {
    expect(sessionSourceSummary(policy())).toBe('阿尔法（30 分钟）')
    const tied = policy({
      idleTimeoutMinutes: 15,
      sources: [
        { workspaceId: 'a', workspaceName: '阿尔法', idleTimeoutMinutes: 15 },
        { workspaceId: 'b', workspaceName: '贝塔', idleTimeoutMinutes: 15 },
      ],
      workspaceCount: 2,
    })
    expect(sessionSourceSummary(tied)).toBe('阿尔法（15 分钟）、贝塔（15 分钟）')
    expect(sessionSourceSummary(policy({ sources: [], unavailable: true }))).toContain('默认 30 分钟')
  })

  it('keeps the warning proportional to short idle policies', () => {
    expect(idleWarningWindow(30)).toBe(120_000)
    expect(idleWarningWindow(2)).toBe(30_000)
    expect(idleWarningWindow(1)).toBe(15_000)
  })

  it('changes the policy key when the effective source changes', () => {
    expect(sessionPolicyKey(policy())).toBe('30|a:30')
    expect(sessionPolicyKey(policy({ idleTimeoutMinutes: 15 }))).not.toBe(sessionPolicyKey(policy()))
  })

  it('recognizes only idle-timeout 401 responses', () => {
    expect(sessionIdleError({ statusCode: 401, data: { code: 'session.idle_timeout' } })).toBe(true)
    expect(sessionIdleError({ statusCode: 401, data: { code: 'other' } })).toBe(false)
    expect(sessionUnauthorized({ statusCode: 401 })).toBe(true)
    expect(sessionUnauthorized({ statusCode: 500 })).toBe(false)
  })
})
