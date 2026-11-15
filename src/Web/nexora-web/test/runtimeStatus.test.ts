import { describe, expect, it } from 'vitest'
import {
  isNewBuild,
  isRuntimeBlocked,
  isRuntimeState,
  parseBuildInfo,
  parseRuntimeStatus,
  runtimeStateKey,
  runtimeStates,
} from '../app/utils/runtimeStatus'

const now = 1_800_000_000_000

describe('parseRuntimeStatus', () => {
  it('falls back to a running status for missing or unknown payloads', () => {
    const status = parseRuntimeStatus(null, now)
    expect(status.state).toBe('running')
    expect(status.message).toBe('')
    expect(status.since).toBe(new Date(now).toISOString())
    expect(status.checkedAt).toBe(new Date(now).toISOString())
    expect(parseRuntimeStatus({ state: 'exploded' }, now).state).toBe('running')
  })

  it('normalizes timestamps and truncates the operator message', () => {
    const status = parseRuntimeStatus({
      state: 'maintenance',
      message: '  ' + 'x'.repeat(400) + '  ',
      since: '2026-11-14T10:00:00+08:00',
      checkedAt: 'not-a-date',
    }, now)
    expect(status.state).toBe('maintenance')
    expect(status.message).toHaveLength(300)
    expect(status.since).toBe('2026-11-14T02:00:00.000Z')
    expect(status.checkedAt).toBe(new Date(now).toISOString())
  })
})

describe('runtime state helpers', () => {
  it('only treats running as unblocked', () => {
    for (const state of runtimeStates) {
      expect(isRuntimeState(state)).toBe(true)
      expect(isRuntimeBlocked(parseRuntimeStatus({ state }, now))).toBe(state !== 'running')
    }
    expect(isRuntimeState('paused')).toBe(false)
  })

  it('builds translation keys per state', () => {
    expect(runtimeStateKey('updating', 'title')).toBe('runtime.states.updating.title')
    expect(runtimeStateKey('starting', 'body')).toBe('runtime.states.starting.body')
  })
})

describe('build info', () => {
  it('rejects payloads without a version or build id', () => {
    expect(parseBuildInfo(null)).toBeNull()
    expect(parseBuildInfo({ version: '0.1.0' })).toBeNull()
    expect(parseBuildInfo({ buildId: 'abc' })).toBeNull()
  })

  it('normalizes a valid payload', () => {
    const info = parseBuildInfo({
      version: ' 0.2.0 ',
      buildId: 'b-2',
      startedAt: '2026-11-14T00:00:00Z',
      environment: 'Development',
    })
    expect(info).toMatchObject({ version: '0.2.0', buildId: 'b-2', environment: 'Development' })
    expect(info?.startedAt).toBe('2026-11-14T00:00:00.000Z')
  })

  it('detects a new deployment only when both build ids exist and differ', () => {
    const first = { version: '0.2.0', buildId: 'b-1', startedAt: '', environment: '' }
    const second = { ...first, buildId: 'b-2' }
    expect(isNewBuild(first, first)).toBe(false)
    expect(isNewBuild(first, second)).toBe(true)
    expect(isNewBuild(null, second)).toBe(false)
    expect(isNewBuild(first, null)).toBe(false)
  })
})
