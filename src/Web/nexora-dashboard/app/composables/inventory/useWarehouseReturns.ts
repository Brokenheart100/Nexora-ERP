import { z } from 'zod'
import type { StockReturn } from '#shared/types/inventory'
import { quantityInput } from '#shared/types/purchasing'
import { compareDecimal, subtractDecimal, sumDecimals } from '#shared/utils/decimal'
import { inventoryPath, useInventoryApi } from '~/composables/api/useInventoryApi'
import { useWorkspaceQuery } from '~/composables/api/useWorkspaceQuery'
import { useScopedSubmission } from '~/composables/api/useScopedSubmission'
import { ApiFailure } from '~/utils/api/client'
import type { useWarehouseConnection } from './useWarehouseConnection'

type Direction = 'purchase' | 'sale'
type ReturnRow = StockReturn & { direction: Direction }
const listName = (direction: Direction) => direction === 'sale' ? 'sales-returns' : 'returns'
const returnInput = z.object({
  on: z.iso.date(),
  quantity: quantityInput,
  reason: z.string().trim().min(1).max(300)
})

export function useWarehouseReturns(warehouse: ReturnType<typeof useWarehouseConnection>, tab: Ref<string>) {
  const api = useInventoryApi()
  const query = useWorkspaceQuery('warehouse-returns', '/inventory', async (workspace, signal) => {
    if (!warehouse.warehouseId || !['movements', 'warehouse-ops'].includes(tab.value)) return null
    const id = warehouse.warehouseId
    const [purchase, sale] = await Promise.allSettled([
      api.returns(workspace, id, false, signal), api.returns(workspace, id, true, signal)
    ])
    return { purchase, sale }
  }, () => [warehouse.warehouseId, tab.value])
  const submission = useScopedSubmission('warehouse-return', () => query.enabled)
  const error = ref('')
  const sourceId = ref('')
  const form = reactive({ on: '', quantity: '', reason: '' })
  const purchase = computed(() => query.data?.purchase.status === 'fulfilled' ? query.data.purchase.value : [])
  const sales = computed(() => query.data?.sale.status === 'fulfilled' ? query.data.sale.value : [])
  const list = computed<ReturnRow[]>(() => [
    ...purchase.value.map(row => ({ ...row, direction: 'purchase' as const })),
    ...sales.value.map(row => ({ ...row, direction: 'sale' as const }))
  ].sort((a, b) => b.id.localeCompare(a.id)))
  const listError = computed(() => {
    const failure = [query.data?.purchase, query.data?.sale].find(value => value?.status === 'rejected'
      && !(value.reason instanceof ApiFailure && [403, 404].includes(value.reason.status)))
    return (failure?.status === 'rejected' ? '部分退货单读取失败，请刷新重试。' : '') || query.problem
  })
  const frozen = computed(() => submission.mutation.busy || !!submission.record)

  function original(id: string) {
    return warehouse.query.data?.movements?.find(row => row.id === id)
  }
  function sourceOrder(id: string) {
    const row = original(id)
    return row ? warehouse.tasks.find(task => task.id === row.permitId) : undefined
  }
  function source(id: string) {
    const row = original(id)
    const task = sourceOrder(id)
    if (!row || row.reversesId || !task) return null
    const direction: Direction = task.direction === 'outbound' ? 'sale' : 'purchase'
    const result = query.data?.[direction]
    if (result?.status !== 'fulfilled') return null
    const originalQuantity = direction === 'sale' ? subtractDecimal('0', row.quantity) : row.quantity
    if (compareDecimal(originalQuantity, '0') <= 0) return null
    const reserved = sumDecimals(result.value.filter(entry => entry.originalId === id && !entry.cancelled).map(entry => entry.quantity))
    const remaining = subtractDecimal(originalQuantity, reserved)
    return { id, direction, row, task, remaining, capped: result.value.length === 100 }
  }
  const selected = computed(() => source(sourceId.value))
  function canAuthorize(direction: Direction) {
    const selectedWarehouse = warehouse.query.data?.selected
    return direction === 'sale' ? selectedWarehouse?.canApproveSalesReturns : selectedWarehouse?.canApproveReturns
  }
  function canStart(id: string) {
    const row = source(id)
    return !!row && canAuthorize(row.direction) && compareDecimal(row.remaining, '0') > 0
  }
  function start(id: string) {
    if (frozen.value || !canStart(id)) return false
    sourceId.value = id
    error.value = ''
    submission.reset()
    Object.assign(form, { on: new Date().toLocaleDateString('en-CA'), quantity: '', reason: '' })
    return true
  }
  async function submit() {
    const record = selected.value
    if (!record || !canStart(record.id) || frozen.value) return null
    const input = returnInput.safeParse(form)
    if (!input.success || input.data.on < record.row.on || compareDecimal(input.data.quantity, record.remaining) > 0) {
      error.value = '请输入退货原因、有效日期和可退范围内的正数数量。'
      return null
    }
    error.value = ''
    const sourcePath = record.direction === 'sale' ? 'shipments' : 'movements'
    const ok = await submission.send('stock-return.create', `${inventoryPath(query.session.activeWorkspaceId)}/${sourcePath}/${record.id}/returns`,
      input.data, { resourceId: record.id, warehouseId: warehouse.warehouseId })
    if (!ok) return null
    await query.refresh()
    return submission.result
  }
  async function decide(row: ReturnRow, confirm: boolean) {
    if (row.cancelled || row.movementId || frozen.value || (confirm ? !row.canConfirm : !canAuthorize(row.direction))) return false
    error.value = ''
    const ok = await submission.send('stock-return.decide', `${inventoryPath(query.session.activeWorkspaceId)}/${listName(row.direction)}/${row.id}/decision`,
      { confirm }, { resourceId: row.id, warehouseId: warehouse.warehouseId })
    if (ok) await Promise.all([query.refresh(), warehouse.query.refresh()])
    return ok
  }
  async function check() {
    if (!submission.mutation.unknown) submission.resume()
    await submission.check(async (saved) => {
      if (!saved.warehouseId) throw new Error('缺少原退货仓库。')
      await api.returns(saved.workspaceId, saved.warehouseId, /\/(shipments|sales-returns)\//.test(saved.path))
      return null
    })
  }
  async function retry() {
    if (!await submission.retry()) return
    await Promise.all([query.refresh(), warehouse.query.refresh()])
  }
  watch(() => [query.owner, warehouse.warehouseId], () => {
    sourceId.value = error.value = ''
    Object.assign(form, { on: '', quantity: '', reason: '' })
  }, { flush: 'sync' })

  return reactive({ query, list, listError, sourceOrder, canAuthorize, canStart, start, selected, form, submit,
    sourceId, error, frozen, submission, decide, check, retry })
}

export type WarehouseReturnsConnection = ReturnType<typeof useWarehouseReturns>
