import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type { ProvisionalBill, TradeDocument, TradeDocumentKind } from '~/mocks'
import {
  accountMappings as accountMappingSeed,
  provisionalBills as provisionalSeed,
  tradeActor,
  tradeDocuments as tradeDocumentSeed
} from '~/mocks'

export type TradeActionResult = { ok: true, message: string } | { ok: false, message: string }

function stamp() {
  const now = new Date()
  const pad = (value: number) => String(value).padStart(2, '0')
  return now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate()) + ' ' + pad(now.getHours()) + ':' + pad(now.getMinutes())
}

export const useTradeDocumentsStore = defineStore('trade-documents', () => {
  const documentRows = ref<TradeDocument[]>(tradeDocumentSeed.map(row => ({ ...row })))
  const provisionalRows = ref<ProvisionalBill[]>(provisionalSeed.map(row => ({ ...row })))
  const accountMappings = ref(accountMappingSeed.map(row => ({ ...row })))

  const documents = computed(() => documentRows.value)
  const provisionals = computed(() => provisionalRows.value)
  const submittedCount = computed(() => documentRows.value.filter(row => row.status === 'submitted').length)
  const postedCount = computed(() => documentRows.value.filter(row => row.status === 'posted').length)
  const provisionalPendingTotal = computed(() => provisionalRows.value
    .filter(row => row.status !== 'confirmed')
    .reduce((sum, row) => sum + row.amount, 0))
  const provisionalPostedTotal = computed(() => provisionalRows.value
    .filter(row => row.status === 'confirmed')
    .reduce((sum, row) => sum + row.stockAmount, 0))

  function ofKind(kind: TradeDocumentKind) {
    return computed(() => documentRows.value.filter(row => row.kind === kind))
  }

  function documentOf(id: string) {
    return documentRows.value.find(row => row.id === id) ?? null
  }

  function submitDocument(id: string, actorName: string): TradeActionResult {
    const row = documentOf(id)
    if (!row) return { ok: false, message: '单据不存在。' }
    if (row.status !== 'draft') return { ok: false, message: '只有草稿可以提交复核。' }
    if (row.maker !== actorName) return { ok: false, message: '只有制单人本人可以提交该单据。' }
    row.status = 'submitted'
    row.version += 1
    row.submittedAt = stamp()
    return { ok: true, message: row.id + ' 已提交，等待独立复核。' }
  }

  function reviewDocument(id: string, reviewerName: string, decision: 'approve' | 'reject'): TradeActionResult {
    const row = documentOf(id)
    if (!row) return { ok: false, message: '单据不存在。' }
    if (row.status !== 'submitted') return { ok: false, message: '只有待复核单据可以复核。' }
    if (row.maker === reviewerName) return { ok: false, message: '复核人不能是制单人，请切换演示身份。' }
    row.reviewer = reviewerName
    row.version += 1
    if (decision === 'reject') {
      row.status = 'draft'
      row.reviewer = undefined
      return { ok: true, message: row.id + ' 已退回草稿，可修改后重新提交。' }
    }
    row.status = 'reviewed'
    return { ok: true, message: row.id + ' 已完成独立复核，等待过账。' }
  }

  function postDocument(id: string, reviewerName: string): TradeActionResult {
    const row = documentOf(id)
    if (!row) return { ok: false, message: '单据不存在。' }
    if (row.status !== 'reviewed') return { ok: false, message: '只有已复核单据可以过账。' }
    if (row.reviewer !== reviewerName) return { ok: false, message: '过账人必须是完成复核的同一人。' }
    row.status = 'posted'
    row.postedAt = stamp()
    row.version += 1
    return { ok: true, message: row.id + ' 已过账，科目映射与总账同步。' }
  }

  function cancelDocument(id: string, actorName: string, reason: string): TradeActionResult {
    const row = documentOf(id)
    if (!row) return { ok: false, message: '单据不存在。' }
    if (row.status === 'posted' || row.status === 'cancelled') return { ok: false, message: '已过账或已取消的单据不能取消。' }
    if (row.maker !== actorName) return { ok: false, message: '只有制单人本人可以取消单据。' }
    if (!reason.trim()) return { ok: false, message: '请填写取消原因。' }
    row.status = 'cancelled'
    row.cancelledAt = stamp()
    row.cancelReason = reason.trim()
    row.version += 1
    return { ok: true, message: row.id + ' 已取消，原单与原因保留。' }
  }

  function confirmProvisional(id: string, reviewerName: string): TradeActionResult {
    const row = provisionalRows.value.find(item => item.id === id)
    if (!row) return { ok: false, message: '暂估单不存在。' }
    if (row.status !== 'pending') return { ok: false, message: '只有待确认的暂估可以确认。' }
    row.status = 'confirmed'
    row.stockAmount = row.amount
    row.confirmedAt = stamp()
    row.confirmedBy = reviewerName
    return { ok: true, message: row.id + ' 已确认，暂估金额转入已过账库存金额。' }
  }

  function reverseProvisional(id: string, reviewerName: string): TradeActionResult {
    const row = provisionalRows.value.find(item => item.id === id)
    if (!row) return { ok: false, message: '暂估单不存在。' }
    if (row.status !== 'confirmed') return { ok: false, message: '只有已确认的暂估可以冲回。' }
    row.status = 'reversed'
    row.stockAmount = 0
    row.confirmedBy = reviewerName
    row.confirmedAt = stamp()
    return { ok: true, message: row.id + ' 已冲回，库存暂估金额回到待处理口径。' }
  }

  function reset() {
    documentRows.value = tradeDocumentSeed.map(row => ({ ...row }))
    provisionalRows.value = provisionalSeed.map(row => ({ ...row }))
    accountMappings.value = accountMappingSeed.map(row => ({ ...row }))
  }

  return {
    tradeActor,
    documents,
    provisionals,
    accountMappings,
    submittedCount,
    postedCount,
    provisionalPendingTotal,
    provisionalPostedTotal,
    ofKind,
    documentOf,
    submitDocument,
    reviewDocument,
    postDocument,
    cancelDocument,
    confirmProvisional,
    reverseProvisional,
    reset
  }
})
