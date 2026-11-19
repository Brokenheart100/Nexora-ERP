import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { assistantReplies } from '../app/mocks'
import { useAssistantStore } from '../app/stores/assistant'
import { useDeviceAuthStore } from '../app/stores/deviceAuth'
import { useSessionStore } from '../app/stores/session'

describe('C22 账户安全与设备授权', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('切换身份同步角色、会话、附加验证与注销预检', () => {
    const session = useSessionStore()
    expect(session.profileKey).toBe('zhang')
    expect(session.user.roleLabel).toBe('所有者')
    expect(session.activeSessions).toHaveLength(3)
    expect(session.currentSession?.status).toBe('expiring')
    expect(session.currentSession?.expiresInMinutes).toBe(18)

    session.extendCurrentSession()
    expect(session.currentSession?.expiresInMinutes).toBe(48)
    expect(session.currentSession?.status).toBe('active')
    expect(session.currentSession?.expiresAt).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/)

    expect(session.revokeSession('session-current')).toBe(false)
    expect(session.revokeSession('session-phone')).toBe(true)
    expect(session.revokeSession('session-phone')).toBe(false)
    expect(session.activeSessions).toHaveLength(2)

    session.switchIdentity('chen')
    expect(session.user.name).toBe('陈立')
    expect(session.user.roleLabel).toBe('管理员')
    expect(session.can('finance.post')).toBe(false)
    expect(session.currentSession?.expiresInMinutes).toBe(185)
    expect(session.activeSessions).toHaveLength(2)
    expect(session.stepUpVerified).toBe(false)
    expect(session.verifyStepUp()).toBe(true)
    expect(session.stepUpVerified).toBe(true)

    session.switchIdentity('wang')
    expect(session.can('finance.view')).toBe(false)
    expect(session.user.mfaEnabled).toBe(false)
    expect(session.verifyStepUp()).toBe(false)
    expect(session.activeSessions).toHaveLength(1)
  })

  it('设备授权按待确认、同意、拒绝、过期和撤销处理', () => {
    const device = useDeviceAuthStore()
    expect(device.lookup('  nxr4-8q2p  ').ok).toBe(true)
    expect(device.selected?.id).toBe('auth-cli-pending')
    expect(device.selected?.scopes).toHaveLength(1)
    expect(device.selected?.scopes.every(scope => scope.id.endsWith(':read'))).toBe(true)

    expect(device.approve().ok).toBe(true)
    expect(device.selected?.status).toBe('approved')
    expect(device.approve().ok).toBe(false)
    expect(device.revoke().ok).toBe(true)
    expect(device.selected?.status).toBe('revoked')

    expect(device.lookup('mcp7-2k9d').ok).toBe(true)
    expect(device.selected?.scopes).toHaveLength(3)
    expect(device.selected?.scopes.every(scope => scope.id.endsWith(':read'))).toBe(true)
    expect(device.deny().ok).toBe(true)
    expect(device.selected?.status).toBe('denied')

    expect(device.lookup('CLI9-0X3M').ok).toBe(false)
    expect(device.selected?.id).toBe('auth-cli-expired')
    expect(device.approve('auth-cli-expired').ok).toBe(false)
    expect(device.revoke('auth-cli-expired').ok).toBe(false)
    expect(device.lookup('unknown').message).toContain('未找到该授权码')
  })
})

describe('C23 助手会话与工具审批', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('本地分片输出可取消并从中断位置恢复', () => {
    const assistant = useAssistantStore()
    assistant.send('生成本月经营摘要，并说明数据截止日期。')
    expect(assistant.isStreaming).toBe(true)
    expect(assistant.messages.at(-1)?.status).toBe('streaming')

    vi.advanceTimersByTime(90)
    expect(assistant.messages.at(-1)?.content.length).toBeGreaterThan(0)
    assistant.cancel()
    expect(assistant.isStreaming).toBe(false)
    expect(assistant.canResume).toBe(true)
    expect(assistant.messages.at(-1)?.status).toBe('cancelled')

    assistant.resume()
    expect(assistant.isStreaming).toBe(true)
    vi.advanceTimersByTime(5000)
    expect(assistant.isStreaming).toBe(false)
    expect(assistant.canResume).toBe(false)
    expect(assistant.messages.at(-1)?.content).toBe(assistantReplies.summary?.text)
    expect(assistant.messages.at(-1)?.status).toBe('complete')
  })

  it('允许工具后写入只读结果与跳转，拒绝工具不读取数据', () => {
    const assistant = useAssistantStore()
    const balances = assistant.sessions.flatMap(session => session.messages).find(message => message.tool?.id === 'tool-balances')
    expect(balances?.tool?.status).toBe('pending')

    assistant.approveTool('tool-balances')
    expect(balances?.tool?.status).toBe('approved')
    expect(balances?.tool?.resultLines).toHaveLength(4)
    expect(balances?.tool?.links?.map(link => link.to)).toContain('/finance?tab=reporting')
    expect(assistant.activeSession?.messages.at(-1)?.content).toContain('工具已执行')

    assistant.approveTool('tool-balances')
    assistant.denyTool('tool-balances')
    expect(balances?.tool?.status).toBe('approved')

    assistant.selectSession('as-aging')
    assistant.denyTool('tool-aging')
    const aging = assistant.sessions.flatMap(session => session.messages).find(message => message.tool?.id === 'tool-aging')
    expect(aging?.tool?.status).toBe('denied')
    expect(aging?.tool?.resultLines?.[0]).toContain('未读取任何数据')
    expect(aging?.tool?.links).toHaveLength(0)
  })
})
