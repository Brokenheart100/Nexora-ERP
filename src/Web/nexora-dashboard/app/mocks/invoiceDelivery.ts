/**
 * 发票编号、本地样张与分享、寄送记录（C17）的本地种子与纯函数。
 *
 * 仅服务 app/components/sales/InvoiceDelivery.vue 的纯 UI 原型：
 * - 不修改 app/mocks/types.ts、app/mocks/index.ts 或既有 store，类型与种子全部留在本文件；
 * - 不接后端，刷新页面后恢复这里的初始状态，所有动作只更新组件内的 ref；
 * - 金额统一保留两位小数，演示日期固定为 2026-11-19，便于断言与截图复现。
 */

/** 固定演示「今天」，保证编号预览、分享有效期与寄送记录状态稳定。 */
export const INVOICE_DELIVERY_TODAY = '2026-11-19'
/** 固定演示「当前时刻」，用于新增记录与提示文案。 */
export const INVOICE_DELIVERY_NOW = '2026-11-19 10:00'

export type InvoiceBadgeColor = 'success' | 'info' | 'warning' | 'neutral' | 'error'

/* -------------------------------------------------------------------------- */
/* 公司抬头                                                                    */
/* -------------------------------------------------------------------------- */

export interface InvoiceCompanyProfile {
  name: string
  shortName: string
  taxId: string
  address: string
  phone: string
  email: string
  bankName: string
  bankAccount: string
  footer: string
}

export const invoiceCompanyProfile: InvoiceCompanyProfile = {
  name: '华东总部贸易有限公司',
  shortName: '华东总部',
  taxId: '91310000MA1K3X8N2P',
  address: '上海市浦东新区世纪大道 1288 号 18 层',
  phone: '021-6888 1200',
  email: 'billing@nexora.example',
  bankName: '招商银行上海张江支行',
  bankAccount: '6225 8888 0012 3456',
  footer: '本发票为演示样张，仅用于界面原型验证，不具备任何税务或法律效力。'
}

/* -------------------------------------------------------------------------- */
/* 发票                                                                        */
/* -------------------------------------------------------------------------- */

export type InvoiceLifecycleStatus = 'draft' | 'pending-review' | 'posted' | 'paid'

export const invoiceLifecycleStatusLabels: Record<InvoiceLifecycleStatus, string> = {
  'draft': '草稿',
  'pending-review': '待复核',
  'posted': '已过账',
  'paid': '已收款'
}

export const invoiceLifecycleStatusColors: Record<InvoiceLifecycleStatus, InvoiceBadgeColor> = {
  'draft': 'neutral',
  'pending-review': 'warning',
  'posted': 'info',
  'paid': 'success'
}

export function invoiceIsOfficial(invoice: DeliveryInvoice | undefined): boolean {
  return invoice?.status === 'posted' || invoice?.status === 'paid'
}

export interface InvoiceBuyer {
  name: string
  taxId: string
  address: string
  contact: string
  email: string
}

export interface InvoiceLineItem {
  id: string
  description: string
  quantity: number
  unitPrice: number
}

export interface DeliveryInvoice {
  id: string
  buyer: InvoiceBuyer
  status: InvoiceLifecycleStatus
  /** 计划或实际开票日期（YYYY-MM-DD）。 */
  issueDate: string
  dueDate: string
  taxRate: number
  note: string
  lines: InvoiceLineItem[]
  /** 已锁定正式编号；过账时写入，之后不再变化。 */
  officialNumber?: string
  /** 复核候选编号；仅 draft / pending-review 存在。 */
  candidateNumber?: string
  /** 候选编号对应的编号规则版本。 */
  candidateRuleVersion?: number
  /** 候选编号是否已由复核人确认。 */
  numberConfirmed: boolean
  /** 复核失效原因（规则版本变化、编号被占用等）。 */
  numberStaleReason?: string
  postedAt?: string
  postedBy?: string
  paidAt?: string
}

export interface InvoiceTotals {
  net: number
  tax: number
  gross: number
}

export function invoiceRoundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

export function invoiceLineAmount(line: InvoiceLineItem): number {
  return invoiceRoundMoney(line.quantity * line.unitPrice)
}

export function invoiceTotals(invoice: DeliveryInvoice): InvoiceTotals {
  const net = invoiceRoundMoney(invoice.lines.reduce((total, line) => total + invoiceLineAmount(line), 0))
  const tax = invoiceRoundMoney(net * invoice.taxRate / 100)
  return { net, tax, gross: invoiceRoundMoney(net + tax) }
}

export function invoiceDisplayNumber(invoice: DeliveryInvoice | undefined): string {
  if (!invoice) return '未选择发票'
  return invoice.officialNumber ?? invoice.candidateNumber ?? '草稿未编号'
}

export const invoiceDeliveryInvoices: DeliveryInvoice[] = [
  {
    id: 'inv-draft-2011',
    buyer: {
      name: '杭州云栖智能科技有限公司',
      taxId: '91330100MA2H4K7Q1B',
      address: '杭州市余杭区文一西路 998 号 5 幢',
      contact: '王芳',
      email: 'wangfang@yunqi.example'
    },
    status: 'draft',
    issueDate: '2026-11-19',
    dueDate: '2026-12-19',
    taxRate: 13,
    note: '年度订阅续费，草稿待补充采购订单号后提交复核。',
    numberConfirmed: false,
    lines: [
      { id: 'line-draft-1', description: '企业版软件订阅（年）', quantity: 1, unitPrice: 128000 },
      { id: 'line-draft-2', description: '实施与培训服务', quantity: 40, unitPrice: 1200 }
    ]
  },
  {
    id: 'inv-review-2019',
    buyer: {
      name: '苏州精工制造有限公司',
      taxId: '91320594MA1W2N3P6L',
      address: '苏州工业园区唯亭镇亭融街 66 号',
      contact: '李强',
      email: 'liqiang@jinggong.example'
    },
    status: 'pending-review',
    issueDate: '2026-11-19',
    dueDate: '2026-12-18',
    taxRate: 13,
    note: '工业传感器年度采购，复核通过后由业务主管过账。',
    candidateNumber: 'INV-2026-0118',
    candidateRuleVersion: 3,
    numberConfirmed: true,
    lines: [
      { id: 'line-review-1', description: '工业传感器套件', quantity: 12, unitPrice: 8600 },
      { id: 'line-review-2', description: '安装调试服务', quantity: 1, unitPrice: 15000 }
    ]
  },
  {
    id: 'inv-review-2020',
    buyer: {
      name: '宁波海联供应链有限公司',
      taxId: '91330201MA2C8H5K7R',
      address: '宁波市鄞州区宁东路 269 号',
      contact: '周敏',
      email: 'zhoumin@hailian.example'
    },
    status: 'pending-review',
    issueDate: '2026-11-19',
    dueDate: '2026-12-17',
    taxRate: 13,
    note: '冷链箱租赁与干线运输，候选编号与上一张待复核发票相同，用于演示占号竞争。',
    candidateNumber: 'INV-2026-0118',
    candidateRuleVersion: 3,
    numberConfirmed: true,
    lines: [
      { id: 'line-review-3', description: '冷链周转箱租赁', quantity: 200, unitPrice: 68 },
      { id: 'line-review-4', description: '冷链干线运输', quantity: 6, unitPrice: 4200 }
    ]
  },
  {
    id: 'inv-posted-2007',
    buyer: {
      name: '上海临港新片区产业发展有限公司',
      taxId: '91310115MA1H9T2M3C',
      address: '上海市浦东新区环湖西二路 888 号',
      contact: '孙悦',
      email: 'sunyue@lingang.example'
    },
    status: 'posted',
    issueDate: '2026-11-18',
    dueDate: '2026-12-18',
    taxRate: 13,
    note: '数字化园区平台许可与运维服务，已过账，正式编号锁定。',
    officialNumber: 'INV-2026-0117',
    candidateRuleVersion: 3,
    numberConfirmed: true,
    postedAt: '2026-11-18 16:40',
    postedBy: '陈立',
    lines: [
      { id: 'line-posted-1', description: '数字化园区平台许可', quantity: 1, unitPrice: 360000 },
      { id: 'line-posted-2', description: '平台运维服务（月）', quantity: 12, unitPrice: 9800 }
    ]
  },
  {
    id: 'inv-paid-1988',
    buyer: {
      name: '江苏远洋进出口有限公司',
      taxId: '91320100MA1K4L7X9D',
      address: '南京市建邺区江东中路 188 号',
      contact: '赵磊',
      email: 'zhaolei@yuanyang.example'
    },
    status: 'paid',
    issueDate: '2025-12-12',
    dueDate: '2026-01-11',
    taxRate: 13,
    note: '历史发票：旧版编号规则开具并已收款，后续规则升级不影响原编号。',
    officialNumber: 'INV-2025-0117',
    candidateRuleVersion: 1,
    numberConfirmed: true,
    postedAt: '2025-12-12 11:05',
    postedBy: '陈立',
    paidAt: '2026-01-08',
    lines: [
      { id: 'line-paid-1', description: '出口代理服务', quantity: 1, unitPrice: 86500 }
    ]
  }
]

/* -------------------------------------------------------------------------- */
/* 发票编号规则                                                                */
/* -------------------------------------------------------------------------- */

export type InvoiceNumberResetPolicy = 'yearly' | 'monthly' | 'never'

export const invoiceNumberResetPolicyLabels: Record<InvoiceNumberResetPolicy, string> = {
  yearly: '按年重置',
  monthly: '按月重置',
  never: '不重置'
}

export interface InvoiceNumberRule {
  id: string
  version: number
  pattern: string
  startNumber: number
  padding: number
  resetPolicy: InvoiceNumberResetPolicy
  effectiveFrom: string
  effectiveTo?: string
  note: string
  createdBy: string
  createdAt: string
}

export const invoiceDeliveryNumberRules: InvoiceNumberRule[] = [
  {
    id: 'rule-v1',
    version: 1,
    pattern: 'INV-{yyyy}-{seq}',
    startNumber: 1,
    padding: 4,
    resetPolicy: 'yearly',
    effectiveFrom: '2024-01-01',
    effectiveTo: '2025-12-31',
    note: '初始财年编号规则，历史发票继续保留原编号。',
    createdBy: '系统迁移',
    createdAt: '2024-01-01 09:00'
  },
  {
    id: 'rule-v2',
    version: 2,
    pattern: 'INV-{yyyy}-{seq}',
    startNumber: 81,
    padding: 4,
    resetPolicy: 'yearly',
    effectiveFrom: '2026-01-01',
    effectiveTo: '2026-10-31',
    note: '2026 财年起始号调整为 81。',
    createdBy: '陈立',
    createdAt: '2026-01-01 09:00'
  },
  {
    id: 'rule-v3',
    version: 3,
    pattern: 'INV-{yyyy}-{seq}',
    startNumber: 118,
    padding: 4,
    resetPolicy: 'yearly',
    effectiveFrom: '2026-11-01',
    note: '2026-11 起启用 118 号段，过账后锁定正式编号。',
    createdBy: '陈立',
    createdAt: '2026-11-01 09:00'
  }
]

export interface InvoiceNumberPreview {
  number: string
  sequence: number
  periodKey: string
  ruleVersion: number
  resetPolicy: InvoiceNumberResetPolicy
  occupiedCount: number
  maxOccupiedSequence: number
  explanation: string
}

export interface InvoiceNumberParseResult {
  sequence: number
  periodKey: string
}

const invoiceNumberTokens = ['{yyyy}', '{yyMM}', '{yy}', '{MM}', '{seq}']
const invoiceNumberTokenPattern = /\{(yyyy|yyMM|yy|MM|seq)\}/g

export function invoiceNumberPeriodKey(rule: InvoiceNumberRule, date: string): string {
  if (rule.resetPolicy === 'yearly') return date.slice(0, 4)
  if (rule.resetPolicy === 'monthly') return date.slice(0, 4) + date.slice(5, 7)
  return 'all'
}

export function invoiceNumberFormat(rule: InvoiceNumberRule, date: string, sequence: number): string {
  const year = date.slice(0, 4)
  const month = date.slice(5, 7)
  return rule.pattern.replace(invoiceNumberTokenPattern, (token) => {
    if (token === '{yyyy}') return year
    if (token === '{yyMM}') return year.slice(2) + month
    if (token === '{yy}') return year.slice(2)
    if (token === '{MM}') return month
    return String(sequence).padStart(rule.padding, '0')
  })
}

function invoiceNumberPatternSource(pattern: string): string {
  const tokenSources: Record<string, string> = {
    '{yyyy}': '(?<yyyy>\\d{4})',
    '{yyMM}': '(?<yy>\\d{2})(?<MM>\\d{2})',
    '{yy}': '(?<yy>\\d{2})',
    '{MM}': '(?<MM>\\d{2})',
    '{seq}': '(?<seq>\\d+)'
  }
  let source = ''
  let index = 0
  while (index < pattern.length) {
    const token = invoiceNumberTokens.find(item => pattern.startsWith(item, index))
    if (token) {
      source += tokenSources[token] ?? ''
      index += token.length
      continue
    }
    source += pattern[index]
    index += 1
  }
  return source
}

export function invoiceNumberParse(rule: InvoiceNumberRule, value: string): InvoiceNumberParseResult | null {
  const match = new RegExp('^' + invoiceNumberPatternSource(rule.pattern) + '$').exec(value)
  const groups = match?.groups
  if (!groups) return null
  const groupYear = groups.yyyy ?? (groups.yy ? '20' + groups.yy : '')
  const groupMonth = groups.MM ?? ''
  const periodKey = rule.resetPolicy === 'yearly'
    ? groupYear
    : rule.resetPolicy === 'monthly'
      ? groupYear + groupMonth
      : 'all'
  const sequence = Number(groups.seq)
  if (!Number.isFinite(sequence)) return null
  return { sequence, periodKey }
}

export function invoiceNumberRuleForDate(rules: InvoiceNumberRule[], date: string): InvoiceNumberRule {
  const ordered = [...rules].sort((left, right) => right.version - left.version)
  const active = ordered.find(rule => (
    rule.effectiveFrom <= date && (!rule.effectiveTo || date <= rule.effectiveTo)
  ))
  return active ?? ordered[0]!
}

export function invoiceNumberRulesInPeriod(rules: InvoiceNumberRule[]): InvoiceNumberRule[] {
  return [...rules].sort((left, right) => right.version - left.version)
}

export function invoiceNumberPreview(
  rule: InvoiceNumberRule,
  date: string,
  occupiedNumbers: string[]
): InvoiceNumberPreview {
  const periodKey = invoiceNumberPeriodKey(rule, date)
  const periodSequences = occupiedNumbers
    .map(value => invoiceNumberParse(rule, value))
    .filter((item): item is InvoiceNumberParseResult => item !== null && item.periodKey === periodKey)
    .map(item => item.sequence)
  const maxOccupiedSequence = periodSequences.length ? Math.max(...periodSequences) : 0
  const sequence = Math.max(rule.startNumber, maxOccupiedSequence + 1)
  const number = invoiceNumberFormat(rule, date, sequence)
  const explanation = '按 v' + rule.version + '（' + invoiceNumberResetPolicyLabels[rule.resetPolicy]
    + '，起始号 ' + rule.startNumber + '，序号 ' + rule.padding + ' 位）计算：当前规则周期已占用 '
    + periodSequences.length + ' 个编号' + (maxOccupiedSequence ? ('，最大序号 ' + maxOccupiedSequence) : '')
    + '，预览号取' + (sequence === rule.startNumber ? '起始号' : '最大占用序号 + 1')
    + '；预览不占用号段，过账时才写入正式编号。'
  return {
    number,
    sequence,
    periodKey,
    ruleVersion: rule.version,
    resetPolicy: rule.resetPolicy,
    occupiedCount: periodSequences.length,
    maxOccupiedSequence,
    explanation
  }
}

export interface InvoiceNumberSettingsInput {
  pattern: string
  startNumber: number
  padding: number
  resetPolicy: InvoiceNumberResetPolicy
  effectiveFrom: string
}

export function invoiceNumberValidateSettings(
  input: InvoiceNumberSettingsInput,
  currentRule: InvoiceNumberRule
): string[] {
  const errors: string[] = []
  const pattern = input.pattern.trim()
  if (!pattern) {
    errors.push('编号格式不能为空，例如 INV-{yyyy}-{seq}。')
  } else {
    const tokens: string[] = pattern.match(invoiceNumberTokenPattern) ?? []
    const yearTokens = tokens.filter(token => token === '{yyyy}' || token === '{yy}' || token === '{yyMM}')
    const monthTokens = tokens.filter(token => token === '{MM}' || token === '{yyMM}')
    if (!tokens.includes('{seq}')) errors.push('编号格式必须包含 {seq} 序号占位符。')
    if (tokens.filter(token => token === '{seq}').length > 1) errors.push('编号格式只能包含一个 {seq}。')
    if (yearTokens.length > 1) errors.push('年份占位符只能有一个（{yyyy}、{yy} 或 {yyMM}）。')
    if (monthTokens.length > 1) errors.push('月份占位符只能有一个（{MM} 或 {yyMM}）。')
    if (input.resetPolicy !== 'never' && yearTokens.length === 0) {
      errors.push('按年或按月重置需要使用年份占位符（{yyyy}、{yy} 或 {yyMM}）。')
    }
    if (input.resetPolicy === 'monthly' && monthTokens.length === 0) {
      errors.push('按月重置需要使用月份占位符（{MM} 或 {yyMM}）。')
    }
    const literal = pattern.replace(invoiceNumberTokenPattern, '')
    if (!/^[A-Za-z0-9 _/-]*$/.test(literal)) {
      errors.push('除占位符外，编号格式只允许字母、数字、空格、短横线、下划线和斜杠。')
    }
  }
  if (!Number.isInteger(input.startNumber) || input.startNumber < 1 || input.startNumber > 999999) {
    errors.push('起始号必须是 1 到 999999 之间的整数。')
  }
  if (!Number.isInteger(input.padding) || input.padding < 3 || input.padding > 8) {
    errors.push('序号位数必须是 3 到 8 之间的整数。')
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.effectiveFrom)) {
    errors.push('生效日期格式必须是 YYYY-MM-DD。')
  } else {
    if (input.effectiveFrom < INVOICE_DELIVERY_TODAY) {
      errors.push('生效日期不能早于今天（' + INVOICE_DELIVERY_TODAY + '），历史版本只读。')
    }
    if (input.effectiveFrom <= currentRule.effectiveFrom) {
      errors.push('生效日期必须晚于当前版本 v' + currentRule.version + ' 的生效日期 ' + currentRule.effectiveFrom + '。')
    }
  }
  if (errors.length === 0
    && pattern === currentRule.pattern
    && input.startNumber === currentRule.startNumber
    && input.padding === currentRule.padding
    && input.resetPolicy === currentRule.resetPolicy) {
    errors.push('设置与当前版本 v' + currentRule.version + ' 相同，请调整后再保存。')
  }
  return errors
}

/* -------------------------------------------------------------------------- */
/* 日期与分享                                                                  */
/* -------------------------------------------------------------------------- */

export function invoiceAddDays(date: string, days: number): string {
  const value = new Date(date + 'T00:00:00Z')
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

export function invoicePreviousDay(date: string): string {
  return invoiceAddDays(date, -1)
}

export type InvoiceShareStatus = 'active' | 'expired' | 'revoked' | 'unavailable'

export const invoiceShareStatusLabels: Record<InvoiceShareStatus, string> = {
  active: '有效',
  expired: '已过期',
  revoked: '已撤销',
  unavailable: '不可用'
}

export const invoiceShareStatusColors: Record<InvoiceShareStatus, InvoiceBadgeColor> = {
  active: 'success',
  expired: 'neutral',
  revoked: 'error',
  unavailable: 'warning'
}

export interface InvoiceShareRecord {
  id: string
  token: string
  invoiceId: string
  createdBy: string
  createdAt: string
  expiresAt: string
  revokedAt?: string
  revokedBy?: string
  views: number
  lastViewedAt?: string
}

export const invoiceDeliveryShares: InvoiceShareRecord[] = [
  {
    id: 'share-0001',
    token: 'shr_demo_a1b2c3d4',
    invoiceId: 'inv-posted-2007',
    createdBy: '陈立',
    createdAt: '2026-11-18 17:00',
    expiresAt: '2026-12-18',
    views: 3,
    lastViewedAt: '2026-11-19 08:40'
  },
  {
    id: 'share-0002',
    token: 'shr_demo_e5f6a7b8',
    invoiceId: 'inv-paid-1988',
    createdBy: '张明远',
    createdAt: '2026-11-10 09:20',
    expiresAt: '2026-12-10',
    views: 1,
    lastViewedAt: '2026-11-12 15:05'
  },
  {
    id: 'share-0003',
    token: 'shr_demo_c9d0e1f2',
    invoiceId: 'inv-paid-1988',
    createdBy: '张明远',
    createdAt: '2026-10-01 10:00',
    expiresAt: '2026-10-31',
    views: 6,
    lastViewedAt: '2026-10-30 18:22'
  },
  {
    id: 'share-0004',
    token: 'shr_demo_a3b4c5d6',
    invoiceId: 'inv-posted-2007',
    createdBy: '陈立',
    createdAt: '2026-11-12 14:00',
    expiresAt: '2026-12-12',
    revokedAt: '2026-11-15 10:00',
    revokedBy: '陈立',
    views: 2,
    lastViewedAt: '2026-11-14 16:31'
  },
  {
    id: 'share-0005',
    token: 'shr_demo_f7a8b9c0',
    invoiceId: 'inv-review-2019',
    createdBy: '张明远',
    createdAt: '2026-11-19 08:00',
    expiresAt: '2026-12-01',
    views: 0
  }
]

export function invoiceShareUrl(token: string): string {
  return 'https://demo.nexora.example/invoice-share/' + token
}

export function invoiceShareEffectiveStatus(
  record: InvoiceShareRecord,
  invoice: DeliveryInvoice | undefined,
  today: string
): InvoiceShareStatus {
  if (record.revokedAt) return 'revoked'
  if (!invoice || (invoice.status !== 'posted' && invoice.status !== 'paid')) return 'unavailable'
  if (record.expiresAt < today) return 'expired'
  return 'active'
}

export function invoiceShareStatusDescription(
  record: InvoiceShareRecord,
  invoice: DeliveryInvoice | undefined,
  status: InvoiceShareStatus
): string {
  if (status === 'active') {
    return '链接有效至 ' + record.expiresAt + '，持链接者可在分享预览页查看正式发票样张。'
  }
  if (status === 'expired') {
    return '链接已于 ' + record.expiresAt + ' 过期，不能再查看发票；如需继续分享，请新建分享链接。'
  }
  if (status === 'revoked') {
    return '已于 ' + (record.revokedAt ?? '未知时间') + ' 由 ' + (record.revokedBy ?? '未知操作者') + ' 撤销，链接立即失效。'
  }
  return '发票当前为「' + invoiceLifecycleStatusLabels[invoice?.status ?? 'draft'] + '」，尚未过账或已不可用，正式分享链接不可用。'
}

/* -------------------------------------------------------------------------- */
/* 寄送通道与发件人                                                            */
/* -------------------------------------------------------------------------- */

export type InvoiceMailChannelStatus = 'ready' | 'degraded' | 'disabled'

export const invoiceMailChannelStatusLabels: Record<InvoiceMailChannelStatus, string> = {
  ready: '可用',
  degraded: '降级',
  disabled: '已停用'
}

export const invoiceMailChannelStatusColors: Record<InvoiceMailChannelStatus, InvoiceBadgeColor> = {
  ready: 'success',
  degraded: 'warning',
  disabled: 'error'
}

export interface InvoiceMailChannel {
  id: string
  name: string
  provider: string
  status: InvoiceMailChannelStatus
  reason?: string
  supportsTracking: boolean
  lastCheckedAt: string
  dailyLimit: number
}

export const invoiceDeliveryMailChannels: InvoiceMailChannel[] = [
  {
    id: 'channel-platform',
    name: '平台邮件通道',
    provider: 'Nexora 云邮件',
    status: 'ready',
    supportsTracking: true,
    lastCheckedAt: '2026-11-19 09:00',
    dailyLimit: 2000
  },
  {
    id: 'channel-smtp',
    name: '自建 SMTP 中继',
    provider: '内部邮件网关',
    status: 'degraded',
    reason: '近 24 小时退信率 6.8%，通道降级为延迟投递并暂停自动重试。',
    supportsTracking: false,
    lastCheckedAt: '2026-11-19 09:05',
    dailyLimit: 300
  },
  {
    id: 'channel-sms',
    name: '平台短信通道',
    provider: '第三方短信网关',
    status: 'disabled',
    reason: '供应商合约于 2026-11-01 到期，通道已停用，续约前不能发送短信。',
    supportsTracking: false,
    lastCheckedAt: '2026-11-01 00:00',
    dailyLimit: 0
  }
]

export type InvoiceMailSenderStatus = 'ready' | 'unverified' | 'missing'

export const invoiceMailSenderStatusLabels: Record<InvoiceMailSenderStatus, string> = {
  ready: '可用',
  unverified: '待验证',
  missing: '未配置'
}

export const invoiceMailSenderStatusColors: Record<InvoiceMailSenderStatus, InvoiceBadgeColor> = {
  ready: 'success',
  unverified: 'warning',
  missing: 'error'
}

export interface InvoiceMailSenderProfile {
  id: string
  name: string
  email: string
  status: InvoiceMailSenderStatus
  reason?: string
  defaultChannelId: string
}

export const invoiceDeliveryMailSenders: InvoiceMailSenderProfile[] = [
  {
    id: 'sender-hq',
    name: '财务共享中心',
    email: 'billing@nexora.example',
    status: 'ready',
    defaultChannelId: 'channel-platform'
  },
  {
    id: 'sender-sales',
    name: '销售一部',
    email: 'sales@nexora.example',
    status: 'unverified',
    reason: 'DKIM 记录未通过验证，平台暂不允许对外发件。',
    defaultChannelId: 'channel-platform'
  },
  {
    id: 'sender-legacy',
    name: '旧版财务邮箱',
    email: 'finance-old@nexora.example',
    status: 'missing',
    reason: '邮箱配置已从工作区删除，需要重新绑定发件人。',
    defaultChannelId: 'channel-smtp'
  }
]

export const invoiceMailWorkspace = {
  workspaceName: '华东总部贸易有限公司',
  defaultSenderId: 'sender-hq',
  defaultChannelId: 'channel-platform',
  allowFallback: false,
  note: '工作区发件人来自演示配置；真实系统会按组织、域名验证与平台策略校验。'
}

export interface InvoiceMailAvailability {
  canSend: boolean
  reasons: string[]
  warning: string
}

export function invoiceMailChannelUsability(
  channelId: string,
  senderProfileId: string,
  channels: InvoiceMailChannel[],
  senders: InvoiceMailSenderProfile[]
): InvoiceMailAvailability {
  const reasons: string[] = []
  const warnings: string[] = []
  const channel = channels.find(item => item.id === channelId)
  const sender = senders.find(item => item.id === senderProfileId)
  if (!channel) {
    reasons.push('所选投递渠道不存在，请重新选择。')
  } else if (channel.status === 'disabled') {
    reasons.push('渠道「' + channel.name + '」已停用：' + (channel.reason ?? '平台未给出原因。'))
  } else if (channel.status === 'degraded') {
    warnings.push('渠道「' + channel.name + '」当前降级：' + (channel.reason ?? '投递可能延迟。'))
  }
  if (!sender) {
    reasons.push('所选发件人配置不存在，请重新选择。')
  } else if (sender.status === 'unverified') {
    reasons.push('发件人「' + sender.name + '」未完成验证：' + (sender.reason ?? '需先完成域名验证。'))
  } else if (sender.status === 'missing') {
    reasons.push('发件人「' + sender.name + '」配置缺失：' + (sender.reason ?? '需重新绑定发件邮箱。'))
  }
  return { canSend: reasons.length === 0, reasons, warning: warnings.join('；') }
}

/* -------------------------------------------------------------------------- */
/* 寄送记录                                                                    */
/* -------------------------------------------------------------------------- */

export type InvoiceMailStatus = 'queued' | 'sent' | 'failed' | 'unknown' | 'abandoned'

export const invoiceMailStatusLabels: Record<InvoiceMailStatus, string> = {
  queued: '排队中',
  sent: '已送达',
  failed: '投递失败',
  unknown: '结果未知',
  abandoned: '已放弃'
}

export const invoiceMailStatusColors: Record<InvoiceMailStatus, InvoiceBadgeColor> = {
  queued: 'info',
  sent: 'success',
  failed: 'error',
  unknown: 'warning',
  abandoned: 'neutral'
}

export type InvoiceMailRelationKind = 'retry' | 'resend'

export const invoiceMailRelationLabels: Record<InvoiceMailRelationKind, string> = {
  retry: '重试',
  resend: '重寄'
}

export interface InvoiceMailRecord {
  id: string
  invoiceId: string
  recipientName: string
  recipientEmail: string
  channelId: string
  senderProfileId: string
  status: InvoiceMailStatus
  statusReason?: string
  failureCode?: string
  failureReason?: string
  createdAt: string
  sentAt?: string
  retryOf?: string
  resendOf?: string
  abandonedAt?: string
  abandonedBy?: string
  abandonedReason?: string
  attempts: number
}

export const invoiceDeliveryMailRecords: InvoiceMailRecord[] = [
  {
    id: 'mail-1095',
    invoiceId: 'inv-paid-1988',
    recipientName: '赵磊',
    recipientEmail: 'zhaolei@yuanyang.example',
    channelId: 'channel-platform',
    senderProfileId: 'sender-hq',
    status: 'abandoned',
    createdAt: '2026-11-02 10:00',
    abandonedAt: '2026-11-02 10:30',
    abandonedBy: '张明远',
    abandonedReason: '客户确认改为线下签收，放弃邮件投递。',
    attempts: 1
  },
  {
    id: 'mail-1096',
    invoiceId: 'inv-posted-2007',
    recipientName: '孙悦',
    recipientEmail: 'sunyue@lingang.example',
    channelId: 'channel-smtp',
    senderProfileId: 'sender-hq',
    status: 'failed',
    failureCode: 'SMTP-421',
    failureReason: 'SMTP 421 服务暂时不可用，连续 2 次重试仍未恢复。',
    createdAt: '2026-11-18 17:10',
    attempts: 2
  },
  {
    id: 'mail-1097',
    invoiceId: 'inv-posted-2007',
    recipientName: '孙悦',
    recipientEmail: 'sunyue@lingang.example',
    channelId: 'channel-platform',
    senderProfileId: 'sender-hq',
    status: 'sent',
    createdAt: '2026-11-18 17:20',
    sentAt: '2026-11-18 17:21',
    retryOf: 'mail-1096',
    attempts: 1
  },
  {
    id: 'mail-1098',
    invoiceId: 'inv-posted-2007',
    recipientName: '临港财务部',
    recipientEmail: 'finance@lingang.example',
    channelId: 'channel-platform',
    senderProfileId: 'sender-hq',
    status: 'failed',
    failureCode: 'MAILBOX-FULL',
    failureReason: '收件箱已满（550 5.2.2），平台放弃本次投递。',
    createdAt: '2026-11-19 09:12',
    attempts: 1
  },
  {
    id: 'mail-1099',
    invoiceId: 'inv-posted-2007',
    recipientName: '应付账款组',
    recipientEmail: 'ap@lingang.example',
    channelId: 'channel-platform',
    senderProfileId: 'sender-hq',
    status: 'unknown',
    statusReason: '平台 60 秒内未返回投递回执，结果未知；可能在稍后异步送达。',
    createdAt: '2026-11-19 09:30',
    attempts: 1
  }
]

const invoiceMailBlockedDomains = ['blocked.example', 'invalid.example']

export interface InvoiceMailRecipientInput {
  name: string
  email: string
}

export function invoiceMailRecipientErrors(input: InvoiceMailRecipientInput): string[] {
  const errors: string[] = []
  const name = input.name.trim()
  const email = input.email.trim()
  if (!name) errors.push('收件人姓名必填。')
  else if (name.length < 2) errors.push('收件人姓名至少 2 个字符。')
  if (!email) {
    errors.push('收件邮箱必填。')
  } else if (!/^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/.test(email)) {
    errors.push('收件邮箱格式不正确，请输入如 billing@example.com 的地址。')
  } else {
    const domain = (email.split('@')[1] ?? '').toLowerCase()
    if (invoiceMailBlockedDomains.includes(domain)) {
      errors.push('邮箱域 ' + domain + ' 已被退订或列入平台黑名单，不能寄送。')
    }
  }
  return errors
}

export interface InvoiceMailDispositionState {
  enabled: boolean
  reason: string
}

export interface InvoiceMailDispositionAvailability {
  retry: InvoiceMailDispositionState
  resend: InvoiceMailDispositionState
  abandon: InvoiceMailDispositionState
}

export function invoiceMailDispositionAvailability(
  record: InvoiceMailRecord,
  records: InvoiceMailRecord[],
  channels: InvoiceMailChannel[],
  senders: InvoiceMailSenderProfile[]
): InvoiceMailDispositionAvailability {
  const children = records.filter(item => item.retryOf === record.id || item.resendOf === record.id)
  const childText = children.map(item => item.id).join('、')
  const actionable = record.status === 'failed' || record.status === 'unknown'
  const usability = invoiceMailChannelUsability(record.channelId, record.senderProfileId, channels, senders)
  const sender = senders.find(item => item.id === record.senderProfileId)
  const senderBlocked = !sender || sender.status !== 'ready'
  const senderReason = sender
    ? '发件人「' + sender.name + '」当前为「' + invoiceMailSenderStatusLabels[sender.status] + '」：' + (sender.reason ?? '暂不可用。')
    : '原记录的发件人配置不存在，不能继续使用。'
  if (!actionable) {
    const reason = '记录状态为「' + invoiceMailStatusLabels[record.status] + '」，仅投递失败或结果未知的记录可重试、重寄或放弃。'
    return {
      retry: { enabled: false, reason },
      resend: { enabled: false, reason },
      abandon: { enabled: false, reason: '当前状态无需放弃。' }
    }
  }
  if (children.length) {
    const reason = '已有后续处理记录 ' + childText + '，请在该记录上继续操作，避免重复投递。'
    return {
      retry: { enabled: false, reason },
      resend: { enabled: false, reason },
      abandon: {
        enabled: true,
        reason: '仍可将原记录标记为已放弃，关联链会保留全部后续记录。'
      }
    }
  }
  const retry = usability.canSend
    ? {
        enabled: true,
        reason: record.status === 'unknown'
          ? '结果未知：重试可能造成重复投递，演示会生成关联重试记录，请确认后再执行。'
          : '按原收件人与原渠道重新投递，成功后会生成关联重试记录。'
      }
    : { enabled: false, reason: usability.reasons[0] ?? '渠道或发件人不可用。' }
  const resend = senderBlocked
    ? { enabled: false, reason: senderReason }
    : { enabled: true, reason: '可修改收件人或渠道后重寄，新记录会关联原记录。' }
  return {
    retry,
    resend,
    abandon: { enabled: true, reason: '放弃后不再自动重试，原记录标记为已放弃并保留失败原因。' }
  }
}

export interface InvoiceMailChain {
  root: InvoiceMailRecord | undefined
  parent: InvoiceMailRecord | undefined
  children: InvoiceMailRecord[]
}

export function invoiceMailChain(records: InvoiceMailRecord[], id: string): InvoiceMailChain {
  const byId = new Map(records.map(record => [record.id, record]))
  const record = byId.get(id)
  if (!record) return { root: undefined, parent: undefined, children: [] }
  const parentId = record.retryOf ?? record.resendOf
  const parent = parentId ? byId.get(parentId) : undefined
  let root = record
  const seen = new Set<string>([record.id])
  while (true) {
    const previousId = root.retryOf ?? root.resendOf
    if (!previousId || seen.has(previousId)) break
    seen.add(previousId)
    const previous = byId.get(previousId)
    if (!previous) break
    root = previous
  }
  const children = records.filter(item => item.retryOf === record.id || item.resendOf === record.id)
  return { root, parent, children }
}

export function invoiceMailRelationLabel(record: InvoiceMailRecord): string {
  if (record.retryOf) return invoiceMailRelationLabels.retry + '自 ' + record.retryOf
  if (record.resendOf) return invoiceMailRelationLabels.resend + '自 ' + record.resendOf
  return '—'
}

export interface InvoiceMailTimelineEvent {
  at: string
  label: string
  detail: string
  tone: InvoiceBadgeColor
}

export function invoiceMailTimeline(
  record: InvoiceMailRecord,
  channelName: string,
  senderName: string,
  children: InvoiceMailRecord[]
): InvoiceMailTimelineEvent[] {
  const events: InvoiceMailTimelineEvent[] = [
    {
      at: record.createdAt,
      label: '创建投递记录',
      detail: '渠道：' + channelName + ' · 发件人：' + senderName + ' · 收件人：' + record.recipientEmail,
      tone: 'info'
    }
  ]
  if (record.sentAt) {
    events.push({
      at: record.sentAt,
      label: '演示回执：已送达',
      detail: '平台返回送达回执（演示数据，不访问真实邮箱）。',
      tone: 'success'
    })
  }
  if (record.failureReason) {
    events.push({
      at: record.createdAt,
      label: '投递失败',
      detail: (record.failureCode ?? '投递失败') + '：' + record.failureReason,
      tone: 'error'
    })
  }
  if (record.status === 'unknown' && record.statusReason) {
    events.push({
      at: record.createdAt,
      label: '结果未知',
      detail: record.statusReason,
      tone: 'warning'
    })
  }
  if (record.abandonedAt) {
    events.push({
      at: record.abandonedAt,
      label: '已放弃',
      detail: (record.abandonedBy ?? '未知操作者') + '：' + (record.abandonedReason ?? '未填写原因'),
      tone: 'neutral'
    })
  }
  for (const child of children) {
    events.push({
      at: child.createdAt,
      label: '关联' + (child.retryOf ? invoiceMailRelationLabels.retry : invoiceMailRelationLabels.resend),
      detail: child.id + ' → ' + child.recipientEmail + '（' + invoiceMailStatusLabels[child.status] + '）',
      tone: 'info'
    })
  }
  return events.sort((left, right) => left.at.localeCompare(right.at))
}
