import type {
  OrderStatus,
  PurchaseApprovalAction,
  PurchaseApprovalStep,
  PurchaseAuditEntry,
  PurchaseOrder,
  PurchaseReceipt
} from './types'

export const statusLabels: Record<OrderStatus, string> = {
  draft: '草稿',
  pending: '待审批',
  approved: '已审批',
  partial: '部分入库',
  received: '已入库',
  closed: '已关闭',
  cancelled: '已取消'
}

export const statusColors: Record<OrderStatus, 'neutral' | 'warning' | 'info' | 'success' | 'error'> = {
  draft: 'neutral',
  pending: 'warning',
  approved: 'info',
  partial: 'warning',
  received: 'success',
  closed: 'neutral',
  cancelled: 'error'
}

export const approvalActionLabels: Record<PurchaseApprovalAction, string> = {
  submitted: '提交审批',
  approved: '审批通过',
  rejected: '审批驳回'
}

export const approvalActionColors: Record<PurchaseApprovalAction, 'warning' | 'success' | 'error'> = {
  submitted: 'warning',
  approved: 'success',
  rejected: 'error'
}

export const purchaseOrders: PurchaseOrder[] = [
  {
    id: 'PO-2026-0511',
    workspaceId: 'ws-hq',
    supplier: '苏州精工电子有限公司',
    contact: '周明 · 138-0512-7788',
    status: 'received',
    orderedAt: '2026-11-02',
    expectedAt: '2026-11-08',
    note: '季度补货，已全部入库。',
    lines: [
      { lineNo: 1, sku: 'SKU-1006', name: 'SATA 6Gb/s 数据线 0.5m 蓝色', spec: '0.5m', quantity: 200, received: 200, unitPrice: 8.8 },
      { lineNo: 2, sku: 'SKU-1007', name: '60W USB-C 快充充电器（国标插头）', spec: '60W 国标', quantity: 60, received: 60, unitPrice: 129 },
      { lineNo: 3, sku: 'SKU-1016', name: 'Type-C 转 HDMI 4K 扩展坞（含 PD 100W）', spec: '4K/100W', quantity: 40, received: 40, unitPrice: 259 }
    ]
  },
  {
    id: 'PO-2026-0512',
    workspaceId: 'ws-hq',
    supplier: '宁波华翔包装材料有限公司',
    contact: '李颖 · 139-0574-2210',
    status: 'pending',
    orderedAt: '2026-11-09',
    expectedAt: '2026-11-16',
    note: '待财务审批，预计分批到货。',
    lines: [
      { lineNo: 1, sku: 'SKU-1004', name: '双面高密度聚乙烯（HDPE）包装袋 40×50cm 加厚', spec: '40×50cm', quantity: 20000, received: 0, unitPrice: 0.42 },
      { lineNo: 2, sku: 'SKU-1009', name: '可回收牛皮纸气泡信封袋 25×35cm', spec: '25×35cm', quantity: 8000, received: 0, unitPrice: 0.68 },
      { lineNo: 3, sku: 'SKU-1013', name: '多层瓦楞纸箱 5 层 60×40×40cm', spec: '5 层', quantity: 1200, received: 0, unitPrice: 6.5 }
    ]
  },
  {
    id: 'PO-2026-0513',
    workspaceId: 'ws-hq',
    supplier: '上海联诚办公用品有限公司',
    contact: '王倩 · 137-0216-9034',
    status: 'approved',
    orderedAt: '2026-11-10',
    expectedAt: '2026-11-17',
    note: '审批通过，等待供应商确认交期。',
    lines: [
      { lineNo: 1, sku: 'SKU-1002', name: 'A4 复印纸 70g 500 张/包', spec: '70g/500 张', quantity: 400, received: 0, unitPrice: 22.5 },
      { lineNo: 2, sku: 'SKU-1014', name: '白板笔（可擦写）黑色 10 支/盒', spec: '黑色 10 支', quantity: 60, received: 0, unitPrice: 18.9 },
      { lineNo: 3, sku: 'SKU-1017', name: '财务装订凭证热熔管 50 支/包', spec: '50 支', quantity: 30, received: 0, unitPrice: 12 }
    ]
  },
  {
    id: 'PO-2026-0514',
    workspaceId: 'ws-hq',
    supplier: '杭州安泰劳保用品有限公司',
    contact: '陈刚 · 135-0571-6677',
    status: 'partial',
    orderedAt: '2026-11-11',
    expectedAt: '2026-11-18',
    note: '首批到货 80 盒，余量待补。',
    lines: [
      { lineNo: 1, sku: 'SKU-1011', name: '一次性丁腈手套 100 只/盒 M 码', spec: 'M 码', quantity: 200, received: 80, unitPrice: 45 },
      { lineNo: 2, sku: 'SKU-1005', name: '工业级防静电手腕带（接地线 1.8m）', spec: '1.8m', quantity: 150, received: 0, unitPrice: 36 }
    ]
  },
  {
    id: 'PO-2026-0515',
    workspaceId: 'ws-south',
    supplier: '深圳市恒通办公设备有限公司',
    contact: '林小雨 · 136-0755-1122',
    status: 'draft',
    orderedAt: '2026-11-12',
    expectedAt: '2026-11-20',
    note: '上次提交被驳回：预算科目缺失，补充后可重新提交。',
    lines: [
      { lineNo: 1, sku: 'SKU-1003', name: '兄弟 DCP-B7530DN 黑白激光一体机', spec: 'A4 双面', quantity: 4, received: 0, unitPrice: 1899 },
      { lineNo: 2, sku: 'SKU-1002', name: 'A4 复印纸 70g 500 张/包', spec: '70g/500 张', quantity: 120, received: 0, unitPrice: 22.5 }
    ]
  },
  {
    id: 'PO-2026-0516',
    workspaceId: 'ws-hq',
    supplier: '东莞市锐驰五金制品有限公司',
    contact: '赵立 · 134-0769-8855',
    status: 'pending',
    orderedAt: '2026-11-12',
    expectedAt: '2026-11-21',
    note: '年度框架协议下的补充订单，明细较多，请核对规格后再审批。',
    lines: [
      { lineNo: 1, sku: 'SKU-1001', name: 'ThinkPad E14 商务笔记本电脑（i7/16G/512G）', spec: 'i7/16G/512G', quantity: 8, received: 0, unitPrice: 6299 },
      { lineNo: 2, sku: 'SKU-1010', name: '人体工学网椅（带腰托/可躺 135°）', spec: '135° 可躺', quantity: 20, received: 0, unitPrice: 1288 },
      { lineNo: 3, sku: 'SKU-1003', name: '兄弟 DCP-B7530DN 黑白激光一体机', spec: 'A4 双面', quantity: 3, received: 0, unitPrice: 1899 },
      { lineNo: 4, sku: 'SKU-1012', name: '24 口千兆非网管交换机', spec: '24 口', quantity: 4, received: 0, unitPrice: 699 },
      { lineNo: 5, sku: 'SKU-1016', name: 'Type-C 转 HDMI 4K 扩展坞（含 PD 100W）', spec: '4K/100W', quantity: 24, received: 0, unitPrice: 259 },
      { lineNo: 6, sku: 'SKU-1007', name: '60W USB-C 快充充电器（国标插头）', spec: '60W 国标', quantity: 30, received: 0, unitPrice: 129 },
      { lineNo: 7, sku: 'SKU-1006', name: 'SATA 6Gb/s 数据线 0.5m 蓝色', spec: '0.5m', quantity: 100, received: 0, unitPrice: 8.8 },
      { lineNo: 8, sku: 'SKU-1014', name: '白板笔（可擦写）黑色 10 支/盒', spec: '黑色 10 支', quantity: 40, received: 0, unitPrice: 18.9 },
      { lineNo: 9, sku: 'SKU-1017', name: '财务装订凭证热熔管 50 支/包', spec: '50 支', quantity: 20, received: 0, unitPrice: 12 },
      { lineNo: 10, sku: 'SKU-1009', name: '可回收牛皮纸气泡信封袋 25×35cm', spec: '25×35cm', quantity: 3000, received: 0, unitPrice: 0.68 },
      { lineNo: 11, sku: 'SKU-1004', name: '双面高密度聚乙烯（HDPE）包装袋 40×50cm 加厚', spec: '40×50cm', quantity: 5000, received: 0, unitPrice: 0.42 },
      { lineNo: 12, sku: 'SKU-1018', name: '高精度电子台秤 30kg/1g（带 RS232）', spec: '30kg/1g', quantity: 2, received: 0, unitPrice: 458 }
    ]
  },
  {
    id: 'PO-2026-0517',
    workspaceId: 'ws-south',
    supplier: '上海联诚办公用品有限公司',
    contact: '王倩 · 137-0216-9034',
    status: 'closed',
    orderedAt: '2026-10-28',
    expectedAt: '2026-11-03',
    note: '已结案，发票已归档。',
    lines: [
      { lineNo: 1, sku: 'SKU-1002', name: 'A4 复印纸 70g 500 张/包', spec: '70g/500 张', quantity: 200, received: 200, unitPrice: 21.8 }
    ]
  },
  {
    id: 'PO-2026-0518',
    workspaceId: 'ws-retail',
    supplier: '杭州安泰劳保用品有限公司',
    contact: '陈刚 · 135-0571-6677',
    status: 'cancelled',
    orderedAt: '2026-11-05',
    expectedAt: '2026-11-12',
    note: '门店调整陈列方案，取消采购。',
    lines: [
      { lineNo: 1, sku: 'SKU-1015', name: '无纺布防尘口罩 50 只/盒', spec: '50 只/盒', quantity: 60, received: 0, unitPrice: 24.5 }
    ]
  },
  {
    id: 'PO-2026-0520',
    workspaceId: 'ws-hq',
    supplier: '苏州精工电子有限公司',
    contact: '周明 · 138-0512-7788',
    status: 'received',
    orderedAt: '2026-11-08',
    expectedAt: '2026-11-10',
    note: 'C1 固定算例：100 条 SATA 数据线，价税合计 ¥1,130.00。',
    lines: [
      { lineNo: 1, sku: 'SKU-1006', name: 'SATA 6Gb/s 数据线 0.5m 蓝色', spec: '0.5m', quantity: 100, received: 100, unitPrice: 10 }
    ]
  }
]

/** 审批轨迹样例（B4）：按采购单号归档，模块初始化时挂到订单上。 */
const approvalTrail: Record<string, PurchaseApprovalStep[]> = {
  'PO-2026-0511': [
    { id: 'ap-0511-01', orderId: 'PO-2026-0511', action: 'submitted', actor: '张明远', at: '2026-11-02 09:15', note: '提交季度补货采购申请，共 3 行明细，金额约 ¥{{total}}。'.replace('{{total}}', '20,780.00') },
    { id: 'ap-0511-02', orderId: 'PO-2026-0511', action: 'approved', actor: '陈昊', at: '2026-11-02 14:20', note: '季度预算内，同意采购。' }
  ],
  'PO-2026-0512': [
    { id: 'ap-0512-01', orderId: 'PO-2026-0512', action: 'submitted', actor: '张明远', at: '2026-11-09 10:05', note: '提交财务审批，等待预算科目核对。' }
  ],
  'PO-2026-0513': [
    { id: 'ap-0513-01', orderId: 'PO-2026-0513', action: 'submitted', actor: '张明远', at: '2026-11-10 09:48', note: '办公用品补货，提交审批。' },
    { id: 'ap-0513-02', orderId: 'PO-2026-0513', action: 'approved', actor: '王倩', at: '2026-11-10 16:12', note: '办公用品年度预算内，同意采购。' }
  ],
  'PO-2026-0514': [
    { id: 'ap-0514-01', orderId: 'PO-2026-0514', action: 'submitted', actor: '张明远', at: '2026-11-11 09:12', note: '劳保用品补充采购，提交审批。' },
    { id: 'ap-0514-02', orderId: 'PO-2026-0514', action: 'approved', actor: '陈昊', at: '2026-11-11 15:40', note: '同意采购，允许分批到货。' }
  ],
  'PO-2026-0515': [
    { id: 'ap-0515-01', orderId: 'PO-2026-0515', action: 'submitted', actor: '陈昊', at: '2026-11-12 10:20', note: '提交办公设备采购审批。' },
    { id: 'ap-0515-02', orderId: 'PO-2026-0515', action: 'rejected', actor: '王倩', at: '2026-11-13 09:35', note: '预算科目缺失，请补充成本中心后重新提交。' }
  ],
  'PO-2026-0516': [
    { id: 'ap-0516-01', orderId: 'PO-2026-0516', action: 'submitted', actor: '张明远', at: '2026-11-12 14:10', note: '年度框架协议补充订单提交审批，共 12 行明细。' }
  ],
  'PO-2026-0517': [
    { id: 'ap-0517-01', orderId: 'PO-2026-0517', action: 'submitted', actor: '陈昊', at: '2026-10-28 09:00', note: '门店办公耗材补货，提交审批。' },
    { id: 'ap-0517-02', orderId: 'PO-2026-0517', action: 'approved', actor: '王倩', at: '2026-10-28 14:00', note: '同意采购，按标准账期结算。' }
  ],
  'PO-2026-0518': [
    { id: 'ap-0518-01', orderId: 'PO-2026-0518', action: 'submitted', actor: '周敏', at: '2026-11-05 10:35', note: '门店劳保用品采购提交审批。' }
  ],
  'PO-2026-0520': [
    { id: 'ap-0520-01', orderId: 'PO-2026-0520', action: 'submitted', actor: '张明远', at: '2026-11-08 09:20', note: 'C1 固定算例采购单，提交审批。' },
    { id: 'ap-0520-02', orderId: 'PO-2026-0520', action: 'approved', actor: '陈昊', at: '2026-11-08 14:05', note: '固定算例预算内，同意采购。' }
  ]
}

/** 收货记录样例（B4）：按采购单号归档。 */
const receiptTrail: Record<string, PurchaseReceipt[]> = {
  'PO-2026-0511': [
    {
      id: 'RC-2026-0511-01',
      orderId: 'PO-2026-0511',
      receivedAt: '2026-11-05',
      receiver: '张明远',
      lines: [
        { lineNo: 1, sku: 'SKU-1006', name: 'SATA 6Gb/s 数据线 0.5m 蓝色', quantity: 200 },
        { lineNo: 2, sku: 'SKU-1007', name: '60W USB-C 快充充电器（国标插头）', quantity: 60 },
        { lineNo: 3, sku: 'SKU-1016', name: 'Type-C 转 HDMI 4K 扩展坞（含 PD 100W）', quantity: 20 }
      ]
    },
    {
      id: 'RC-2026-0511-02',
      orderId: 'PO-2026-0511',
      receivedAt: '2026-11-06',
      receiver: '张明远',
      lines: [
        { lineNo: 3, sku: 'SKU-1016', name: 'Type-C 转 HDMI 4K 扩展坞（含 PD 100W）', quantity: 20 }
      ]
    }
  ],
  'PO-2026-0514': [
    {
      id: 'RC-2026-0514-01',
      orderId: 'PO-2026-0514',
      receivedAt: '2026-11-17',
      receiver: '张明远',
      lines: [
        { lineNo: 1, sku: 'SKU-1011', name: '一次性丁腈手套 100 只/盒 M 码', quantity: 80 }
      ]
    }
  ],
  'PO-2026-0517': [
    {
      id: 'RC-2026-0517-01',
      orderId: 'PO-2026-0517',
      receivedAt: '2026-10-31',
      receiver: '陈昊',
      lines: [
        { lineNo: 1, sku: 'SKU-1002', name: 'A4 复印纸 70g 500 张/包', quantity: 200 }
      ]
    }
  ],
  'PO-2026-0520': [
    {
      id: 'RC-2026-0520-01',
      orderId: 'PO-2026-0520',
      receivedAt: '2026-11-10',
      receiver: '张明远',
      lines: [
        { lineNo: 1, sku: 'SKU-1006', name: 'SATA 6Gb/s 数据线 0.5m 蓝色', quantity: 100 }
      ]
    }
  ]
}

/** 单据审计记录样例（B4）：按采购单号归档，数组按时间正序排列。 */
const auditTrail: Record<string, PurchaseAuditEntry[]> = {
  'PO-2026-0511': [
    { id: 'aud-0511-01', orderId: 'PO-2026-0511', action: '创建', actor: '张明远', at: '2026-11-01 17:40', detail: '创建采购订单草稿，供应商苏州精工电子有限公司，共 3 行明细。' },
    { id: 'aud-0511-02', orderId: 'PO-2026-0511', action: '提交审批', actor: '张明远', at: '2026-11-02 09:15', detail: '提交审批，等待部门负责人确认。' },
    { id: 'aud-0511-03', orderId: 'PO-2026-0511', action: '审批通过', actor: '陈昊', at: '2026-11-02 14:20', detail: '审批通过，订单状态更新为已审批。' },
    { id: 'aud-0511-04', orderId: 'PO-2026-0511', action: '收货', actor: '张明远', at: '2026-11-05 16:10', detail: '登记首批到货 3 行，合计 280 件。' },
    { id: 'aud-0511-05', orderId: 'PO-2026-0511', action: '收货', actor: '张明远', at: '2026-11-06 10:25', detail: '补收剩余 20 个扩展坞，明细全部到货。' },
    { id: 'aud-0511-06', orderId: 'PO-2026-0511', action: '状态更新', actor: '系统', at: '2026-11-06 10:26', detail: '全部明细收货完成，状态更新为已入库。' }
  ],
  'PO-2026-0512': [
    { id: 'aud-0512-01', orderId: 'PO-2026-0512', action: '创建', actor: '张明远', at: '2026-11-09 09:50', detail: '创建包装材料采购订单，共 3 行明细。' },
    { id: 'aud-0512-02', orderId: 'PO-2026-0512', action: '提交审批', actor: '张明远', at: '2026-11-09 10:05', detail: '提交财务审批，等待预算科目核对。' }
  ],
  'PO-2026-0513': [
    { id: 'aud-0513-01', orderId: 'PO-2026-0513', action: '创建', actor: '张明远', at: '2026-11-10 09:30', detail: '创建办公用品采购订单，共 3 行明细。' },
    { id: 'aud-0513-02', orderId: 'PO-2026-0513', action: '提交审批', actor: '张明远', at: '2026-11-10 09:48', detail: '提交审批，等待财务确认预算。' },
    { id: 'aud-0513-03', orderId: 'PO-2026-0513', action: '审批通过', actor: '王倩', at: '2026-11-10 16:12', detail: '审批通过，等待供应商确认交期。' }
  ],
  'PO-2026-0514': [
    { id: 'aud-0514-01', orderId: 'PO-2026-0514', action: '创建', actor: '张明远', at: '2026-11-11 08:50', detail: '创建劳保用品采购订单，共 2 行明细。' },
    { id: 'aud-0514-02', orderId: 'PO-2026-0514', action: '提交审批', actor: '张明远', at: '2026-11-11 09:12', detail: '提交审批，允许分批到货。' },
    { id: 'aud-0514-03', orderId: 'PO-2026-0514', action: '审批通过', actor: '陈昊', at: '2026-11-11 15:40', detail: '审批通过，订单状态更新为已审批。' },
    { id: 'aud-0514-04', orderId: 'PO-2026-0514', action: '收货', actor: '张明远', at: '2026-11-17 18:42', detail: '首批到货 80 盒丁腈手套，登记为部分收货。' }
  ],
  'PO-2026-0515': [
    { id: 'aud-0515-01', orderId: 'PO-2026-0515', action: '创建', actor: '陈昊', at: '2026-11-12 10:05', detail: '创建办公设备采购订单草稿。' },
    { id: 'aud-0515-02', orderId: 'PO-2026-0515', action: '提交审批', actor: '陈昊', at: '2026-11-12 10:20', detail: '提交审批，共 2 行明细。' },
    { id: 'aud-0515-03', orderId: 'PO-2026-0515', action: '审批驳回', actor: '王倩', at: '2026-11-13 09:35', detail: '驳回原因：预算科目缺失，请补充成本中心后重新提交。' }
  ],
  'PO-2026-0516': [
    { id: 'aud-0516-01', orderId: 'PO-2026-0516', action: '创建', actor: '张明远', at: '2026-11-12 14:00', detail: '创建年度框架协议补充订单，共 12 行明细。' },
    { id: 'aud-0516-02', orderId: 'PO-2026-0516', action: '提交审批', actor: '张明远', at: '2026-11-12 14:10', detail: '提交审批，等待采购负责人核对规格。' }
  ],
  'PO-2026-0517': [
    { id: 'aud-0517-01', orderId: 'PO-2026-0517', action: '创建', actor: '陈昊', at: '2026-10-28 08:40', detail: '创建门店办公耗材采购订单。' },
    { id: 'aud-0517-02', orderId: 'PO-2026-0517', action: '提交审批', actor: '陈昊', at: '2026-10-28 09:00', detail: '提交审批，按标准账期结算。' },
    { id: 'aud-0517-03', orderId: 'PO-2026-0517', action: '审批通过', actor: '王倩', at: '2026-10-28 14:00', detail: '审批通过，通知供应商备货。' },
    { id: 'aud-0517-04', orderId: 'PO-2026-0517', action: '收货', actor: '陈昊', at: '2026-10-31 11:20', detail: '全部到货 200 包，登记收货。' },
    { id: 'aud-0517-05', orderId: 'PO-2026-0517', action: '关闭', actor: '陈昊', at: '2026-11-08 14:45', detail: '对账与结算完成，订单关闭。' }
  ],
  'PO-2026-0518': [
    { id: 'aud-0518-01', orderId: 'PO-2026-0518', action: '创建', actor: '周敏', at: '2026-11-05 10:10', detail: '创建门店劳保用品采购订单。' },
    { id: 'aud-0518-02', orderId: 'PO-2026-0518', action: '提交审批', actor: '周敏', at: '2026-11-05 10:35', detail: '提交审批，共 1 行明细。' },
    { id: 'aud-0518-03', orderId: 'PO-2026-0518', action: '取消', actor: '周敏', at: '2026-11-12 16:10', detail: '门店调整陈列方案，取消采购订单。' }
  ],
  'PO-2026-0520': [
    { id: 'aud-0520-01', orderId: 'PO-2026-0520', action: '创建', actor: '张明远', at: '2026-11-08 09:05', detail: '创建 C1 固定算例采购订单，100 条 SATA 数据线。' },
    { id: 'aud-0520-02', orderId: 'PO-2026-0520', action: '提交审批', actor: '张明远', at: '2026-11-08 09:20', detail: '提交审批，等待财务复核。' },
    { id: 'aud-0520-03', orderId: 'PO-2026-0520', action: '审批通过', actor: '陈昊', at: '2026-11-08 14:05', detail: '审批通过，等待供应商发货。' },
    { id: 'aud-0520-04', orderId: 'PO-2026-0520', action: '收货', actor: '张明远', at: '2026-11-10 11:30', detail: '全部到货 100 条，登记收货并暂估入库。' }
  ]
}

for (const order of purchaseOrders) {
  order.approvals = approvalTrail[order.id] ?? []
  order.receipts = receiptTrail[order.id] ?? []
  order.audit = auditTrail[order.id] ?? []
}

/** 最新一条审批轨迹，用于判断单据是否处于「已驳回」状态。 */
export function latestApproval(order: PurchaseOrder): PurchaseApprovalStep | null {
  const steps = order.approvals ?? []
  return steps.length ? steps[steps.length - 1]! : null
}

/** 是否被驳回：最新审批动作为「审批驳回」。 */
export function isRejectedOrder(order: PurchaseOrder): boolean {
  return latestApproval(order)?.action === 'rejected'
}

/**
 * 深拷贝采购单。页面上的写入（审批、收货、编辑）只改副本，
 * 刷新后重新从 mocks 恢复初始样例。
 */
export function clonePurchaseOrder(order: PurchaseOrder): PurchaseOrder {
  return {
    ...order,
    lines: order.lines.map(line => ({ ...line })),
    approvals: (order.approvals ?? []).map(step => ({ ...step })),
    receipts: (order.receipts ?? []).map(receipt => ({
      ...receipt,
      lines: receipt.lines.map(line => ({ ...line }))
    })),
    audit: (order.audit ?? []).map(entry => ({ ...entry }))
  }
}

export function orderTotal(order: PurchaseOrder): number {
  return order.lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0)
}
