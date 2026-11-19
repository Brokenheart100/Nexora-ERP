import { defineStore } from 'pinia'
import type { DeviceAuthorization } from '~/mocks'
import { deviceAuthorizations } from '~/mocks'

function cloneAuths() {
  return deviceAuthorizations.map(item => ({ ...item, scopes: item.scopes.map(scope => ({ ...scope })) }))
}

/**
 * CLI 与 MCP 共用一套设备授权状态。所有确认、拒绝与撤销均为本地演示。
 */
export const useDeviceAuthStore = defineStore('deviceAuth', () => {
  const authorizations = ref<DeviceAuthorization[]>(cloneAuths())
  const selectedId = ref('auth-cli-pending')
  const selected = computed(() => authorizations.value.find(item => item.id === selectedId.value) ?? null)
  const examples = computed(() => authorizations.value)

  function select(id: string) {
    if (authorizations.value.some(item => item.id === id)) selectedId.value = id
  }

  function findByCode(code: string) {
    const normalized = code.trim().toUpperCase()
    if (!normalized) return null
    return authorizations.value.find(item => item.code === normalized) ?? null
  }

  function lookup(code: string) {
    const found = findByCode(code)
    if (!found) return { ok: false as const, message: '未找到该授权码，请核对设备上显示的 8 位代码。' }
    selectedId.value = found.id
    if (found.status === 'expired') return { ok: false as const, message: found.note ?? '授权码已过期。' }
    if (found.status === 'revoked') return { ok: false as const, message: '该设备的授权已撤销，请重新发起设备登录。' }
    return { ok: true as const, message: '已找到授权请求。' }
  }

  function approve(id = selectedId.value) {
    const target = authorizations.value.find(item => item.id === id)
    if (!target) return { ok: false as const, message: '授权请求不存在。' }
    if (target.status === 'expired') return { ok: false as const, message: target.note ?? '授权码已过期。' }
    if (target.status !== 'pending') return { ok: false as const, message: '该请求已处理，不能重复确认。' }
    target.status = 'approved'
    target.approvedAt = '2026-11-19 17:52'
    target.note = target.clientType === 'cli'
      ? 'CLI 已获得工作区只读范围，可在终端继续操作。'
      : 'MCP 客户端已获得财务只读范围，工具调用仍需在会话中逐次审批。'
    return { ok: true as const, message: target.note }
  }

  function deny(id = selectedId.value) {
    const target = authorizations.value.find(item => item.id === id)
    if (!target) return { ok: false as const, message: '授权请求不存在。' }
    if (target.status !== 'pending') return { ok: false as const, message: '该请求已处理，不能再次拒绝。' }
    target.status = 'denied'
    target.deniedAt = '2026-11-19 17:52'
    target.note = '已拒绝本次请求，设备不会获得令牌。'
    return { ok: true as const, message: target.note }
  }

  function revoke(id = selectedId.value) {
    const target = authorizations.value.find(item => item.id === id)
    if (!target) return { ok: false as const, message: '授权记录不存在。' }
    if (target.status !== 'approved') return { ok: false as const, message: '只有已授权的设备可以撤销。' }
    target.status = 'revoked'
    target.revokedAt = '2026-11-19 17:52'
    target.note = '已撤销设备令牌；设备下一次请求会被拒绝。'
    return { ok: true as const, message: target.note }
  }

  function reset() {
    authorizations.value = cloneAuths()
    selectedId.value = 'auth-cli-pending'
  }

  return { authorizations, selectedId, selected, examples, select, findByCode, lookup, approve, deny, revoke, reset }
})
