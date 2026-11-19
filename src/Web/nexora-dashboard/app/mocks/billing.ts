import type {
  Invoice,
  InvoiceDelivery,
  InvoiceDeliveryChannel,
  InvoiceDeliveryStatus,
  InvoiceLine,
  InvoiceStatus,
  RecurringIntervalMonths,
  RecurringInvoiceOccurrence,
  RecurringInvoicePlan
} from './types'
import { salesOrders } from './sales'

export const invoiceStatusLabels: Record<InvoiceStatus, string> = {
  draft: '草稿',
  issued: '已开具',
  paid: '已收款',
  overdue: '已逾期',
  cancelled: '已作废'
}
export const invoiceStatusColors: Record<InvoiceStatus, 'neutral' | 'info' | 'success' | 'error'> = {
  draft: 'neutral',
  issued: 'info',
  paid: 'success',
  overdue: 'error',
  cancelled: 'neutral'
}

export const invoiceDeliveryChannelLabels: Record<InvoiceDeliveryChannel, string> = {
  email: '邮件发送',
  link: '分享链接'
}
export const invoiceDeliveryStatusLabels: Record<InvoiceDeliveryStatus, string> = {
  sent: '已送达',
  failed: '发送失败'
}
export const invoiceDeliveryStatusColors: Record<InvoiceDeliveryStatus, 'success' | 'error'> = {
  sent: 'success',
  failed: 'error'
}

function delivery(
  id: string,
  channel: InvoiceDeliveryChannel,
  target: string,
  status: InvoiceDeliveryStatus,
  at: string,
  error?: string
): InvoiceDelivery {
  return {
    id,
    channel,
    target,
    status,
    at,
    ...(error ? { error } : {})
  }
}

interface InvoiceSeed {
  id: string
  sourceOrderId: string
  status: InvoiceStatus
  issuedAt: string
  dueAt: string
  updatedAt: string
  deliveries: InvoiceDelivery[]
}

/**
 * 发票样例：客户、工作区、明细与金额都由关联的销售订单派生，
 * 保证发票明细合计、税额与价税合计三者自洽；仅这些派生关系属于演示数据。
 */
const invoiceSeeds: InvoiceSeed[] = [
  {
    id: 'INV-2026-0081',
    sourceOrderId: 'SO-2026-9001',
    status: 'paid',
    issuedAt: '2026-11-06',
    dueAt: '2026-12-06',
    updatedAt: '2026-11-10',
    deliveries: [
      delivery('DLV-0081-01', 'email', 'linxiao@yunshan.example', 'sent', '2026-11-06 09:12')
    ]
  },
  {
    id: 'INV-2026-0082',
    sourceOrderId: 'SO-2026-9002',
    status: 'issued',
    issuedAt: '2026-11-08',
    dueAt: '2026-12-08',
    updatedAt: '2026-11-08',
    deliveries: [
      delivery('DLV-0082-01', 'email', 'finance@yuanhang.example', 'sent', '2026-11-08 10:02'),
      delivery('DLV-0082-02', 'link', '客户财务群（演示）', 'sent', '2026-11-09 15:40')
    ]
  },
  {
    id: 'INV-2026-0083',
    sourceOrderId: 'SO-2026-9003',
    status: 'overdue',
    issuedAt: '2026-09-15',
    dueAt: '2026-09-30',
    updatedAt: '2026-10-02',
    deliveries: [
      delivery('DLV-0083-01', 'email', 'ap@qiming.example', 'failed', '2026-09-15 08:55', 'SMTP 550 收件人邮箱不存在（演示错误）')
    ]
  },
  {
    id: 'INV-2026-0084',
    sourceOrderId: 'SO-2026-9008',
    status: 'overdue',
    issuedAt: '2026-06-28',
    dueAt: '2026-07-28',
    updatedAt: '2026-11-02',
    deliveries: [
      delivery('DLV-0084-01', 'email', 'caiwu@hengxin.example', 'sent', '2026-06-28 10:20'),
      delivery('DLV-0084-02', 'email', 'caiwu@hengxin.example', 'failed', '2026-11-02 09:10', '邮件网关超时（演示错误）')
    ]
  },
  {
    id: 'INV-2026-0085',
    sourceOrderId: 'SO-2026-9005',
    status: 'paid',
    issuedAt: '2026-10-25',
    dueAt: '2026-11-24',
    updatedAt: '2026-11-01',
    deliveries: [
      delivery('DLV-0085-01', 'email', 'store@linli.example', 'sent', '2026-10-25 11:30')
    ]
  },
  {
    id: 'INV-2026-0086',
    sourceOrderId: 'SO-2026-9006',
    status: 'draft',
    issuedAt: '2026-11-14',
    dueAt: '2026-12-14',
    updatedAt: '2026-11-14',
    deliveries: []
  },
  {
    id: 'INV-2026-0087',
    sourceOrderId: 'SO-2026-9007',
    status: 'cancelled',
    issuedAt: '2026-10-16',
    dueAt: '2026-11-16',
    updatedAt: '2026-10-21',
    deliveries: []
  },
  {
    id: 'INV-2026-0088',
    sourceOrderId: 'SO-2026-9009',
    status: 'overdue',
    issuedAt: '2026-10-15',
    dueAt: '2026-10-28',
    updatedAt: '2026-11-05',
    deliveries: [
      delivery('DLV-0088-01', 'link', '客户采购负责人（演示）', 'sent', '2026-10-15 16:20')
    ]
  },
  {
    id: 'INV-2026-0089',
    sourceOrderId: 'SO-2026-9011',
    status: 'issued',
    issuedAt: '2026-11-18',
    dueAt: '2026-12-18',
    updatedAt: '2026-11-18',
    deliveries: []
  },
  {
    id: 'INV-2026-0090',
    sourceOrderId: 'SO-2026-9010',
    status: 'draft',
    issuedAt: '2026-11-18',
    dueAt: '2026-12-18',
    updatedAt: '2026-11-18',
    deliveries: []
  }
]

function buildInvoiceLines(orderId: string): InvoiceLine[] {
  const order = salesOrders.find(item => item.id === orderId)
  if (!order) return []
  return order.lines.map(line => ({
    lineNo: line.lineNo,
    sku: line.sku,
    name: line.name,
    quantity: line.quantity,
    unitPrice: line.unitPrice,
    taxRate: '13%',
    amount: line.amount
  }))
}

export const invoices: Invoice[] = invoiceSeeds.map((seed) => {
  const lines = buildInvoiceLines(seed.sourceOrderId)
  const subtotal = lines.reduce((sum, line) => sum + Number(line.amount), 0)
  const order = salesOrders.find(item => item.id === seed.sourceOrderId)
  return {
    id: seed.id,
    workspaceId: order?.workspaceId ?? 'ws-hq',
    customerName: order?.customerName ?? '未知客户',
    status: seed.status,
    issuedAt: seed.issuedAt,
    dueAt: seed.dueAt,
    amount: (subtotal * 1.13).toFixed(2),
    taxAmount: (subtotal * 0.13).toFixed(2),
    sourceOrderId: seed.sourceOrderId,
    lines,
    deliveries: seed.deliveries,
    shareToken: 'demo-' + seed.id.toLowerCase(),
    updatedAt: seed.updatedAt
  }
})

export const recurringServiceOptions = [
  { label: 'IT 运维支持服务', value: 'svc-it', unitPrice: 12800 },
  { label: '数据备份与容灾服务', value: 'svc-backup', unitPrice: 9000 },
  { label: '门店收银系统维护', value: 'svc-pos', unitPrice: 4800 },
  { label: '办公设备维保服务', value: 'svc-device', unitPrice: 9800 },
  { label: '年度审计支持服务', value: 'svc-audit', unitPrice: 6000 }
]

export const recurringIntervalLabels: Record<RecurringIntervalMonths, string> = {
  1: '每月',
  3: '每季度',
  6: '每半年',
  12: '每年'
}

export const recurringPlanStatusLabels: Record<RecurringInvoicePlan['status'], string> = {
  active: '执行中',
  paused: '已暂停'
}

export const recurringOccurrenceStatusLabels: Record<RecurringInvoiceOccurrence['status'], string> = {
  executed: '已开票',
  skipped: '已跳过',
  blocked: '期间阻断'
}

export const recurringOccurrenceStatusColors: Record<RecurringInvoiceOccurrence['status'], 'success' | 'neutral' | 'warning'> = {
  executed: 'success',
  skipped: 'neutral',
  blocked: 'warning'
}

/** 定期开票计划：模板字段与后端 ScheduleView 对齐，本地模拟执行与历史。 */
export const recurringInvoicePlans: RecurringInvoicePlan[] = [
  {
    id: 'RCP-2026-001',
    workspaceId: 'ws-hq',
    customerName: '杭州云杉科技有限公司',
    serviceId: 'svc-it',
    serviceName: 'IT 运维支持服务',
    quantity: 1,
    unitPrice: 12800,
    intervalMonths: 1,
    dueDays: 30,
    firstOn: '2026-01-19',
    endsOn: '2027-12-19',
    nextRunAt: '2026-11-19',
    lastRunAt: '2026-10-19',
    status: 'active',
    version: 4,
    owner: '李婉',
    createdAt: '2025-12-20',
    updatedAt: '2026-10-20'
  },
  {
    id: 'RCP-2026-002',
    workspaceId: 'ws-hq',
    customerName: '南京远航贸易有限公司',
    serviceId: 'svc-backup',
    serviceName: '数据备份与容灾服务',
    quantity: 4,
    unitPrice: 9000,
    intervalMonths: 3,
    dueDays: 15,
    firstOn: '2026-01-05',
    endsOn: '2027-01-05',
    nextRunAt: '2027-01-05',
    lastRunAt: '2026-10-05',
    status: 'active',
    version: 2,
    owner: '陈默',
    createdAt: '2025-12-18',
    updatedAt: '2026-10-06'
  },
  {
    id: 'RCP-2026-003',
    workspaceId: 'ws-retail',
    customerName: '杭州邻里生活超市',
    serviceId: 'svc-pos',
    serviceName: '门店收银系统维护',
    quantity: 1,
    unitPrice: 4800,
    intervalMonths: 1,
    dueDays: 15,
    firstOn: '2026-01-03',
    nextRunAt: '2026-12-03',
    lastRunAt: '2026-11-03',
    status: 'paused',
    version: 3,
    owner: '沈嘉',
    createdAt: '2025-12-15',
    updatedAt: '2026-11-04'
  },
  {
    id: 'RCP-2026-004',
    workspaceId: 'ws-south',
    customerName: '深圳市恒通办公设备有限公司',
    serviceId: 'svc-device',
    serviceName: '办公设备维保服务',
    quantity: 1,
    unitPrice: 9800,
    intervalMonths: 1,
    dueDays: 20,
    firstOn: '2026-01-08',
    nextRunAt: '2026-12-08',
    lastRunAt: '2026-11-08',
    status: 'active',
    version: 2,
    owner: '周奕',
    createdAt: '2025-12-21',
    updatedAt: '2026-11-09'
  },
  {
    id: 'RCP-2026-005',
    workspaceId: 'ws-hq',
    customerName: '杭州云杉科技有限公司',
    serviceId: 'svc-audit',
    serviceName: '年度审计支持服务',
    quantity: 1,
    unitPrice: 6000,
    intervalMonths: 1,
    dueDays: 30,
    firstOn: '2026-06-01',
    nextRunAt: '2026-12-01',
    lastRunAt: '2026-11-01',
    status: 'active',
    version: 2,
    owner: '李婉',
    blockedPeriods: ['2026-12'],
    createdAt: '2026-05-20',
    updatedAt: '2026-11-02'
  }
]

/** 计划历史：执行、跳过与期间阻断均保留，便于回看模板版本。 */
export const recurringInvoiceOccurrences: RecurringInvoiceOccurrence[] = [
  {
    id: 'OCC-2026-0001',
    planId: 'RCP-2026-002',
    workspaceId: 'ws-hq',
    scheduledOn: '2026-10-05',
    status: 'executed',
    version: 2,
    invoiceId: 'INV-2026-0082',
    actedAt: '2026-10-05 08:05'
  },
  {
    id: 'OCC-2026-0002',
    planId: 'RCP-2026-001',
    workspaceId: 'ws-hq',
    scheduledOn: '2026-09-19',
    status: 'skipped',
    version: 1,
    actedAt: '2026-09-19 09:12',
    note: '客户要求合并到下一期开票。'
  }
]

/** 深拷贝发票（含明细与寄送记录），列表页用它在本地演示与重试。 */
export function cloneInvoice(invoice: Invoice): Invoice {
  return {
    ...invoice,
    ...(invoice.lines ? { lines: invoice.lines.map(line => ({ ...line })) } : {}),
    ...(invoice.deliveries ? { deliveries: invoice.deliveries.map(item => ({ ...item })) } : {})
  }
}

/** 深拷贝定期开票计划。 */
export function cloneRecurringInvoicePlan(plan: RecurringInvoicePlan): RecurringInvoicePlan {
  return {
    ...plan,
    ...(plan.blockedPeriods ? { blockedPeriods: [...plan.blockedPeriods] } : {})
  }
}
