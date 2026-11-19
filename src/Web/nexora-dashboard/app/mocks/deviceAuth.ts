export type DeviceClientType = 'cli' | 'mcp'
export type DeviceAuthorizationStatus = 'pending' | 'approved' | 'denied' | 'expired' | 'revoked'

export interface DeviceScope {
  id: string
  label: string
  detail: string
}

export interface DeviceAuthorization {
  id: string
  code: string
  clientType: DeviceClientType
  clientName: string
  clientDetail: string
  device: string
  location: string
  requestedAt: string
  expiresAt: string
  status: DeviceAuthorizationStatus
  scopes: DeviceScope[]
  approvedAt?: string
  deniedAt?: string
  revokedAt?: string
  note?: string
}

const workspaceRead: DeviceScope = {
  id: 'workspaces:read',
  label: '读取工作区列表',
  detail: '只读当前账户可访问的工作区名称与套餐，不包含单据内容。'
}
const financeRead: DeviceScope = {
  id: 'finance:read',
  label: '读取财务数据',
  detail: '只读科目、凭证与余额；不能创建、过账或修改任何单据。'
}
const ledgerRead: DeviceScope = {
  id: 'ledger:read',
  label: '读取总账与明细',
  detail: '只读总账分录与科目明细，用于核对余额。'
}
const reportRead: DeviceScope = {
  id: 'reports:read',
  label: '读取报表与导出状态',
  detail: '只读四表、账龄与导出记录，不触发新的导出任务。'
}

export const deviceAuthorizations: DeviceAuthorization[] = [
  {
    id: 'auth-cli-pending',
    code: 'NXR4-8Q2P',
    clientType: 'cli',
    clientName: 'Nexora CLI',
    clientDetail: 'nexora-cli 0.8.2 · 设备登录',
    device: 'MacBook Pro 14"',
    location: '上海 · 210.22.18.44',
    requestedAt: '2026-11-19 17:35',
    expiresAt: '2026-11-19 18:10',
    status: 'pending',
    scopes: [workspaceRead]
  },
  {
    id: 'auth-mcp-pending',
    code: 'MCP7-2K9D',
    clientType: 'mcp',
    clientName: 'Claude Desktop · MCP',
    clientDetail: 'MCP 客户端 · 财务只读工具',
    device: 'MacBook Pro 14"',
    location: '上海 · 210.22.18.44',
    requestedAt: '2026-11-19 17:42',
    expiresAt: '2026-11-19 18:25',
    status: 'pending',
    scopes: [financeRead, ledgerRead, reportRead]
  },
  {
    id: 'auth-mcp-approved',
    code: 'MCP2-8H4R',
    clientType: 'mcp',
    clientName: 'Claude Desktop · MCP',
    clientDetail: 'MCP 客户端 · 财务只读工具',
    device: 'ThinkPad X1 Carbon',
    location: '上海 · 210.22.18.61',
    requestedAt: '2026-11-18 14:08',
    expiresAt: '2026-11-25 14:20',
    status: 'approved',
    scopes: [financeRead],
    approvedAt: '2026-11-18 14:20'
  },
  {
    id: 'auth-cli-expired',
    code: 'CLI9-0X3M',
    clientType: 'cli',
    clientName: 'Nexora CLI',
    clientDetail: 'nexora-cli 0.8.2 · 设备登录',
    device: 'Windows 11 工作站',
    location: '杭州 · 122.224.67.9',
    requestedAt: '2026-11-17 16:05',
    expiresAt: '2026-11-17 16:20',
    status: 'expired',
    scopes: [workspaceRead],
    note: '授权码在 15 分钟内未确认，已自动失效。请重新运行 nexora-cli login。'
  },
  {
    id: 'auth-cli-denied',
    code: 'CLI3-6B1N',
    clientType: 'cli',
    clientName: 'Nexora CLI',
    clientDetail: 'nexora-cli 0.8.1 · 设备登录',
    device: '旧款 ThinkPad',
    location: '南京 · 49.77.18.3',
    requestedAt: '2026-11-16 10:12',
    expiresAt: '2026-11-16 10:27',
    status: 'denied',
    scopes: [workspaceRead],
    deniedAt: '2026-11-16 10:14',
    note: '本次请求已被拒绝，设备未获得任何令牌。'
  }
]

export const deviceAuthStatusLabels: Record<DeviceAuthorizationStatus, string> = {
  pending: '等待确认',
  approved: '已授权',
  denied: '已拒绝',
  expired: '已过期',
  revoked: '已撤销'
}

export const deviceAuthStatusColors: Record<DeviceAuthorizationStatus, 'warning' | 'success' | 'neutral' | 'error'> = {
  pending: 'warning',
  approved: 'success',
  denied: 'neutral',
  expired: 'error',
  revoked: 'neutral'
}

export const deviceClientLabels: Record<DeviceClientType, string> = {
  cli: 'CLI',
  mcp: 'MCP'
}
