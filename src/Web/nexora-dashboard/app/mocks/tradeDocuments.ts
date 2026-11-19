import type {
  AccountMapping,
  ProvisionalBill,
  TradeDocument,
  TradeDocumentKind,
  TradeDocumentStatus
} from './types'

export const tradeDocumentKindLabels: Record<TradeDocumentKind, string> = {
  bill: '供应商账单',
  receipt: '客户收款',
  allocation: '收款核销'
}

export const tradeDocumentKindDescriptions: Record<TradeDocumentKind, string> = {
  bill: '采购入库后形成的应付账单，独立复核后过账到应付账款。',
  receipt: '客户回款登记，确认资金到账后过账到银行存款。',
  allocation: '把收款核销到具体应收发票，过账后更新应收余额。'
}

export const tradeDocumentStatusLabels: Record<TradeDocumentStatus, string> = {
  draft: '草稿',
  submitted: '待独立复核',
  reviewed: '已复核待过账',
  posted: '已过账',
  cancelled: '已取消'
}

export const tradeDocumentStatusColors: Record<TradeDocumentStatus, 'neutral' | 'warning' | 'info' | 'success' | 'error'> = {
  draft: 'neutral',
  submitted: 'warning',
  reviewed: 'info',
  posted: 'success',
  cancelled: 'error'
}

export const provisionalBillStatusLabels: Record<ProvisionalBill['status'], string> = {
  pending: '暂估待确认',
  confirmed: '已确认暂估',
  reversed: '已冲回'
}

export const provisionalBillStatusColors: Record<ProvisionalBill['status'], 'warning' | 'success' | 'neutral'> = {
  pending: 'warning',
  confirmed: 'success',
  reversed: 'neutral'
}

export const tradeActor = { makerId: 'u-1001', makerName: '张明远', reviewerId: 'u-1004', reviewerName: '陈立' }

export const tradeDocuments: TradeDocument[] = [
  {
    id: 'BILL-2026-1101',
    workspaceId: 'ws-hq',
    kind: 'bill',
    party: '苏州精工电子有限公司',
    amount: 113000,
    sourceRef: 'PO-2026-0520',
    maker: '张明远',
    status: 'submitted',
    version: 2,
    submittedAt: '2026-11-16 10:20',
    note: 'C1 固定算例采购入库后的应付账单。'
  },
  {
    id: 'BILL-2026-1102',
    workspaceId: 'ws-hq',
    kind: 'bill',
    party: '宁波华翔包装材料有限公司',
    amount: 42800,
    sourceRef: 'PO-2026-0516',
    maker: '张明远',
    status: 'draft',
    version: 1,
    note: '包装材料补货账单，尚未提交复核。'
  },
  {
    id: 'BILL-2026-1103',
    workspaceId: 'ws-hq',
    kind: 'bill',
    party: '上海联诚办公用品有限公司',
    amount: 8746.2,
    sourceRef: 'PO-2026-0511',
    maker: '张明远',
    reviewer: '陈立',
    status: 'posted',
    version: 3,
    submittedAt: '2026-11-14 09:40',
    postedAt: '2026-11-14 11:05',
    note: '办公用品账单已由财务负责人独立复核并过账。'
  },
  {
    id: 'RCPT-2026-0501',
    workspaceId: 'ws-hq',
    kind: 'receipt',
    party: '杭州云杉科技有限公司',
    amount: 62800,
    sourceRef: 'INV-2026-0091',
    maker: '张明远',
    status: 'submitted',
    version: 2,
    submittedAt: '2026-11-17 14:10',
    note: '客户电汇回款，等待独立复核后过账。'
  },
  {
    id: 'RCPT-2026-0502',
    workspaceId: 'ws-hq',
    kind: 'receipt',
    party: '南京远航物流有限公司',
    amount: 24860,
    sourceRef: 'INV-2026-0082',
    maker: '张明远',
    reviewer: '陈立',
    status: 'posted',
    version: 3,
    submittedAt: '2026-11-13 09:15',
    postedAt: '2026-11-13 10:30',
    note: '客户回款已过账，可用于核销发票。'
  },
  {
    id: 'ALLOC-2026-0301',
    workspaceId: 'ws-hq',
    kind: 'allocation',
    party: '南京远航物流有限公司',
    amount: 24860,
    sourceRef: 'RCPT-2026-0502 / INV-2026-0082',
    maker: '张明远',
    status: 'submitted',
    version: 2,
    submittedAt: '2026-11-13 11:00',
    note: '收款与发票金额一致，等待复核过账。'
  },
  {
    id: 'ALLOC-2026-0302',
    workspaceId: 'ws-hq',
    kind: 'allocation',
    party: '杭州云杉科技有限公司',
    amount: 18600,
    sourceRef: 'RCPT-2026-0501 / INV-2026-0071',
    maker: '张明远',
    status: 'draft',
    version: 1,
    note: '部分核销草稿，尚未提交。'
  }
]

export const accountMappings: AccountMapping[] = [
  { id: 'map-ar', kind: 'AR', accountCode: '1122', accountName: '应收账款', status: 'mapped', note: '客户收款与核销过账使用该统驭科目。' },
  { id: 'map-ap', kind: 'AP', accountCode: '2202', accountName: '应付账款', status: 'mapped', note: '供应商账单与采购暂估过账使用该统驭科目。' }
]

export const provisionalBills: ProvisionalBill[] = [
  {
    id: 'PB-2026-001',
    workspaceId: 'ws-hq',
    billNo: 'BILL-2026-1102',
    supplier: '宁波华翔包装材料有限公司',
    orderId: 'PO-2026-0516',
    amount: 98400,
    stockAmount: 0,
    status: 'pending',
    note: '货已到票未到，暂估入库。确认后才会更新已过账库存金额。'
  },
  {
    id: 'PB-2026-002',
    workspaceId: 'ws-hq',
    billNo: 'BILL-2026-1103',
    supplier: '上海联诚办公用品有限公司',
    orderId: 'PO-2026-0511',
    amount: 52600,
    stockAmount: 52600,
    status: 'confirmed',
    confirmedBy: '陈立',
    confirmedAt: '2026-11-14 11:05',
    note: '暂估已确认，库存暂估金额转入已过账口径。'
  }
]
