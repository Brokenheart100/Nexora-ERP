import { defineStore } from 'pinia'
import type { BankAccount, BankTransaction } from '~/mocks'
import { bankAccounts, bankTransactions } from '~/mocks'

export interface BankReconciliationRecord {
  id: string
  accountId: string
  sequence: number
  completedAt: string
  completedBy: string
  matchedCount: number
  status: 'completed' | 'voided'
  voidedAt?: string
  voidedBy?: string
  voidReason?: string
}

export interface BankReconActionResult {
  ok: boolean
  message: string
  record?: BankReconciliationRecord
}

export interface PaymentReversalInput {
  transactionId: string
  paymentId: string
  billId: string
  supplier: string
  date: string
  amount: number
  bankAccountId: string
  journalId: string
}

function nowStamp() {
  const date = new Date()
  const pad = (value: number) => String(value).padStart(2, '0')
  return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate())
    + ' ' + pad(date.getHours()) + ':' + pad(date.getMinutes())
}

function nextRecordId(rows: BankReconciliationRecord[]) {
  const prefix = 'REC-2026-'
  const max = rows.reduce((value, row) => {
    if (!row.id.startsWith(prefix)) return value
    const parsed = Number(row.id.slice(prefix.length))
    return Number.isFinite(parsed) ? Math.max(value, parsed) : value
  }, 0)
  return prefix + String(max + 1).padStart(4, '0')
}

export const useBankReconStore = defineStore('bank-recon', () => {
  const accounts = ref<BankAccount[]>(structuredClone(bankAccounts))
  const transactions = ref<BankTransaction[]>(structuredClone(bankTransactions))
  const excludedIds = ref<string[]>([])
  const reconciliations = ref<BankReconciliationRecord[]>([])

  function transactionsFor(accountId: string) {
    return transactions.value.filter(transaction => transaction.bankAccountId === accountId)
  }

  function pendingCountOf(accountId: string) {
    return transactionsFor(accountId).filter(transaction => !transaction.matched && !excludedIds.value.includes(transaction.id)).length
  }

  function matchedCountOf(accountId: string) {
    return transactionsFor(accountId).filter(transaction => transaction.matched).length
  }

  function latestCompletedOf(accountId: string) {
    for (let index = reconciliations.value.length - 1; index >= 0; index -= 1) {
      const record = reconciliations.value[index]
      if (record && record.accountId === accountId && record.status === 'completed') return record
    }
    return null
  }

  function latestRecordOf(accountId: string) {
    for (let index = reconciliations.value.length - 1; index >= 0; index -= 1) {
      const record = reconciliations.value[index]
      if (record && record.accountId === accountId) return record
    }
    return null
  }

  function recordsFor(accountId: string) {
    return reconciliations.value
      .filter(record => record.accountId === accountId)
      .slice()
      .reverse()
  }

  function isReconciled(accountId: string) {
    return latestCompletedOf(accountId) !== null
  }

  function match(transactionId: string, journalId: string): BankReconActionResult {
    const transaction = transactions.value.find(row => row.id === transactionId)
    if (!transaction) return { ok: false, message: '未找到银行流水。' }
    if (!journalId) return { ok: false, message: '请选择要匹配的凭证。' }
    transaction.matched = true
    transaction.matchedJournalId = journalId
    return { ok: true, message: '流水 ' + transactionId + ' 已匹配到凭证 ' + journalId + '。' }
  }

  function unmatch(transactionId: string): BankReconActionResult {
    const transaction = transactions.value.find(row => row.id === transactionId)
    if (!transaction) return { ok: false, message: '未找到银行流水。' }
    if (!transaction.matched) return { ok: false, message: '该流水尚未匹配，无需解除。' }
    transaction.matched = false
    transaction.matchedJournalId = undefined
    return { ok: true, message: '流水 ' + transactionId + ' 已解除匹配，回到待匹配状态。' }
  }

  function exclude(transactionId: string): BankReconActionResult {
    const transaction = transactions.value.find(row => row.id === transactionId)
    if (!transaction) return { ok: false, message: '未找到银行流水。' }
    if (transaction.matched) return { ok: false, message: '已匹配流水不能排除，请先解除匹配。' }
    if (!excludedIds.value.includes(transactionId)) {
      excludedIds.value = [...excludedIds.value, transactionId]
    }
    return { ok: true, message: '流水 ' + transactionId + ' 已排除，本轮不再参与对账。' }
  }

  function include(transactionId: string): BankReconActionResult {
    excludedIds.value = excludedIds.value.filter(id => id !== transactionId)
    return { ok: true, message: '流水 ' + transactionId + ' 已恢复，重新纳入对账范围。' }
  }

  function importRows(rows: BankTransaction[]): BankReconActionResult {
    if (!rows.length) return { ok: false, message: '没有可导入的银行流水。' }
    transactions.value = [...transactions.value, ...rows.map(row => ({ ...row }))]
    return { ok: true, message: '已导入 ' + rows.length + ' 笔示例流水。' }
  }

  function completeReconciliation(accountId: string): BankReconActionResult {
    const account = accounts.value.find(row => row.id === accountId)
    if (!account) return { ok: false, message: '未找到银行账户。' }
    const pending = pendingCountOf(accountId)
    if (pending > 0) return { ok: false, message: '还有 ' + pending + ' 笔流水待处理，不能完成对账。' }
    const sequence = reconciliations.value.filter(record => record.accountId === accountId).length + 1
    const record: BankReconciliationRecord = {
      id: nextRecordId(reconciliations.value),
      accountId,
      sequence,
      completedAt: nowStamp(),
      completedBy: '陈昊',
      matchedCount: matchedCountOf(accountId),
      status: 'completed'
    }
    reconciliations.value = [...reconciliations.value, record]
    return {
      ok: true,
      message: account.bankName + ' 第 ' + sequence + ' 次对账已完成，共核对 ' + record.matchedCount + ' 笔已匹配流水。',
      record
    }
  }

  function undoReconciliation(recordId: string, reason: string): BankReconActionResult {
    const record = reconciliations.value.find(row => row.id === recordId)
    if (!record) return { ok: false, message: '未找到对账记录。' }
    if (record.status === 'voided') return { ok: false, message: '该对账记录已经撤销。' }
    const reasonText = reason.trim()
    if (!reasonText) return { ok: false, message: '请填写撤销原因。' }
    const latest = latestCompletedOf(record.accountId)
    if (latest?.id !== record.id) return { ok: false, message: '只能撤销该账户最近一次已完成对账。' }
    record.status = 'voided'
    record.voidedAt = nowStamp()
    record.voidedBy = '陈昊'
    record.voidReason = reasonText
    const previous = latestCompletedOf(record.accountId)
    return {
      ok: true,
      message: previous
        ? '已撤销第 ' + record.sequence + ' 次对账，账户回退到第 ' + previous.sequence + ' 次对账记录。'
        : '已撤销第 ' + record.sequence + ' 次对账，账户恢复为待对账，可重新完成对账。',
      record
    }
  }

  function recordPaymentReversal(input: PaymentReversalInput): BankReconActionResult {
    const account = accounts.value.find(row => row.id === input.bankAccountId)
    if (!account) return { ok: false, message: '未找到原付款资金账户。' }
    if (transactions.value.some(row => row.id === input.transactionId)) {
      return { ok: false, message: '该付款的冲销流水已经存在。' }
    }
    const balanceAfter = Number(account.balance) + input.amount
    account.balance = balanceAfter.toFixed(2)
    account.updatedAt = nowStamp()
    transactions.value = [
      {
        id: input.transactionId,
        bankAccountId: account.id,
        date: input.date,
        description: '付款作废冲销 ' + input.paymentId,
        amount: input.amount.toFixed(2),
        direction: 'in',
        counterparty: input.supplier,
        matched: true,
        matchedJournalId: input.journalId
      },
      ...transactions.value
    ]
    return { ok: true, message: '冲销流水 ' + input.transactionId + ' 已生成，账户余额更新为 ¥' + account.balance + '。' }
  }

  function reset() {
    accounts.value = structuredClone(bankAccounts)
    transactions.value = structuredClone(bankTransactions)
    excludedIds.value = []
    reconciliations.value = []
  }

  return {
    accounts,
    transactions,
    excludedIds,
    reconciliations,
    transactionsFor,
    pendingCountOf,
    matchedCountOf,
    latestCompletedOf,
    latestRecordOf,
    recordsFor,
    isReconciled,
    match,
    unmatch,
    exclude,
    include,
    importRows,
    completeReconciliation,
    undoReconciliation,
    recordPaymentReversal,
    reset
  }
})
