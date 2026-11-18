import type { RecentDocument, Todo } from './types'

export const todos: Todo[] = [
  { id: 't-1', workspaceId: 'ws-hq', title: '审批 PO-2026-0516 年度框架补充订单', due: '今天 17:00', priority: 'high', group: 'approval', done: false },
  { id: 't-2', workspaceId: 'ws-hq', title: '核对 PO-2026-0512 包装材料交期', due: '今天 18:00', priority: 'medium', group: 'approval', done: false },
  { id: 't-3', workspaceId: 'ws-hq', title: '确认 11 月办公用品预算执行情况', due: '明天', priority: 'medium', group: 'draft', done: false },
  { id: 't-4', workspaceId: 'ws-hq', title: '整理供应商年度评估材料', due: '11-20', priority: 'low', group: 'overdue', done: false },
  { id: 't-5', workspaceId: 'ws-hq', title: '归档 10 月采购合同与发票', due: '已完成', priority: 'low', group: 'draft', done: true },
  { id: 't-6', workspaceId: 'ws-south', title: '补充 PO-2026-0515 预算科目', due: '今天 16:30', priority: 'high', group: 'approval', done: false },
  { id: 't-7', workspaceId: 'ws-south', title: '跟踪深圳仓库首批到货', due: '明天', priority: 'medium', group: 'draft', done: false },
  { id: 't-8', workspaceId: 'ws-retail', title: '确认门店陈列物料需求', due: '11-19', priority: 'medium', group: 'approval', done: false },
  { id: 't-9', workspaceId: 'ws-retail', title: '提交试运营采购复盘', due: '11-22', priority: 'low', group: 'draft', done: false }
]

export const recentDocuments: RecentDocument[] = [
  { id: 'PO-2026-0514', workspaceId: 'ws-hq', type: '采购订单', title: '杭州安泰劳保用品有限公司', status: '部分入库', amount: 14400, at: '11-13 16:42' },
  { id: 'GR-2026-1026', workspaceId: 'ws-hq', type: '采购入库', title: '苏州精工电子有限公司', status: '已入库', amount: 63210, at: '11-13 14:18' },
  { id: 'INV-2026-8831', workspaceId: 'ws-hq', type: '采购发票', title: '宁波华翔包装材料有限公司', status: '已确认', amount: 22840, at: '11-13 11:05' },
  { id: 'PAY-2026-0915', workspaceId: 'ws-hq', type: '付款单', title: '苏州精工电子有限公司', status: '已付款', amount: 63210, at: '11-12 17:30' },
  { id: 'PO-2026-0512', workspaceId: 'ws-hq', type: '采购订单', title: '宁波华翔包装材料有限公司', status: '待审批', amount: 39168, at: '11-12 09:12' },
  { id: 'PO-2026-0515', workspaceId: 'ws-south', type: '采购订单', title: '深圳市恒通办公设备有限公司', status: '草稿', amount: 10296, at: '11-12 08:40' },
  { id: 'PO-2026-0518', workspaceId: 'ws-retail', type: '采购订单', title: '杭州安泰劳保用品有限公司', status: '已取消', amount: 1470, at: '11-11 15:20' },
  { id: 'SO-2026-9001', workspaceId: 'ws-hq', type: '销售订单', title: '杭州云杉科技有限公司', status: '部分履约', amount: 86400, at: '11-13 17:05' },
  { id: 'SO-2026-9004', workspaceId: 'ws-hq', type: '销售订单', title: '上海启明办公设备有限公司', status: '待审批', amount: 52360, at: '11-12 15:28' },
  { id: 'INV-2026-0081', workspaceId: 'ws-hq', type: '采购发票', title: '杭州云杉科技有限公司', status: '已收款', amount: 128400, at: '11-10 09:40' },
  { id: 'INV-2026-0084', workspaceId: 'ws-hq', type: '采购发票', title: '无锡恒信实业有限公司', status: '已逾期', amount: 63200, at: '10-29 10:15' }
]
