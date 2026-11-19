export type TreasuryBadgeColor = 'neutral' | 'success' | 'warning' | 'error' | 'info' | 'primary'

export type TreasuryAccountKind = 'bank' | 'cash'
export type TreasuryLedgerCode = '1002' | '1001'

export const treasuryAccountKindLabels: Record<TreasuryAccountKind, string> = {
  bank: '银行账户',
  cash: '现金账户'
}

export const treasuryAccountKindColors: Record<TreasuryAccountKind, TreasuryBadgeColor> = {
  bank: 'info',
  cash: 'warning'
}

export const treasuryLedgerLabels: Record<TreasuryLedgerCode, string> = {
  1002: '1002 银行存款',
  1001: '1001 库存现金'
}

export interface TreasuryAccount {
  id: string
  kind: TreasuryAccountKind
  name: string
  accountNo: string
  balance: number
  ledgerCode: TreasuryLedgerCode
  isDefault: boolean
}

export type TreasuryFlowType = 'other-income' | 'expense' | 'transfer' | 'owner-contribution' | 'owner-withdrawal'
export type TreasuryFlowDirection = 'in' | 'out'
export type TreasuryFlowStatus = 'draft' | 'submitted' | 'posted' | 'voided'

export const treasuryFlowTypeLabels: Record<TreasuryFlowType, string> = {
  'other-income': '其他收入',
  'expense': '费用',
  'transfer': '资金划转',
  'owner-contribution': '业主投入',
  'owner-withdrawal': '业主提款'
}

/** 非划转类型的默认资金方向。划转会同时生成方向相反的两条流水。 */
export const treasuryFlowTypeDirections: Record<TreasuryFlowType, TreasuryFlowDirection> = {
  'other-income': 'in',
  'expense': 'out',
  'transfer': 'out',
  'owner-contribution': 'in',
  'owner-withdrawal': 'out'
}

export const treasuryFlowStatusLabels: Record<TreasuryFlowStatus, string> = {
  draft: '草稿',
  submitted: '已提交',
  posted: '已过账',
  voided: '已作废'
}

export const treasuryFlowStatusColors: Record<TreasuryFlowStatus, TreasuryBadgeColor> = {
  draft: 'neutral',
  submitted: 'warning',
  posted: 'success',
  voided: 'error'
}

export const treasuryFlowDirectionLabels: Record<TreasuryFlowDirection, string> = {
  in: '收入',
  out: '支出'
}

export interface TreasuryFlow {
  id: string
  type: TreasuryFlowType
  date: string
  amount: number
  direction: TreasuryFlowDirection
  accountId: string
  counterparty: string
  summary: string
  status: TreasuryFlowStatus
  maker: string
  createdAt: string
  submittedAt?: string
  postedAt?: string
  voidedAt?: string
  voucherNo?: string
  transferGroupId?: string
  originalFlowId?: string
  reversalFlowId?: string
  rejectReason?: string
  voidReason?: string
}

export type TreasuryStatementDirection = 'in' | 'out'
export type TreasuryStatementStatus = 'unmatched' | 'partial' | 'matched' | 'excluded'
export type TreasuryMatchKind = 'flow' | 'other-income' | 'other-expense' | 'vendor-payment'

export const treasuryStatementStatusLabels: Record<TreasuryStatementStatus, string> = {
  unmatched: '未匹配',
  partial: '部分匹配',
  matched: '已匹配',
  excluded: '已排除'
}

export const treasuryStatementStatusColors: Record<TreasuryStatementStatus, TreasuryBadgeColor> = {
  unmatched: 'warning',
  partial: 'info',
  matched: 'success',
  excluded: 'neutral'
}

export const treasuryMatchKindLabels: Record<TreasuryMatchKind, string> = {
  'flow': '已有流水',
  'other-income': '带入其他收入',
  'other-expense': '带入费用',
  'vendor-payment': '带入供应商付款'
}

export interface TreasuryStatementMatch {
  id: string
  kind: TreasuryMatchKind
  flowId?: string
  amount: number
  label: string
  createdAt: string
}

export interface TreasuryStatementRow {
  id: string
  accountId: string
  date: string
  summary: string
  amount: number
  direction: TreasuryStatementDirection
  status: TreasuryStatementStatus
  matchedAmount: number
  matches: TreasuryStatementMatch[]
  importBatchId: string
  excludeReason?: string
}

export interface TreasuryImportBatch {
  id: string
  accountId: string
  fileName: string
  importedAt: string
  validCount: number
  problemCount: number
  statementIds: string[]
}

export interface TreasuryCsvFile {
  key: string
  fileName: string
  accountId: string
  content: string
}

export interface TreasuryImportMapping {
  date: string
  summary: string
  amount: string
  direction: string
}

export interface TreasuryImportValidRow {
  line: number
  date: string
  summary: string
  amount: number
  direction: TreasuryStatementDirection
}

export type TreasuryImportRowStatus = 'valid' | 'duplicate' | 'invalid'

export interface TreasuryImportPreviewRow extends TreasuryImportValidRow {
  status: TreasuryImportRowStatus
  message: string
}

export interface TreasuryImportPreview {
  fileName: string
  headers: string[]
  rows: TreasuryImportPreviewRow[]
  validRows: TreasuryImportValidRow[]
  validCount: number
  duplicateCount: number
  invalidCount: number
  problemCount: number
  canImport: boolean
}

export type TreasuryReconciliationStatus = 'draft' | 'completed' | 'undone'

export const treasuryReconciliationStatusLabels: Record<TreasuryReconciliationStatus, string> = {
  draft: '待完成',
  completed: '已完成',
  undone: '已撤销'
}

export const treasuryReconciliationStatusColors: Record<TreasuryReconciliationStatus, TreasuryBadgeColor> = {
  draft: 'warning',
  completed: 'success',
  undone: 'neutral'
}

export interface TreasuryReconciliationRecord {
  id: string
  accountId: string
  cutoff: string
  bankBalance: number
  bookBalance: number
  outstanding: number
  difference: number
  status: TreasuryReconciliationStatus
  maker: string
  reviewer?: string
  createdAt: string
  savedAt?: string
  completedAt?: string
  undoneAt?: string
  undoReason?: string
  undoneBy?: string
  statementCount: number
  matchedStatementCount: number
}

export const treasuryAccounts: TreasuryAccount[] = [
  {
    id: 'ACC-B1',
    kind: 'bank',
    name: '工商银行基本户',
    accountNo: '6222 0210 1108 6601',
    balance: 286420.00,
    ledgerCode: '1002',
    isDefault: true
  },
  {
    id: 'ACC-B2',
    kind: 'bank',
    name: '建设银行一般户',
    accountNo: '6217 0012 0045 8820',
    balance: 128750.50,
    ledgerCode: '1002',
    isDefault: false
  },
  {
    id: 'ACC-B3',
    kind: 'bank',
    name: '招商银行工资户',
    accountNo: '6225 8800 3312 5579',
    balance: 56300.00,
    ledgerCode: '1002',
    isDefault: false
  },
  {
    id: 'ACC-C1',
    kind: 'cash',
    name: '出纳备用金',
    accountNo: '现金-备用金-01',
    balance: 8600.00,
    ledgerCode: '1001',
    isDefault: false
  },
  {
    id: 'ACC-C2',
    kind: 'cash',
    name: '门店现金',
    accountNo: '现金-门店-02',
    balance: 3280.00,
    ledgerCode: '1001',
    isDefault: false
  }
]

export const treasuryFlows: TreasuryFlow[] = [
  {
    id: 'F-2601',
    type: 'other-income',
    date: '2026-11-08',
    amount: 12000,
    direction: 'in',
    accountId: 'ACC-B1',
    counterparty: '宁波远航供应链有限公司',
    summary: '收到客户货款',
    status: 'posted',
    maker: '张明远',
    createdAt: '2026-11-08 09:20',
    submittedAt: '2026-11-08 09:26',
    postedAt: '2026-11-08 15:20',
    voucherNo: '记-2026-1108'
  },
  {
    id: 'F-2602',
    type: 'expense',
    date: '2026-11-12',
    amount: 3200,
    direction: 'out',
    accountId: 'ACC-B1',
    counterparty: '中国工商银行',
    summary: '银行手续费',
    status: 'posted',
    maker: '张明远',
    createdAt: '2026-11-12 10:02',
    submittedAt: '2026-11-12 10:05',
    postedAt: '2026-11-12 11:40',
    voucherNo: '记-2026-1112'
  },
  {
    id: 'F-2603',
    type: 'transfer',
    date: '2026-11-15',
    amount: 50000,
    direction: 'out',
    accountId: 'ACC-B1',
    counterparty: '建设银行一般户',
    summary: '基本户转一般户',
    status: 'posted',
    maker: '张明远',
    createdAt: '2026-11-15 09:10',
    submittedAt: '2026-11-15 09:15',
    postedAt: '2026-11-15 09:30',
    voucherNo: '记-2026-1115',
    transferGroupId: 'TG-2601'
  },
  {
    id: 'F-2604',
    type: 'transfer',
    date: '2026-11-15',
    amount: 50000,
    direction: 'in',
    accountId: 'ACC-B2',
    counterparty: '工商银行基本户',
    summary: '一般户收到内部划转',
    status: 'posted',
    maker: '张明远',
    createdAt: '2026-11-15 09:10',
    submittedAt: '2026-11-15 09:15',
    postedAt: '2026-11-15 09:30',
    voucherNo: '记-2026-1116',
    transferGroupId: 'TG-2601'
  },
  {
    id: 'F-2605',
    type: 'other-income',
    date: '2026-11-20',
    amount: 8600,
    direction: 'in',
    accountId: 'ACC-B1',
    counterparty: '苏州明泰电子有限公司',
    summary: '客户预付款',
    status: 'draft',
    maker: '张明远',
    createdAt: '2026-11-20 14:05'
  },
  {
    id: 'F-2606',
    type: 'owner-contribution',
    date: '2026-11-22',
    amount: 30000,
    direction: 'in',
    accountId: 'ACC-B1',
    counterparty: '业主 王海涛',
    summary: '业主追加投入',
    status: 'draft',
    maker: '张明远',
    createdAt: '2026-11-22 10:30'
  },
  {
    id: 'F-2607',
    type: 'expense',
    date: '2026-11-05',
    amount: 1850,
    direction: 'out',
    accountId: 'ACC-B1',
    counterparty: '晨光办公用品',
    summary: '办公用品采购',
    status: 'posted',
    maker: '张明远',
    createdAt: '2026-11-05 08:40',
    submittedAt: '2026-11-05 08:45',
    postedAt: '2026-11-05 09:10',
    voucherNo: '记-2026-1105'
  },
  {
    id: 'F-2608',
    type: 'owner-withdrawal',
    date: '2026-11-24',
    amount: 6000,
    direction: 'out',
    accountId: 'ACC-B1',
    counterparty: '业主 王海涛',
    summary: '业主提现',
    status: 'submitted',
    maker: '张明远',
    createdAt: '2026-11-24 16:20',
    submittedAt: '2026-11-24 16:25'
  },
  {
    id: 'F-2609',
    type: 'expense',
    date: '2026-11-26',
    amount: 420,
    direction: 'out',
    accountId: 'ACC-B1',
    counterparty: '顺丰速运',
    summary: '快递费',
    status: 'submitted',
    maker: '张明远',
    createdAt: '2026-11-26 11:15',
    submittedAt: '2026-11-26 11:18'
  },
  {
    id: 'F-2610',
    type: 'other-income',
    date: '2026-11-25',
    amount: 8000,
    direction: 'in',
    accountId: 'ACC-B2',
    counterparty: '苏州明泰电子有限公司',
    summary: '收到货款',
    status: 'posted',
    maker: '张明远',
    createdAt: '2026-11-25 13:40',
    submittedAt: '2026-11-25 13:45',
    postedAt: '2026-11-25 14:02',
    voucherNo: '记-2026-1118'
  },
  {
    id: 'F-2611',
    type: 'expense',
    date: '2026-11-27',
    amount: 1500,
    direction: 'out',
    accountId: 'ACC-B2',
    counterparty: '国家电网',
    summary: '水电费',
    status: 'draft',
    maker: '张明远',
    createdAt: '2026-11-27 09:05'
  }
]

export const treasuryStatements: TreasuryStatementRow[] = [
  {
    id: 'STM-2601',
    accountId: 'ACC-B1',
    date: '2026-11-28',
    summary: '收到货款 宁波远航',
    amount: 12000,
    direction: 'in',
    status: 'unmatched',
    matchedAmount: 0,
    matches: [],
    importBatchId: 'IMP-SEED'
  },
  {
    id: 'STM-2602',
    accountId: 'ACC-B1',
    date: '2026-11-29',
    summary: '银行手续费',
    amount: 3200,
    direction: 'out',
    status: 'unmatched',
    matchedAmount: 0,
    matches: [],
    importBatchId: 'IMP-SEED'
  },
  {
    id: 'STM-2603',
    accountId: 'ACC-B1',
    date: '2026-11-27',
    summary: '内部划转 基本户转一般户',
    amount: 50000,
    direction: 'out',
    status: 'unmatched',
    matchedAmount: 0,
    matches: [],
    importBatchId: 'IMP-SEED'
  },
  {
    id: 'STM-2604',
    accountId: 'ACC-B2',
    date: '2026-11-25',
    summary: '收到货款 苏州明泰',
    amount: 8000,
    direction: 'in',
    status: 'partial',
    matchedAmount: 3000,
    matches: [
      {
        id: 'M-9001',
        kind: 'flow',
        flowId: 'F-2610',
        amount: 3000,
        label: 'F-2610 收到货款',
        createdAt: '2026-11-29 10:12'
      }
    ],
    importBatchId: 'IMP-SEED'
  },
  {
    id: 'STM-2605',
    accountId: 'ACC-B2',
    date: '2026-11-26',
    summary: 'POS 手续费',
    amount: 500,
    direction: 'out',
    status: 'unmatched',
    matchedAmount: 0,
    matches: [],
    importBatchId: 'IMP-SEED'
  }
]

export const treasuryReconciliations: TreasuryReconciliationRecord[] = [
  {
    id: 'REC-2026-1001',
    accountId: 'ACC-B2',
    cutoff: '2026-10-31',
    bankBalance: 128900.50,
    bookBalance: 128750.50,
    outstanding: 150.00,
    difference: 0,
    status: 'completed',
    maker: '张明远',
    reviewer: '陈立',
    createdAt: '2026-11-01 09:40',
    savedAt: '2026-11-01 09:52',
    completedAt: '2026-11-01 10:20',
    statementCount: 6,
    matchedStatementCount: 6
  },
  {
    id: 'REC-2026-1002',
    accountId: 'ACC-B3',
    cutoff: '2026-11-30',
    bankBalance: 56100.00,
    bookBalance: 56300.00,
    outstanding: -200.00,
    difference: 0,
    status: 'draft',
    maker: '张明远',
    createdAt: '2026-11-18 15:30',
    savedAt: '2026-11-18 15:34',
    statementCount: 4,
    matchedStatementCount: 4
  }
]

/** 对账单导入样例：第 4 行为文件内重复行，第 5 行金额非法。 */
export const treasuryImportFiles: TreasuryCsvFile[] = [
  {
    key: 'icbc-2026-12',
    fileName: '工商银行_2026-12.csv',
    accountId: 'ACC-B1',
    content: [
      '交易日期,交易摘要,交易金额,收支方向',
      '2026-12-01,收到客户货款,8600.00,收入',
      '2026-12-02,支付办公用品,1200.00,支出',
      '2026-12-01,收到客户货款,8600.00,收入',
      '2026-12-04,银行手续费,abc,支出',
      '2026-12-05,业主投入,30000.00,收入'
    ].join('\n')
  }
]

export const treasuryImportMappingDefaults: TreasuryImportMapping = {
  date: '交易日期',
  summary: '交易摘要',
  amount: '交易金额',
  direction: '收支方向'
}

function parseCsvLine(line: string): string[] {
  return line.split(',').map(cell => cell.trim())
}

export function treasuryCsvHeaders(content: string): string[] {
  const firstLine = content.split(/\r?\n/).find(line => line.trim().length > 0)
  return firstLine ? parseCsvLine(firstLine) : []
}

function parseDirection(value: string): TreasuryStatementDirection | null {
  const normalized = value.trim()
  if (['收入', '入', '收', '贷', '进账', 'in'].includes(normalized)) return 'in'
  if (['支出', '出', '付', '借', '出账', 'out'].includes(normalized)) return 'out'
  return null
}

function normalizeDate(value: string): string | null {
  const text = value.trim().replace(/\//g, '-')
  if (!/^\d{4}-\d{1,2}-\d{1,2}$/.test(text)) return null
  const [year, month, day] = text.split('-')
  return year + '-' + month!.padStart(2, '0') + '-' + day!.padStart(2, '0')
}

export function parseTreasuryCsv(
  fileName: string,
  content: string,
  mapping: TreasuryImportMapping,
  existing: Array<Pick<TreasuryStatementRow, 'date' | 'summary' | 'amount' | 'direction'>>
): TreasuryImportPreview {
  const lines = content.split(/\r?\n/).filter(line => line.trim().length > 0)
  const headers = lines.length > 0 ? parseCsvLine(lines[0]!) : []
  const dateIndex = headers.indexOf(mapping.date)
  const summaryIndex = headers.indexOf(mapping.summary)
  const amountIndex = headers.indexOf(mapping.amount)
  const directionIndex = headers.indexOf(mapping.direction)
  const mappingInvalid = [dateIndex, summaryIndex, amountIndex, directionIndex].some(index => index < 0)
  const seen = new Set(existing.map(item => item.date + '|' + item.summary + '|' + item.amount.toFixed(2) + '|' + item.direction))
  const rows: TreasuryImportPreviewRow[] = []
  const validRows: TreasuryImportValidRow[] = []

  lines.slice(1).forEach((line, index) => {
    const lineNumber = index + 2
    const cells = parseCsvLine(line)
    const dateCell = cells[dateIndex] ?? ''
    const summaryCell = cells[summaryIndex] ?? ''
    const amountCell = cells[amountIndex] ?? ''
    const directionCell = cells[directionIndex] ?? ''
    const date = normalizeDate(dateCell)
    const direction = parseDirection(directionCell)
    const amountText = amountCell.replace(/[¥￥,\s]/g, '')
    const amount = Number(amountText)
    const amountValid = amountText !== '' && Number.isFinite(amount) && amount > 0
    let status: TreasuryImportRowStatus = 'valid'
    let message = '可导入'

    if (mappingInvalid) {
      status = 'invalid'
      message = '列映射不完整，请为日期、摘要、金额和方向选择对应列。'
    } else if (!date) {
      status = 'invalid'
      message = '日期格式无效，应为 YYYY-MM-DD。'
    } else if (!amountValid) {
      status = 'invalid'
      message = '金额非法，需为大于 0 的数字。'
    } else if (!direction) {
      status = 'invalid'
      message = '收支方向无法识别。'
    }

    const row: TreasuryImportPreviewRow = {
      line: lineNumber,
      date: date ?? dateCell,
      summary: summaryCell || '—',
      amount: amountValid ? Number(amount.toFixed(2)) : 0,
      direction: direction ?? 'in',
      status,
      message
    }

    if (status === 'valid') {
      const signature = row.date + '|' + row.summary + '|' + row.amount.toFixed(2) + '|' + row.direction
      if (seen.has(signature)) {
        row.status = 'duplicate'
        row.message = '与已有流水或文件内前序行重复。'
      } else {
        seen.add(signature)
        validRows.push({
          line: row.line,
          date: row.date,
          summary: row.summary,
          amount: row.amount,
          direction: row.direction
        })
      }
    }

    rows.push(row)
  })

  const duplicateCount = rows.filter(row => row.status === 'duplicate').length
  const invalidCount = rows.filter(row => row.status === 'invalid').length
  const problemCount = duplicateCount + invalidCount

  return {
    fileName,
    headers,
    rows,
    validRows,
    validCount: validRows.length,
    duplicateCount,
    invalidCount,
    problemCount,
    canImport: !mappingInvalid && validRows.length > 0
  }
}
