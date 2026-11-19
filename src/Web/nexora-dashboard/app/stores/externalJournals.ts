import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type {
  ExternalJournal,
  ExternalJournalBatchIssue,
  ExternalJournalStatus,
  JournalEntry,
  JournalLine
} from '~/mocks'
import { formatMoney } from '~/utils/format'
import {
  cloneExternalJournal,
  externalJournalSeeds,
  externalJournalProviders,
  externalJournalStatusLabels,
  financeAccounts,
  financePeriods,
  journalEntries
} from '~/mocks'

export interface ExternalJournalInput {
  provider: string
  externalId: string
  date: string
  description: string
  lines: Array<{ accountCode: string, debit: string, credit: string }>
}

export interface ExternalJournalResult {
  ok: boolean
  message: string
  journal?: ExternalJournal
  warning?: string
}

export interface ExternalJournalBatchResult {
  ok: boolean
  message: string
  issues: ExternalJournalBatchIssue[]
  updated: number
}

export type ExternalJournalDecision = 'submit' | 'cancel' | 'post'

function nowText() {
  const date = new Date()
  const pad = (value: number) => String(value).padStart(2, '0')
  return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate())
    + ' ' + pad(date.getHours()) + ':' + pad(date.getMinutes())
}

function nextId(rows: ExternalJournal[]) {
  const max = rows.reduce((value, row) => {
    const match = row.id.match(/IMP-2026-(\d+)/)
    return match ? Math.max(value, Number(match[1])) : value
  }, 0)
  return 'IMP-2026-' + String(max + 1).padStart(4, '0')
}

function nextPostingNumber(rows: ExternalJournal[]) {
  const max = rows.reduce((value, row) => {
    if (!row.postingNumber) return value
    const match = row.postingNumber.match(/JE-2026-(\d+)/)
    return match ? Math.max(value, Number(match[1])) : value
  }, 100)
  return 'JE-2026-' + String(max + 1).padStart(4, '0')
}

function normalizeLines(input: ExternalJournalInput['lines']): { lines: JournalLine[], issue?: string } {
  const filled = input.filter(line => line.accountCode || Number(line.debit) || Number(line.credit))
  if (filled.length < 2) return { lines: [], issue: '请至少填写两条分录。' }
  if (filled.length > 50) return { lines: [], issue: '单张外部凭证最多 50 条分录。' }
  for (let index = 0; index < filled.length; index += 1) {
    const line = filled[index]!
    if (!line.accountCode) return { lines: [], issue: '第 ' + (index + 1) + ' 条分录未选择科目。' }
    const debit = Number(line.debit) || 0
    const credit = Number(line.credit) || 0
    if ((debit > 0 && credit > 0) || (debit <= 0 && credit <= 0)) {
      return { lines: [], issue: '第 ' + (index + 1) + ' 条分录需且仅需填写借方或贷方金额。' }
    }
  }
  const debitTotal = filled.reduce((sum, line) => sum + (Number(line.debit) || 0), 0)
  const creditTotal = filled.reduce((sum, line) => sum + (Number(line.credit) || 0), 0)
  if (Math.abs(debitTotal - creditTotal) >= 0.005) {
    return { lines: [], issue: '借贷不平衡：借方合计 ' + formatMoney(debitTotal) + '，贷方合计 ' + formatMoney(creditTotal) + '。' }
  }
  const lines = filled.map((line) => {
    const account = financeAccounts.find(item => item.code === line.accountCode)
    return {
      accountCode: line.accountCode,
      accountName: account?.name ?? line.accountCode,
      debit: (Number(line.debit) || 0).toFixed(2),
      credit: (Number(line.credit) || 0).toFixed(2)
    }
  })
  return { lines }
}

export const useExternalJournalsStore = defineStore('external-journals', () => {
  const rows = ref<ExternalJournal[]>(externalJournalSeeds.map(cloneExternalJournal))
  const postedJournals = ref<JournalEntry[]>([{
    id: 'JE-2026-0101',
    date: '2026-11-16',
    period: '2026-11',
    description: '外部凭证 KINGDEE / JE-2026-0089 · 外部系统转入原材料采购',
    status: 'posted',
    debitTotal: '66000.00',
    creditTotal: '66000.00',
    lines: [
      { accountCode: '1403', accountName: '原材料', debit: '66000.00', credit: '0.00' },
      { accountCode: '2202', accountName: '应付账款', debit: '0.00', credit: '66000.00' }
    ],
    source: 'external',
    provider: 'KINGDEE',
    externalId: 'JE-2026-0089'
  }])

  const draftCount = computed(() => rows.value.filter(row => row.status === 'draft').length)
  const submittedCount = computed(() => rows.value.filter(row => row.status === 'submitted').length)
  const postedCount = computed(() => rows.value.filter(row => row.status === 'posted').length)
  const cancelledCount = computed(() => rows.value.filter(row => row.status === 'cancelled').length)
  const providerOptions = externalJournalProviders

  function periodOf(date: string) {
    return financePeriods.find(period => period.period === date.slice(0, 7))
  }

  function periodClosed(date: string) {
    return periodOf(date)?.status === 'closed'
  }

  function statusOf(id: string): ExternalJournalStatus | null {
    return rows.value.find(row => row.id === id)?.status ?? null
  }

  function importJournal(input: ExternalJournalInput, actorId: string, actorName: string): ExternalJournalResult {
    const provider = input.provider.trim()
    const externalId = input.externalId.trim()
    if (!/^[A-Za-z0-9_-]{1,40}$/.test(provider)) return { ok: false, message: '来源系统需为 1-40 位字母、数字、短横线或下划线。' }
    if (externalId.length < 1 || externalId.length > 80) return { ok: false, message: '外部编号需为 1-80 个字符。' }
    if (!input.date) return { ok: false, message: '请选择业务日期。' }
    const period = periodOf(input.date)
    if (!period) return { ok: false, message: '业务日期 ' + input.date + ' 不在已建立的会计期间内。' }
    if (!input.description.trim()) return { ok: false, message: '请填写凭证摘要。' }
    const duplicate = rows.value.find(row => row.provider === provider && row.externalId === externalId)
    if (duplicate) {
      return { ok: false, message: '来源系统 ' + provider + ' 的外部编号 ' + externalId + ' 已存在（' + duplicate.id + '），不能重复登记。' }
    }
    const normalized = normalizeLines(input.lines)
    if (normalized.issue) return { ok: false, message: normalized.issue }
    const total = normalized.lines.reduce((sum, line) => sum + Number(line.debit), 0)
    const at = nowText()
    const journal: ExternalJournal = {
      id: nextId(rows.value),
      workspaceId: 'ws-hq',
      provider,
      externalId,
      date: input.date,
      period: input.date.slice(0, 7),
      description: input.description.trim(),
      status: 'draft',
      version: 1,
      debitTotal: total.toFixed(2),
      creditTotal: total.toFixed(2),
      lines: normalized.lines,
      makerId: actorId,
      makerName: actorName,
      createdAt: at,
      updatedAt: at
    }
    rows.value = [journal, ...rows.value]
    const warning = period.status === 'closed'
      ? '会计期间 ' + period.period + ' 已关闭，凭证已保存为草稿；重新开启期间后才能提交复核。'
      : undefined
    return {
      ok: true,
      message: '外部凭证 ' + journal.id + ' 已保存为草稿。',
      journal,
      warning
    }
  }

  function updateJournal(id: string, input: ExternalJournalInput, actorId: string, expectedVersion: number): ExternalJournalResult {
    const target = rows.value.find(row => row.id === id)
    if (!target) return { ok: false, message: '外部凭证 ' + id + ' 不存在。' }
    if (target.makerId !== actorId) return { ok: false, message: '只有制单人可以修改该外部凭证。' }
    if (target.status !== 'draft') return { ok: false, message: '只有草稿状态的外部凭证可以修改。' }
    if (target.version !== expectedVersion) {
      return { ok: false, message: '版本冲突：' + id + ' 已更新到版本 ' + target.version + '，请刷新后重试。' }
    }
    const provider = input.provider.trim()
    const externalId = input.externalId.trim()
    const duplicate = rows.value.find(row => row.id !== id && row.provider === provider && row.externalId === externalId)
    if (duplicate) return { ok: false, message: '来源系统 ' + provider + ' 的外部编号 ' + externalId + ' 已被 ' + duplicate.id + ' 使用。' }
    const period = periodOf(input.date)
    if (!period) return { ok: false, message: '业务日期 ' + input.date + ' 不在已建立的会计期间内。' }
    const normalized = normalizeLines(input.lines)
    if (normalized.issue) return { ok: false, message: normalized.issue }
    const total = normalized.lines.reduce((sum, line) => sum + Number(line.debit), 0)
    const updated: ExternalJournal = {
      ...target,
      provider,
      externalId,
      date: input.date,
      period: input.date.slice(0, 7),
      description: input.description.trim(),
      version: target.version + 1,
      debitTotal: total.toFixed(2),
      creditTotal: total.toFixed(2),
      lines: normalized.lines,
      updatedAt: nowText()
    }
    rows.value = rows.value.map(row => (row.id === id ? updated : row))
    const warning = period.status === 'closed'
      ? '会计期间 ' + period.period + ' 已关闭，该草稿暂不能提交复核。'
      : undefined
    return { ok: true, message: '外部凭证 ' + id + ' 已更新到版本 ' + updated.version + '。', journal: updated, warning }
  }

  function decideBatch(
    ids: string[],
    decision: ExternalJournalDecision,
    actorId: string,
    actorName: string,
    versions: Record<string, number> = {}
  ): ExternalJournalBatchResult {
    const unique = [...new Set(ids)]
    if (unique.length === 0) return { ok: false, message: '请至少选择一张外部凭证。', issues: [], updated: 0 }
    if (unique.length > 50) {
      return { ok: false, message: '同批最多处理 50 张外部凭证，当前选择了 ' + unique.length + ' 张。', issues: [], updated: 0 }
    }
    const issues: ExternalJournalBatchIssue[] = []
    const targets: ExternalJournal[] = []
    for (const id of unique) {
      if (journalEntries.some(entry => entry.id === id)) {
        issues.push({ journalId: id, message: id + ' 不是外部凭证，不能参与外部凭证批量操作。' })
        continue
      }
      const target = rows.value.find(row => row.id === id)
      if (!target) {
        issues.push({ journalId: id, message: id + ' 不存在，可能已被删除。' })
        continue
      }
      if (versions[id] !== undefined && versions[id] !== target.version) {
        issues.push({ journalId: id, message: id + ' 版本冲突：提交版本 ' + versions[id] + '，当前版本 ' + target.version + '。' })
        continue
      }
      if (decision === 'submit' && target.status !== 'draft') {
        issues.push({ journalId: id, message: id + ' 当前为' + externalJournalStatusLabels[target.status] + '，只有草稿可以提交复核。' })
        continue
      }
      if (decision === 'submit' && periodClosed(target.date)) {
        issues.push({ journalId: id, message: id + ' 所在期间 ' + target.period + ' 已关闭，不能提交复核。' })
        continue
      }
      if (decision === 'cancel' && target.status !== 'draft') {
        issues.push({ journalId: id, message: id + ' 当前为' + externalJournalStatusLabels[target.status] + '，只有草稿可以取消。' })
        continue
      }
      if (decision === 'cancel' && target.makerId !== actorId) {
        issues.push({ journalId: id, message: id + ' 的制单人是 ' + target.makerName + '，当前身份不能取消。' })
        continue
      }
      if (decision === 'post' && target.status !== 'submitted') {
        issues.push({ journalId: id, message: id + ' 当前为' + externalJournalStatusLabels[target.status] + '，只有待独立复核的凭证可以过账。' })
        continue
      }
      if (decision === 'post' && target.makerId === actorId) {
        issues.push({ journalId: id, message: id + ' 由当前身份制单，独立复核不能由制单人执行。' })
        continue
      }
      targets.push(target)
    }

    if (issues.length > 0) {
      return {
        ok: false,
        message: '批量操作未执行：' + issues.length + ' 张凭证不符合条件，整批保持原状态。',
        issues,
        updated: 0
      }
    }

    const at = nowText()
    const posted: JournalEntry[] = []
    rows.value = rows.value.map((row) => {
      if (!unique.includes(row.id)) return row
      if (decision === 'submit') {
        return { ...row, status: 'submitted', version: row.version + 1, submittedAt: at, updatedAt: at }
      }
      if (decision === 'cancel') {
        return { ...row, status: 'cancelled', version: row.version + 1, cancelledAt: at, updatedAt: at }
      }
      const postingNumber = nextPostingNumber(rows.value.concat(posted.map(entry => ({
        ...row,
        postingNumber: entry.id
      }))))
      const next: ExternalJournal = {
        ...row,
        status: 'posted',
        version: row.version + 1,
        reviewerId: actorId,
        reviewerName: actorName,
        postedAt: at,
        postingNumber,
        updatedAt: at
      }
      posted.push({
        id: postingNumber,
        date: next.date,
        period: next.period,
        description: '外部凭证 ' + next.provider + ' / ' + next.externalId + ' · ' + next.description,
        status: 'posted',
        debitTotal: next.debitTotal,
        creditTotal: next.creditTotal,
        lines: next.lines.map(line => ({ ...line })),
        source: 'external',
        provider: next.provider,
        externalId: next.externalId
      })
      return next
    })
    if (posted.length > 0) postedJournals.value = [...posted, ...postedJournals.value]
    const actionLabel = decision === 'submit' ? '提交复核' : decision === 'cancel' ? '取消' : '独立过账'
    return {
      ok: true,
      message: '已' + actionLabel + ' ' + unique.length + ' 张外部凭证。',
      issues: [],
      updated: unique.length
    }
  }

  function reset() {
    rows.value = externalJournalSeeds.map(cloneExternalJournal)
    postedJournals.value = [{
      id: 'JE-2026-0101',
      date: '2026-11-16',
      period: '2026-11',
      description: '外部凭证 KINGDEE / JE-2026-0089 · 外部系统转入原材料采购',
      status: 'posted',
      debitTotal: '66000.00',
      creditTotal: '66000.00',
      lines: [
        { accountCode: '1403', accountName: '原材料', debit: '66000.00', credit: '0.00' },
        { accountCode: '2202', accountName: '应付账款', debit: '0.00', credit: '66000.00' }
      ],
      source: 'external',
      provider: 'KINGDEE',
      externalId: 'JE-2026-0089'
    }]
  }

  return {
    rows,
    postedJournals,
    draftCount,
    submittedCount,
    postedCount,
    cancelledCount,
    providerOptions,
    statusOf,
    periodOf,
    periodClosed,
    importJournal,
    updateJournal,
    decideBatch,
    reset
  }
})
