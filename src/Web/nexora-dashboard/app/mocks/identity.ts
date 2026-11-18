import type { DemoSession, DemoUser } from './types'

/**
 * 纯 UI 阶段的演示身份：账户菜单与安全设置都从这里读取，
 * 不发起任何认证请求，刷新后恢复初始值。
 */
export const demoUser: DemoUser = {
  id: 'user-demo-001',
  name: '张明远',
  title: '采购经理',
  email: 'mingyuan.zhang@nexora.demo',
  avatarIcon: 'i-carbon-user-avatar',
  mfaEnabled: true,
  lastLoginAt: '2026-11-17 23:41'
}

export const demoSessions: DemoSession[] = [
  {
    id: 'session-current',
    device: 'MacBook Pro 14"',
    browser: 'Edge 143 · macOS 15',
    location: '上海 · 210.22.18.44',
    lastActiveAt: '当前会话',
    current: true
  },
  {
    id: 'session-phone',
    device: 'iPhone 16 Pro',
    browser: 'Safari · iOS 19',
    location: '上海 · 117.136.0.18',
    lastActiveAt: '2026-11-17 21:08',
    current: false
  },
  {
    id: 'session-office',
    device: 'Windows 11 工作站',
    browser: 'Chrome 142 · Windows 11',
    location: '杭州 · 122.224.67.9',
    lastActiveAt: '2026-11-15 09:26',
    current: false
  }
]
