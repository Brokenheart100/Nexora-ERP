import type { DemoSession, Permission } from './types'

export type SecurityRole = 'owner' | 'admin' | 'finance' | 'viewer'

export interface SecurityLoginChannel {
  id: string
  label: string
  detail: string
  state: 'enabled' | 'pending' | 'unavailable'
  icon: string
}

export interface SecurityDeletionCheck {
  id: string
  label: string
  detail: string
  state: 'pass' | 'blocked'
  actionTo?: string
  actionLabel?: string
}

export interface SecurityProfile {
  key: string
  name: string
  title: string
  email: string
  avatarIcon: string
  mfaEnabled: boolean
  lastLoginAt: string
  role: SecurityRole
  roleLabel: string
  permissions: Permission[]
  sessions: DemoSession[]
  channels: SecurityLoginChannel[]
  mfaMethods: string[]
  stepUpVerified: boolean
  stepUpDetail: string
  deletionChecks: SecurityDeletionCheck[]
}

const ownerPermissions: Permission[] = [
  'dashboard.view',
  'catalog.view',
  'catalog.edit',
  'purchase.view',
  'purchase.create',
  'purchase.approve',
  'sales.view',
  'sales.create',
  'inventory.view',
  'inventory.adjust',
  'finance.view',
  'finance.post',
  'settings.view',
  'settings.manage'
]

const adminPermissions: Permission[] = ownerPermissions.filter(permission => permission !== 'finance.post')

const salesPermissions: Permission[] = [
  'dashboard.view',
  'catalog.view',
  'sales.view',
  'sales.create',
  'inventory.view',
  'settings.view'
]

const channels: SecurityLoginChannel[] = [
  { id: 'password', label: '账户密码', detail: '已设置 · 92 天前更新', state: 'enabled', icon: 'i-carbon-password' },
  { id: 'sso', label: '企业 SSO', detail: '已绑定 Azure AD · 华东总部', state: 'enabled', icon: 'i-carbon-enterprise' },
  { id: 'passkey', label: '通行密钥', detail: '2 个密钥 · 本机与 iPhone', state: 'enabled', icon: 'i-carbon-fingerprint-recognition' },
  { id: 'recovery', label: '恢复邮箱', detail: '待验证新的备用邮箱', state: 'pending', icon: 'i-carbon-email' }
]

export const securityProfiles: SecurityProfile[] = [
  {
    key: 'zhang',
    name: '张明远',
    title: '采购经理 · 工作区所有者',
    email: 'mingyuan.zhang@nexora.demo',
    avatarIcon: 'i-carbon-user-avatar',
    mfaEnabled: true,
    lastLoginAt: '2026-11-19 09:41',
    role: 'owner',
    roleLabel: '所有者',
    permissions: ownerPermissions,
    sessions: [
      {
        id: 'session-current',
        device: 'MacBook Pro 14"',
        browser: 'Edge 143 · macOS 15',
        location: '上海 · 210.22.18.44',
        loginAt: '2026-11-19 09:41',
        lastActiveAt: '当前会话',
        expiresAt: '2026-11-19 18:08',
        expiresInMinutes: 18,
        status: 'expiring',
        current: true
      },
      {
        id: 'session-phone',
        device: 'iPhone 16 Pro',
        browser: 'Safari · iOS 19',
        location: '上海 · 117.136.0.18',
        loginAt: '2026-11-18 20:12',
        lastActiveAt: '2026-11-19 08:18',
        expiresAt: '2026-11-26 20:12',
        expiresInMinutes: 10068,
        status: 'active',
        current: false
      },
      {
        id: 'session-office',
        device: 'Windows 11 工作站',
        browser: 'Chrome 142 · Windows 11',
        location: '杭州 · 122.224.67.9',
        loginAt: '2026-11-16 09:10',
        lastActiveAt: '2026-11-18 17:46',
        expiresAt: '2026-11-23 09:10',
        expiresInMinutes: 5419,
        status: 'active',
        current: false
      }
    ],
    channels,
    mfaMethods: ['TOTP 验证器', '通行密钥'],
    stepUpVerified: true,
    stepUpDetail: '6 分钟前完成验证 · 修改付款账户与导出全量数据时要求附加验证',
    deletionChecks: [
      { id: 'owner', label: '工作区所有权', detail: '当前账户是华东总部唯一所有者；需先指定新的所有者。', state: 'blocked', actionTo: '/settings?tab=members', actionLabel: '转让所有权' },
      { id: 'subscription', label: '有效订阅', detail: '专业版年付服务持续到 2026-12-07，注销会终止未到期权益。', state: 'blocked', actionTo: '/settings?tab=billing', actionLabel: '查看订阅' },
      { id: 'billing', label: '未结清账单', detail: 'BILL-2026-0009 待支付 542.47 元。', state: 'blocked', actionTo: '/settings?tab=billing', actionLabel: '处理账单' },
      { id: 'retention', label: '数据保留与审计', detail: '61 张已过账凭证、44 条审计记录仍在 180 天保留期内。', state: 'blocked' }
    ]
  },
  {
    key: 'chen',
    name: '陈立',
    title: '业务主管',
    email: 'li.chen@nexora.demo',
    avatarIcon: 'i-carbon-user-avatar',
    mfaEnabled: true,
    lastLoginAt: '2026-11-19 08:55',
    role: 'admin',
    roleLabel: '管理员',
    permissions: adminPermissions,
    sessions: [
      {
        id: 'session-current',
        device: 'ThinkPad X1 Carbon',
        browser: 'Chrome 142 · Windows 11',
        location: '上海 · 210.22.18.61',
        loginAt: '2026-11-19 08:55',
        lastActiveAt: '当前会话',
        expiresAt: '2026-11-19 20:55',
        expiresInMinutes: 185,
        status: 'active',
        current: true
      },
      {
        id: 'session-tablet',
        device: 'iPad Air',
        browser: 'Safari · iPadOS 19',
        location: '上海 · 117.136.0.44',
        loginAt: '2026-11-17 19:30',
        lastActiveAt: '2026-11-18 22:03',
        expiresAt: '2026-11-24 19:30',
        expiresInMinutes: 7205,
        status: 'active',
        current: false
      }
    ],
    channels,
    mfaMethods: ['TOTP 验证器'],
    stepUpVerified: false,
    stepUpDetail: '上次验证已超过 10 分钟 · 本次敏感操作需要重新验证',
    deletionChecks: [
      { id: 'owner', label: '工作区所有权', detail: '管理员不能发起工作区账户注销，需由所有者操作。', state: 'blocked', actionTo: '/settings?tab=members', actionLabel: '查看成员' },
      { id: 'approvals', label: '待处理审批', detail: '仍有 3 张采购单和 1 张销售订单等待独立复核。', state: 'blocked', actionTo: '/purchase-orders', actionLabel: '处理审批' },
      { id: 'subscription', label: '有效订阅', detail: '当前工作区订阅有效到 2026-12-07。', state: 'blocked', actionTo: '/settings?tab=billing', actionLabel: '查看订阅' }
    ]
  },
  {
    key: 'wang',
    name: '王倩',
    title: '销售专员',
    email: 'qian.wang@nexora.demo',
    avatarIcon: 'i-carbon-user-avatar',
    mfaEnabled: false,
    lastLoginAt: '2026-11-19 10:06',
    role: 'viewer',
    roleLabel: '成员',
    permissions: salesPermissions,
    sessions: [
      {
        id: 'session-current',
        device: 'MacBook Air 13"',
        browser: 'Safari 19 · macOS 15',
        location: '苏州 · 58.211.9.77',
        loginAt: '2026-11-19 10:06',
        lastActiveAt: '当前会话',
        expiresAt: '2026-11-19 18:36',
        expiresInMinutes: 46,
        status: 'active',
        current: true
      }
    ],
    channels: channels.map(channel => channel.id === 'passkey'
      ? { ...channel, detail: '未启用', state: 'unavailable' as const }
      : channel),
    mfaMethods: [],
    stepUpVerified: false,
    stepUpDetail: '当前账户未启用 MFA；敏感操作会被阻止，需先绑定验证器',
    deletionChecks: [
      { id: 'owner', label: '工作区所有权', detail: '成员只能由所有者移除；不能自行注销工作区账户。', state: 'blocked' },
      { id: 'documents', label: '经办单据', detail: '仍有 2 张销售订单处于草稿状态，需先取消或转交。', state: 'blocked', actionTo: '/sales', actionLabel: '查看单据' },
      { id: 'mfa', label: '身份验证', detail: '账户未启用 MFA，注销前必须完成身份验证。', state: 'blocked' }
    ]
  }
]

export function securityProfileByKey(key: string) {
  return securityProfiles.find(profile => profile.key === key) ?? securityProfiles[0]!
}

export const loginChannelStateLabels: Record<SecurityLoginChannel['state'], string> = {
  enabled: '已启用',
  pending: '待验证',
  unavailable: '未启用'
}

export const loginChannelStateColors: Record<SecurityLoginChannel['state'], 'success' | 'warning' | 'neutral'> = {
  enabled: 'success',
  pending: 'warning',
  unavailable: 'neutral'
}

export const securityRoleLabels: Record<SecurityRole, string> = {
  owner: '所有者',
  admin: '管理员',
  finance: '财务',
  viewer: '成员'
}
