/**
 * C18 财务报表、账龄与工作台投影的本地演示数据。
 *
 * 金额单位：元。日期为业务日期（Asia/Shanghai）。全部为静态种子，页面刷新后恢复。
 * 报表与导出字段沿用 C5 报表导出的快照号（snapshotId）、过账水位（watermark）与申请/完成时间口径。
 */

export type ReportingBadgeColor = 'neutral' | 'success' | 'warning' | 'error' | 'info' | 'primary'

/* ------------------------------------------------------------------ */
/* 报表期间、水位与口径                                                */
/* ------------------------------------------------------------------ */

export type ReportingBasis = 'accrual' | 'cash'

export const reportingBasisLabels: Record<ReportingBasis, string> = {
  accrual: '权责发生制',
  cash: '收付实现制'
}

export type ReportingStatementKey = 'balance-sheet' | 'income-statement' | 'cash-flow' | 'equity-changes'

export const reportingStatementLabels: Record<ReportingStatementKey, string> = {
  'balance-sheet': '资产负债表',
  'income-statement': '利润表',
  'cash-flow': '现金流量表',
  'equity-changes': '所有者权益变动表'
}

export const reportingStatementHints: Record<ReportingStatementKey, string> = {
  'balance-sheet': '取所选月份最近一次过账水位的期末余额，资产 = 负债 + 所有者权益。',
  'income-statement': '发生额按所选日期区间折算；可切换权责发生制与收付实现制核算口径。',
  'cash-flow': '发生额按所选日期区间折算；期末现金余额取所选月份最近过账水位。',
  'equity-changes': '期初余额 + 本期净利润 - 利润分配 + 所有者投入 = 期末余额。'
}

export interface ReportingPeriodSeed {
  key: string
  label: string
  start: string
  end: string
  watermark: number
  postedAt: string
  voucherCount: number
  postingAmount: number
}

export const reportingPeriods: ReportingPeriodSeed[] = [
  {
    key: '2026-10',
    label: '2026 年 10 月',
    start: '2026-10-01',
    end: '2026-10-31',
    watermark: 128,
    postedAt: '2026-10-31 20:10',
    voucherCount: 96,
    postingAmount: 2846200
  },
  {
    key: '2026-11',
    label: '2026 年 11 月',
    start: '2026-11-01',
    end: '2026-11-30',
    watermark: 142,
    postedAt: '2026-11-18 18:00',
    voucherCount: 61,
    postingAmount: 3186400
  }
]

/** 报表与投影共用的过账水位日：演示数据只到 2026-11-18。 */
export const reportingWatermarkDate = '2026-11-18'
export const reportingMinDate = '2026-10-01'
export const reportingMaxDate = reportingWatermarkDate
export const reportingDefaultStart = '2026-11-01'
export const reportingDefaultEnd = '2026-11-18'

/* ------------------------------------------------------------------ */
/* 四张财务报表行种子                                                   */
/* ------------------------------------------------------------------ */

export type ReportingRowMeasure = 'flow' | 'balance'

export interface ReportingRowSeed {
  id: string
  label: string
  /** 0 为合计/报表主行，1 为明细行；仅影响缩进与字重。 */
  level: number
  /** flow：发生额按月折算；balance：取所选月份期末余额。 */
  measure: ReportingRowMeasure
  /** 2026-10、2026-11 的月度金额；flow 为全月发生额，balance 为月末余额。 */
  monthly: Record<string, number>
  /** 收付实现制口径的月度发生额（仅利润表使用）。 */
  cashMonthly?: Record<string, number>
  /** 钻取到凭证的关联凭证号。 */
  voucherIds: string[]
}

export const reportingRowSeeds: Record<Exclude<ReportingStatementKey, 'equity-changes'>, ReportingRowSeed[]> = {
  'balance-sheet': [
    {
      id: 'bs-assets-current',
      label: '流动资产',
      level: 0,
      measure: 'balance',
      monthly: { '2026-10': 2048240, '2026-11': 2150360 },
      voucherIds: ['JE-2026-1101', 'JE-2026-1102', 'JE-2026-1104']
    },
    {
      id: 'bs-assets-noncurrent',
      label: '非流动资产',
      level: 0,
      measure: 'balance',
      monthly: { '2026-10': 646760, '2026-11': 652480 },
      voucherIds: ['JE-2026-1106', 'JE-2026-1110']
    },
    {
      id: 'bs-assets-total',
      label: '资产总计',
      level: 0,
      measure: 'balance',
      monthly: { '2026-10': 2695000, '2026-11': 2802840 },
      voucherIds: ['JE-2026-1101', 'JE-2026-1102', 'JE-2026-1110']
    },
    {
      id: 'bs-liabilities-current',
      label: '流动负债',
      level: 0,
      measure: 'balance',
      monthly: { '2026-10': 1086600, '2026-11': 1076410 },
      voucherIds: ['JE-2026-1103', 'JE-2026-1105']
    },
    {
      id: 'bs-liabilities-noncurrent',
      label: '非流动负债',
      level: 0,
      measure: 'balance',
      monthly: { '2026-10': 100000, '2026-11': 128000 },
      voucherIds: ['JE-2026-1109']
    },
    {
      id: 'bs-liabilities-total',
      label: '负债合计',
      level: 0,
      measure: 'balance',
      monthly: { '2026-10': 1186600, '2026-11': 1204410 },
      voucherIds: ['JE-2026-1103', 'JE-2026-1105']
    },
    {
      id: 'bs-equity-paid-in',
      label: '实收资本',
      level: 1,
      measure: 'balance',
      monthly: { '2026-10': 1000000, '2026-11': 1000000 },
      voucherIds: ['JE-2026-1109']
    },
    {
      id: 'bs-equity-reserve',
      label: '资本公积',
      level: 1,
      measure: 'balance',
      monthly: { '2026-10': 150000, '2026-11': 150000 },
      voucherIds: ['JE-2026-1109']
    },
    {
      id: 'bs-equity-retained',
      label: '未分配利润',
      level: 1,
      measure: 'balance',
      monthly: { '2026-10': 358400, '2026-11': 448430 },
      voucherIds: ['JE-2026-1102', 'JE-2026-1108', 'JE-2026-1111']
    },
    {
      id: 'bs-equity-total',
      label: '所有者权益合计',
      level: 0,
      measure: 'balance',
      monthly: { '2026-10': 1508400, '2026-11': 1598430 },
      voucherIds: ['JE-2026-1108', 'JE-2026-1109', 'JE-2026-1111']
    },
    {
      id: 'bs-liabilities-equity-total',
      label: '负债和所有者权益总计',
      level: 0,
      measure: 'balance',
      monthly: { '2026-10': 2695000, '2026-11': 2802840 },
      voucherIds: ['JE-2026-1103', 'JE-2026-1109', 'JE-2026-1111']
    }
  ],
  'income-statement': [
    {
      id: 'is-revenue',
      label: '营业收入',
      level: 1,
      measure: 'flow',
      monthly: { '2026-10': 1028400, '2026-11': 1286400 },
      cashMonthly: { '2026-10': 928700, '2026-11': 1168200 },
      voucherIds: ['JE-2026-1102']
    },
    {
      id: 'is-cost',
      label: '营业成本',
      level: 1,
      measure: 'flow',
      monthly: { '2026-10': 660800, '2026-11': 842600 },
      cashMonthly: { '2026-10': 604100, '2026-11': 776900 },
      voucherIds: ['JE-2026-1101', 'JE-2026-1105']
    },
    {
      id: 'is-expense',
      label: '期间费用',
      level: 1,
      measure: 'flow',
      monthly: { '2026-10': 248700, '2026-11': 292000 },
      cashMonthly: { '2026-10': 244300, '2026-11': 287400 },
      voucherIds: ['JE-2026-1106', 'JE-2026-1107']
    },
    {
      id: 'is-operating-profit',
      label: '营业利润',
      level: 0,
      measure: 'flow',
      monthly: { '2026-10': 118900, '2026-11': 151800 },
      cashMonthly: { '2026-10': 80300, '2026-11': 103900 },
      voucherIds: ['JE-2026-1102', 'JE-2026-1101', 'JE-2026-1106']
    },
    {
      id: 'is-tax',
      label: '所得税费用',
      level: 1,
      measure: 'flow',
      monthly: { '2026-10': 17835, '2026-11': 22770 },
      cashMonthly: { '2026-10': 12045, '2026-11': 15585 },
      voucherIds: ['JE-2026-1111']
    },
    {
      id: 'is-net-profit',
      label: '净利润',
      level: 0,
      measure: 'flow',
      monthly: { '2026-10': 101065, '2026-11': 129030 },
      cashMonthly: { '2026-10': 68255, '2026-11': 88315 },
      voucherIds: ['JE-2026-1102', 'JE-2026-1106', 'JE-2026-1111']
    }
  ],
  'cash-flow': [
    {
      id: 'cf-operating',
      label: '经营活动现金流',
      level: 1,
      measure: 'flow',
      monthly: { '2026-10': 186400, '2026-11': 214800 },
      voucherIds: ['JE-2026-1104', 'JE-2026-1107', 'JE-2026-1105']
    },
    {
      id: 'cf-investing',
      label: '投资活动现金流',
      level: 1,
      measure: 'flow',
      monthly: { '2026-10': -96000, '2026-11': -126000 },
      voucherIds: ['JE-2026-1110']
    },
    {
      id: 'cf-financing',
      label: '筹资活动现金流',
      level: 1,
      measure: 'flow',
      monthly: { '2026-10': 240000, '2026-11': 300000 },
      voucherIds: ['JE-2026-1109']
    },
    {
      id: 'cf-net',
      label: '现金净增加额',
      level: 0,
      measure: 'flow',
      monthly: { '2026-10': 330400, '2026-11': 388800 },
      voucherIds: ['JE-2026-1109', 'JE-2026-1110', 'JE-2026-1104']
    },
    {
      id: 'cf-closing',
      label: '期末现金余额',
      level: 0,
      measure: 'balance',
      monthly: { '2026-10': 879600, '2026-11': 1268400 },
      voucherIds: ['JE-2026-1104', 'JE-2026-1107', 'JE-2026-1109']
    }
  ]
}

/* ------------------------------------------------------------------ */
/* 所有者权益变动表种子                                                 */
/* ------------------------------------------------------------------ */

export interface ReportingEquityMonthSeed {
  openingRetained: number
  netProfit: number
  distribution: number
  /** 本期所有者投入金额（演示数据为 0）。 */
  paidInAdd: number
}

export interface ReportingEquitySeed {
  paidIn: number
  capitalReserve: number
  monthly: Record<string, ReportingEquityMonthSeed>
  /** 权益变动表行与钻取凭证的关联。 */
  voucherIds: Record<string, string[]>
}

export const reportingEquitySeed: ReportingEquitySeed = {
  paidIn: 1000000,
  capitalReserve: 150000,
  monthly: {
    '2026-10': { openingRetained: 257335, netProfit: 101065, distribution: 0, paidInAdd: 0 },
    '2026-11': { openingRetained: 358400, netProfit: 129030, distribution: 39000, paidInAdd: 0 }
  },
  voucherIds: {
    'equity-opening': ['JE-2026-1109'],
    'equity-net-profit': ['JE-2026-1102', 'JE-2026-1106', 'JE-2026-1111'],
    'equity-contribution': ['JE-2026-1109'],
    'equity-distribution': ['JE-2026-1108'],
    'equity-closing': ['JE-2026-1109', 'JE-2026-1108', 'JE-2026-1111']
  }
}

export interface ReportingEquityRowSeed {
  id: string
  label: string
  /** 该行在权益变动表中的数额，按实收资本/资本公积/未分配利润/合计顺序。 */
  paidIn: number
  capitalReserve: number
  retained: number
}

/** 单年度合伙权益明细（2026 年度演示口径）。 */
export interface ReportingEquityPartner {
  id: string
  name: string
  role: string
  /** 出资比例，百分数。 */
  sharePct: number
  capital: number
  openingEquity: number
  netProfitShare: number
  distribution: number
  closingEquity: number
}

export const reportingEquityPartners: ReportingEquityPartner[] = [
  {
    id: 'equity-partner-zhang',
    name: '张明远',
    role: '执行事务合伙人',
    sharePct: 45,
    capital: 450000,
    openingEquity: 678780,
    netProfitShare: 456570,
    distribution: 108000,
    closingEquity: 1027350
  },
  {
    id: 'equity-partner-chen',
    name: '陈立',
    role: '有限合伙人',
    sharePct: 35,
    capital: 350000,
    openingEquity: 527940,
    netProfitShare: 355110,
    distribution: 84000,
    closingEquity: 799050
  },
  {
    id: 'equity-partner-yuanjian',
    name: '杭州远见投资合伙企业（有限合伙）',
    role: '有限合伙人',
    sharePct: 20,
    capital: 200000,
    openingEquity: 301680,
    netProfitShare: 202920,
    distribution: 48000,
    closingEquity: 456600
  }
]

/* ------------------------------------------------------------------ */
/* 凭证（报表行钻取）                                                   */
/* ------------------------------------------------------------------ */

export type ReportingVoucherStatus = 'posted'

export const reportingVoucherStatusLabels: Record<ReportingVoucherStatus, string> = {
  posted: '已过账'
}

export const reportingVoucherStatusColors: Record<ReportingVoucherStatus, ReportingBadgeColor> = {
  posted: 'success'
}

export interface ReportingVoucherLine {
  accountCode: string
  accountName: string
  debit: number
  credit: number
}

export interface ReportingVoucher {
  id: string
  date: string
  period: string
  description: string
  status: ReportingVoucherStatus
  preparedBy: string
  postedAt: string
  lines: ReportingVoucherLine[]
}

export const reportingVouchers: ReportingVoucher[] = [
  {
    id: 'JE-2026-1101',
    date: '2026-10-08',
    period: '2026-10',
    description: '采购办公用品入库',
    status: 'posted',
    preparedBy: '张明远',
    postedAt: '2026-10-08 16:20',
    lines: [
      { accountCode: '1403', accountName: '原材料', debit: 22600, credit: 0 },
      { accountCode: '2202', accountName: '应付账款', debit: 0, credit: 22600 }
    ]
  },
  {
    id: 'JE-2026-1102',
    date: '2026-10-15',
    period: '2026-10',
    description: '销售商品确认收入',
    status: 'posted',
    preparedBy: '陈立',
    postedAt: '2026-10-15 18:05',
    lines: [
      { accountCode: '1122', accountName: '应收账款', debit: 128400, credit: 0 },
      { accountCode: '4001', accountName: '主营业务收入', debit: 0, credit: 128400 }
    ]
  },
  {
    id: 'JE-2026-1103',
    date: '2026-10-22',
    period: '2026-10',
    description: '支付供应商货款',
    status: 'posted',
    preparedBy: '张明远',
    postedAt: '2026-10-22 15:40',
    lines: [
      { accountCode: '2202', accountName: '应付账款', debit: 63210, credit: 0 },
      { accountCode: '1002', accountName: '银行存款', debit: 0, credit: 63210 }
    ]
  },
  {
    id: 'JE-2026-1104',
    date: '2026-11-02',
    period: '2026-11',
    description: '收回应收账款',
    status: 'posted',
    preparedBy: '陈立',
    postedAt: '2026-11-02 10:30',
    lines: [
      { accountCode: '1002', accountName: '银行存款', debit: 45800, credit: 0 },
      { accountCode: '1122', accountName: '应收账款', debit: 0, credit: 45800 }
    ]
  },
  {
    id: 'JE-2026-1105',
    date: '2026-11-04',
    period: '2026-11',
    description: '采购包装材料入库',
    status: 'posted',
    preparedBy: '张明远',
    postedAt: '2026-11-04 14:10',
    lines: [
      { accountCode: '1403', accountName: '原材料', debit: 35800, credit: 0 },
      { accountCode: '2202', accountName: '应付账款', debit: 0, credit: 35800 }
    ]
  },
  {
    id: 'JE-2026-1106',
    date: '2026-11-06',
    period: '2026-11',
    description: '计提折旧',
    status: 'posted',
    preparedBy: '陈立',
    postedAt: '2026-11-06 09:20',
    lines: [
      { accountCode: '4105', accountName: '管理费用', debit: 12600, credit: 0 },
      { accountCode: '1602', accountName: '累计折旧', debit: 0, credit: 12600 }
    ]
  },
  {
    id: 'JE-2026-1107',
    date: '2026-11-10',
    period: '2026-11',
    description: '支付期间费用',
    status: 'posted',
    preparedBy: '张明远',
    postedAt: '2026-11-10 16:45',
    lines: [
      { accountCode: '4105', accountName: '管理费用', debit: 28400, credit: 0 },
      { accountCode: '1002', accountName: '银行存款', debit: 0, credit: 28400 }
    ]
  },
  {
    id: 'JE-2026-1108',
    date: '2026-11-15',
    period: '2026-11',
    description: '利润分配',
    status: 'posted',
    preparedBy: '陈立',
    postedAt: '2026-11-15 11:05',
    lines: [
      { accountCode: '4104', accountName: '利润分配', debit: 39000, credit: 0 },
      { accountCode: '2241', accountName: '应付股利', debit: 0, credit: 39000 }
    ]
  },
  {
    id: 'JE-2026-1109',
    date: '2026-11-06',
    period: '2026-11',
    description: '取得长期借款',
    status: 'posted',
    preparedBy: '张明远',
    postedAt: '2026-11-06 15:50',
    lines: [
      { accountCode: '1002', accountName: '银行存款', debit: 300000, credit: 0 },
      { accountCode: '2501', accountName: '长期借款', debit: 0, credit: 300000 }
    ]
  },
  {
    id: 'JE-2026-1110',
    date: '2026-11-08',
    period: '2026-11',
    description: '购置生产设备',
    status: 'posted',
    preparedBy: '陈立',
    postedAt: '2026-11-08 17:15',
    lines: [
      { accountCode: '1601', accountName: '固定资产', debit: 126000, credit: 0 },
      { accountCode: '1002', accountName: '银行存款', debit: 0, credit: 126000 }
    ]
  },
  {
    id: 'JE-2026-1111',
    date: '2026-11-18',
    period: '2026-11',
    description: '计提企业所得税',
    status: 'posted',
    preparedBy: '张明远',
    postedAt: '2026-11-18 17:30',
    lines: [
      { accountCode: '6801', accountName: '所得税费用', debit: 22770, credit: 0 },
      { accountCode: '2221', accountName: '应交税费', debit: 0, credit: 22770 }
    ]
  }
]

/* ------------------------------------------------------------------ */
/* 账龄与账龄快照                                                      */
/* ------------------------------------------------------------------ */

export type ReportingAgingKind = 'receivable' | 'payable'

export const reportingAgingKindLabels: Record<ReportingAgingKind, string> = {
  receivable: '应收',
  payable: '应付'
}

export const reportingAgingKindLongLabels: Record<ReportingAgingKind, string> = {
  receivable: '应收账款账龄',
  payable: '应付账款账龄'
}

export const reportingAgingBucketKeys = ['current', 'd1-30', 'd31-60', 'd61-90', 'd90-plus'] as const

export type ReportingAgingBucketKey = (typeof reportingAgingBucketKeys)[number]

export const reportingAgingBucketLabels: Record<ReportingAgingBucketKey, string> = {
  'current': '未到期',
  'd1-30': '1-30 天',
  'd31-60': '31-60 天',
  'd61-90': '61-90 天',
  'd90-plus': '90 天以上'
}

export interface ReportingAgingItem {
  id: string
  kind: ReportingAgingKind
  partnerName: string
  docId: string
  docType: '销售发票' | '采购订单'
  postedAt: string
  dueAt: string
  amount: number
}

export const reportingAgingItems: ReportingAgingItem[] = [
  {
    id: 'aging-ar-0081',
    kind: 'receivable',
    partnerName: '杭州云杉科技有限公司',
    docId: 'INV-2026-0081',
    docType: '销售发票',
    postedAt: '2026-10-08',
    dueAt: '2026-11-30',
    amount: 128400
  },
  {
    id: 'aging-ar-0088',
    kind: 'receivable',
    partnerName: '杭州云杉科技有限公司',
    docId: 'INV-2026-0088',
    docType: '销售发票',
    postedAt: '2026-11-02',
    dueAt: '2026-10-28',
    amount: 45800
  },
  {
    id: 'aging-ar-0082',
    kind: 'receivable',
    partnerName: '南京远航贸易有限公司',
    docId: 'INV-2026-0082',
    docType: '销售发票',
    postedAt: '2026-10-15',
    dueAt: '2026-11-25',
    amount: 48260
  },
  {
    id: 'aging-ar-0084',
    kind: 'receivable',
    partnerName: '无锡恒信实业有限公司',
    docId: 'INV-2026-0084',
    docType: '销售发票',
    postedAt: '2026-08-20',
    dueAt: '2026-08-15',
    amount: 63200
  },
  {
    id: 'aging-ar-0083',
    kind: 'receivable',
    partnerName: '上海启明零售有限公司',
    docId: 'INV-2026-0083',
    docType: '销售发票',
    postedAt: '2026-10-30',
    dueAt: '2026-10-30',
    amount: 15600
  },
  {
    id: 'aging-ar-0089',
    kind: 'receivable',
    partnerName: '杭州云杉科技有限公司',
    docId: 'INV-2026-0089',
    docType: '销售发票',
    postedAt: '2026-11-18',
    dueAt: '2026-12-18',
    amount: 22600
  },
  {
    id: 'aging-ar-0087',
    kind: 'receivable',
    partnerName: '南京远航贸易有限公司',
    docId: 'INV-2026-0087',
    docType: '销售发票',
    postedAt: '2026-11-12',
    dueAt: '2026-11-16',
    amount: 12680
  },
  {
    id: 'aging-ar-0090',
    kind: 'receivable',
    partnerName: '上海启明零售有限公司',
    docId: 'INV-2026-0090',
    docType: '销售发票',
    postedAt: '2026-11-05',
    dueAt: '2026-12-10',
    amount: 18800
  },
  {
    id: 'aging-ap-0511',
    kind: 'payable',
    partnerName: '苏州精工电子有限公司',
    docId: 'PO-2026-0511',
    docType: '采购订单',
    postedAt: '2026-10-12',
    dueAt: '2026-11-20',
    amount: 63210
  },
  {
    id: 'aging-ap-0512',
    kind: 'payable',
    partnerName: '上海联诚办公用品有限公司',
    docId: 'PO-2026-0512',
    docType: '采购订单',
    postedAt: '2026-10-18',
    dueAt: '2026-10-18',
    amount: 22600
  },
  {
    id: 'aging-ap-0513',
    kind: 'payable',
    partnerName: '宁波华翔包装材料有限公司',
    docId: 'PO-2026-0513',
    docType: '采购订单',
    postedAt: '2026-10-05',
    dueAt: '2026-10-05',
    amount: 35800
  },
  {
    id: 'aging-ap-0514',
    kind: 'payable',
    partnerName: '深圳市恒通办公设备有限公司',
    docId: 'PO-2026-0514',
    docType: '采购订单',
    postedAt: '2026-09-12',
    dueAt: '2026-09-12',
    amount: 90000
  },
  {
    id: 'aging-ap-0515',
    kind: 'payable',
    partnerName: '苏州精工电子有限公司',
    docId: 'PO-2026-0515',
    docType: '采购订单',
    postedAt: '2026-08-10',
    dueAt: '2026-08-10',
    amount: 12600
  },
  {
    id: 'aging-ap-0516',
    kind: 'payable',
    partnerName: '杭州安泰劳保用品有限公司',
    docId: 'PO-2026-0516',
    docType: '采购订单',
    postedAt: '2026-11-03',
    dueAt: '2026-11-10',
    amount: 14400
  },
  {
    id: 'aging-ap-0517',
    kind: 'payable',
    partnerName: '无锡恒信实业有限公司',
    docId: 'PO-2026-0517',
    docType: '采购订单',
    postedAt: '2026-11-14',
    dueAt: '2026-11-28',
    amount: 46800
  },
  {
    id: 'aging-ap-0518',
    kind: 'payable',
    partnerName: '宁波华翔包装材料有限公司',
    docId: 'PO-2026-0518',
    docType: '采购订单',
    postedAt: '2026-11-16',
    dueAt: '2026-11-22',
    amount: 8960
  },
  {
    id: 'aging-ap-0519',
    kind: 'payable',
    partnerName: '杭州安泰劳保用品有限公司',
    docId: 'PO-2026-0519',
    docType: '采购订单',
    postedAt: '2026-11-06',
    dueAt: '2026-11-25',
    amount: 26400
  }
]

export interface ReportingAgingSnapshot {
  id: string
  cutoff: string
  generatedAt: string
  version: number
  receivableTotal: number
  payableTotal: number
  note?: string
}

export const reportingAgingSnapshots: ReportingAgingSnapshot[] = [
  {
    id: 'AS-2026-11-18',
    cutoff: '2026-11-18',
    generatedAt: '2026-11-18 18:30',
    version: 3,
    receivableTotal: 355340,
    payableTotal: 320770,
    note: '日结账龄快照，覆盖 11 月已过账未核销单据。'
  },
  {
    id: 'AS-2026-11-10',
    cutoff: '2026-11-10',
    generatedAt: '2026-11-10 18:00',
    version: 2,
    receivableTotal: 320060,
    payableTotal: 265010
  },
  {
    id: 'AS-2026-10-31',
    cutoff: '2026-10-31',
    generatedAt: '2026-10-31 18:00',
    version: 1,
    receivableTotal: 317740,
    payableTotal: 267970
  }
]

/* ------------------------------------------------------------------ */
/* 客户 / 供应商明细账                                                 */
/* ------------------------------------------------------------------ */

export type ReportingLedgerKind = 'receivable' | 'payable'

export const reportingLedgerKindLabels: Record<ReportingLedgerKind, string> = {
  receivable: '客户明细账',
  payable: '供应商明细账'
}

export type ReportingLedgerDocType = 'sales-invoice' | 'receipt' | 'purchase-order' | 'payment'

export const reportingLedgerDocTypeLabels: Record<ReportingLedgerDocType, string> = {
  'sales-invoice': '销售发票',
  'receipt': '收款单',
  'purchase-order': '采购订单',
  'payment': '付款单'
}

export interface ReportingLedgerOpening {
  partnerName: string
  kind: ReportingLedgerKind
  openingAmount: number
  openingAt: string
}

export const reportingLedgerOpenings: ReportingLedgerOpening[] = [
  { partnerName: '杭州云杉科技有限公司', kind: 'receivable', openingAmount: 64200, openingAt: '2026-10-01' },
  { partnerName: '南京远航贸易有限公司', kind: 'receivable', openingAmount: 0, openingAt: '2026-10-01' },
  { partnerName: '无锡恒信实业有限公司', kind: 'receivable', openingAmount: 63200, openingAt: '2026-10-01' },
  { partnerName: '上海启明零售有限公司', kind: 'receivable', openingAmount: 0, openingAt: '2026-10-01' },
  { partnerName: '苏州精工电子有限公司', kind: 'payable', openingAmount: 0, openingAt: '2026-10-01' },
  { partnerName: '上海联诚办公用品有限公司', kind: 'payable', openingAmount: 0, openingAt: '2026-10-01' },
  { partnerName: '宁波华翔包装材料有限公司', kind: 'payable', openingAmount: 0, openingAt: '2026-10-01' },
  { partnerName: '深圳市恒通办公设备有限公司', kind: 'payable', openingAmount: 90000, openingAt: '2026-10-01' },
  { partnerName: '杭州安泰劳保用品有限公司', kind: 'payable', openingAmount: 0, openingAt: '2026-10-01' }
]

export interface ReportingLedgerEntry {
  id: string
  kind: ReportingLedgerKind
  partnerName: string
  date: string
  docId: string
  docType: ReportingLedgerDocType
  summary: string
  /** 增加：应收为借方发生额，应付为贷方发生额。 */
  increase: number
  /** 减少：应收为贷方发生额，应付为借方发生额。 */
  decrease: number
}

export const reportingLedgerEntries: ReportingLedgerEntry[] = [
  {
    id: 'ledger-ar-0001',
    kind: 'receivable',
    partnerName: '杭州云杉科技有限公司',
    date: '2026-10-08',
    docId: 'INV-2026-0081',
    docType: 'sales-invoice',
    summary: '销售商品确认应收',
    increase: 128400,
    decrease: 0
  },
  {
    id: 'ledger-ar-0002',
    kind: 'receivable',
    partnerName: '杭州云杉科技有限公司',
    date: '2026-10-20',
    docId: 'RCPT-2026-1002',
    docType: 'receipt',
    summary: '收到销售货款',
    increase: 0,
    decrease: 64200
  },
  {
    id: 'ledger-ar-0003',
    kind: 'receivable',
    partnerName: '杭州云杉科技有限公司',
    date: '2026-11-02',
    docId: 'INV-2026-0088',
    docType: 'sales-invoice',
    summary: '销售商品确认应收',
    increase: 45800,
    decrease: 0
  },
  {
    id: 'ledger-ar-0004',
    kind: 'receivable',
    partnerName: '杭州云杉科技有限公司',
    date: '2026-11-16',
    docId: 'RCPT-2026-1101',
    docType: 'receipt',
    summary: '收到销售货款',
    increase: 0,
    decrease: 45800
  },
  {
    id: 'ledger-ar-0005',
    kind: 'receivable',
    partnerName: '杭州云杉科技有限公司',
    date: '2026-11-18',
    docId: 'INV-2026-0089',
    docType: 'sales-invoice',
    summary: '销售商品确认应收',
    increase: 22600,
    decrease: 0
  },
  {
    id: 'ledger-ar-0006',
    kind: 'receivable',
    partnerName: '南京远航贸易有限公司',
    date: '2026-10-15',
    docId: 'INV-2026-0082',
    docType: 'sales-invoice',
    summary: '销售商品确认应收',
    increase: 48260,
    decrease: 0
  },
  {
    id: 'ledger-ar-0007',
    kind: 'receivable',
    partnerName: '南京远航贸易有限公司',
    date: '2026-11-10',
    docId: 'RCPT-2026-1102',
    docType: 'receipt',
    summary: '收到部分销售货款',
    increase: 0,
    decrease: 20000
  },
  {
    id: 'ledger-ar-0008',
    kind: 'receivable',
    partnerName: '无锡恒信实业有限公司',
    date: '2026-11-10',
    docId: 'RCPT-2026-1103',
    docType: 'receipt',
    summary: '收到历史欠款',
    increase: 0,
    decrease: 15000
  },
  {
    id: 'ledger-ar-0009',
    kind: 'receivable',
    partnerName: '上海启明零售有限公司',
    date: '2026-10-30',
    docId: 'INV-2026-0083',
    docType: 'sales-invoice',
    summary: '销售商品确认应收',
    increase: 15600,
    decrease: 0
  },
  {
    id: 'ledger-ap-0001',
    kind: 'payable',
    partnerName: '苏州精工电子有限公司',
    date: '2026-10-12',
    docId: 'PO-2026-0511',
    docType: 'purchase-order',
    summary: '采购电子元件入库',
    increase: 63210,
    decrease: 0
  },
  {
    id: 'ledger-ap-0002',
    kind: 'payable',
    partnerName: '苏州精工电子有限公司',
    date: '2026-10-25',
    docId: 'PAY-2026-1015',
    docType: 'payment',
    summary: '支付采购货款',
    increase: 0,
    decrease: 63210
  },
  {
    id: 'ledger-ap-0003',
    kind: 'payable',
    partnerName: '苏州精工电子有限公司',
    date: '2026-11-18',
    docId: 'PO-2026-0515',
    docType: 'purchase-order',
    summary: '采购维修配件入库',
    increase: 12600,
    decrease: 0
  },
  {
    id: 'ledger-ap-0004',
    kind: 'payable',
    partnerName: '上海联诚办公用品有限公司',
    date: '2026-10-18',
    docId: 'PO-2026-0512',
    docType: 'purchase-order',
    summary: '采购办公用品入库',
    increase: 22600,
    decrease: 0
  },
  {
    id: 'ledger-ap-0005',
    kind: 'payable',
    partnerName: '宁波华翔包装材料有限公司',
    date: '2026-10-05',
    docId: 'PO-2026-0513',
    docType: 'purchase-order',
    summary: '采购包装材料入库',
    increase: 35800,
    decrease: 0
  },
  {
    id: 'ledger-ap-0006',
    kind: 'payable',
    partnerName: '宁波华翔包装材料有限公司',
    date: '2026-11-16',
    docId: 'PAY-2026-1108',
    docType: 'payment',
    summary: '支付包装材料货款',
    increase: 0,
    decrease: 35800
  },
  {
    id: 'ledger-ap-0007',
    kind: 'payable',
    partnerName: '杭州安泰劳保用品有限公司',
    date: '2026-11-03',
    docId: 'PO-2026-0516',
    docType: 'purchase-order',
    summary: '采购劳保用品入库',
    increase: 14400,
    decrease: 0
  }
]

export interface ReportingLedgerDocument {
  id: string
  docType: ReportingLedgerDocType
  label: string
  partnerName: string
  date: string
  amount: number
  statusLabel: string
  jumpPath: string
  jumpLabel: string
}

export const reportingLedgerDocuments: ReportingLedgerDocument[] = [
  {
    id: 'INV-2026-0081',
    docType: 'sales-invoice',
    label: '销售发票',
    partnerName: '杭州云杉科技有限公司',
    date: '2026-10-08',
    amount: 128400,
    statusLabel: '已开票',
    jumpPath: '/sales?tab=invoices',
    jumpLabel: '前往销售发票'
  },
  {
    id: 'INV-2026-0088',
    docType: 'sales-invoice',
    label: '销售发票',
    partnerName: '杭州云杉科技有限公司',
    date: '2026-11-02',
    amount: 45800,
    statusLabel: '已开票',
    jumpPath: '/sales?tab=invoices',
    jumpLabel: '前往销售发票'
  },
  {
    id: 'INV-2026-0089',
    docType: 'sales-invoice',
    label: '销售发票',
    partnerName: '杭州云杉科技有限公司',
    date: '2026-11-18',
    amount: 22600,
    statusLabel: '已开票',
    jumpPath: '/sales?tab=invoices',
    jumpLabel: '前往销售发票'
  },
  {
    id: 'INV-2026-0082',
    docType: 'sales-invoice',
    label: '销售发票',
    partnerName: '南京远航贸易有限公司',
    date: '2026-10-15',
    amount: 48260,
    statusLabel: '已开票',
    jumpPath: '/sales?tab=invoices',
    jumpLabel: '前往销售发票'
  },
  {
    id: 'INV-2026-0083',
    docType: 'sales-invoice',
    label: '销售发票',
    partnerName: '上海启明零售有限公司',
    date: '2026-10-30',
    amount: 15600,
    statusLabel: '已开票',
    jumpPath: '/sales?tab=invoices',
    jumpLabel: '前往销售发票'
  },
  {
    id: 'RCPT-2026-1002',
    docType: 'receipt',
    label: '收款单',
    partnerName: '杭州云杉科技有限公司',
    date: '2026-10-20',
    amount: 64200,
    statusLabel: '已收款',
    jumpPath: '/finance?tab=bank',
    jumpLabel: '前往银行流水'
  },
  {
    id: 'RCPT-2026-1101',
    docType: 'receipt',
    label: '收款单',
    partnerName: '杭州云杉科技有限公司',
    date: '2026-11-16',
    amount: 45800,
    statusLabel: '已收款',
    jumpPath: '/finance?tab=bank',
    jumpLabel: '前往银行流水'
  },
  {
    id: 'RCPT-2026-1102',
    docType: 'receipt',
    label: '收款单',
    partnerName: '南京远航贸易有限公司',
    date: '2026-11-10',
    amount: 20000,
    statusLabel: '已收款',
    jumpPath: '/finance?tab=bank',
    jumpLabel: '前往银行流水'
  },
  {
    id: 'RCPT-2026-1103',
    docType: 'receipt',
    label: '收款单',
    partnerName: '无锡恒信实业有限公司',
    date: '2026-11-10',
    amount: 15000,
    statusLabel: '已收款',
    jumpPath: '/finance?tab=bank',
    jumpLabel: '前往银行流水'
  },
  {
    id: 'PO-2026-0511',
    docType: 'purchase-order',
    label: '采购订单',
    partnerName: '苏州精工电子有限公司',
    date: '2026-10-12',
    amount: 63210,
    statusLabel: '已完成',
    jumpPath: '/purchase-orders?order=PO-2026-0511',
    jumpLabel: '前往采购订单'
  },
  {
    id: 'PO-2026-0512',
    docType: 'purchase-order',
    label: '采购订单',
    partnerName: '上海联诚办公用品有限公司',
    date: '2026-10-18',
    amount: 22600,
    statusLabel: '已完成',
    jumpPath: '/purchase-orders?order=PO-2026-0512',
    jumpLabel: '前往采购订单'
  },
  {
    id: 'PO-2026-0513',
    docType: 'purchase-order',
    label: '采购订单',
    partnerName: '宁波华翔包装材料有限公司',
    date: '2026-10-05',
    amount: 35800,
    statusLabel: '已完成',
    jumpPath: '/purchase-orders?order=PO-2026-0513',
    jumpLabel: '前往采购订单'
  },
  {
    id: 'PO-2026-0515',
    docType: 'purchase-order',
    label: '采购订单',
    partnerName: '苏州精工电子有限公司',
    date: '2026-11-18',
    amount: 12600,
    statusLabel: '待收货',
    jumpPath: '/purchase-orders?order=PO-2026-0515',
    jumpLabel: '前往采购订单'
  },
  {
    id: 'PO-2026-0516',
    docType: 'purchase-order',
    label: '采购订单',
    partnerName: '杭州安泰劳保用品有限公司',
    date: '2026-11-03',
    amount: 14400,
    statusLabel: '已完成',
    jumpPath: '/purchase-orders?order=PO-2026-0516',
    jumpLabel: '前往采购订单'
  },
  {
    id: 'PAY-2026-1015',
    docType: 'payment',
    label: '付款单',
    partnerName: '苏州精工电子有限公司',
    date: '2026-10-25',
    amount: 63210,
    statusLabel: '已付款',
    jumpPath: '/finance?tab=bank',
    jumpLabel: '前往银行流水'
  },
  {
    id: 'PAY-2026-1108',
    docType: 'payment',
    label: '付款单',
    partnerName: '宁波华翔包装材料有限公司',
    date: '2026-11-16',
    amount: 35800,
    statusLabel: '已付款',
    jumpPath: '/finance?tab=bank',
    jumpLabel: '前往银行流水'
  }
]

/* ------------------------------------------------------------------ */
/* 报告导出记录                                                        */
/* ------------------------------------------------------------------ */

export type ReportingExportStatus = 'generating' | 'ready' | 'failed'

export const reportingExportStatusLabels: Record<ReportingExportStatus, string> = {
  generating: '生成中',
  ready: '已就绪',
  failed: '生成失败'
}

export const reportingExportStatusColors: Record<ReportingExportStatus, ReportingBadgeColor> = {
  generating: 'warning',
  ready: 'success',
  failed: 'error'
}

export type ReportingExportBasis = ReportingBasis | 'ledger'

export const reportingExportBasisLabels: Record<ReportingExportBasis, string> = {
  accrual: '权责发生制',
  cash: '收付实现制',
  ledger: '账面口径'
}

export interface ReportingExportRecord {
  id: string
  workspaceId: string
  workspaceName: string
  statement: ReportingStatementKey
  periodKey: string
  rangeStart: string
  rangeEnd: string
  basis: ReportingExportBasis
  status: ReportingExportStatus
  watermark: number
  snapshotId: string
  requestedAt: string
  completedAt?: string
  rowCount: number
  fileName: string
  fileSizeKb: number
  failureReason?: string
  rebuiltFrom?: string
}

export const reportingExportSeeds: ReportingExportRecord[] = [
  {
    id: 'EXP-2026-0001',
    workspaceId: 'ws-hq',
    workspaceName: '华东总部贸易有限公司',
    statement: 'income-statement',
    periodKey: '2026-10',
    rangeStart: '2026-10-01',
    rangeEnd: '2026-10-31',
    basis: 'accrual',
    status: 'ready',
    watermark: 128,
    snapshotId: 'snap-2026-10-31-a13f',
    requestedAt: '2026-11-02 09:12',
    completedAt: '2026-11-02 09:13',
    rowCount: 6,
    fileName: '利润表-2026-10-权责发生制.csv',
    fileSizeKb: 2.4
  },
  {
    id: 'EXP-2026-0002',
    workspaceId: 'ws-hq',
    workspaceName: '华东总部贸易有限公司',
    statement: 'cash-flow',
    periodKey: '2026-10',
    rangeStart: '2026-10-01',
    rangeEnd: '2026-10-31',
    basis: 'ledger',
    status: 'failed',
    watermark: 128,
    snapshotId: 'snap-2026-10-31-a13f',
    requestedAt: '2026-11-02 09:14',
    completedAt: '2026-11-02 09:15',
    rowCount: 5,
    fileName: '现金流量表-2026-10.csv',
    fileSizeKb: 0,
    failureReason: '源快照缺少现金流量表辅助核算，生成失败；可按原快照重建后重试。'
  },
  {
    id: 'EXP-2026-0003',
    workspaceId: 'ws-hq',
    workspaceName: '华东总部贸易有限公司',
    statement: 'balance-sheet',
    periodKey: '2026-10',
    rangeStart: '2026-10-01',
    rangeEnd: '2026-10-31',
    basis: 'ledger',
    status: 'ready',
    watermark: 128,
    snapshotId: 'snap-2026-10-31-a13f',
    requestedAt: '2026-11-02 09:18',
    completedAt: '2026-11-02 09:19',
    rowCount: 11,
    fileName: '资产负债表-2026-10.csv',
    fileSizeKb: 3.1
  },
  {
    id: 'EXP-2026-0004',
    workspaceId: 'ws-hq',
    workspaceName: '华东总部贸易有限公司',
    statement: 'equity-changes',
    periodKey: '2026-11',
    rangeStart: '2026-11-01',
    rangeEnd: '2026-11-18',
    basis: 'ledger',
    status: 'ready',
    watermark: 142,
    snapshotId: 'snap-2026-11-18-3c7e',
    requestedAt: '2026-11-19 09:05',
    completedAt: '2026-11-19 09:06',
    rowCount: 5,
    fileName: '所有者权益变动表-2026-11.csv',
    fileSizeKb: 2.7
  }
]

/* ------------------------------------------------------------------ */
/* 工作台财务概览投影                                                  */
/* ------------------------------------------------------------------ */

export type ReportingProjectionStatus = 'pending' | 'ready' | 'unavailable'

export const reportingProjectionStatusLabels: Record<ReportingProjectionStatus, string> = {
  pending: '待生成',
  ready: '已就绪',
  unavailable: '暂不可用'
}

export const reportingProjectionStatusColors: Record<ReportingProjectionStatus, ReportingBadgeColor> = {
  pending: 'warning',
  ready: 'success',
  unavailable: 'error'
}

export interface ReportingOverviewMonth {
  revenue: number
  cost: number
  expense: number
  netProfit: number
  receivable: number
  payable: number
  cashIn: number
  cashOut: number
}

export interface ReportingProjectionSeed {
  workspaceId: string
  workspaceName: string
  status: ReportingProjectionStatus
  /** 投影版本；待生成/不可用时为空。 */
  version?: number
  /** 工作区投影的更新时间（投影服务口径）。 */
  updatedAt: string
  /** 投影生成时间（已就绪时展示）。 */
  generatedAt?: string
  /** 过账水位号。 */
  postingWatermark: number
  /** 过账水位时间。 */
  postingWatermarkAt: string
  /** 水位金额：截至过账水位的累计过账金额。 */
  postingAmount: number
  voucherCount: number
  pendingReason?: string
  unavailableReason?: string
  /** 2026-10 与 2026-11 的月度概览（全月口径，展示时按日期区间折算）。 */
  monthly: Record<string, ReportingOverviewMonth>
}

export const reportingProjectionSeeds: ReportingProjectionSeed[] = [
  {
    workspaceId: 'ws-hq',
    workspaceName: '华东总部贸易有限公司',
    status: 'ready',
    version: 18,
    updatedAt: '2026-11-19 09:20',
    generatedAt: '2026-11-19 09:18',
    postingWatermark: 142,
    postingWatermarkAt: '2026-11-18 18:00',
    postingAmount: 3186400,
    voucherCount: 61,
    monthly: {
      '2026-10': {
        revenue: 1028400,
        cost: 660800,
        expense: 248700,
        netProfit: 101065,
        receivable: 328600,
        payable: 412800,
        cashIn: 1868400,
        cashOut: 1538000
      },
      '2026-11': {
        revenue: 1286400,
        cost: 842600,
        expense: 292000,
        netProfit: 129030,
        receivable: 356200,
        payable: 438900,
        cashIn: 2046800,
        cashOut: 1658000
      }
    }
  },
  {
    workspaceId: 'ws-south',
    workspaceName: '华南采购中心（深圳）',
    status: 'pending',
    updatedAt: '2026-11-19 09:12',
    postingWatermark: 57,
    postingWatermarkAt: '2026-11-17 17:20',
    postingAmount: 1264800,
    voucherCount: 34,
    pendingReason: '工作区投影任务已进入队列，正在等待财务投影服务调度；预计 09:40 完成。',
    monthly: {
      '2026-10': {
        revenue: 432000,
        cost: 277500,
        expense: 104500,
        netProfit: 50000,
        receivable: 148000,
        payable: 176000,
        cashIn: 784700,
        cashOut: 646000
      },
      '2026-11': {
        revenue: 540300,
        cost: 353900,
        expense: 122600,
        netProfit: 63800,
        receivable: 158900,
        payable: 184300,
        cashIn: 860000,
        cashOut: 696400
      }
    }
  },
  {
    workspaceId: 'ws-retail',
    workspaceName: '社区零售事业部（杭州试运营）',
    status: 'unavailable',
    updatedAt: '2026-11-19 08:55',
    postingWatermark: 31,
    postingWatermarkAt: '2026-11-17 16:05',
    postingAmount: 486200,
    voucherCount: 18,
    unavailableReason: '投影服务在 09:05 的健康检查中返回 503，工作区投影暂不可用；已过账财务数据不受影响。',
    monthly: {
      '2026-10': {
        revenue: 174800,
        cost: 112400,
        expense: 42300,
        netProfit: 20100,
        receivable: 55900,
        payable: 70200,
        cashIn: 317600,
        cashOut: 261500
      },
      '2026-11': {
        revenue: 218700,
        cost: 143200,
        expense: 49600,
        netProfit: 25900,
        receivable: 60600,
        payable: 74600,
        cashIn: 347900,
        cashOut: 281900
      }
    }
  }
]

export const reportingOverviewMetricLabels: Record<keyof ReportingOverviewMonth, string> = {
  revenue: '营业收入',
  cost: '营业成本',
  expense: '期间费用',
  netProfit: '净利润',
  receivable: '应收余额',
  payable: '应付余额',
  cashIn: '现金流入',
  cashOut: '现金流出'
}
