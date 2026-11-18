import type {
  AgingBucket,
  BankAccount,
  BankTransaction,
  FinanceAccount,
  FinanceAccountType,
  FinancePeriod,
  FinancePeriodStatus,
  JournalEntry,
  JournalStatus,
  PartnerLedgerEntry,
  ReportRow,
  TaxPeriod,
  TaxRateDefinition
} from './types'
import { makeJournalEntry } from './factories'

export const accountTypeLabels: Record<FinanceAccountType, string> = {
  asset: '资产',
  liability: '负债',
  equity: '权益',
  revenue: '收入',
  expense: '费用'
}
export const accountTypeOrder: FinanceAccountType[] = ['asset', 'liability', 'equity', 'revenue', 'expense']
/** 余额方向：资产、费用在借方，负债、权益、收入在贷方。 */
export const accountBalanceDirections: Record<FinanceAccountType, '借' | '贷'> = {
  asset: '借',
  liability: '贷',
  equity: '贷',
  revenue: '贷',
  expense: '借'
}
export const journalStatusLabels: Record<JournalStatus, string> = {
  draft: '草稿',
  posted: '已过账',
  reversed: '已冲销'
}
export const journalStatusColors: Record<JournalStatus, 'neutral' | 'success' | 'warning'> = {
  draft: 'neutral',
  posted: 'success',
  reversed: 'warning'
}

const accountSeeds: Array<[string, string, FinanceAccountType, string]> = [
  ['1001', '库存现金', 'asset', '28640.00'],
  ['1002', '银行存款', 'asset', '1268400.00'],
  ['1122', '应收账款', 'asset', '486200.00'],
  ['1123', '预付账款', 'asset', '128000.00'],
  ['1221', '其他应收款', 'asset', '36400.00'],
  ['1403', '原材料', 'asset', '218600.00'],
  ['1405', '库存商品', 'asset', '642800.00'],
  ['1601', '固定资产', 'asset', '980000.00'],
  ['1602', '累计折旧', 'asset', '126000.00'],
  ['2001', '短期借款', 'liability', '300000.00'],
  ['2202', '应付账款', 'liability', '528400.00'],
  ['2203', '预收账款', 'liability', '96400.00'],
  ['2211', '应付职工薪酬', 'liability', '186200.00'],
  ['2221', '应交税费', 'liability', '74200.00'],
  ['3001', '实收资本', 'equity', '1000000.00'],
  ['3002', '资本公积', 'equity', '240000.00'],
  ['3103', '本年利润', 'equity', '186400.00'],
  ['3104', '利润分配', 'equity', '82000.00'],
  ['4001', '主营业务收入', 'revenue', '1286400.00'],
  ['4051', '其他业务收入', 'revenue', '86400.00'],
  ['4101', '主营业务成本', 'expense', '842600.00'],
  ['4102', '其他业务成本', 'expense', '42800.00'],
  ['4103', '税金及附加', 'expense', '18600.00'],
  ['4104', '销售费用', 'expense', '96400.00'],
  ['4105', '管理费用', 'expense', '128600.00'],
  ['4106', '财务费用', 'expense', '12400.00'],
  ['4107', '研发费用', 'expense', '68400.00'],
  ['4108', '营业外支出', 'expense', '3200.00'],
  ['4201', '营业外收入', 'revenue', '8600.00'],
  ['4301', '所得税费用', 'expense', '42600.00']
]

export const financeAccounts: FinanceAccount[] = accountSeeds.map(([code, name, type, balance], i) => ({
  id: 'acc-' + (1001 + i),
  code,
  name,
  type,
  balance
}))

export const journalEntries: JournalEntry[] = [
  { id: 'JE-2026-1101', date: '2026-11-01', period: '2026-11', description: '采购办公用品入库', status: 'posted', debitTotal: '22600.00', creditTotal: '22600.00', lines: [
    { accountCode: '1403', accountName: '原材料', debit: '22600.00', credit: '0.00' },
    { accountCode: '2202', accountName: '应付账款', debit: '0.00', credit: '22600.00' }
  ] },
  { id: 'JE-2026-1102', date: '2026-11-03', period: '2026-11', description: '销售商品确认收入', status: 'posted', debitTotal: '128400.00', creditTotal: '128400.00', lines: [
    { accountCode: '1122', accountName: '应收账款', debit: '128400.00', credit: '0.00' },
    { accountCode: '4001', accountName: '主营业务收入', debit: '0.00', credit: '128400.00' }
  ] },
  { id: 'JE-2026-1103', date: '2026-11-05', period: '2026-11', description: '支付供应商货款', status: 'posted', debitTotal: '63210.00', creditTotal: '63210.00', lines: [
    { accountCode: '2202', accountName: '应付账款', debit: '63210.00', credit: '0.00' },
    { accountCode: '1002', accountName: '银行存款', debit: '0.00', credit: '63210.00' }
  ] },
  ...Array.from({ length: 9 }, (_, i) => makeJournalEntry({ id: 'JE-2026-' + (1110 + i), period: '2026-11' }, 9100 + i))
]

export const reportRows: ReportRow[] = [
  { id: 'r-1', report: 'trial-balance', label: '资产合计', amount: '3136840.00', level: 0 },
  { id: 'r-2', report: 'trial-balance', label: '负债合计', amount: '1186600.00', level: 0 },
  { id: 'r-3', report: 'trial-balance', label: '权益合计', amount: '1508400.00', level: 0 },
  { id: 'r-4', report: 'income-statement', label: '营业收入', amount: '1286400.00', level: 0 },
  { id: 'r-5', report: 'income-statement', label: '营业成本', amount: '842600.00', level: 1 },
  { id: 'r-6', report: 'income-statement', label: '期间费用', amount: '292000.00', level: 1 },
  { id: 'r-7', report: 'balance-sheet', label: '流动资产', amount: '2048240.00', level: 0 },
  { id: 'r-8', report: 'cash-flow', label: '经营活动现金流', amount: '186400.00', level: 0 },
  { id: 'r-9', report: 'trial-balance', label: '收入合计', amount: '1286400.00', level: 0 },
  { id: 'r-10', report: 'trial-balance', label: '成本费用合计', amount: '844560.00', level: 0 },
  { id: 'r-11', report: 'income-statement', label: '营业利润', amount: '151800.00', level: 0 },
  { id: 'r-12', report: 'income-statement', label: '利润总额', amount: '151800.00', level: 0 },
  { id: 'r-13', report: 'income-statement', label: '所得税费用', amount: '22770.00', level: 1 },
  { id: 'r-14', report: 'income-statement', label: '净利润', amount: '129030.00', level: 0 },
  { id: 'r-15', report: 'balance-sheet', label: '非流动资产', amount: '646760.00', level: 0 },
  { id: 'r-16', report: 'balance-sheet', label: '资产总计', amount: '2695000.00', level: 0 },
  { id: 'r-17', report: 'balance-sheet', label: '负债合计', amount: '1186600.00', level: 0 },
  { id: 'r-18', report: 'balance-sheet', label: '所有者权益合计', amount: '1508400.00', level: 0 },
  { id: 'r-19', report: 'balance-sheet', label: '负债和所有者权益总计', amount: '2695000.00', level: 0 },
  { id: 'r-20', report: 'cash-flow', label: '投资活动现金流', amount: '-126000.00', level: 0 },
  { id: 'r-21', report: 'cash-flow', label: '筹资活动现金流', amount: '300000.00', level: 0 },
  { id: 'r-22', report: 'cash-flow', label: '现金净增加额', amount: '360400.00', level: 0 },
  { id: 'r-23', report: 'cash-flow', label: '期末现金余额', amount: '1268400.00', level: 0 }
]

/** 近六个月净利润趋势，用于利润表页签图表。 */
export const financeTrend: Array<{ month: string, amount: number }> = [
  { month: '2026-06', amount: 96800 },
  { month: '2026-07', amount: 104200 },
  { month: '2026-08', amount: 112600 },
  { month: '2026-09', amount: 121400 },
  { month: '2026-10', amount: 118900 },
  { month: '2026-11', amount: 129030 }
]

export const agingBuckets: AgingBucket[] = [
  { bucket: '未到期', receivable: '328600.00', payable: '412800.00' },
  { bucket: '1-30 天', receivable: '96200.00', payable: '68400.00' },
  { bucket: '31-60 天', receivable: '42800.00', payable: '32600.00' },
  { bucket: '60 天以上', receivable: '18600.00', payable: '14600.00' }
]

export const taxPeriods: TaxPeriod[] = [
  { id: 'tax-2026-09', period: '2026-09', status: 'closed', taxableAmount: '986400.00', taxAmount: '128232.00', dueAt: '2026-10-15' },
  { id: 'tax-2026-10', period: '2026-10', status: 'closed', taxableAmount: '1128400.00', taxAmount: '146692.00', dueAt: '2026-11-15' },
  { id: 'tax-2026-11', period: '2026-11', status: 'open', taxableAmount: '1286400.00', taxAmount: '167232.00', dueAt: '2026-12-15' }
]

// ---- B7 财务作业扩展：会计期间、银行、税务与伙伴明细账 ----

export const financePeriodStatusLabels: Record<FinancePeriodStatus, string> = {
  open: '未关账',
  closing: '关账中',
  closed: '已关账'
}
export const financePeriodStatusColors: Record<FinancePeriodStatus, 'neutral' | 'warning' | 'success'> = {
  open: 'neutral',
  closing: 'warning',
  closed: 'success'
}

const PERIOD_END_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

/** 2026 年度会计期间：1-9 月已关账，10 月关账中，11-12 月未关账（本地演示）。 */
export const financePeriods: FinancePeriod[] = PERIOD_END_DAYS.map((days, index) => {
  const month = String(index + 1).padStart(2, '0')
  const period = '2026-' + month
  const status: FinancePeriodStatus = index <= 8 ? 'closed' : index === 9 ? 'closing' : 'open'
  const base: FinancePeriod = {
    id: 'period-2026-' + month,
    period,
    status,
    startDate: period + '-01',
    endDate: period + '-' + days
  }
  return status === 'closed' ? { ...base, closedAt: '2026-' + month + '-05 18:00' } : base
})

export const bankAccountStatusLabels: Record<'active' | 'inactive', string> = {
  active: '正常',
  inactive: '停用'
}

export const bankAccounts: BankAccount[] = [
  { id: 'ba-2026-01', workspaceId: 'ws-hq', bankName: '招商银行', accountName: '基本存款账户', accountNo: '6225 8001 2345 6789', balance: '1268400.00', currency: 'CNY', status: 'active', updatedAt: '2026-11-18 09:20' },
  { id: 'ba-2026-02', workspaceId: 'ws-hq', bankName: '中国银行', accountName: '一般存款账户', accountNo: '4563 2100 9876 5432', balance: '486200.00', currency: 'CNY', status: 'active', updatedAt: '2026-11-17 16:40' },
  { id: 'ba-2026-03', workspaceId: 'ws-hq', bankName: '工商银行', accountName: '工资专用账户', accountNo: '6222 0202 0011 2233', balance: '96000.00', currency: 'CNY', status: 'inactive', updatedAt: '2026-10-31 18:00' }
]

export const bankTransactions: BankTransaction[] = [
  { id: 'bt-2026-1101', bankAccountId: 'ba-2026-01', date: '2026-11-01', description: '收到杭州云杉科技货款', amount: '128400.00', direction: 'in', counterparty: '杭州云杉科技有限公司', matched: true, matchedJournalId: 'JE-2026-1102' },
  { id: 'bt-2026-1102', bankAccountId: 'ba-2026-01', date: '2026-11-02', description: '支付苏州精工电子货款', amount: '63210.00', direction: 'out', counterparty: '苏州精工电子有限公司', matched: true, matchedJournalId: 'JE-2026-1103' },
  { id: 'bt-2026-1103', bankAccountId: 'ba-2026-01', date: '2026-11-03', description: '采购办公用品付款', amount: '22600.00', direction: 'out', counterparty: '上海联诚办公用品有限公司', matched: true, matchedJournalId: 'JE-2026-1101' },
  { id: 'bt-2026-1104', bankAccountId: 'ba-2026-01', date: '2026-11-05', description: '收到南京远航贸易预付款', amount: '48260.00', direction: 'in', counterparty: '南京远航贸易有限公司', matched: false },
  { id: 'bt-2026-1105', bankAccountId: 'ba-2026-01', date: '2026-11-08', description: '支付十一月办公场地租金', amount: '38000.00', direction: 'out', counterparty: '杭州未来科技城物业管理有限公司', matched: false },
  { id: 'bt-2026-1106', bankAccountId: 'ba-2026-01', date: '2026-11-11', description: '收到无锡恒信实业货款', amount: '63200.00', direction: 'in', counterparty: '无锡恒信实业有限公司', matched: false },
  { id: 'bt-2026-1107', bankAccountId: 'ba-2026-01', date: '2026-11-14', description: '支付员工差旅报销', amount: '12680.00', direction: 'out', counterparty: '员工报销专户', matched: false },
  { id: 'bt-2026-1108', bankAccountId: 'ba-2026-01', date: '2026-11-16', description: '支付宁波华翔包装货款', amount: '35800.00', direction: 'out', counterparty: '宁波华翔包装材料有限公司', matched: false },
  { id: 'bt-2026-1109', bankAccountId: 'ba-2026-01', date: '2026-11-18', description: '银行账户管理费', amount: '260.00', direction: 'out', counterparty: '招商银行', matched: false },
  { id: 'bt-2026-1110', bankAccountId: 'ba-2026-02', date: '2026-11-06', description: '收到上海启明零售货款', amount: '15600.00', direction: 'in', counterparty: '上海启明零售有限公司', matched: false },
  { id: 'bt-2026-1111', bankAccountId: 'ba-2026-02', date: '2026-11-12', description: '支付设备采购定金', amount: '90000.00', direction: 'out', counterparty: '深圳市恒通办公设备有限公司', matched: false },
  { id: 'bt-2026-1112', bankAccountId: 'ba-2026-02', date: '2026-11-17', description: '收到杭州云杉科技尾款', amount: '45800.00', direction: 'in', counterparty: '杭州云杉科技有限公司', matched: false }
]

/** 流水导入预览：确认导入后追加为未匹配流水（本地演示）。 */
export const bankImportPreview: BankTransaction[] = [
  { id: 'bt-import-01', bankAccountId: 'ba-2026-01', date: '2026-11-18', description: '收到杭州云杉科技电子回单', amount: '45800.00', direction: 'in', counterparty: '杭州云杉科技有限公司', matched: false },
  { id: 'bt-import-02', bankAccountId: 'ba-2026-01', date: '2026-11-18', description: '支付顺丰速运物流费', amount: '1260.00', direction: 'out', counterparty: '顺丰速运有限公司', matched: false },
  { id: 'bt-import-03', bankAccountId: 'ba-2026-02', date: '2026-11-19', description: '收到南京远航贸易货款', amount: '48260.00', direction: 'in', counterparty: '南京远航贸易有限公司', matched: false }
]

export const taxRateKindLabels: Record<'output' | 'input', string> = {
  output: '销项',
  input: '进项'
}

export const taxRates: TaxRateDefinition[] = [
  { id: 'rate-vat-13', code: 'VAT13', name: '增值税 13%', rate: '13', kind: 'output', status: 'active' },
  { id: 'rate-vat-9', code: 'VAT9', name: '增值税 9%', rate: '9', kind: 'output', status: 'active' },
  { id: 'rate-vat-6', code: 'VAT6', name: '增值税 6%', rate: '6', kind: 'output', status: 'active' },
  { id: 'rate-vat-in-13', code: 'VATIN13', name: '进项增值税 13%', rate: '13', kind: 'input', status: 'active' },
  { id: 'rate-vat-in-6', code: 'VATIN6', name: '进项增值税 6%', rate: '6', kind: 'input', status: 'active' },
  { id: 'rate-cit-25', code: 'CIT25', name: '企业所得税 25%', rate: '25', kind: 'output', status: 'inactive' }
]

/** 税组：把税率组合成可分配给商品或单据的税码。 */
export interface TaxGroup {
  id: string
  code: string
  name: string
  rateCodes: string[]
  status: 'active' | 'inactive'
}

export const taxGroups: TaxGroup[] = [
  { id: 'tg-sales-13', code: 'TG-S13', name: '销项税组 13%', rateCodes: ['VAT13'], status: 'active' },
  { id: 'tg-sales-6', code: 'TG-S6', name: '销项税组 6%', rateCodes: ['VAT6'], status: 'active' },
  { id: 'tg-purchase-13', code: 'TG-P13', name: '进项税组 13%', rateCodes: ['VATIN13'], status: 'active' },
  { id: 'tg-cit-25', code: 'TG-CIT', name: '企业所得税 25%', rateCodes: ['CIT25'], status: 'inactive' }
]

export type TaxFilingStatus = 'pending' | 'filed' | 'paid'
export interface TaxFiling {
  id: string
  period: string
  taxType: 'vat' | 'cit'
  taxableAmount: string
  taxAmount: string
  dueAt: string
  status: TaxFilingStatus
  filedAt?: string
}

export const taxFilingStatusLabels: Record<TaxFilingStatus, string> = {
  pending: '待申报',
  filed: '已申报',
  paid: '已缴款'
}
export const taxFilingStatusColors: Record<TaxFilingStatus, 'neutral' | 'info' | 'success' | 'warning'> = {
  pending: 'warning',
  filed: 'info',
  paid: 'success'
}
export const taxTypeLabels: Record<'vat' | 'cit', string> = {
  vat: '增值税',
  cit: '企业所得税'
}

export const taxFilings: TaxFiling[] = [
  { id: 'tf-2026-09-vat', period: '2026-09', taxType: 'vat', taxableAmount: '986400.00', taxAmount: '128232.00', dueAt: '2026-10-15', status: 'paid', filedAt: '2026-10-12' },
  { id: 'tf-2026-09-cit', period: '2026-09', taxType: 'cit', taxableAmount: '986400.00', taxAmount: '24660.00', dueAt: '2026-10-15', status: 'paid', filedAt: '2026-10-12' },
  { id: 'tf-2026-10-vat', period: '2026-10', taxType: 'vat', taxableAmount: '1128400.00', taxAmount: '146692.00', dueAt: '2026-11-15', status: 'filed', filedAt: '2026-11-13' },
  { id: 'tf-2026-10-cit', period: '2026-10', taxType: 'cit', taxableAmount: '1128400.00', taxAmount: '28210.00', dueAt: '2026-11-15', status: 'filed', filedAt: '2026-11-13' },
  { id: 'tf-2026-11-vat', period: '2026-11', taxType: 'vat', taxableAmount: '1286400.00', taxAmount: '167232.00', dueAt: '2026-12-15', status: 'pending' },
  { id: 'tf-2026-11-cit', period: '2026-11', taxType: 'cit', taxableAmount: '1286400.00', taxAmount: '32160.00', dueAt: '2026-12-15', status: 'pending' }
]

export const partnerLedgers: PartnerLedgerEntry[] = [
  { id: 'pl-01', partnerName: '杭州云杉科技有限公司', docId: 'INV-2026-0081', date: '2026-11-02', summary: '销售商品确认应收', debit: '128400.00', credit: '0.00', balance: '128400.00' },
  { id: 'pl-02', partnerName: '杭州云杉科技有限公司', docId: 'INV-2026-0088', date: '2026-11-16', summary: '销售商品确认应收', debit: '45800.00', credit: '0.00', balance: '174200.00' },
  { id: 'pl-03', partnerName: '杭州云杉科技有限公司', docId: 'RCPT-2026-1101', date: '2026-11-18', summary: '收到银行货款', debit: '0.00', credit: '45800.00', balance: '128400.00' },
  { id: 'pl-04', partnerName: '南京远航贸易有限公司', docId: 'INV-2026-0082', date: '2026-11-05', summary: '销售商品确认应收', debit: '48260.00', credit: '0.00', balance: '48260.00' },
  { id: 'pl-05', partnerName: '无锡恒信实业有限公司', docId: 'INV-2026-0084', date: '2026-09-28', summary: '销售商品确认应收（已逾期）', debit: '63200.00', credit: '0.00', balance: '63200.00' },
  { id: 'pl-06', partnerName: '上海启明零售有限公司', docId: 'INV-2026-0083', date: '2026-11-08', summary: '销售商品确认应收', debit: '15600.00', credit: '0.00', balance: '15600.00' },
  { id: 'pl-07', partnerName: '苏州精工电子有限公司', docId: 'PO-2026-0511', date: '2026-11-01', summary: '采购入库确认应付', debit: '0.00', credit: '63210.00', balance: '63210.00' },
  { id: 'pl-08', partnerName: '苏州精工电子有限公司', docId: 'PAY-2026-1103', date: '2026-11-02', summary: '支付供应商货款', debit: '63210.00', credit: '0.00', balance: '0.00' },
  { id: 'pl-09', partnerName: '上海联诚办公用品有限公司', docId: 'PO-2026-0512', date: '2026-11-03', summary: '采购办公用品确认应付', debit: '0.00', credit: '22600.00', balance: '22600.00' },
  { id: 'pl-10', partnerName: '宁波华翔包装材料有限公司', docId: 'PO-2026-0513', date: '2026-11-16', summary: '采购包装材料确认应付', debit: '0.00', credit: '35800.00', balance: '35800.00' },
  { id: 'pl-11', partnerName: '深圳市恒通办公设备有限公司', docId: 'PO-2026-0514', date: '2026-11-12', summary: '采购设备预付定金', debit: '0.00', credit: '90000.00', balance: '90000.00' },
  { id: 'pl-12', partnerName: '苏州精工电子有限公司', docId: 'PO-2026-0515', date: '2026-11-18', summary: '采购耗材确认应付', debit: '0.00', credit: '12600.00', balance: '12600.00' }
]
