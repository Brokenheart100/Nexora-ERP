export const runtimeStates = ['running', 'starting', 'updating', 'maintenance'] as const

export type RuntimeState = (typeof runtimeStates)[number]

export interface RuntimeStatus {
  state: RuntimeState
  message: string
  since: string
  checkedAt: string
}

export interface RuntimeBuildInfo {
  version: string
  buildId: string
  startedAt: string
  environment: string
}

export const versionSnoozeMs = 30 * 60 * 1000

const maxMessageLength = 300

export function isRuntimeState(value: unknown): value is RuntimeState {
  return typeof value === 'string' && (runtimeStates as readonly string[]).includes(value)
}

function toIso(value: unknown, fallback: number): string {
  if (typeof value === 'string') {
    const parsed = Date.parse(value)
    if (!Number.isNaN(parsed)) return new Date(parsed).toISOString()
  }
  return new Date(fallback).toISOString()
}

function toText(value: unknown, limit: number): string {
  return typeof value === 'string' ? value.trim().slice(0, limit) : ''
}

export function parseRuntimeStatus(value: unknown, now = Date.now()): RuntimeStatus {
  const record = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  return {
    state: isRuntimeState(record.state) ? record.state : 'running',
    message: toText(record.message, maxMessageLength),
    since: toIso(record.since, now),
    checkedAt: toIso(record.checkedAt, now),
  }
}

export function parseBuildInfo(value: unknown): RuntimeBuildInfo | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  const version = toText(record.version, 80)
  const buildId = toText(record.buildId, 160)
  if (!version || !buildId) return null
  return {
    version,
    buildId,
    startedAt: toIso(record.startedAt, Date.now()),
    environment: toText(record.environment, 40),
  }
}

export function isRuntimeBlocked(status: RuntimeStatus): boolean {
  return status.state !== 'running'
}

export function runtimeStateKey(state: RuntimeState, part: 'title' | 'body'): string {
  return 'runtime.states.' + state + '.' + part
}

export function isNewBuild(initial: RuntimeBuildInfo | null, latest: RuntimeBuildInfo | null): boolean {
  return Boolean(initial?.buildId && latest?.buildId && initial.buildId !== latest.buildId)
}
