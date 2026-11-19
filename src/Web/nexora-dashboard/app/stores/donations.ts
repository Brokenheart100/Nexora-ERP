import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type {
  Donation,
  DonationDispatch,
  DonationFiscalTicket,
  DonationMailState
} from '~/mocks'
import {
  cloneDonation,
  cloneDonationDispatch,
  donationChannelSeed,
  donationDispatchSeeds,
  donationFundAccounts,
  donationSeeds,
  donationTicketSeeds,
  partners,
  partnerRolesOf
} from '~/mocks'

export interface DonationInput {
  donorId: string
  date: string
  method: Donation['method']
  amount: string
  fundAccountId: string
  purpose: string
  note?: string
}

export interface DonationResult {
  ok: boolean
  message: string
  donation?: Donation
}

export interface DonationMailResult {
  ok: boolean
  message: string
  dispatch?: DonationDispatch
}

function nowText() {
  const date = new Date()
  const pad = (value: number) => String(value).padStart(2, '0')
  return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate())
    + ' ' + pad(date.getHours()) + ':' + pad(date.getMinutes())
}

function nextId(prefix: string, ids: string[], digits = 4) {
  const max = ids.reduce((value, id) => {
    const match = id.match(new RegExp('^' + prefix + '-(\\d+)$'))
    return match ? Math.max(value, Number(match[1])) : value
  }, 0)
  return prefix + '-' + String(max + 1).padStart(digits, '0')
}

let dispatchTimer: ReturnType<typeof setTimeout> | null = null

export const useDonationsStore = defineStore('donations', () => {
  const rows = ref<Donation[]>(donationSeeds.map(cloneDonation))
  const tickets = ref<DonationFiscalTicket[]>(donationTicketSeeds.map(ticket => ({ ...ticket })))
  const dispatches = ref<DonationDispatch[]>(donationDispatchSeeds.map(cloneDonationDispatch))
  const channel = ref({ ...donationChannelSeed })
  const statutoryReceiptAvailable = ref(false)

  // 已过账口径包含后来作废的原单，与负额冲销记录相抵后即净额。
  const postedTotal = computed(() => rows.value
    .filter(row => row.status === 'posted' || row.status === 'reversed')
    .reduce((sum, row) => sum + Number(row.amount), 0))
  const submittedCount = computed(() => rows.value.filter(row => row.status === 'submitted').length)
  const reversedCount = computed(() => rows.value.filter(row => row.status === 'reversed').length)
  const mailIssueCount = computed(() => dispatches.value
    .filter(dispatch => dispatch.state === 'failed' || dispatch.state === 'unknown').length)
  const donorOptions = computed(() => partners
    .filter(partner => partner.status === 'active' && partnerRolesOf(partner).includes('donor'))
    .map(partner => ({ label: partner.name + '（' + partner.code + '）', value: partner.id })))

  function donationOf(id: string) {
    return rows.value.find(row => row.id === id) ?? null
  }

  function ticketsFor(id: string) {
    return tickets.value.filter(ticket => ticket.donationId === id)
  }

  function dispatchesFor(id: string) {
    return dispatches.value
      .filter(dispatch => dispatch.donationId === id)
      .slice()
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }

  function createDonation(input: DonationInput, actorId: string, actorName: string, submit: boolean): DonationResult {
    const donor = partners.find(partner => partner.id === input.donorId)
    if (!donor) return { ok: false, message: '请选择有效的捐赠人档案。' }
    if (donor.status !== 'active') return { ok: false, message: '捐赠人档案已停用，不能用于新捐赠单。' }
    const amount = Number(input.amount)
    if (!Number.isFinite(amount) || amount <= 0) return { ok: false, message: '捐赠金额必须大于 0。' }
    if (!input.date) return { ok: false, message: '请选择捐赠日期。' }
    const account = donationFundAccounts.find(item => item.id === input.fundAccountId)
    if (!account) return { ok: false, message: '请选择资金账户。' }
    if (input.method === 'cash' && account.type !== 'cash') {
      return { ok: false, message: '现金捐赠必须选择现金账户。' }
    }
    if (input.method !== 'cash' && account.type !== 'bank') {
      return { ok: false, message: '支票、银行卡或转账捐赠必须选择银行账户。' }
    }
    if (!input.purpose.trim()) return { ok: false, message: '请填写捐赠用途。' }
    const at = nowText()
    const donation: Donation = {
      id: nextId('DON-2026', rows.value.map(row => row.id)),
      workspaceId: 'ws-hq',
      donorId: donor.id,
      donorName: donor.name,
      donorCode: donor.code,
      date: input.date,
      method: input.method,
      fundAccountId: account.id,
      fundAccountName: account.name,
      amount: amount.toFixed(2),
      purpose: input.purpose.trim(),
      note: input.note?.trim() || undefined,
      status: submit ? 'submitted' : 'draft',
      version: submit ? 2 : 1,
      makerId: actorId,
      makerName: actorName,
      submittedAt: submit ? at : undefined,
      createdAt: at,
      updatedAt: at
    }
    rows.value = [donation, ...rows.value]
    return {
      ok: true,
      message: submit ? '捐赠单 ' + donation.id + ' 已提交独立复核。' : '捐赠单 ' + donation.id + ' 已保存为草稿。',
      donation
    }
  }

  function submitDonation(id: string, actorId: string): DonationResult {
    const target = donationOf(id)
    if (!target) return { ok: false, message: '捐赠单 ' + id + ' 不存在。' }
    if (target.status !== 'draft') return { ok: false, message: '只有草稿捐赠单可以提交复核。' }
    if (target.makerId !== actorId) return { ok: false, message: '只有制单人可以提交该捐赠单。' }
    const at = nowText()
    target.status = 'submitted'
    target.version += 1
    target.submittedAt = at
    target.updatedAt = at
    return { ok: true, message: '捐赠单 ' + id + ' 已提交独立复核。', donation: target }
  }

  function reviewDonation(id: string, decision: 'approve' | 'reject', actorId: string, actorName: string, note = ''): DonationResult {
    const target = donationOf(id)
    if (!target) return { ok: false, message: '捐赠单 ' + id + ' 不存在。' }
    if (target.status !== 'submitted') return { ok: false, message: '只有待独立复核的捐赠单可以处理。' }
    if (target.makerId === actorId) return { ok: false, message: '复核人不能是制单人，请切换演示身份。' }
    const at = nowText()
    if (decision === 'reject') {
      if (!note.trim()) return { ok: false, message: '请填写拒绝原因。' }
      target.status = 'draft'
      target.version += 1
      target.rejection = note.trim()
      target.updatedAt = at
      return { ok: true, message: '捐赠单 ' + id + ' 已退回修改。', donation: target }
    }
    target.status = 'posted'
    target.version += 1
    target.reviewerId = actorId
    target.reviewerName = actorName
    target.postedAt = at
    target.receiptNumber = 'RCPT-DON-2026-' + id.slice(-4)
    target.journalId = 'JE-DON-2026-' + id.slice(-4)
    target.fundFlow = {
      id: 'BF-' + id.slice(-4),
      accountId: target.fundAccountId,
      accountName: target.fundAccountName,
      direction: 'in',
      amount: target.amount,
      date: target.date,
      reference: id
    }
    target.rejection = undefined
    target.updatedAt = at
    return { ok: true, message: '捐赠单 ' + id + ' 已复核过账，收据 ' + target.receiptNumber + ' 已生成。', donation: target }
  }

  function reverseDonation(id: string, actorId: string, actorName: string): DonationResult {
    const target = donationOf(id)
    if (!target) return { ok: false, message: '捐赠单 ' + id + ' 不存在。' }
    if (target.status !== 'posted') return { ok: false, message: '只有已过账捐赠单可以作废。' }
    if (Number(target.amount) <= 0) return { ok: false, message: '冲销记录不能再次作废。' }
    const at = nowText()
    const reversal: Donation = {
      ...cloneDonation(target),
      id: nextId('DON-2026', rows.value.map(row => row.id)),
      amount: (-Number(target.amount)).toFixed(2),
      purpose: '作废冲销 ' + target.id,
      note: '原捐赠单作废的自动冲销记录。',
      status: 'posted',
      version: 1,
      receiptNumber: 'RCPT-DON-2026-' + String(rows.value.length + 1).padStart(4, '0'),
      journalId: 'JE-DON-2026-' + String(rows.value.length + 1).padStart(4, '0'),
      fundFlow: {
        id: 'BF-' + String(rows.value.length + 1).padStart(4, '0'),
        accountId: target.fundAccountId,
        accountName: target.fundAccountName,
        direction: 'out',
        amount: Number(target.amount).toFixed(2),
        date: at.slice(0, 10),
        reference: target.id
      },
      makerId: actorId,
      makerName: actorName,
      reviewerId: 'u-1004',
      reviewerName: '陈立',
      submittedAt: at,
      postedAt: at,
      reversedAt: undefined,
      reversalOf: target.id,
      reversalId: undefined,
      createdAt: at,
      updatedAt: at
    }
    target.status = 'reversed'
    target.version += 1
    target.reversedAt = at
    target.reversalId = reversal.id
    target.updatedAt = at
    rows.value = [reversal, ...rows.value]
    return { ok: true, message: '捐赠单 ' + id + ' 已作废，冲销记录 ' + reversal.id + ' 已生成。', donation: reversal }
  }

  function linkFiscalTicket(id: string, input: { code: string, number: string, issuedOn: string }): DonationResult {
    const target = donationOf(id)
    if (!target) return { ok: false, message: '捐赠单 ' + id + ' 不存在。' }
    if (target.status !== 'posted') return { ok: false, message: '只有已过账捐赠单可以关联财政票据。' }
    if (ticketsFor(id).length > 0) return { ok: false, message: '该捐赠单已关联财政票据，不能重复关联。' }
    if (!input.code.trim() || !input.number.trim()) return { ok: false, message: '请填写票据代码和号码。' }
    if (!input.issuedOn) return { ok: false, message: '请选择票据开具日期。' }
    if (tickets.value.some(ticket => ticket.code === input.code.trim() && ticket.number === input.number.trim())) {
      return { ok: false, message: '票据代码 ' + input.code.trim() + ' 与号码 ' + input.number.trim() + ' 已关联其他捐赠单。' }
    }
    const ticket: DonationFiscalTicket = {
      id: nextId('TCK-2026', tickets.value.map(item => item.id)),
      donationId: id,
      code: input.code.trim(),
      number: input.number.trim(),
      issuedOn: input.issuedOn,
      linkedAt: nowText(),
      type: 'fiscal'
    }
    tickets.value = [ticket, ...tickets.value]
    return { ok: true, message: '已关联外部财政票据 ' + ticket.code + ' / ' + ticket.number + '。', donation: target }
  }

  function enableChannel() {
    channel.value = {
      ...channel.value,
      status: 'active',
      reason: '本地演示邮件通道已启用，投递结果仍为模拟。'
    }
    return { ok: true, message: '本地演示邮件通道已启用。' }
  }

  function queueMail(id: string, recipient: string): DonationMailResult {
    const target = donationOf(id)
    if (!target) return { ok: false, message: '捐赠单 ' + id + ' 不存在。' }
    if (target.status !== 'posted') return { ok: false, message: '只有已过账且未作废的捐赠单可以发送收据。' }
    if (channel.value.status !== 'active') return { ok: false, message: channel.value.reason }
    const email = recipient.trim()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, message: '收件人邮箱格式不正确。' }
    const donor = partners.find(partner => partner.id === target.donorId)
    if (!donor || email.toLowerCase() !== donor.email.toLowerCase()) {
      return { ok: false, message: '收件人必须是捐赠人档案中的联系人邮箱（' + (donor?.email ?? '未登记') + '）。' }
    }
    const dispatch: DonationDispatch = {
      id: nextId('DSP-2026', dispatches.value.map(item => item.id)),
      donationId: id,
      recipient: email,
      state: 'queued',
      attempt: 1,
      version: 1,
      detail: '普通捐赠收据已加入本地演示投递队列。',
      updatedAt: nowText()
    }
    dispatches.value = [dispatch, ...dispatches.value]
    scheduleResult(dispatch.id)
    return { ok: true, message: '普通捐赠收据已提交投递。', dispatch }
  }

  function decideMail(id: string, decision: 'retry' | 'resend' | 'abandon'): DonationMailResult {
    const target = dispatches.value.find(item => item.id === id)
    if (!target) return { ok: false, message: '投递记录 ' + id + ' 不存在。' }
    if (decision === 'retry') {
      if (target.state !== 'failed') return { ok: false, message: '只有投递失败的记录可以重试。' }
      target.state = 'queued'
      target.attempt += 1
      target.version += 1
      target.failureReason = undefined
      target.detail = '已按原收件人重新提交投递，等待 SMTP 响应。'
      target.updatedAt = nowText()
      scheduleResult(target.id)
      return { ok: true, message: '已重新提交投递。', dispatch: target }
    }
    if (decision === 'resend') {
      if (!['sent', 'unknown'].includes(target.state)) return { ok: false, message: '只有已发送或结果未知的记录可以补发。' }
      if (target.resentAsId) return { ok: false, message: '该记录已补发为 ' + target.resentAsId + '，不能重复补发。' }
      const next: DonationDispatch = {
        id: nextId('DSP-2026', dispatches.value.map(item => item.id)),
        donationId: target.donationId,
        recipient: target.recipient,
        state: 'queued',
        attempt: target.attempt + 1,
        version: 1,
        previousId: target.id,
        detail: '补发普通捐赠收据，关联原投递 ' + target.id + '。',
        updatedAt: nowText()
      }
      target.resentAsId = next.id
      target.updatedAt = nowText()
      dispatches.value = [next, ...dispatches.value]
      scheduleResult(next.id)
      return { ok: true, message: '已创建补发记录 ' + next.id + '。', dispatch: next }
    }
    if (!['queued', 'failed', 'unknown', 'sending'].includes(target.state)) {
      return { ok: false, message: '当前投递状态不能放弃。' }
    }
    target.state = 'abandoned'
    target.version += 1
    target.detail = '操作人放弃本次投递，记录保留以便追溯。'
    target.updatedAt = nowText()
    return { ok: true, message: '投递记录 ' + id + ' 已放弃。', dispatch: target }
  }

  function scheduleResult(id: string) {
    if (dispatchTimer) clearTimeout(dispatchTimer)
    dispatchTimer = setTimeout(() => {
      const target = dispatches.value.find(item => item.id === id)
      if (!target || target.state !== 'queued') return
      target.state = 'sent'
      target.version += 1
      target.detail = 'SMTP 已接受普通捐赠收据，模拟邮件编号 M-' + id.slice(-4) + '。'
      target.updatedAt = nowText()
    }, 1200)
  }

  function forceMailState(id: string, state: DonationMailState, reason?: string) {
    const target = dispatches.value.find(item => item.id === id)
    if (!target) return
    target.state = state
    target.version += 1
    target.failureReason = reason
    target.updatedAt = nowText()
  }

  function reset() {
    if (dispatchTimer) clearTimeout(dispatchTimer)
    rows.value = donationSeeds.map(cloneDonation)
    tickets.value = donationTicketSeeds.map(ticket => ({ ...ticket }))
    dispatches.value = donationDispatchSeeds.map(cloneDonationDispatch)
    channel.value = { ...donationChannelSeed }
  }

  return {
    rows,
    tickets,
    dispatches,
    channel,
    statutoryReceiptAvailable,
    postedTotal,
    submittedCount,
    reversedCount,
    mailIssueCount,
    donorOptions,
    donationOf,
    ticketsFor,
    dispatchesFor,
    createDonation,
    submitDonation,
    reviewDonation,
    reverseDonation,
    linkFiscalTicket,
    enableChannel,
    queueMail,
    decideMail,
    forceMailState,
    reset
  }
})
