import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type {
  OpeningBalanceFileKey,
  OpeningBalancePreview,
  OpeningImportRecord,
  OpeningSubledgerBatch,
  OpeningSubledgerPreview
} from '~/mocks'
import {
  buildOpeningBalancePreview,
  buildOpeningSubledgerResult,
  openingSubledgerBatches,
  openingSubledgerPreview
} from '~/mocks'

function nowText() {
  const date = new Date()
  const pad = (value: number) => String(value).padStart(2, '0')
  return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) + ' ' + pad(date.getHours()) + ':' + pad(date.getMinutes())
}

function nextId(prefix: string, ids: string[]) {
  const max = ids.reduce((value, id) => {
    const parsed = Number(id.slice(prefix.length))
    return Number.isFinite(parsed) ? Math.max(value, parsed) : value
  }, 0)
  return prefix + String(max + 1).padStart(4, '0')
}

export const useOpeningBalancesStore = defineStore('opening-balances', () => {
  const importRows = ref<OpeningImportRecord[]>([])
  const batchRows = ref<OpeningSubledgerBatch[]>(structuredClone(openingSubledgerBatches))
  const currentSubledgerPreview = ref<OpeningSubledgerPreview>(structuredClone(openingSubledgerPreview))
  const currentGlPreview = ref<OpeningBalancePreview | null>(null)

  const imports = computed(() => importRows.value)
  const batches = computed(() => batchRows.value)
  const subledgerPreview = computed(() => currentSubledgerPreview.value)
  const glPreview = computed(() => currentGlPreview.value)

  function previewOpening(fileKey: OpeningBalanceFileKey) {
    const preview = buildOpeningBalancePreview(fileKey)
    currentGlPreview.value = preview
    return { ok: true, message: '已读取 ' + preview.rowCount + ' 行，借贷差额 ' + (preview.debit - preview.credit).toFixed(2) + '。', preview }
  }

  function importOpening(fileKey: OpeningBalanceFileKey, workspaceId: string, actorName: string) {
    const preview = buildOpeningBalancePreview(fileKey)
    currentGlPreview.value = preview
    if (!preview.canImport) return { ok: false, message: '预览存在校验错误，修正文件后再导入。' }
    if (importRows.value.some(record => record.workspaceId === workspaceId)) {
      return { ok: false, message: '当前工作区已导入总账期初，请先冲销原有批次。' }
    }
    const id = nextId('OPEN-GL-2026-', importRows.value.map(record => record.id))
    const suffix = id.slice('OPEN-GL-2026-'.length)
    const record: OpeningImportRecord = {
      id,
      workspaceId,
      fileName: preview.fileName,
      fileHash: preview.fileHash,
      importedAt: nowText(),
      journalId: 'JE-OPEN-GL-2026-' + suffix,
      debit: preview.debit,
      credit: preview.credit,
      rowCount: preview.rowCount,
      operator: actorName
    }
    importRows.value.unshift(record)
    return { ok: true, message: '总账期初已导入，生成凭证 ' + record.journalId + '。', record }
  }

  function submitBatch(preview: OpeningSubledgerPreview, workspaceId: string, actorId: string, actorName: string) {
    if (preview.issues.some(issue => issue.severity === 'error')) {
      return { ok: false, message: '子账预览存在校验错误，不能提交复核。' }
    }
    if (!preview.sources.length) return { ok: false, message: '没有可提交的子账行。' }
    const id = nextId('OB-2026-', batchRows.value.map(batch => batch.id))
    const batch: OpeningSubledgerBatch = {
      id,
      workspaceId,
      state: 'submitted',
      version: 1,
      on: preview.on,
      currency: preview.currency,
      fileKey: preview.fileKey,
      fileName: preview.fileName,
      fileHash: preview.fileHash,
      chartRevision: preview.chartRevision,
      equityAccountCode: '3103',
      equityAccountName: '本年利润',
      makerId: actorId,
      makerName: actorName,
      submittedAt: nowText(),
      sources: preview.sources.map(source => ({ ...source })),
      checks: preview.checks.map(check => ({ ...check })),
      issues: preview.issues.map(issue => ({ ...issue }))
    }
    batchRows.value.unshift(batch)
    return { ok: true, message: '批次 ' + id + ' 已提交，等待独立复核。', batch }
  }

  function reviewBatch(batchId: string, decision: 'approve' | 'reject', actorId: string, actorName: string, note = '') {
    const batch = batchRows.value.find(row => row.id === batchId)
    if (!batch) return { ok: false, message: '批次不存在或已被移除。' }
    if (batch.state !== 'submitted') return { ok: false, message: '只有待独立复核的批次可以审批。' }
    if (batch.makerId === actorId) return { ok: false, message: '复核人不能是制单人，请切换演示身份。' }
    const difference = batch.sources.reduce((sum, source) => sum + (source.amount - source.ledgerAmount), 0)
    if (decision === 'approve') {
      if (Math.abs(difference) > 0.005 && !note.trim()) {
        return { ok: false, message: '存在子账差异 ¥' + difference.toFixed(2) + '，请填写复核说明后再批准。' }
      }
      batch.state = 'applying'
      batch.reviewerId = actorId
      batch.reviewerName = actorName
      batch.reviewedAt = nowText()
      batch.reviewNote = note.trim() || '复核一致，同意导入。'
      batch.version += 1
      return { ok: true, message: '复核通过，库存与子账正在入账。', batch }
    }
    if (!note.trim()) return { ok: false, message: '拒绝时必须填写原因。' }
    batch.state = 'rejected'
    batch.reviewerId = actorId
    batch.reviewerName = actorName
    batch.reviewedAt = nowText()
    batch.rejection = note.trim()
    batch.version += 1
    return { ok: true, message: '批次已拒绝，来源文件与差异已保留。', batch }
  }

  function postBatch(batchId: string) {
    const batch = batchRows.value.find(row => row.id === batchId)
    if (!batch) return { ok: false, message: '批次不存在或已被移除。' }
    if (batch.state !== 'applying') return { ok: false, message: '只有库存入账处理中的批次可以过账。' }
    const existing = batchRows.value.flatMap(row => row.result?.journalIds ?? [])
    const firstJournal = nextId('JE-OPEN-2026-', existing)
    const prefix = firstJournal.slice(0, 'JE-OPEN-2026-'.length)
    const firstNumber = Number(firstJournal.slice(prefix.length))
    const journalIds = batch.checks.map((_, index) => prefix + String(firstNumber + index).padStart(4, '0'))
    const passed = batch.checks.filter(check => check.matched).length
    const postedAt = nowText()
    const result = buildOpeningSubledgerResult(batchId, journalIds, postedAt, passed, batch.checks.length)
    batch.state = 'posted'
    batch.completedAt = result.postedAt
    batch.version += 1
    batch.result = result
    return { ok: true, message: '期初已过账，生成 ' + journalIds.length + ' 张凭证并通过 ' + passed + '/' + batch.checks.length + ' 项校验。', batch }
  }

  function cancelBatch(batchId: string, actorId: string) {
    const batch = batchRows.value.find(row => row.id === batchId)
    if (!batch) return { ok: false, message: '批次不存在或已被移除。' }
    if (batch.state !== 'submitted') return { ok: false, message: '只有待独立复核的批次可以撤回。' }
    if (batch.makerId !== actorId) return { ok: false, message: '只有制单人本人可以撤回批次。' }
    batch.state = 'cancelled'
    batch.cancelledAt = nowText()
    batch.version += 1
    return { ok: true, message: '批次已撤回，来源文件保留。', batch }
  }

  function reset() {
    importRows.value = []
    batchRows.value = structuredClone(openingSubledgerBatches)
    currentSubledgerPreview.value = structuredClone(openingSubledgerPreview)
    currentGlPreview.value = null
  }

  return {
    imports,
    batches,
    glPreview,
    subledgerPreview,
    previewOpening,
    importOpening,
    submitBatch,
    reviewBatch,
    postBatch,
    cancelBatch,
    reset
  }
})
