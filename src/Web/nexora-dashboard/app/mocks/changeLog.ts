import type { ChangeEntityType, ChangeEntry } from './types'

// 商品、伙伴、采购/销售单与发票共用的模拟变更记录（B3 变更记录页；工作台最近动态也读取这里）。
export const changeLogEntries: ChangeEntry[] = [
  { id: 'chg-001', workspaceId: 'ws-hq', entityType: 'purchase-order', entityId: 'PO-2026-0514', entityName: 'PO-2026-0514', action: '收货', actor: '张明远', summary: '登记 4 行商品部分到货，收货数量 60。', at: '2026-11-17 18:42' },
  { id: 'chg-002', workspaceId: 'ws-hq', entityType: 'product', entityId: 'p-1005', entityName: '惠普 LaserJet 硒鼓 CF280A', action: '库存预警', actor: '系统', summary: '库存低于演示阈值 30，已生成库存提醒。', at: '2026-11-17 17:10' },
  { id: 'chg-003', workspaceId: 'ws-hq', entityType: 'partner', entityId: 'pt-1002', entityName: '苏州精工电子有限公司', action: '更新', actor: '李雯', summary: '更新联系人、电话与开票信息。', at: '2026-11-17 16:05' },
  { id: 'chg-004', workspaceId: 'ws-hq', entityType: 'sales-order', entityId: 'SO-2026-9003', entityName: 'SO-2026-9003', action: '提交审批', actor: '王倩', summary: '提交销售订单审批，金额 ¥86,400.00。', at: '2026-11-17 14:26' },
  { id: 'chg-005', workspaceId: 'ws-hq', entityType: 'invoice', entityId: 'INV-2026-0083', entityName: 'INV-2026-0083', action: '开具', actor: '王倩', summary: '为客户杭州云杉开具增值税专用发票。', at: '2026-11-17 11:32' },
  { id: 'chg-006', workspaceId: 'ws-hq', entityType: 'purchase-order', entityId: 'PO-2026-0516', entityName: 'PO-2026-0516', action: '提交审批', actor: '张明远', summary: '年度框架补充订单提交审批，共 12 行明细。', at: '2026-11-17 10:18' },
  { id: 'chg-007', workspaceId: 'ws-hq', entityType: 'product', entityId: 'p-1001', entityName: 'ThinkPad E14 商务笔记本电脑', action: '更新', actor: '李雯', summary: '调整销售单价与商品分类。', at: '2026-11-16 17:44' },
  { id: 'chg-008', workspaceId: 'ws-south', entityType: 'purchase-order', entityId: 'PO-2026-0512', entityName: 'PO-2026-0512', action: '审批', actor: '陈昊', summary: '审批通过包装材料采购订单。', at: '2026-11-16 15:20' },
  { id: 'chg-009', workspaceId: 'ws-hq', entityType: 'partner', entityId: 'pt-1001', entityName: '宁波华翔包装材料有限公司', action: '创建', actor: '张明远', summary: '新增供应商伙伴档案。', at: '2026-11-16 11:08' },
  { id: 'chg-010', workspaceId: 'ws-hq', entityType: 'product', entityId: 'p-1012', entityName: 'A4 复印纸 70g（500 张/包）', action: '归档', actor: '李雯', summary: '停止销售并归档商品。', at: '2026-11-15 17:02' },
  { id: 'chg-011', workspaceId: 'ws-hq', entityType: 'sales-order', entityId: 'SO-2026-9001', entityName: 'SO-2026-9001', action: '履约', actor: '王倩', summary: '登记 3 行商品发货，状态更新为部分履约。', at: '2026-11-15 14:36' },
  { id: 'chg-012', workspaceId: 'ws-hq', entityType: 'purchase-order', entityId: 'PO-2026-0511', entityName: 'PO-2026-0511', action: '关闭', actor: '张明远', summary: '全部明细已收货，采购订单关闭。', at: '2026-11-15 10:12' },
  { id: 'chg-013', workspaceId: 'ws-retail', entityType: 'product', entityId: 'p-2003', entityName: '门店陈列价签纸', action: '恢复', actor: '周敏', summary: '从归档状态恢复为在售。', at: '2026-11-14 18:25' },
  { id: 'chg-014', workspaceId: 'ws-hq', entityType: 'definition', entityId: 'cat-03', entityName: '包装材料', action: '更新', actor: '李雯', summary: '更新分类说明与默认计量单位。', at: '2026-11-14 16:40' },
  { id: 'chg-015', workspaceId: 'ws-hq', entityType: 'partner', entityId: 'pt-1004', entityName: '杭州安泰劳保用品有限公司', action: '更新', actor: '张明远', summary: '补充统一社会信用代码与银行账号。', at: '2026-11-14 14:18' },
  { id: 'chg-016', workspaceId: 'ws-south', entityType: 'sales-order', entityId: 'SO-2026-9006', entityName: 'SO-2026-9006', action: '创建', actor: '陈昊', summary: '创建深圳客户销售订单草稿。', at: '2026-11-14 11:06' },
  { id: 'chg-017', workspaceId: 'ws-hq', entityType: 'invoice', entityId: 'INV-2026-0081', entityName: 'INV-2026-0081', action: '回款', actor: '系统', summary: '登记客户回款，发票状态更新为已收款。', at: '2026-11-13 17:55' },
  { id: 'chg-018', workspaceId: 'ws-hq', entityType: 'purchase-order', entityId: 'PO-2026-0513', entityName: 'PO-2026-0513', action: '创建', actor: '张明远', summary: '创建办公设备采购订单草稿。', at: '2026-11-13 15:32' },
  { id: 'chg-019', workspaceId: 'ws-hq', entityType: 'product', entityId: 'p-1008', entityName: '罗技 MX Master 3S 无线鼠标', action: '更新', actor: '李雯', summary: '更新库存与采购参考价。', at: '2026-11-13 11:20' },
  { id: 'chg-020', workspaceId: 'ws-retail', entityType: 'partner', entityId: 'pt-1009', entityName: '杭州邻里社区服务中心', action: '创建', actor: '周敏', summary: '新增捐赠人档案，用于社区公益领用。', at: '2026-11-12 18:04' },
  { id: 'chg-021', workspaceId: 'ws-hq', entityType: 'purchase-order', entityId: 'PO-2026-0518', entityName: 'PO-2026-0518', action: '取消', actor: '张明远', summary: '供应商交期无法满足，取消采购订单。', at: '2026-11-12 16:10' },
  { id: 'chg-022', workspaceId: 'ws-hq', entityType: 'sales-order', entityId: 'SO-2026-9008', entityName: 'SO-2026-9008', action: '审批', actor: '王倩', summary: '审批通过销售订单，金额 ¥128,400.00。', at: '2026-11-12 13:42' },
  { id: 'chg-023', workspaceId: 'ws-hq', entityType: 'definition', entityId: 'unit-02', entityName: '盒', action: '创建', actor: '李雯', summary: '新增计量单位「盒」，精度 0。', at: '2026-11-12 10:15' },
  { id: 'chg-024', workspaceId: 'ws-hq', entityType: 'product', entityId: 'p-1018', entityName: '晨光中性笔 0.5mm（12 支/盒）', action: '创建', actor: '李雯', summary: '新增办公耗材商品。', at: '2026-11-11 17:28' },
  { id: 'chg-025', workspaceId: 'ws-south', entityType: 'purchase-order', entityId: 'PO-2026-0515', entityName: 'PO-2026-0515', action: '提交审批', actor: '陈昊', summary: '提交办公设备采购单审批。', at: '2026-11-11 15:06' },
  { id: 'chg-026', workspaceId: 'ws-hq', entityType: 'partner', entityId: 'pt-1006', entityName: '上海启明办公设备有限公司', action: '停用', actor: '张明远', summary: '年度评估未通过，停用供应商档案。', at: '2026-11-11 11:48' },
  { id: 'chg-027', workspaceId: 'ws-hq', entityType: 'purchase-order', entityId: 'PO-2026-0512', entityName: 'PO-2026-0512', action: '驳回', actor: '陈昊', summary: '审批驳回：预算科目缺失，请补充后重新提交。', at: '2026-11-10 17:12' },
  { id: 'chg-028', workspaceId: 'ws-retail', entityType: 'sales-order', entityId: 'SO-2026-9010', entityName: 'SO-2026-9010', action: '提交审批', actor: '周敏', summary: '门店物料销售订单提交审批。', at: '2026-11-10 15:40' },
  { id: 'chg-029', workspaceId: 'ws-hq', entityType: 'invoice', entityId: 'INV-2026-0085', entityName: 'INV-2026-0085', action: '开具', actor: '王倩', summary: '为客户南京远航开具增值税普通发票。', at: '2026-11-10 11:16' },
  { id: 'chg-030', workspaceId: 'ws-hq', entityType: 'product', entityId: 'p-1009', entityName: '得力 A4 文件夹（10 个/包）', action: '归档', actor: '李雯', summary: '清理停售办公耗材，归档商品。', at: '2026-11-09 16:35' },
  { id: 'chg-031', workspaceId: 'ws-hq', entityType: 'definition', entityId: 'tax-13', entityName: '销项税 13%', action: '更新', actor: '王倩', summary: '更新税码说明与适用商品范围。', at: '2026-11-09 14:02' },
  { id: 'chg-032', workspaceId: 'ws-hq', entityType: 'partner', entityId: 'pt-1003', entityName: '无锡恒信电子科技有限公司', action: '创建', actor: '张明远', summary: '新增客户档案并同步开票信息。', at: '2026-11-09 10:30' },
  { id: 'chg-033', workspaceId: 'ws-south', entityType: 'product', entityId: 'p-2005', entityName: '工业防护手套（12 双/包）', action: '创建', actor: '陈昊', summary: '新增劳保用品商品。', at: '2026-11-08 17:18' },
  { id: 'chg-034', workspaceId: 'ws-hq', entityType: 'purchase-order', entityId: 'PO-2026-0517', entityName: 'PO-2026-0517', action: '关闭', actor: '张明远', summary: '订单全部收货并完成对账后关闭。', at: '2026-11-08 14:45' },
  { id: 'chg-035', workspaceId: 'ws-hq', entityType: 'invoice', entityId: 'INV-2026-0087', entityName: 'INV-2026-0087', action: '逾期', actor: '系统', summary: '超过约定账期仍未回款，标记为逾期。', at: '2026-11-08 09:00' },
  { id: 'chg-036', workspaceId: 'ws-hq', entityType: 'partner', entityId: 'pt-1005', entityName: '深圳市恒通办公设备有限公司', action: '更新', actor: '李雯', summary: '更新联系人邮箱与账期。', at: '2026-11-07 16:24' }
]

export const changeEntityLabels: Record<ChangeEntityType, string> = {
  'product': '商品',
  'partner': '伙伴',
  'purchase-order': '采购单',
  'sales-order': '销售单',
  'invoice': '发票',
  'definition': '定义'
}
