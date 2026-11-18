import type { Workspace } from './types'

export const workspaces: Workspace[] = [
  {
    id: 'ws-hq',
    name: '华东总部贸易有限公司',
    plan: '专业版',
    members: 46,
    pendingTasks: 9,
    monthlyPurchase: [182, 196, 174, 231, 208, 245, 268, 251, 289, 312, 298, 334],
    monthlySales: [210, 225, 198, 246, 238, 262, 281, 274, 305, 322, 318, 356],
    monthlyReceivables: [860, 902, 884, 931, 958, 987, 1012, 1048, 1086, 1120, 1168, 1206],
    trendPct: 12.4,
    updatedAt: '2026-11-17 18:42'
  },
  {
    id: 'ws-south',
    name: '华南采购中心（深圳）',
    plan: '标准版',
    members: 21,
    pendingTasks: 4,
    monthlyPurchase: [96, 112, 104, 121, 118, 133, 141, 138, 152, 161, 158, 172],
    monthlySales: [110, 126, 118, 139, 132, 148, 156, 151, 168, 176, 171, 189],
    monthlyReceivables: [420, 438, 452, 466, 481, 495, 512, 528, 541, 558, 572, 590],
    trendPct: 8.7,
    updatedAt: '2026-11-17 17:20'
  },
  {
    id: 'ws-retail',
    name: '社区零售事业部（杭州试运营）',
    plan: '标准版',
    members: 12,
    pendingTasks: 3,
    monthlyPurchase: [28, 31, 26, 37, 34, 42, 39, 46, 51, 48, 56, 61],
    monthlySales: [34, 38, 31, 44, 41, 49, 47, 53, 58, 55, 63, 69],
    monthlyReceivables: [120, 128, 134, 141, 148, 156, 162, 168, 174, 181, 188, 196],
    trendPct: 15.2,
    updatedAt: '2026-11-17 16:05'
  }
]

export const currentWorkspaceId = 'ws-hq'
