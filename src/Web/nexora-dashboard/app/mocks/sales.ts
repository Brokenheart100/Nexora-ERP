import type {
  Quote,
  QuoteLine,
  QuoteStatus,
  SalesApprovalAction,
  SalesApprovalStep,
  SalesFulfillment,
  SalesOrder,
  SalesOrderLine,
  SalesOrderStatus
} from './types'

export const quoteStatusLabels: Record<QuoteStatus, string> = {
  draft: '草稿',
  sent: '已发送',
  accepted: '已接受',
  rejected: '已拒绝',
  expired: '已过期'
}

export const quoteStatusColors: Record<QuoteStatus, 'neutral' | 'info' | 'success' | 'error' | 'warning'> = {
  draft: 'neutral',
  sent: 'info',
  accepted: 'success',
  rejected: 'error',
  expired: 'warning'
}

export const salesStatusLabels: Record<SalesOrderStatus, string> = {
  draft: '草稿',
  pending: '待审批',
  approved: '已批准',
  partial: '部分履约',
  fulfilled: '已履约',
  closed: '已关闭',
  cancelled: '已取消'
}

export const salesStatusColors: Record<SalesOrderStatus, 'neutral' | 'info' | 'success' | 'warning' | 'error'> = {
  draft: 'neutral',
  pending: 'warning',
  approved: 'info',
  partial: 'info',
  fulfilled: 'success',
  closed: 'neutral',
  cancelled: 'error'
}

/** 审批轨迹的动作文案与徽标颜色（本地演示）。 */
export const salesApprovalLabels: Record<SalesApprovalAction, string> = {
  submitted: '提交审批',
  approved: '审批通过',
  rejected: '审批驳回',
  withdrawn: '撤回提交'
}

export const salesApprovalColors: Record<SalesApprovalAction, 'warning' | 'success' | 'error'> = {
  submitted: 'warning',
  approved: 'success',
  rejected: 'error',
  withdrawn: 'warning'
}

/** 报价与销售订单共用的演示商品目录，金额只在本原型内使用。 */
const catalog: Record<string, { name: string, unitPrice: string }> = {
  'SKU-1002': { name: 'A4 复印纸 70g 500 张/包', unitPrice: '22.50' },
  'SKU-1003': { name: '兄弟 DCP-B7530DN 黑白激光一体机', unitPrice: '1899.00' },
  'SKU-1010': { name: '人体工学网椅（带腰托/可躺 135°）', unitPrice: '1288.00' },
  'SKU-1012': { name: '24 口千兆非网管交换机', unitPrice: '699.00' },
  'SKU-1014': { name: '白板笔（可擦写）黑色 10 支/盒', unitPrice: '18.90' },
  'SKU-1016': { name: 'Type-C 转 HDMI 4K 扩展坞（含 PD 100W）', unitPrice: '259.00' },
  'SKU-1099': { name: 'ERP 实施服务（C2 固定算例）', unitPrice: '1000.00' }
}

function amountOf(quantity: number, unitPrice: string) {
  return (quantity * Number(unitPrice)).toFixed(2)
}

function buildQuoteLines(items: Array<[string, number]>): QuoteLine[] {
  return items.map(([sku, quantity], index) => {
    const item = catalog[sku]!
    return {
      lineNo: index + 1,
      sku,
      name: item.name,
      quantity,
      unitPrice: item.unitPrice,
      taxRate: '13%',
      amount: amountOf(quantity, item.unitPrice)
    }
  })
}

interface QuoteSeed {
  id: string
  workspaceId: string
  customerName: string
  status: QuoteStatus
  validUntil: string
  owner: string
  updatedAt: string
  convertedOrderId?: string
  lines: Array<[string, number]>
}

/**
 * 报价样例：覆盖草稿 / 已发送 / 已接受 / 已拒绝 / 已过期五种状态。
 * QT-2026-0411 已转销售订单 SO-2026-9001，两侧通过 convertedOrderId 与 quoteId 关联。
 */
const quoteSeeds: QuoteSeed[] = [
  {
    id: 'QT-2026-0411',
    workspaceId: 'ws-hq',
    customerName: '杭州云杉科技有限公司',
    status: 'accepted',
    validUntil: '2026-11-30',
    owner: '李婉',
    updatedAt: '2026-11-06',
    convertedOrderId: 'SO-2026-9001',
    lines: [['SKU-1010', 80], ['SKU-1012', 20], ['SKU-1016', 40]]
  },
  {
    id: 'QT-2026-0412',
    workspaceId: 'ws-hq',
    customerName: '南京远航贸易有限公司',
    status: 'sent',
    validUntil: '2026-12-08',
    owner: '陈默',
    updatedAt: '2026-11-07',
    lines: [['SKU-1003', 6], ['SKU-1002', 60]]
  },
  {
    id: 'QT-2026-0413',
    workspaceId: 'ws-hq',
    customerName: '上海启明零售有限公司',
    status: 'draft',
    validUntil: '2026-12-15',
    owner: '周奕',
    updatedAt: '2026-11-10',
    lines: [['SKU-1016', 12], ['SKU-1014', 30]]
  },
  {
    id: 'QT-2026-0414',
    workspaceId: 'ws-hq',
    customerName: '杭州云杉科技有限公司',
    status: 'expired',
    validUntil: '2026-10-20',
    owner: '李婉',
    updatedAt: '2026-10-21',
    lines: [['SKU-1012', 8]]
  },
  {
    id: 'QT-2026-0415',
    workspaceId: 'ws-hq',
    customerName: '苏州精工电子有限公司',
    status: 'rejected',
    validUntil: '2026-11-12',
    owner: '沈嘉',
    updatedAt: '2026-11-04',
    lines: [['SKU-1002', 100], ['SKU-1014', 50]]
  },
  {
    id: 'QT-2026-0416',
    workspaceId: 'ws-south',
    customerName: '无锡恒信实业有限公司',
    status: 'sent',
    validUntil: '2026-12-20',
    owner: '周奕',
    updatedAt: '2026-11-12',
    lines: [['SKU-1010', 10], ['SKU-1003', 2]]
  }
]

export const quotes: Quote[] = quoteSeeds.map((seed) => {
  const lines = buildQuoteLines(seed.lines)
  const totalAmount = lines.reduce((sum, line) => sum + Number(line.amount), 0).toFixed(2)
  return {
    id: seed.id,
    workspaceId: seed.workspaceId,
    customerName: seed.customerName,
    status: seed.status,
    validUntil: seed.validUntil,
    owner: seed.owner,
    totalAmount,
    lines,
    updatedAt: seed.updatedAt,
    ...(seed.convertedOrderId ? { convertedOrderId: seed.convertedOrderId } : {})
  }
})

interface OrderSeed {
  id: string
  workspaceId: string
  customerName: string
  status: SalesOrderStatus
  orderedAt: string
  promisedAt: string
  owner: string
  maker?: string
  note: string
  quoteId?: string
  lines: Array<[string, number]>
}

/**
 * 销售订单样例：覆盖草稿、待审批、已批准、部分履约、已履约、已关闭、已取消七种状态。
 * 审批轨迹与履约记录由种子状态派生，保证列表、详情与本地状态机一致。
 */
const orderSeeds: OrderSeed[] = [
  {
    id: 'SO-2026-9001',
    workspaceId: 'ws-hq',
    customerName: '杭州云杉科技有限公司',
    status: 'partial',
    orderedAt: '2026-11-06',
    promisedAt: '2026-11-20',
    owner: '李婉',
    note: '由报价 QT-2026-0411 转入，首批已完成部分发货。',
    quoteId: 'QT-2026-0411',
    lines: [['SKU-1010', 80], ['SKU-1012', 20], ['SKU-1016', 40]]
  },
  {
    id: 'SO-2026-9002',
    workspaceId: 'ws-hq',
    customerName: '南京远航贸易有限公司',
    status: 'approved',
    orderedAt: '2026-11-06',
    promisedAt: '2026-11-20',
    owner: '陈默',
    note: '客户要求分批发货，等待仓库排期。',
    lines: [['SKU-1003', 6], ['SKU-1002', 60]]
  },
  {
    id: 'SO-2026-9003',
    workspaceId: 'ws-hq',
    customerName: '上海启明零售有限公司',
    status: 'pending',
    orderedAt: '2026-09-08',
    promisedAt: '2026-09-22',
    owner: '陈立',
    maker: '陈立',
    note: '客户信用额度待复核，审批停留时间较长。',
    lines: [['SKU-1016', 12], ['SKU-1014', 30]]
  },
  {
    id: 'SO-2026-9004',
    workspaceId: 'ws-south',
    customerName: '深圳市恒通办公设备有限公司',
    status: 'closed',
    orderedAt: '2026-06-15',
    promisedAt: '2026-06-29',
    owner: '沈嘉',
    note: '已完成交付并关闭，等待开票。',
    lines: [['SKU-1012', 5]]
  },
  {
    id: 'SO-2026-9005',
    workspaceId: 'ws-retail',
    customerName: '杭州邻里生活超市',
    status: 'fulfilled',
    orderedAt: '2026-10-20',
    promisedAt: '2026-11-03',
    owner: '李婉',
    note: '社区门店补货订单，已全部签收。',
    lines: [['SKU-1002', 200], ['SKU-1014', 40]]
  },
  {
    id: 'SO-2026-9006',
    workspaceId: 'ws-south',
    customerName: '东莞市锐驰五金制品有限公司',
    status: 'draft',
    orderedAt: '2026-11-12',
    promisedAt: '2026-11-26',
    owner: '陈默',
    note: '草稿：客户确认数量后再提交审批。',
    lines: [['SKU-1003', 1]]
  },
  {
    id: 'SO-2026-9007',
    workspaceId: 'ws-south',
    customerName: '广州南沙物流有限公司',
    status: 'cancelled',
    orderedAt: '2026-10-15',
    promisedAt: '2026-10-29',
    owner: '周奕',
    note: '客户项目取消，订单作废并冲销。',
    lines: [['SKU-1010', 4]]
  },
  {
    id: 'SO-2026-9008',
    workspaceId: 'ws-hq',
    customerName: '无锡恒信实业有限公司',
    status: 'approved',
    orderedAt: '2026-06-08',
    promisedAt: '2026-06-22',
    owner: '沈嘉',
    note: '历史订单，已开具发票但客户回款逾期。',
    lines: [['SKU-1012', 10], ['SKU-1014', 20]]
  },
  {
    id: 'SO-2026-9009',
    workspaceId: 'ws-hq',
    customerName: '杭州云杉科技有限公司',
    status: 'approved',
    orderedAt: '2026-09-20',
    promisedAt: '2026-10-04',
    owner: '李婉',
    note: '框架协议下的季度补单，已开票待回款。',
    lines: [['SKU-1003', 3], ['SKU-1002', 10]]
  },
  {
    id: 'SO-2026-9010',
    workspaceId: 'ws-hq',
    customerName: '苏州精工电子有限公司',
    status: 'fulfilled',
    orderedAt: '2026-10-25',
    promisedAt: '2026-11-08',
    owner: '陈默',
    note: '已全部履约，等待财务开具发票。',
    lines: [['SKU-1016', 6], ['SKU-1014', 15]]
  },
  {
    id: 'SO-2026-9011',
    workspaceId: 'ws-hq',
    customerName: '杭州云杉科技有限公司',
    status: 'fulfilled',
    orderedAt: '2026-11-12',
    promisedAt: '2026-11-16',
    owner: '李婉',
    note: 'C2 销售到收款固定算例：服务已交付，价税合计 1,130.00，等待分次收款。',
    lines: [['SKU-1099', 1]]
  }
]

function buildOrderLines(items: Array<[string, number]>): SalesOrderLine[] {
  return items.map(([sku, quantity], index) => {
    const item = catalog[sku]!
    return {
      lineNo: index + 1,
      sku,
      name: item.name,
      quantity,
      shipped: 0,
      unitPrice: item.unitPrice,
      amount: amountOf(quantity, item.unitPrice)
    }
  })
}

function stepId(orderId: string, sequence: number) {
  return 'AP-' + orderId.slice(-4) + '-S' + sequence
}

function buildApprovals(seed: OrderSeed): SalesApprovalStep[] {
  if (seed.status === 'draft') return []
  const steps: SalesApprovalStep[] = [{
    id: stepId(seed.id, 1),
    orderId: seed.id,
    action: 'submitted',
    actor: seed.owner,
    at: seed.orderedAt + ' 09:20',
    note: '销售代表提交订单，进入销售审批队列（本地演示）。'
  }]
  const approvedStatuses: SalesOrderStatus[] = ['approved', 'partial', 'fulfilled', 'closed', 'cancelled']
  if (approvedStatuses.includes(seed.status)) {
    steps.push({
      id: stepId(seed.id, 2),
      orderId: seed.id,
      action: 'approved',
      actor: '王倩',
      at: seed.orderedAt + ' 14:05',
      note: '客户额度、价格与交付条款校验通过，审批放行。'
    })
  }
  return steps
}

const shippers = ['顺丰速运', '德邦物流', '京东物流']

function buildFulfillments(seed: OrderSeed, lines: SalesOrderLine[]): SalesFulfillment[] {
  if (!['partial', 'fulfilled', 'closed'].includes(seed.status)) return []
  const shippedLines = lines.map((line) => {
    const quantity = seed.status === 'partial'
      ? Math.floor(line.quantity / 2)
      : line.quantity
    return { lineNo: line.lineNo, sku: line.sku, name: line.name, quantity }
  }).filter(line => line.quantity > 0)
  if (!shippedLines.length) return []
  return [{
    id: 'FUL-' + seed.id.slice(-4) + '-01',
    orderId: seed.id,
    shippedAt: seed.orderedAt + ' 16:20',
    shipper: shippers[Number(seed.id.slice(-1)) % shippers.length]!,
    lines: shippedLines
  }]
}

export const salesOrders: SalesOrder[] = orderSeeds.map((seed) => {
  const lines = buildOrderLines(seed.lines)
  const totalAmount = lines.reduce((sum, line) => sum + Number(line.amount), 0).toFixed(2)
  const order: SalesOrder = {
    id: seed.id,
    workspaceId: seed.workspaceId,
    customerName: seed.customerName,
    status: seed.status,
    orderedAt: seed.orderedAt,
    promisedAt: seed.promisedAt,
    owner: seed.owner,
    maker: seed.maker ?? seed.owner,
    totalAmount,
    note: seed.note,
    lines,
    updatedAt: '2026-11-17'
  }
  if (seed.quoteId) order.quoteId = seed.quoteId
  const approvals = buildApprovals(seed)
  if (approvals.length) order.approvals = approvals
  const fulfillments = buildFulfillments(seed, lines)
  if (fulfillments.length) {
    order.fulfillments = fulfillments
    for (const fulfillment of fulfillments) {
      for (const shippedLine of fulfillment.lines) {
        const line = order.lines.find(entry => entry.lineNo === shippedLine.lineNo)
        if (line) line.shipped += shippedLine.quantity
      }
    }
  }
  return order
})

/** 深拷贝报价单，列表页用它在本地修改而不污染 app/mocks 的初始样例。 */
export function cloneQuote(quote: Quote): Quote {
  return {
    ...quote,
    lines: quote.lines.map(line => ({ ...line })),
    ...(quote.convertedOrderId ? { convertedOrderId: quote.convertedOrderId } : {})
  }
}

/** 深拷贝销售订单（含审批轨迹与履约记录）。 */
export function cloneSalesOrder(order: SalesOrder): SalesOrder {
  return {
    ...order,
    lines: order.lines.map(line => ({ ...line })),
    ...(order.quoteId ? { quoteId: order.quoteId } : {}),
    ...(order.approvals
      ? { approvals: order.approvals.map(step => ({ ...step })) }
      : {}),
    ...(order.fulfillments
      ? {
          fulfillments: order.fulfillments.map(fulfillment => ({
            ...fulfillment,
            lines: fulfillment.lines.map(line => ({ ...line }))
          }))
        }
      : {})
  }
}
