import type {
  Donation,
  DonationDispatch,
  DonationFiscalTicket,
  DonationMailState,
  DonationMethod,
  DonationStatus
} from './types'

export const donationStatusLabels: Record<DonationStatus, string> = {
  draft: '草稿',
  submitted: '待独立复核',
  posted: '已过账',
  reversed: '已作废'
}

export const donationStatusColors: Record<DonationStatus, 'neutral' | 'warning' | 'success' | 'error'> = {
  draft: 'neutral',
  submitted: 'warning',
  posted: 'success',
  reversed: 'error'
}

export const donationMethodLabels: Record<DonationMethod, string> = {
  cash: '现金',
  check: '支票',
  card: '银行卡',
  transfer: '银行转账'
}

export const donationMethodColors: Record<DonationMethod, 'success' | 'info' | 'warning' | 'primary'> = {
  cash: 'success',
  check: 'warning',
  card: 'info',
  transfer: 'primary'
}

export const donationFundAccounts = [
  { id: 'fund-cash', name: '现金账户', type: 'cash' as const },
  { id: 'ba-2026-01', name: '招商银行 · 基本存款账户', type: 'bank' as const },
  { id: 'ba-2026-02', name: '中国银行 · 一般存款账户', type: 'bank' as const }
]

export const donationMailStateLabels: Record<DonationMailState, string> = {
  queued: '排队中',
  sending: '投递中',
  sent: 'SMTP 已接受',
  failed: '投递失败',
  unknown: '结果未知',
  abandoned: '已放弃'
}

export const donationMailStateColors: Record<DonationMailState, 'neutral' | 'info' | 'success' | 'warning' | 'error'> = {
  queued: 'neutral',
  sending: 'info',
  sent: 'success',
  failed: 'error',
  unknown: 'warning',
  abandoned: 'neutral'
}

export const donationSeeds: Donation[] = [
  {
    id: 'DON-2026-0001',
    workspaceId: 'ws-hq',
    donorId: 'pt-1007',
    donorName: '杭州市社会福利基金会',
    donorCode: 'DON-001',
    date: '2026-11-08',
    method: 'transfer',
    fundAccountId: 'ba-2026-01',
    fundAccountName: '招商银行 · 基本存款账户',
    amount: '50000.00',
    purpose: '社区养老服务设备捐赠',
    note: '定向用于社区养老设备采购。',
    status: 'posted',
    version: 3,
    receiptNumber: 'RCPT-DON-2026-0001',
    journalId: 'JE-DON-2026-0001',
    fundFlow: {
      id: 'BF-2026-0001',
      accountId: 'ba-2026-01',
      accountName: '招商银行 · 基本存款账户',
      direction: 'in',
      amount: '50000.00',
      date: '2026-11-08',
      reference: 'DON-2026-0001'
    },
    makerId: 'u-1001',
    makerName: '张明远',
    reviewerId: 'u-1004',
    reviewerName: '陈立',
    submittedAt: '2026-11-08 10:10',
    postedAt: '2026-11-08 15:20',
    createdAt: '2026-11-08 09:40',
    updatedAt: '2026-11-08 15:20'
  },
  {
    id: 'DON-2026-0002',
    workspaceId: 'ws-hq',
    donorId: 'pt-1009',
    donorName: '杭州邻里社区服务中心',
    donorCode: 'DON-002',
    date: '2026-11-10',
    method: 'cash',
    fundAccountId: 'fund-cash',
    fundAccountName: '现金账户',
    amount: '20000.00',
    purpose: '公益培训活动',
    note: '现金收款，已存入现金账户。',
    status: 'posted',
    version: 3,
    receiptNumber: 'RCPT-DON-2026-0002',
    journalId: 'JE-DON-2026-0002',
    fundFlow: {
      id: 'BF-2026-0002',
      accountId: 'fund-cash',
      accountName: '现金账户',
      direction: 'in',
      amount: '20000.00',
      date: '2026-11-10',
      reference: 'DON-2026-0002'
    },
    makerId: 'u-1001',
    makerName: '张明远',
    reviewerId: 'u-1004',
    reviewerName: '陈立',
    submittedAt: '2026-11-10 09:30',
    postedAt: '2026-11-10 16:10',
    createdAt: '2026-11-10 09:10',
    updatedAt: '2026-11-10 16:10'
  },
  {
    id: 'DON-2026-0003',
    workspaceId: 'ws-hq',
    donorId: 'pt-1007',
    donorName: '杭州市社会福利基金会',
    donorCode: 'DON-001',
    date: '2026-11-18',
    method: 'check',
    fundAccountId: 'ba-2026-02',
    fundAccountName: '中国银行 · 一般存款账户',
    amount: '12800.00',
    purpose: '困难家庭慰问',
    note: '支票已收妥，待财务复核后入账。',
    status: 'submitted',
    version: 2,
    makerId: 'u-1001',
    makerName: '张明远',
    submittedAt: '2026-11-18 11:20',
    createdAt: '2026-11-18 10:50',
    updatedAt: '2026-11-18 11:20'
  },
  {
    id: 'DON-2026-0004',
    workspaceId: 'ws-hq',
    donorId: 'pt-1009',
    donorName: '杭州邻里社区服务中心',
    donorCode: 'DON-002',
    date: '2026-11-02',
    method: 'transfer',
    fundAccountId: 'ba-2026-02',
    fundAccountName: '中国银行 · 一般存款账户',
    amount: '8000.00',
    purpose: '社区公益活动',
    note: '捐赠人申请撤回，已生成冲销记录。',
    status: 'reversed',
    version: 4,
    receiptNumber: 'RCPT-DON-2026-0003',
    journalId: 'JE-DON-2026-0003',
    fundFlow: {
      id: 'BF-2026-0003',
      accountId: 'ba-2026-02',
      accountName: '中国银行 · 一般存款账户',
      direction: 'in',
      amount: '8000.00',
      date: '2026-11-02',
      reference: 'DON-2026-0004'
    },
    makerId: 'u-1001',
    makerName: '张明远',
    reviewerId: 'u-1004',
    reviewerName: '陈立',
    submittedAt: '2026-11-02 10:00',
    postedAt: '2026-11-02 14:00',
    reversedAt: '2026-11-17 09:30',
    reversalId: 'DON-2026-0005',
    createdAt: '2026-11-02 09:30',
    updatedAt: '2026-11-17 09:30'
  },
  {
    id: 'DON-2026-0005',
    workspaceId: 'ws-hq',
    donorId: 'pt-1009',
    donorName: '杭州邻里社区服务中心',
    donorCode: 'DON-002',
    date: '2026-11-17',
    method: 'transfer',
    fundAccountId: 'ba-2026-02',
    fundAccountName: '中国银行 · 一般存款账户',
    amount: '-8000.00',
    purpose: '作废冲销 DON-2026-0004',
    note: '原捐赠单作废的自动冲销记录。',
    status: 'posted',
    version: 1,
    receiptNumber: 'RCPT-DON-2026-0005',
    journalId: 'JE-DON-2026-0004',
    fundFlow: {
      id: 'BF-2026-0005',
      accountId: 'ba-2026-02',
      accountName: '中国银行 · 一般存款账户',
      direction: 'out',
      amount: '8000.00',
      date: '2026-11-17',
      reference: 'DON-2026-0005'
    },
    makerId: 'u-1004',
    makerName: '陈立',
    reviewerId: 'u-1001',
    reviewerName: '张明远',
    submittedAt: '2026-11-17 09:35',
    postedAt: '2026-11-17 09:40',
    reversalOf: 'DON-2026-0004',
    createdAt: '2026-11-17 09:30',
    updatedAt: '2026-11-17 09:40'
  }
]

export const donationTicketSeeds: DonationFiscalTicket[] = [
  {
    id: 'TCK-2026-0001',
    donationId: 'DON-2026-0002',
    code: '330001',
    number: '00012876',
    issuedOn: '2026-11-10',
    linkedAt: '2026-11-10 16:40',
    type: 'fiscal'
  }
]

export const donationDispatchSeeds: DonationDispatch[] = [
  {
    id: 'DSP-2026-0001',
    donationId: 'DON-2026-0001',
    recipient: 'sunmin@hz-welfare.example',
    state: 'sent',
    attempt: 1,
    version: 2,
    detail: 'SMTP 已接受普通捐赠收据，邮件编号 M-20261108-001。',
    updatedAt: '2026-11-08 16:05'
  },
  {
    id: 'DSP-2026-0002',
    donationId: 'DON-2026-0002',
    recipient: 'qianfang@linli.example',
    state: 'failed',
    attempt: 2,
    version: 2,
    failureReason: 'SMTP 550 收件人邮箱不存在。',
    detail: '连续两次投递被邮件服务拒绝，请核对捐赠人档案中的联系人邮箱。',
    updatedAt: '2026-11-11 10:20'
  },
  {
    id: 'DSP-2026-0003',
    donationId: 'DON-2026-0002',
    recipient: 'qianfang@linli.example',
    state: 'unknown',
    attempt: 1,
    version: 1,
    failureReason: '连接 SMTP 服务时超时，投递结果未知。',
    detail: '首次投递在等待服务端响应时中断，不能确认对方是否收到。',
    updatedAt: '2026-11-10 16:20'
  }
]

export const donationChannelSeed = {
  status: 'disabled' as 'disabled' | 'active',
  reason: '当前工作区未配置 SMTP 发件通道，普通收据邮件暂不能投递。可在下方启用本地演示通道。',
  sender: 'finance@nexora.example'
}

export function cloneDonation(donation: Donation): Donation {
  return {
    ...donation,
    fundFlow: donation.fundFlow ? { ...donation.fundFlow } : undefined
  }
}

export function cloneDonationDispatch(dispatch: DonationDispatch): DonationDispatch {
  return { ...dispatch }
}
