import type { FinanceAccount, FinancePeriod, JournalLine } from './types'

/**
 * C15 财务关账与年结演示种子。
 * 本文件只提供本地类型与初始数据，不修改 mocks/types.ts 与 mocks/index.ts。
 * 所有页面动作仅在组件内的 ref 状态中生效，刷新后恢复为这里的种子。
 */

export const NEWLINE = String.fromCharCode(10)

// ---- 工作台就绪 ----

export type ReadinessKey = 'ledger' | 'opening' | 'vouchers' | 'inventory-cost'
export type ReadinessStatus = 'pass' | 'blocked'

export interface ReadinessMeta {
  key: ReadinessKey
  label: string
  description: string
  sourceTitle: string
  sourceDescription: string
  sourceAction: string
  actionTarget: 'source' | 'journals' | 'cost'
}

export const readinessMeta: ReadinessMeta[] = [
  {
    key: 'ledger',
    label: '账簿已建立',
    description: '2026 会计年度账簿与 12 个会计期间已建立，科目表版本已锁定。',
    sourceTitle: '2026 年度账簿',
    sourceDescription: '账簿编号 LEDGER-2026-HQ，记账本位币 CNY，12 个期间按自然月划分。',
    sourceAction: '查看账簿信息',
    actionTarget: 'source'
  },
  {
    key: 'opening',
    label: '期初余额已导入',
    description: '2026-01 期初批次已复核通过，借贷平衡，期初余额已带入总账。',
    sourceTitle: '期初余额批次 OB-2026-001',
    sourceDescription: '文件 opening-2026.csv，30 个科目，借贷各 2,695,000.00。',
    sourceAction: '查看期初批次',
    actionTarget: 'source'
  },
  {
    key: 'vouchers',
    label: '已过账缺凭证',
    description: '已过账但未关联业务来源的凭证需要扫描并补齐关联，否则关账检查阻断。',
    sourceTitle: '已过账未关联业务凭证',
    sourceDescription: '扫描全部已过账凭证，列出缺少业务来源关联的异常记录。',
    sourceAction: '去凭证页扫描',
    actionTarget: 'journals'
  },
  {
    key: 'inventory-cost',
    label: '待入账库存成本',
    description: '本期出入库单据已生成但成本尚未入账，需要补记库存成本凭证。',
    sourceTitle: '待入账库存成本明细',
    sourceDescription: '两张出库单的移动加权成本尚未过账，合计 42,800.00。',
    sourceAction: '补记库存成本',
    actionTarget: 'cost'
  }
]

export const ledgerSeed = {
  id: 'LEDGER-2026-HQ',
  fiscalYear: 2026,
  createdAt: '2026-01-02 09:30',
  chartRevision: 7,
  currency: 'CNY',
  periodCount: 12
}

export const openingBatchSeed = {
  id: 'OB-2026-001',
  fileName: 'opening-2026.csv',
  importedAt: '2026-01-05 09:12',
  accountCount: 30,
  debit: '2695000.00',
  credit: '2695000.00',
  status: 'approved',
  reviewer: '陈立'
}

export interface PendingInventoryCostEntry {
  ref: string
  warehouse: string
  amount: string
  note: string
}

export const pendingInventoryCost = {
  amount: '42800.00',
  cutoffDate: '2026-11-30',
  entries: [
    { ref: 'SO-2026-1121', warehouse: '华东仓', amount: '26800.00', note: '销售出库 · 移动加权成本' },
    { ref: 'SO-2026-1122', warehouse: '华南仓', amount: '16000.00', note: '销售出库 · 移动加权成本' }
  ] as PendingInventoryCostEntry[],
  accountCode: '4101',
  accountName: '主营业务成本',
  offsetAccountCode: '1405',
  offsetAccountName: '库存商品'
}

export interface CostRecordSeed {
  id: string
  cutoffDate: string
  amount: string
  summary: string
  source: string
  createdAt: string
  by: string
}

export const costRecordSeeds: CostRecordSeed[] = []

// ---- 凭证生命周期 ----

export type ClosingJournalStage = 'draft' | 'submitted' | 'posted' | 'reversed'
export type ClosingJournalSourceKind = 'manual' | 'external' | 'inventory-cost' | 'carryover'

export interface ClosingJournal {
  id: string
  date: string
  period: string
  description: string
  stage: ClosingJournalStage
  debitTotal: string
  creditTotal: string
  lines: JournalLine[]
  preparedBy: string
  preparedById: string
  reviewer?: string
  submittedAt?: string
  postedAt?: string
  reversedAt?: string
  sourceKind: ClosingJournalSourceKind
  sourceLabel: string
  businessRef?: string
  originalId?: string
  reversalId?: string
  local?: boolean
}

export interface ClosingJournalSeed {
  id: string
  date: string
  period: string
  description: string
  stage: 'draft' | 'posted'
  debitTotal: string
  creditTotal: string
  lines: JournalLine[]
  preparedBy: string
  preparedById: string
  sourceKind: ClosingJournalSourceKind
  sourceLabel: string
  businessRef?: string
  postedAt?: string
}

export const closingJournalSeeds: ClosingJournalSeed[] = [
  {
    id: 'JE-2026-1201',
    date: '2026-12-05',
    period: '2026-12',
    description: '计提 2026 年 11 月固定资产折旧',
    stage: 'draft',
    debitTotal: '12400.00',
    creditTotal: '12400.00',
    lines: [
      { accountCode: '4105', accountName: '管理费用', debit: '12400.00', credit: '0.00' },
      { accountCode: '1602', accountName: '累计折旧', debit: '0.00', credit: '12400.00' }
    ],
    preparedBy: '张明远',
    preparedById: 'u-1001',
    sourceKind: 'manual',
    sourceLabel: '手工录入 · 折旧计提',
    businessRef: 'FA-2026-11'
  },
  {
    id: 'JE-2026-1202',
    date: '2026-12-06',
    period: '2026-12',
    description: '计提 2026 年 11 月职工薪酬',
    stage: 'draft',
    debitTotal: '48000.00',
    creditTotal: '48000.00',
    lines: [
      { accountCode: '4105', accountName: '管理费用', debit: '48000.00', credit: '0.00' },
      { accountCode: '2211', accountName: '应付职工薪酬', debit: '0.00', credit: '48000.00' }
    ],
    preparedBy: '张明远',
    preparedById: 'u-1001',
    sourceKind: 'manual',
    sourceLabel: '手工录入 · 工资计提',
    businessRef: 'PAY-2026-11'
  },
  {
    id: 'JE-2026-1150',
    date: '2026-11-19',
    period: '2026-11',
    description: '银行账户管理费扣款',
    stage: 'posted',
    debitTotal: '260.00',
    creditTotal: '260.00',
    lines: [
      { accountCode: '4106', accountName: '财务费用', debit: '260.00', credit: '0.00' },
      { accountCode: '1002', accountName: '银行存款', debit: '0.00', credit: '260.00' }
    ],
    preparedBy: '系统导入',
    preparedById: 'u-system',
    sourceKind: 'external',
    sourceLabel: '网银流水导入 · 2026-11-19',
    postedAt: '2026-11-19 18:02'
  }
]

export const businessLinkOptions = [
  { label: 'SO-2026-1121 销售出库单', value: 'SO-2026-1121' },
  { label: 'SO-2026-1122 销售出库单', value: 'SO-2026-1122' },
  { label: 'PO-2026-0516 采购入库单', value: 'PO-2026-0516' },
  { label: 'FA-2026-11 折旧计提单', value: 'FA-2026-11' },
  { label: 'PAY-2026-11 工资计提单', value: 'PAY-2026-11' },
  { label: 'BT-2026-1110 银行手续费回单', value: 'BT-2026-1110' }
]

// ---- 科目树治理 ----

export interface ChartAccountMeta {
  purpose: string
  template?: boolean
}

export const chartAccountMeta: Record<string, ChartAccountMeta> = {
  1001: { purpose: '日常现金收付与备用金管理', template: true },
  1002: { purpose: '银行结算与对账主科目', template: true },
  1122: { purpose: '销售应收、收款核销与账龄分析', template: true },
  1403: { purpose: '原材料采购入库与领用成本', template: true },
  1405: { purpose: '库存商品成本与销售结转', template: true },
  2202: { purpose: '采购应付与付款核销', template: true },
  2211: { purpose: '工资、奖金与社保计提发放', template: true },
  3001: { purpose: '合伙人实收资本登记', template: true },
  3104: { purpose: '利润分配与合伙人提款', template: true },
  4001: { purpose: '商品销售收入确认', template: true },
  4101: { purpose: '销售成本结转与库存成本入账', template: true },
  4105: { purpose: '管理费用归集与期间结转', template: true }
}

export const chartExtraAccounts: FinanceAccount[] = [
  { id: 'acc-local-1003', code: '1003', name: '备用金', type: 'asset', balance: '0.00' },
  { id: 'acc-local-4109', code: '4109', name: '税金及附加-待摊', type: 'expense', balance: '0.00' }
]

export interface ChartTemplateAccount {
  code: string
  name: string
  type: FinanceAccount['type']
}

export const chartTemplateAccounts: ChartTemplateAccount[] = [
  { code: '1001', name: '库存现金', type: 'asset' },
  { code: '1002', name: '银行存款', type: 'asset' },
  { code: '1122', name: '应收账款', type: 'asset' },
  { code: '1403', name: '原材料', type: 'asset' },
  { code: '1405', name: '库存商品', type: 'asset' },
  { code: '2202', name: '应付账款', type: 'liability' },
  { code: '2211', name: '应付职工薪酬', type: 'liability' },
  { code: '3001', name: '实收资本', type: 'equity' },
  { code: '3104', name: '利润分配', type: 'equity' },
  { code: '4001', name: '主营业务收入', type: 'revenue' },
  { code: '4101', name: '主营业务成本', type: 'expense' },
  { code: '4105', name: '管理费用', type: 'expense' }
]

export const chartImportSample = [
  '科目编码,科目名称,科目类型,期初余额',
  '1003,备用金,asset,0.00',
  '6101,研发支出,expense,0.00',
  '1002,重复编码科目,asset,0.00',
  ',缺少编码科目,asset,0.00',
  '9999,无效类型科目,unknown,0.00',
  '6001,主营业务收入-新增,revenue,12000.00'
].join(NEWLINE)

// ---- 期间与年结 ----

export interface PeriodHistoryEvent {
  id: string
  at: string
  action: string
  actor: string
  reason?: string
}

export const periodHistorySeeds: Record<string, PeriodHistoryEvent[]> = {
  '2026-10': [
    { id: 'ph-2026-10-1', at: '2026-10-31 18:00', action: '开始关账', actor: '陈立' },
    { id: 'ph-2026-10-2', at: '2026-11-01 09:20', action: '关账检查阻断', actor: '系统', reason: '已过账凭证缺少业务关联 1 张' }
  ],
  '2026-09': [
    { id: 'ph-2026-09-1', at: '2026-09-30 18:10', action: '开始关账', actor: '陈立' },
    { id: 'ph-2026-09-2', at: '2026-10-05 18:00', action: '清零关闭', actor: '陈立' }
  ],
  '2025-06': [
    { id: 'ph-2025-06-1', at: '2025-07-05 17:40', action: '清零关闭', actor: '陈立' }
  ]
}

export const periodCheckMeta = [
  { key: 'journal', label: '未过账凭证', description: '期间内不能存在草稿或待复核凭证。' },
  { key: 'business', label: '凭证业务关联', description: '已过账凭证必须关联业务来源。' },
  { key: 'inventory', label: '库存成本已入账', description: '期间内出库成本需补记入账。' },
  { key: 'prior', label: '上期已关账', description: '按自然月顺序关账，上期需先关闭。' }
]

export interface PeriodClosingCheck {
  key: string
  label: string
  passed: boolean
  detail: string
}

export function buildPeriod2025Seed(): FinancePeriod[] {
  const days = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  return days.map((day, index) => {
    const month = String(index + 1).padStart(2, '0')
    const period = '2025-' + month
    return {
      id: 'period-' + period,
      period,
      status: 'closed' as const,
      startDate: period + '-01',
      endDate: period + '-' + String(day).padStart(2, '0'),
      closedAt: period + '-05 18:00'
    }
  })
}

export const period2025Seeds: FinancePeriod[] = buildPeriod2025Seed()

export type ClosingYearStatus = 'open' | 'requested' | 'closed'

export interface ClosingYearState {
  year: number
  status: ClosingYearStatus
  profit: string
  requestedBy?: string
  approvedBy?: string
  requestedAt?: string
  closedAt?: string
  carryoverJournalId?: string
  reversalJournalId?: string
  closedProfit?: string
}

export const closingYearSeeds: ClosingYearState[] = [
  {
    year: 2025,
    status: 'closed',
    profit: '186400.00',
    requestedBy: '张明远',
    approvedBy: '陈立',
    requestedAt: '2026-01-08 09:20',
    closedAt: '2026-01-09 16:40',
    carryoverJournalId: 'JE-CLOSE-2025',
    reversalJournalId: 'JE-CLOSE-2025-R',
    closedProfit: '186400.00'
  },
  {
    year: 2026,
    status: 'open',
    profit: '258600.00'
  }
]

export interface CarryoverLine {
  accountCode: string
  accountName: string
  debit: string
  credit: string
}

export const yearCarryoverLines: Record<number, CarryoverLine[]> = {
  2025: [
    { accountCode: '3103', accountName: '本年利润', debit: '186400.00', credit: '0.00' },
    { accountCode: '3104', accountName: '利润分配', debit: '0.00', credit: '186400.00' }
  ],
  2026: [
    { accountCode: '3103', accountName: '本年利润', debit: '258600.00', credit: '0.00' },
    { accountCode: '3104', accountName: '利润分配', debit: '0.00', credit: '258600.00' }
  ]
}

// ---- 合伙人份额 ----

export interface PartnerShareSeed {
  id: string
  name: string
  role: string
  share: number
  capitalAccountCode: string
  drawingAccountCode: string
}

export const partnerYearOptions = [2026, 2025]

export const partnerShareByYear: Record<number, PartnerShareSeed[]> = {
  2026: [
    { id: 'partner-01', name: '张明远', role: '执行事务合伙人', share: 40, capitalAccountCode: '3001', drawingAccountCode: '3104' },
    { id: 'partner-02', name: '陈立', role: '管理合伙人', share: 35, capitalAccountCode: '3001', drawingAccountCode: '3104' },
    { id: 'partner-03', name: '王倩', role: '财务合伙人', share: 25, capitalAccountCode: '3002', drawingAccountCode: '1221' }
  ],
  2025: [
    { id: 'partner-01', name: '张明远', role: '执行事务合伙人', share: 45, capitalAccountCode: '3001', drawingAccountCode: '3104' },
    { id: 'partner-02', name: '陈立', role: '管理合伙人', share: 35, capitalAccountCode: '3001', drawingAccountCode: '3104' },
    { id: 'partner-03', name: '王倩', role: '财务合伙人', share: 20, capitalAccountCode: '3002', drawingAccountCode: '1221' }
  ]
}
