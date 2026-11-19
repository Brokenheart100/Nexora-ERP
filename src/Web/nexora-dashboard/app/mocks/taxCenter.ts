/**
 * 税务中心（C16）本地种子与纯函数。
 *
 * 仅服务 app/components/finance/TaxCenter.vue 的纯 UI 原型：
 * - 不修改既有的 app/mocks/types.ts 与 app/mocks/index.ts，类型与种子全部留在本文件；
 * - 不新增依赖，数据是确定的演示口径，刷新页面后恢复这里的初始状态；
 * - 金额保留两位小数，计算统一走 calculateTaxPreview，便于断言（含税 1130、13% -> 未税 1000、税额 130）。
 */

/** 固定演示「今天」，保证税率版本状态、期间状态和表单默认日期稳定可断言。 */
export const TAX_CENTER_TODAY = '2026-11-19'

export type TaxRateStatus = 'active' | 'scheduled' | 'retired'
export type TaxGroupStatus = 'active' | 'inactive'
export type TaxCalcMode = 'inclusive' | 'exclusive'
export type TaxRounding = '2' | '1' | '0'
export type TaxCalendarFrequency = 'monthly' | 'quarterly'
export type TaxBasis = 'accrual' | 'cash'
export type TaxPeriodStatus = 'upcoming' | 'open' | 'filed' | 'corrected'
export type TaxRecordKind = 'filing' | 'correction'
export type TaxPartnerKind = 'customer' | 'supplier'

export type TaxBadgeColor = 'success' | 'info' | 'warning' | 'neutral' | 'error'

/* -------------------------------------------------------------------------- */
/* 文案与状态                                                                  */
/* -------------------------------------------------------------------------- */

export const taxRateStatusLabels: Record<TaxRateStatus, string> = {
  active: '生效中',
  scheduled: '待生效',
  retired: '已停用'
}

export const taxRateStatusColors: Record<TaxRateStatus, TaxBadgeColor> = {
  active: 'success',
  scheduled: 'info',
  retired: 'neutral'
}

export const taxGroupStatusLabels: Record<TaxGroupStatus, string> = {
  active: '启用',
  inactive: '停用'
}

export const taxGroupStatusColors: Record<TaxGroupStatus, TaxBadgeColor> = {
  active: 'success',
  inactive: 'neutral'
}

export const taxPeriodStatusLabels: Record<TaxPeriodStatus, string> = {
  upcoming: '未开始',
  open: '待申报',
  filed: '已申报',
  corrected: '已更正'
}

export const taxPeriodStatusColors: Record<TaxPeriodStatus, TaxBadgeColor> = {
  upcoming: 'neutral',
  open: 'warning',
  filed: 'success',
  corrected: 'info'
}

export const taxRecordKindLabels: Record<TaxRecordKind, string> = {
  filing: '首次申报',
  correction: '更正申报'
}

export const taxBasisLabels: Record<TaxBasis, string> = {
  accrual: '权责发生制',
  cash: '收付实现制'
}

export const taxCalendarFrequencyLabels: Record<TaxCalendarFrequency, string> = {
  monthly: '按月申报',
  quarterly: '按季度申报'
}

export const taxCalcModeLabels: Record<TaxCalcMode, string> = {
  inclusive: '含税金额',
  exclusive: '未税金额'
}

export const taxRoundingLabels: Record<TaxRounding, string> = {
  2: '保留 2 位（分）',
  1: '保留 1 位（角）',
  0: '取整（元）'
}

export const taxPartnerKindLabels: Record<TaxPartnerKind, string> = {
  customer: '客户',
  supplier: '供应商'
}

/* -------------------------------------------------------------------------- */
/* 税率版本                                                                    */
/* -------------------------------------------------------------------------- */

export interface TaxRateVersion {
  id: string
  /** 税种编码：同一税种可以有多个先后版本。 */
  code: string
  /** 税种名称，例如「增值税」。 */
  taxType: string
  /** 版本展示名。 */
  name: string
  /** 百分数，13 表示 13%。 */
  rate: number
  /** 生效日期（含当天）。 */
  effectiveFrom: string
  /** 停用日期（含当天）；为空表示持续有效。 */
  effectiveTo?: string
  /** 同一税种内的版本序号。 */
  version: number
}

export const taxCenterRateVersions: TaxRateVersion[] = [
  {
    id: 'rate-vat13-2025',
    code: 'VAT13',
    taxType: '增值税',
    name: '增值税 13%',
    rate: 13,
    effectiveFrom: '2025-01-01',
    effectiveTo: '2026-04-30',
    version: 1
  },
  {
    id: 'rate-vat13-2026',
    code: 'VAT13',
    taxType: '增值税',
    name: '增值税 13%（2026 新版本）',
    rate: 14,
    effectiveFrom: '2026-05-01',
    version: 2
  },
  {
    id: 'rate-vat6-2025',
    code: 'VAT6',
    taxType: '增值税（服务）',
    name: '增值税 6%',
    rate: 6,
    effectiveFrom: '2025-01-01',
    version: 1
  },
  {
    id: 'rate-cit25-2025',
    code: 'CIT25',
    taxType: '企业所得税',
    name: '企业所得税 25%',
    rate: 25,
    effectiveFrom: '2025-01-01',
    version: 1
  },
  {
    id: 'rate-surtax-2025',
    code: 'SURTAX',
    taxType: '附加税',
    name: '城建及附加 12%',
    rate: 12,
    effectiveFrom: '2025-01-01',
    effectiveTo: '2026-06-30',
    version: 1
  },
  {
    id: 'rate-surtax-2026',
    code: 'SURTAX',
    taxType: '附加税',
    name: '城建及附加 10%',
    rate: 10,
    effectiveFrom: '2026-07-01',
    version: 2
  },
  {
    id: 'rate-export-2025',
    code: 'EXPORT',
    taxType: '出口关税',
    name: '出口关税 0%（免税）',
    rate: 0,
    effectiveFrom: '2025-01-01',
    version: 1
  }
]

/** 历史单据的计算快照：同一税种换版本后，这里保留旧版本税率与金额。 */
export interface TaxDocumentSnapshot {
  id: string
  document: string
  date: string
  rateVersionId: string
  taxType: string
  rate: number
  netAmount: number
  taxAmount: number
  grossAmount: number
}

export const taxDocumentSnapshots: TaxDocumentSnapshot[] = [
  {
    id: 'snap-inv-0218',
    document: 'INV-2026-0218',
    date: '2026-02-18',
    rateVersionId: 'rate-vat13-2025',
    taxType: '增值税',
    rate: 13,
    netAmount: 8600,
    taxAmount: 1118,
    grossAmount: 9718
  },
  {
    id: 'snap-inv-0509',
    document: 'INV-2026-0509',
    date: '2026-05-09',
    rateVersionId: 'rate-vat13-2026',
    taxType: '增值税',
    rate: 14,
    netAmount: 12400,
    taxAmount: 1736,
    grossAmount: 14136
  },
  {
    id: 'snap-inv-0912',
    document: 'INV-2026-0912',
    date: '2026-09-12',
    rateVersionId: 'rate-vat13-2026',
    taxType: '增值税',
    rate: 14,
    netAmount: 18600,
    taxAmount: 2604,
    grossAmount: 21204
  },
  {
    id: 'snap-bill-0511',
    document: 'BILL-2026-0511',
    date: '2026-05-11',
    rateVersionId: 'rate-vat6-2025',
    taxType: '增值税（服务）',
    rate: 6,
    netAmount: 35800,
    taxAmount: 2148,
    grossAmount: 37948
  }
]

/* -------------------------------------------------------------------------- */
/* 税组与绑定                                                                  */
/* -------------------------------------------------------------------------- */

export interface TaxGroupLine {
  rateCode: string
  /** 计税基础占比，100 表示全额计税。 */
  basePortion: number
}

export interface TaxGroupDefinition {
  id: string
  name: string
  description: string
  lines: TaxGroupLine[]
  status: TaxGroupStatus
  updatedAt: string
}

export const taxCenterTaxGroups: TaxGroupDefinition[] = [
  {
    id: 'tg-standard',
    name: '标准内销税组',
    description: '内销货物与服务的默认税组',
    lines: [{ rateCode: 'VAT13', basePortion: 100 }],
    status: 'active',
    updatedAt: '2026-11-02 09:30'
  },
  {
    id: 'tg-service',
    name: '服务税组',
    description: '现代服务业按 6% 计税',
    lines: [{ rateCode: 'VAT6', basePortion: 100 }],
    status: 'active',
    updatedAt: '2026-10-18 14:10'
  },
  {
    id: 'tg-export',
    name: '出口免税税组',
    description: '出口货物零税率',
    lines: [{ rateCode: 'EXPORT', basePortion: 100 }],
    status: 'active',
    updatedAt: '2026-09-05 11:45'
  },
  {
    id: 'tg-mixed',
    name: '混合计税税组',
    description: '演示同一张单据叠加多个税种',
    lines: [
      { rateCode: 'VAT13', basePortion: 100 },
      { rateCode: 'CIT25', basePortion: 50 }
    ],
    status: 'inactive',
    updatedAt: '2026-08-21 16:20'
  }
]

export interface TaxProductBinding {
  sku: string
  name: string
  category: string
  groupId: string
}

export const taxCenterProductBindings: TaxProductBinding[] = [
  { sku: 'SKU-1001', name: '工业级传感器 A1', category: '硬件', groupId: 'tg-standard' },
  { sku: 'SKU-1002', name: '云平台订阅（年付）', category: '服务', groupId: 'tg-service' },
  { sku: 'SKU-1003', name: '出口组件模组', category: '外销', groupId: 'tg-export' },
  { sku: 'SKU-1004', name: '定制开发服务', category: '服务', groupId: 'tg-service' }
]

export interface TaxPartnerBinding {
  id: string
  name: string
  kind: TaxPartnerKind
  region: string
  groupId: string
}

export const taxCenterPartnerBindings: TaxPartnerBinding[] = [
  { id: 'partner-001', name: '华东智造有限公司', kind: 'customer', region: '上海', groupId: 'tg-standard' },
  { id: 'partner-002', name: '远洋贸易（香港）', kind: 'customer', region: '香港', groupId: 'tg-export' },
  { id: 'partner-003', name: '启明云服务', kind: 'supplier', region: '杭州', groupId: 'tg-service' },
  { id: 'partner-004', name: '恒信物流', kind: 'supplier', region: '苏州', groupId: 'tg-standard' }
]

/* -------------------------------------------------------------------------- */
/* 日历、期间与申报记录                                                        */
/* -------------------------------------------------------------------------- */

export interface TaxPeriodLineState {
  id: string
  taxCode: string
  taxType: string
  /** 首次申报时的税率（百分比）。 */
  rate: number
  /** 首次申报的计税基础。 */
  declaredBase: number
  /** 首次申报的税额。 */
  declaredTax: number
  /** 权责发生制口径的当前计税基础。 */
  accrualBase: number
  /** 收付实现制口径的当前计税基础。 */
  cashBase: number
  /** 首次申报采用的税率版本。 */
  rateVersionId: string
}

export interface TaxPeriodRecord {
  id: string
  number: string
  kind: TaxRecordKind
  version: number
  at: string
  basis: TaxBasis
  taxAmount: number
  reason?: string
  /** 更正申报追溯的原始申报编号。 */
  traceOf?: string
}

export interface TaxPeriodState {
  id: string
  frequency: TaxCalendarFrequency
  /** 期间标识：2026-11 或 2026-Q4。 */
  period: string
  label: string
  startDate: string
  endDate: string
  dueAt: string
  status: TaxPeriodStatus
  booksLocked: boolean
  filingNumber?: string
  filedAt?: string
  lines: TaxPeriodLineState[]
  records: TaxPeriodRecord[]
}

interface TaxMonthSeed {
  month: string
  status: TaxPeriodStatus
  /** 已申报口径（同时作为首次申报的计税基础）。 */
  revenue: number
  profit: number
  /** 权责发生制口径相对已申报口径的调整额。 */
  accrualRevenueAdjust?: number
  accrualProfitAdjust?: number
  /** 收付实现制口径相对已申报口径的调整额。 */
  cashRevenueAdjust?: number
  cashProfitAdjust?: number
  filingNumber?: string
  filedAt?: string
}

const taxMonthSeeds: TaxMonthSeed[] = [
  { month: '2026-01', status: 'filed', revenue: 892400, profit: 89240, filingNumber: 'TAX-2026-01-0001', filedAt: '2026-02-12 10:20' },
  { month: '2026-02', status: 'filed', revenue: 842600, profit: 84260, filingNumber: 'TAX-2026-02-0001', filedAt: '2026-03-13 09:48' },
  { month: '2026-03', status: 'filed', revenue: 968200, profit: 96820, filingNumber: 'TAX-2026-03-0001', filedAt: '2026-04-12 15:05' },
  { month: '2026-04', status: 'filed', revenue: 1036400, profit: 103640, filingNumber: 'TAX-2026-04-0001', filedAt: '2026-05-12 11:32' },
  { month: '2026-05', status: 'filed', revenue: 1092400, profit: 109240, filingNumber: 'TAX-2026-05-0001', filedAt: '2026-06-12 09:15' },
  { month: '2026-06', status: 'filed', revenue: 1148600, profit: 114860, filingNumber: 'TAX-2026-06-0001', filedAt: '2026-07-13 14:40' },
  { month: '2026-07', status: 'filed', revenue: 1184200, profit: 118420, filingNumber: 'TAX-2026-07-0001', filedAt: '2026-08-12 10:02' },
  { month: '2026-08', status: 'filed', revenue: 1216800, profit: 121680, filingNumber: 'TAX-2026-08-0001', filedAt: '2026-09-14 16:18' },
  { month: '2026-09', status: 'filed', revenue: 986400, profit: 98640, filingNumber: 'TAX-2026-09-0001', filedAt: '2026-10-13 10:36' },
  { month: '2026-10', status: 'filed', revenue: 1128400, profit: 112840, filingNumber: 'TAX-2026-10-0001', filedAt: '2026-11-12 09:55' },
  {
    month: '2026-11',
    status: 'open',
    revenue: 1286400,
    profit: 128640,
    accrualRevenueAdjust: 10000,
    accrualProfitAdjust: 1000,
    cashRevenueAdjust: -6000,
    cashProfitAdjust: -900
  },
  { month: '2026-12', status: 'upcoming', revenue: 0, profit: 0 }
]

const taxQuarterFilingAt: Record<number, string> = {
  1: '2026-04-12 10:30',
  2: '2026-07-10 14:05',
  3: '2026-10-13 09:40'
}

/** 四舍五入到指定小数位；用于固定本的金额断言。 */
export function taxRound(value: number, digits = 2): number {
  const factor = 10 ** digits
  return Math.round((value + Number.EPSILON) * factor) / factor
}

export function taxFormatRate(rate: number): string {
  return `${Number(rate.toFixed(2))}%`
}

function taxPad(value: number): string {
  return String(value).padStart(2, '0')
}

function formatTaxDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export function taxPreviousDay(date: string): string {
  const value = new Date(`${date}T00:00:00.000Z`)
  value.setUTCDate(value.getUTCDate() - 1)
  return formatTaxDate(value)
}

function taxMonthEnd(month: string): string {
  const year = Number(month.slice(0, 4))
  const monthNumber = Number(month.slice(5, 7))
  return formatTaxDate(new Date(Date.UTC(year, monthNumber, 0)))
}

function taxNextMonthFifteenth(month: string): string {
  const year = Number(month.slice(0, 4))
  const monthNumber = Number(month.slice(5, 7))
  return formatTaxDate(new Date(Date.UTC(year, monthNumber, 15)))
}

export function taxRateVersionStatus(version: TaxRateVersion, today = TAX_CENTER_TODAY): TaxRateStatus {
  if (version.effectiveFrom > today) return 'scheduled'
  if (version.effectiveTo && version.effectiveTo < today) return 'retired'
  return 'active'
}

/** 解析某一日期对某税种生效的版本：取生效日期不晚于该日期的最新版本。 */
export function taxResolveRateVersion(code: string, date: string, versions: TaxRateVersion[]): TaxRateVersion | null {
  let matched: TaxRateVersion | null = null
  for (const version of versions) {
    if (version.code !== code) continue
    if (version.effectiveFrom > date) continue
    if (version.effectiveTo && version.effectiveTo < date) continue
    if (!matched || version.effectiveFrom > matched.effectiveFrom) matched = version
  }
  return matched
}

export function taxGroupTotalRate(group: TaxGroupDefinition, versions: TaxRateVersion[], date = TAX_CENTER_TODAY): number {
  return taxRound(
    group.lines.reduce((sum, line) => {
      const version = taxResolveRateVersion(line.rateCode, date, versions)
      if (!version) return sum
      return sum + (version.rate * line.basePortion) / 100
    }, 0)
  )
}

export function taxGroupRateSummary(group: TaxGroupDefinition, versions: TaxRateVersion[], date = TAX_CENTER_TODAY): string {
  return group.lines
    .map((line) => {
      const version = taxResolveRateVersion(line.rateCode, date, versions)
      if (!version) return `${line.rateCode}（无有效版本）`
      const portion = line.basePortion === 100 ? '' : ` × ${line.basePortion}%`
      return `${version.taxType} ${taxFormatRate(version.rate)}${portion}`
    })
    .join(' + ')
}

export function taxPeriodDeclaredAmount(period: TaxPeriodState): number {
  return taxRound(period.lines.reduce((sum, line) => sum + line.declaredTax, 0))
}

function buildPeriodLine(
  id: string,
  taxCode: string,
  taxType: string,
  declaredBase: number,
  accrualBase: number,
  cashBase: number,
  date: string,
  versions: TaxRateVersion[]
): TaxPeriodLineState {
  const version = taxResolveRateVersion(taxCode, date, versions)
  const rate = version?.rate ?? 0
  return {
    id,
    taxCode,
    taxType,
    rate,
    declaredBase,
    declaredTax: taxRound((declaredBase * rate) / 100),
    accrualBase,
    cashBase,
    rateVersionId: version?.id ?? ''
  }
}

/** 生成按月税历；返回全新对象，调用方可以放心就地修改。 */
export function buildMonthlyTaxPeriods(versions: TaxRateVersion[]): TaxPeriodState[] {
  return taxMonthSeeds.map((seed) => {
    const endDate = taxMonthEnd(seed.month)
    const accrualRevenue = seed.revenue + (seed.accrualRevenueAdjust ?? 0)
    const accrualProfit = seed.profit + (seed.accrualProfitAdjust ?? 0)
    const cashRevenue = seed.revenue + (seed.cashRevenueAdjust ?? 0)
    const cashProfit = seed.profit + (seed.cashProfitAdjust ?? 0)
    const lines: TaxPeriodLineState[] = [
      buildPeriodLine(`${seed.month}-vat`, 'VAT13', '增值税', seed.revenue, accrualRevenue, cashRevenue, endDate, versions),
      buildPeriodLine(`${seed.month}-cit`, 'CIT25', '企业所得税', seed.profit, accrualProfit, cashProfit, endDate, versions)
    ]
    const records: TaxPeriodRecord[]
      = seed.status === 'filed' && seed.filingNumber && seed.filedAt
        ? [
            {
              id: `${seed.month}-record-1`,
              number: seed.filingNumber,
              kind: 'filing',
              version: 1,
              at: seed.filedAt,
              basis: 'accrual',
              taxAmount: taxRound(lines.reduce((sum, line) => sum + line.declaredTax, 0))
            }
          ]
        : []
    return {
      id: `tax-period-${seed.month}`,
      frequency: 'monthly',
      period: seed.month,
      label: seed.month,
      startDate: `${seed.month}-01`,
      endDate,
      dueAt: taxNextMonthFifteenth(seed.month),
      status: seed.status,
      booksLocked: seed.status === 'filed',
      filingNumber: seed.filingNumber,
      filedAt: seed.filedAt,
      lines,
      records
    }
  })
}

/** 生成按季度税历；季度数据由同一年度的月份汇总得到。 */
export function buildQuarterlyTaxPeriods(versions: TaxRateVersion[]): TaxPeriodState[] {
  const months = buildMonthlyTaxPeriods(versions)
  return [1, 2, 3, 4].map((quarter) => {
    const firstMonth = (quarter - 1) * 3 + 1
    const lastMonth = quarter * 3
    const quarterMonths = months.filter((period) => {
      const monthNumber = Number(period.period.slice(5, 7))
      return monthNumber >= firstMonth && monthNumber <= lastMonth
    })
    const periodKey = `2026-Q${quarter}`
    const endDate = taxMonthEnd(`2026-${taxPad(lastMonth)}`)
    const allFiled = quarterMonths.length > 0 && quarterMonths.every(period => period.status === 'filed')
    const anyOpen = quarterMonths.some(period => period.status === 'open' || period.status === 'corrected')
    const status: TaxPeriodStatus = allFiled ? 'filed' : anyOpen ? 'open' : 'upcoming'
    const definitions = [
      { code: 'VAT13', taxType: '增值税' },
      { code: 'CIT25', taxType: '企业所得税' }
    ]
    const lines: TaxPeriodLineState[] = definitions.map((definition) => {
      const version = taxResolveRateVersion(definition.code, endDate, versions)
      const rate = version?.rate ?? 0
      const declaredBase = taxRound(
        quarterMonths.reduce((sum, period) => sum + (period.lines.find(line => line.taxCode === definition.code)?.declaredBase ?? 0), 0)
      )
      const declaredTax = taxRound(
        quarterMonths.reduce((sum, period) => sum + (period.lines.find(line => line.taxCode === definition.code)?.declaredTax ?? 0), 0)
      )
      const accrualBase = taxRound(
        quarterMonths.reduce((sum, period) => sum + (period.lines.find(line => line.taxCode === definition.code)?.accrualBase ?? 0), 0)
      )
      const cashBase = taxRound(
        quarterMonths.reduce((sum, period) => sum + (period.lines.find(line => line.taxCode === definition.code)?.cashBase ?? 0), 0)
      )
      return {
        id: `${periodKey}-${definition.code.toLowerCase()}`,
        taxCode: definition.code,
        taxType: definition.taxType,
        rate,
        declaredBase,
        declaredTax,
        accrualBase,
        cashBase,
        rateVersionId: version?.id ?? ''
      }
    })
    const filingNumber = allFiled ? `TAX-${periodKey}-0001` : undefined
    const filedAt = allFiled ? taxQuarterFilingAt[quarter] : undefined
    const records: TaxPeriodRecord[]
      = allFiled && filingNumber && filedAt
        ? [
            {
              id: `${periodKey}-record-1`,
              number: filingNumber,
              kind: 'filing',
              version: 1,
              at: filedAt,
              basis: 'accrual',
              taxAmount: taxRound(lines.reduce((sum, line) => sum + line.declaredTax, 0))
            }
          ]
        : []
    return {
      id: `tax-period-${periodKey}`,
      frequency: 'quarterly',
      period: periodKey,
      label: `2026 年第 ${quarter} 季度`,
      startDate: `2026-${taxPad(firstMonth)}-01`,
      endDate,
      dueAt: taxNextMonthFifteenth(`2026-${taxPad(lastMonth)}`),
      status,
      booksLocked: allFiled,
      filingNumber,
      filedAt,
      lines,
      records
    }
  })
}

export function buildTaxCalendarPeriods(frequency: TaxCalendarFrequency, versions: TaxRateVersion[] = taxCenterRateVersions): TaxPeriodState[] {
  return frequency === 'monthly' ? buildMonthlyTaxPeriods(versions) : buildQuarterlyTaxPeriods(versions)
}

/* -------------------------------------------------------------------------- */
/* 税额计算预览                                                                */
/* -------------------------------------------------------------------------- */

export interface TaxCalcLine {
  rateCode: string
  taxType: string
  rate: number
  basePortion: number
  /** 该税项对应的计税基数。 */
  base: number
  tax: number
  /** 生效的税率版本说明。 */
  versionLabel: string
}

export interface TaxCalcInput {
  mode: TaxCalcMode
  amount: number
  discount: number
  rounding: TaxRounding
  date: string
  group: TaxGroupDefinition
  rateVersions: TaxRateVersion[]
}

export interface TaxCalcResult {
  mode: TaxCalcMode
  date: string
  amount: number
  discount: number
  netAmount: number
  taxAmount: number
  grossAmount: number
  rounding: TaxRounding
  groupName: string
  lines: TaxCalcLine[]
}

/**
 * 固定计算口径：
 * 1. 先按含税/未税得到净额（含税输入先去折扣）；
 * 2. 每个税项按 basePortion 拆分基数并逐项计税；
 * 3. 按舍入位数对每行和合计分别四舍五入，保证 net + tax = gross。
 *
 * 断言样例：含税 1130、税组「标准内销税组」（增值税 13%）-> 未税 1000、税额 130、含税 1130。
 */
export function calculateTaxPreview(input: TaxCalcInput): TaxCalcResult {
  const digits = Number(input.rounding)
  const amount = Math.max(input.amount, 0)
  const discount = Math.min(Math.max(input.discount, 0), amount)
  const payable = amount - discount
  const lines: TaxCalcLine[] = input.group.lines.map((line) => {
    const version = taxResolveRateVersion(line.rateCode, input.date, input.rateVersions)
    const rate = version?.rate ?? 0
    const totalRate = rate * (line.basePortion / 100)
    const grossBase = input.mode === 'inclusive' ? payable / (1 + totalRate / 100) : payable
    const base = grossBase * (line.basePortion / 100)
    const tax = (grossBase * totalRate) / 100
    return {
      rateCode: line.rateCode,
      taxType: version?.taxType ?? line.rateCode,
      rate,
      basePortion: line.basePortion,
      base: taxRound(base, digits),
      tax: taxRound(tax, digits),
      versionLabel: version ? `${version.name}（${version.effectiveFrom} 起）` : '无有效税率版本'
    }
  })
  const taxAmount = taxRound(lines.reduce((sum, line) => sum + line.tax, 0), digits)
  let netAmount: number
  let grossAmount: number
  if (input.mode === 'inclusive') {
    grossAmount = taxRound(payable, digits)
    netAmount = taxRound(grossAmount - taxAmount, digits)
  } else {
    netAmount = taxRound(payable, digits)
    grossAmount = taxRound(netAmount + taxAmount, digits)
  }
  return {
    mode: input.mode,
    date: input.date,
    amount: input.amount,
    discount,
    netAmount,
    taxAmount,
    grossAmount,
    rounding: input.rounding,
    groupName: input.group.name,
    lines
  }
}
