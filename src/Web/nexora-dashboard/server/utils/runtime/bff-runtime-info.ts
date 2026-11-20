import { readFile, stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { RuntimeBuildInfo, RuntimeStatus } from '#shared/utils/runtimeStatus'
import { parseRuntimeStatus } from '#shared/utils/runtimeStatus'

const bootedAt = new Date()

function envValue(name: string): string {
  return (process.env[name] ?? '').trim()
}

/** Build identity served to browsers so an open page can detect a newer deployment. */
export function buildInfo(): RuntimeBuildInfo {
  const version = envValue('NEXORA_BUILD_VERSION') || '0.1.0-local'
  const buildId = envValue('NEXORA_BUILD_ID')
    || version + '+' + bootedAt.getTime().toString(36) + '-' + process.pid.toString(36)
  return {
    version,
    buildId,
    startedAt: bootedAt.toISOString(),
    environment: envValue('NEXORA_BUILD_ENV') || process.env.NODE_ENV || 'development'
  }
}

function envStatus(): RuntimeStatus {
  return parseRuntimeStatus({
    state: envValue('NEXORA_STATUS_STATE'),
    message: envValue('NEXORA_STATUS_MESSAGE'),
    since: bootedAt.toISOString()
  })
}

/**
 * Runtime state published by operations. The JSON file wins over environment defaults so
 * maintenance can be toggled without restarting the web server; a missing or malformed
 * file means the service expects to serve traffic.
 */
export async function runtimeStatus(): Promise<RuntimeStatus> {
  const fallback = envStatus()
  const statusFile = envValue('NEXORA_STATUS_FILE')
  if (!statusFile) return { ...fallback, checkedAt: new Date().toISOString() }
  try {
    const path = resolve(statusFile)
    const [raw, file] = await Promise.all([readFile(path, 'utf8'), stat(path)])
    const payload = JSON.parse(raw) as Record<string, unknown>
    const status = parseRuntimeStatus({ ...payload, since: payload.since ?? file.mtime.toISOString() })
    return { ...status, checkedAt: new Date().toISOString() }
  } catch {
    // Missing, unreadable or malformed status files fall back to the environment default.
    return { ...fallback, checkedAt: new Date().toISOString() }
  }
}
