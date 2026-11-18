import type {
  OpeningBalancePreview,
  OpeningBalanceRow,
  OpeningSubledgerBatch,
  OpeningSubledgerCheck,
  OpeningSubledgerPreview,
  OpeningSubledgerSource,
  ReportExportKind,
  ReportExportRecord,
  ReportExportStatus
} from './types'

export type OpeningBalanceFileKey = 'standard' | 'issues'

interface OpeningFileSeed {
  key: OpeningBalanceFileKey
  label: string
  fileName: string
  fileHash: string
  chartRevision: number
  on: string
  rows: OpeningBalanceRow[]
  issues: { row?: number, message: string, severity: 'error' | 'warning' }[]
}

export const openingBalanceFileOptions = [
  { label: '总账期初-标准.csv（借贷平衡）', value: 'standard' },
  { label: '总账期初-问题.csv（含重复科目与差额）', value: 'issues' }
]

const standardRows: OpeningBalanceRow[] = [
  { row: 1, accountId: 'acc-1001', accountCode: '1001', accountName: '库存现金', debit: 28640, credit: 0 },
  { row: 2, accountId: 'acc-1002', accountCode: '1002', accountName: '银行存款', debit: 1268400, credit: 0 },
  { row: 3, accountId: 'acc-1122', accountCode: '1122', accountName: '应收账款', debit: 486200, credit: 0 },
  { row: 4, accountId: 'acc-1405', accountCode: '1405', accountName: '库存商品', debit: 642800, credit: 0 },
  { row: 5, accountId: 'acc-1601', accountCode: '1601', accountName: '固定资产', debit: 980000, credit: 0 },
  { row: 6, accountId: 'acc-2202', accountCode: '2202', accountName: '应付账款', debit: 0, credit: 528400 },
  { row: 7, accountId: 'acc-3001', accountCode: '3001', accountName: '实收资本', debit: 0, credit: 1200000 },
  { row: 8, accountId: 'acc-3103', accountCode: '3103', accountName: '本年利润', debit: 0, credit: 1677640 }
]

const issueRows: OpeningBalanceRow[] = [
  { row: 1, accountId: 'acc-1001', accountCode: '1001', accountName: '库存现金', debit: 100000, credit: 0 },
  { row: 2, accountId: 'acc-1001', accountCode: '1001', accountName: '库存现金', debit: 100000, credit: 0 },
  { row: 3, accountId: '', accountCode: '9999', accountName: '未匹配科目', debit: 0, credit: 0 },
  { row: 4, accountId: 'acc-3001', accountCode: '3001', accountName: '实收资本', debit: 0, credit: 198800 }
]

const openingFiles: Record<OpeningBalanceFileKey, OpeningFileSeed> = {
  standard: {
    key: 'standard',
    label: '总账期初-标准',
    fileName: 'opening-balances-2026.csv',
    fileHash: '9b1c4d70a2f8e6315d8c0a14f27b9d33',
    chartRevision: 3,
    on: '2026-01-01',
    rows: standardRows,
    issues: []
  },
  issues: {
    key: 'issues',
    label: '总账期初-问题',
    fileName: 'opening-balances-2026-draft.csv',
    fileHash: 'f21e88b40c7d9a5630b4e2d918cf7740',
    chartRevision: 3,
    on: '2026-01-01',
    rows: issueRows,
    issues: [
      { row: 2, message: '科目 1001 在本文件中重复出现，请合并后再导入。', severity: 'error' },
      { row: 3, message: '科目 9999 不存在于当前科目表，或已停用。', severity: 'error' },
      { message: '借方合计 ¥200,000.00 与贷方合计 ¥198,800.00 相差 ¥1,200.00。', severity: 'error' }
    ]
  }
}

export function buildOpeningBalancePreview(fileKey: OpeningBalanceFileKey): OpeningBalancePreview {
  const seed = openingFiles[fileKey]
  const debit = seed.rows.reduce((sum, row) => sum + row.debit, 0)
  const credit = seed.rows.reduce((sum, row) => sum + row.credit, 0)
  return {
    fileKey: seed.key,
    fileName: seed.fileName,
    fileHash: seed.fileHash,
    chartRevision: seed.chartRevision,
    on: seed.on,
    currency: 'CNY',
    debit,
    credit,
    rowCount: seed.rows.length,
    rows: seed.rows.map(row => ({ ...row })),
    issues: seed.issues.map(issue => ({ ...issue })),
    canImport: seed.issues.every(issue => issue.severity !== 'error')
  }
}

export const openingSubledgerMeta = {
  fileKey: 'subledger-2026',
  fileName: 'opening-subledgers-2026.csv',
  fileHash: 'c4e8a1b76d0f2359ab8e4c17d2f6905a',
  chartRevision: 3,
  on: '2026-01-01'
}

export const openingSubledgerSources: OpeningSubledgerSource[] = [
  {
    id: 'src-stock-east',
    kind: 'stock',
    label: '华东中心仓',
    fileName: openingSubledgerMeta.fileName,
    reference: '第 1–12 行',
    detail: '12 个 SKU · 1,842 件',
    amount: 486400,
    ledgerAmount: 484400,
    difference: 2000,
    matched: false,
    href: '/inventory',
    sampleDocNo: 'RC-2026-0520-01',
    sampleLabel: '采购收货单'
  },
  {
    id: 'src-stock-south',
    kind: 'stock',
    label: '华南前置仓',
    fileName: openingSubledgerMeta.fileName,
    reference: '第 13–18 行',
    detail: '6 个 SKU · 286 件',
    amount: 158400,
    ledgerAmount: 158400,
    difference: 0,
    matched: true,
    href: '/inventory',
    sampleDocNo: 'OPEN-STOCK-WH-SOUTH',
    sampleLabel: '库存期初行'
  },
  {
    id: 'src-ar-yunshan',
    kind: 'receivable',
    label: '杭州云杉科技有限公司',
    fileName: openingSubledgerMeta.fileName,
    reference: '第 19–22 行',
    detail: '3 张未结发票',
    amount: 186400,
    ledgerAmount: 186400,
    difference: 0,
    matched: true,
    href: '/sales?tab=receivables',
    sampleDocNo: 'INV-2026-0089',
    sampleLabel: '销售发票'
  },
  {
    id: 'src-ar-yuanhang',
    kind: 'receivable',
    label: '南京远航商贸有限公司',
    fileName: openingSubledgerMeta.fileName,
    reference: '第 23–26 行',
    detail: '2 张未结发票',
    amount: 299800,
    ledgerAmount: 299800,
    difference: 0,
    matched: true,
    href: '/sales?tab=receivables',
    sampleDocNo: 'OPEN-AR-NJ-001',
    sampleLabel: '应收期初行'
  },
  {
    id: 'src-ap-suzhou',
    kind: 'payable',
    label: '苏州精工电子有限公司',
    fileName: openingSubledgerMeta.fileName,
    reference: '第 27–30 行',
    detail: '2 张未结账单',
    amount: 228400,
    ledgerAmount: 228400,
    difference: 0,
    matched: true,
    href: '/finance?tab=payables',
    sampleDocNo: 'BILL-2026-1101',
    sampleLabel: '供应商账单'
  },
  {
    id: 'src-ap-liancheng',
    kind: 'payable',
    label: '上海联诚办公用品有限公司',
    fileName: openingSubledgerMeta.fileName,
    reference: '第 31–34 行',
    detail: '2 张未结账单',
    amount: 300000,
    ledgerAmount: 300000,
    difference: 0,
    matched: true,
    href: '/finance?tab=payables',
    sampleDocNo: 'OPEN-AP-SH-001',
    sampleLabel: '应付期初行'
  },
  {
    id: 'src-bank-cmb',
    kind: 'bank',
    label: '招商银行基本户',
    fileName: openingSubledgerMeta.fileName,
    reference: '第 35–38 行',
    detail: '账户 6225 **** 0001',
    amount: 1268400,
    ledgerAmount: 1268400,
    difference: 0,
    matched: true,
    href: '/finance?tab=bank',
    sampleDocNo: 'ba-2026-01',
    sampleLabel: '银行账户'
  },
  {
    id: 'src-bank-boc',
    kind: 'bank',
    label: '中国银行一般户',
    fileName: openingSubledgerMeta.fileName,
    reference: '第 39–40 行',
    detail: '账户 4563 **** 0028',
    amount: 28640,
    ledgerAmount: 28640,
    difference: 0,
    matched: true,
    href: '/finance?tab=bank',
    sampleDocNo: 'ba-2026-02',
    sampleLabel: '银行账户'
  }
]

export function buildOpeningSubledgerPreview(sources: OpeningSubledgerSource[] = openingSubledgerSources): OpeningSubledgerPreview {
  const rows = sources.map(source => ({
    ...source,
    difference: source.amount - source.ledgerAmount,
    matched: Math.abs(source.amount - source.ledgerAmount) < 0.005
  }))
  const kinds = ['stock', 'receivable', 'payable', 'bank'] as const
  const labels: Record<OpeningSubledgerSource['kind'], string> = {
    stock: '库存',
    receivable: '未结应收',
    payable: '未结应付',
    bank: '银行现金'
  }
  const checks: OpeningSubledgerCheck[] = kinds.map((kind) => {
    const group = rows.filter(row => row.kind === kind)
    const label = labels[kind]
    const imported = group.reduce((sum, row) => sum + row.amount, 0)
    const ledger = group.reduce((sum, row) => sum + row.ledgerAmount, 0)
    return { kind, label, imported, subledger: imported, ledger, matched: Math.abs(imported - ledger) < 0.005 }
  })
  const totalImported = rows.reduce((sum, row) => sum + row.amount, 0)
  const totalLedger = rows.reduce((sum, row) => sum + row.ledgerAmount, 0)
  const totalDifference = totalImported - totalLedger
  const issues = totalDifference === 0
    ? []
    : [{ message: '库存子账比总账多 ¥2,000.00，复核时需填写差异说明。', severity: 'warning' as const }]
  return {
    ...openingSubledgerMeta,
    currency: 'CNY',
    sources: rows,
    checks,
    issues,
    totalImported,
    totalSubledger: totalImported,
    totalLedger,
    totalDifference
  }
}

export const openingSubledgerPreview = buildOpeningSubledgerPreview()

const matchedSources = openingSubledgerSources.map(source => source.kind === 'stock'
  ? { ...source, ledgerAmount: source.amount, difference: 0, matched: true }
  : { ...source })

export const openingSubledgerBatches: OpeningSubledgerBatch[] = [
  {
    id: 'OB-2026-0001',
    workspaceId: 'ws-hq',
    state: 'posted',
    version: 3,
    on: '2026-01-01',
    currency: 'CNY',
    fileKey: openingSubledgerMeta.fileKey,
    fileName: openingSubledgerMeta.fileName,
    fileHash: openingSubledgerMeta.fileHash,
    chartRevision: openingSubledgerMeta.chartRevision,
    equityAccountCode: '3103',
    equityAccountName: '本年利润',
    makerId: 'u-1001',
    makerName: '张明远',
    reviewerId: 'u-1004',
    reviewerName: '陈立',
    submittedAt: '2026-11-10 09:20',
    reviewedAt: '2026-11-10 10:05',
    completedAt: '2026-11-10 10:18',
    reviewNote: '四类子账与总账核对一致，同意导入。',
    sources: matchedSources,
    checks: buildOpeningSubledgerPreview(matchedSources).checks,
    issues: [],
    result: {
      journalIds: ['JE-OPEN-2026-0001', 'JE-OPEN-2026-0002', 'JE-OPEN-2026-0003', 'JE-OPEN-2026-0004'],
      stockMovements: 2,
      receivableDocs: 6,
      payableDocs: 4,
      bankMovements: 2,
      checks: 4,
      passed: 4,
      postedAt: '2026-11-10 10:18'
    }
  }
]

export const openingSubledgerStatusLabels: Record<OpeningSubledgerBatch['state'], string> = {
  submitted: '待独立复核',
  applying: '库存入账处理中',
  posted: '已过账',
  rejected: '已拒绝',
  cancelled: '已取消'
}

export const openingSubledgerStatusColors: Record<OpeningSubledgerBatch['state'], 'warning' | 'info' | 'success' | 'error' | 'neutral'> = {
  submitted: 'warning',
  applying: 'info',
  posted: 'success',
  rejected: 'error',
  cancelled: 'neutral'
}

export const openingSubledgerKindLabels: Record<OpeningSubledgerSource['kind'], string> = {
  stock: '库存',
  receivable: '未结应收',
  payable: '未结应付',
  bank: '银行现金'
}

export const reportExportKindLabels: Record<ReportExportKind, string> = {
  'trial-balance': '试算平衡',
  'income-statement': '利润表',
  'balance-sheet': '资产负债表',
  'cash-flow': '现金流量表'
}

export const reportExportStatusLabels: Record<ReportExportStatus, string> = {
  queued: '排队中',
  running: '生成中',
  ready: '已完成',
  failed: '失败'
}

export const reportExportStatusColors: Record<ReportExportStatus, 'info' | 'warning' | 'success' | 'error'> = {
  queued: 'info',
  running: 'warning',
  ready: 'success',
  failed: 'error'
}

export const reportExportSeeds: ReportExportRecord[] = [
  {
    id: 'EXP-2026-0001',
    workspaceId: 'ws-hq',
    kind: 'trial-balance',
    period: '2026-10',
    status: 'ready',
    requestedAt: '2026-11-02 09:12',
    completedAt: '2026-11-02 09:13',
    snapshotId: 'snap-2026-10-31-a13f',
    watermark: 128,
    rowCount: 42,
    fileHash: 'a13f90d6e2b8451c77f02a9d3e6b5c81',
    fileName: 'trial-balance-2026-10.csv',
    fileSizeKb: 3.2,
    basis: 'ledger'
  },
  {
    id: 'EXP-2026-0002',
    workspaceId: 'ws-hq',
    kind: 'cash-flow',
    period: '2026-09',
    status: 'failed',
    requestedAt: '2026-10-08 14:20',
    completedAt: '2026-10-08 14:21',
    snapshotId: 'snap-2026-09-30-77c1',
    watermark: 119,
    rowCount: 0,
    fileHash: '77c1b3f0ea6d4821c5a7e9b2d14f08a6',
    fileName: 'cash-flow-2026-09.csv',
    fileSizeKb: 0,
    basis: 'ledger',
    failureReason: '源快照缺少现金流量表辅助核算，生成失败；可按原快照重建后重试。'
  },
  {
    id: 'EXP-2026-0003',
    workspaceId: 'ws-hq',
    kind: 'balance-sheet',
    period: '2026-10',
    status: 'ready',
    requestedAt: '2026-11-03 16:08',
    completedAt: '2026-11-03 16:09',
    snapshotId: 'snap-2026-10-31-a13f',
    watermark: 128,
    rowCount: 28,
    fileHash: '5d2a8c31b7e04f96d1a6c8e5b9302f47',
    fileName: 'balance-sheet-2026-10.csv',
    fileSizeKb: 2.6,
    basis: 'ledger'
  }
]

export const openingImportActors = [
  { id: 'u-1001', name: '张明远', title: '制单人' },
  { id: 'u-1004', name: '陈立', title: '财务负责人' }
]
