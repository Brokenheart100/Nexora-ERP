import type { ExternalJournal, ExternalJournalStatus } from './types'

export const externalJournalStatusLabels: Record<ExternalJournalStatus, string> = {
  draft: '草稿',
  submitted: '待独立复核',
  posted: '已过账',
  cancelled: '已取消'
}

export const externalJournalStatusColors: Record<ExternalJournalStatus, 'neutral' | 'warning' | 'success' | 'error'> = {
  draft: 'neutral',
  submitted: 'warning',
  posted: 'success',
  cancelled: 'error'
}

export const externalJournalProviders = [
  { label: '金蝶云星空', value: 'KINGDEE' },
  { label: '用友 NC', value: 'YONYOU' },
  { label: 'SAP S/4HANA', value: 'SAP' },
  { label: '历史 ERP（已停用）', value: 'ERP-OLD' }
]

export const externalJournalSeeds: ExternalJournal[] = [
  {
    id: 'IMP-2026-0001',
    workspaceId: 'ws-hq',
    provider: 'KINGDEE',
    externalId: 'JE-2026-0088',
    date: '2026-11-12',
    period: '2026-11',
    description: '外部系统转入服务收入确认',
    status: 'draft',
    version: 1,
    debitTotal: '56000.00',
    creditTotal: '56000.00',
    lines: [
      { accountCode: '1002', accountName: '银行存款', debit: '56000.00', credit: '0.00' },
      { accountCode: '4001', accountName: '主营业务收入', debit: '0.00', credit: '56000.00' }
    ],
    makerId: 'u-1001',
    makerName: '张明远',
    createdAt: '2026-11-12 09:20',
    updatedAt: '2026-11-12 09:20'
  },
  {
    id: 'IMP-2026-0002',
    workspaceId: 'ws-hq',
    provider: 'YONYOU',
    externalId: '202611-0042',
    date: '2026-11-15',
    period: '2026-11',
    description: '外部系统转入客户回款',
    status: 'submitted',
    version: 2,
    debitTotal: '128400.00',
    creditTotal: '128400.00',
    lines: [
      { accountCode: '1002', accountName: '银行存款', debit: '128400.00', credit: '0.00' },
      { accountCode: '1122', accountName: '应收账款', debit: '0.00', credit: '128400.00' }
    ],
    makerId: 'u-1001',
    makerName: '张明远',
    submittedAt: '2026-11-15 14:05',
    createdAt: '2026-11-15 13:40',
    updatedAt: '2026-11-15 14:05'
  },
  {
    id: 'IMP-2026-0003',
    workspaceId: 'ws-hq',
    provider: 'KINGDEE',
    externalId: 'JE-2026-0089',
    date: '2026-11-16',
    period: '2026-11',
    description: '外部系统转入原材料采购',
    status: 'posted',
    version: 3,
    debitTotal: '66000.00',
    creditTotal: '66000.00',
    lines: [
      { accountCode: '1403', accountName: '原材料', debit: '66000.00', credit: '0.00' },
      { accountCode: '2202', accountName: '应付账款', debit: '0.00', credit: '66000.00' }
    ],
    makerId: 'u-1001',
    makerName: '张明远',
    reviewerId: 'u-1004',
    reviewerName: '陈立',
    submittedAt: '2026-11-16 10:12',
    postedAt: '2026-11-16 15:30',
    postingNumber: 'JE-2026-0101',
    createdAt: '2026-11-16 09:50',
    updatedAt: '2026-11-16 15:30'
  },
  {
    id: 'IMP-2026-0004',
    workspaceId: 'ws-hq',
    provider: 'ERP-OLD',
    externalId: '2026-08-001',
    date: '2026-08-20',
    period: '2026-08',
    description: '历史系统导入的办公费',
    status: 'draft',
    version: 1,
    debitTotal: '12600.00',
    creditTotal: '12600.00',
    lines: [
      { accountCode: '1002', accountName: '银行存款', debit: '12600.00', credit: '0.00' },
      { accountCode: '4001', accountName: '主营业务收入', debit: '0.00', credit: '12600.00' }
    ],
    makerId: 'u-1001',
    makerName: '张明远',
    createdAt: '2026-08-21 11:00',
    updatedAt: '2026-08-21 11:00'
  }
]

export function cloneExternalJournal(journal: ExternalJournal): ExternalJournal {
  return {
    ...journal,
    lines: journal.lines.map(line => ({ ...line }))
  }
}
