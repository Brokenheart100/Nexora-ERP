import { useFinanceSetupApi } from './useFinanceSetupApi'
import { useInventoryApi } from './useInventoryApi'
import { useOrganizationApi } from './useOrganizationApi'
import { useWorkspaceQuery } from './useWorkspaceQuery'
import { useScopedSubmission } from './useScopedSubmission'
import { assessPrerequisites, permittedOrderDepartments } from '~/utils/finance/prerequisites'
import type { WireWarehouse } from '#shared/types/prerequisites'
import { tradeMappingFields, receivableMappingFields, tradeMappingSchema, receivableMappingSchema, mappingCandidates, type MappingField } from '~/utils/api/account-mappings'

export function useTradePrerequisites() {
  const finance = useFinanceSetupApi(), inventory = useInventoryApi(), organization = useOrganizationApi()
  const query = useWorkspaceQuery('trade-prerequisites', '/finance', async (id, signal) => {
    const [snapshot, departments, warehouses] = await Promise.all([
      finance.snapshot(id, signal), finance.probe(() => organization.departments(id, signal)), finance.probe(() => inventory.warehouses(id, signal))
    ])
    return { snapshot, departments, warehouses }
  })
  const today = new Date()
  const on = ref([today.getFullYear(), String(today.getMonth() + 1).padStart(2, '0'), String(today.getDate()).padStart(2, '0')].join('-'))
  const flow = ref<'purchasing' | 'sales'>('purchasing'), departmentId = ref(''), warehouseId = ref('')
  const warehouse = shallowRef<WireWarehouse | null>(null), warehouseMessage = ref(''), recoveryMessage = ref('')
  const tradeForm = reactive(Object.fromEntries(tradeMappingFields.map(field => [field.key, ''])))
  const receivableForm = reactive(Object.fromEntries(receivableMappingFields.map(field => [field.key, ''])))
  const trade = computed(() => query.data?.snapshot.trade.state === 'ready' ? query.data.snapshot.trade.data : null)
  const receivables = computed(() => query.data?.snapshot.receivables.state === 'ready' ? query.data.snapshot.receivables.data : null)
  const chart = computed(() => query.data?.snapshot.chart.state === 'ready' ? query.data.snapshot.chart.data : null)
  const tradeSubmission = useScopedSubmission('finance-trade-setup', () => trade.value?.canConfigure === true)
  const receivableSubmission = useScopedSubmission('finance-receivable-setup', () => receivables.value?.canConfigure === true)
  watch(() => query.data, (data) => {
    if (!data) return
    if (!tradeSubmission.record && trade.value?.setup) Object.assign(tradeForm, Object.fromEntries(Object.entries(trade.value.setup).map(([key, value]) => [key, value ?? ''])))
    if (!receivableSubmission.record && receivables.value?.accounts) Object.assign(receivableForm, receivables.value.accounts)
  })
  let selection = 0
  watch(() => query.owner, () => {
    selection++
    recoveryMessage.value = ''
    warehouseId.value = ''
    departmentId.value = ''
    warehouse.value = null
    warehouseMessage.value = ''
    Object.keys(tradeForm).forEach((key) => {
      tradeForm[key as keyof typeof tradeForm] = ''
    })
    Object.keys(receivableForm).forEach((key) => {
      receivableForm[key as keyof typeof receivableForm] = ''
    })
  }, { flush: 'sync' })
  watch([on, flow], () => {
    departmentId.value = ''
  })
  async function selectWarehouse(id: string) {
    const ticket = ++selection
    warehouseId.value = id
    warehouse.value = null
    warehouseMessage.value = ''
    if (!id) return
    try {
      const [detail, reference] = await Promise.all([inventory.detail(query.session.activeWorkspaceId, id), inventory.reference(query.session.activeWorkspaceId, id)])
      if (ticket === selection) warehouse.value = { ...detail, canReceive: reference.canReceive }
    } catch (error) {
      if (ticket === selection) warehouseMessage.value = error instanceof Error ? error.message : '仓库引用暂不可用。'
    }
  }
  async function saveTrade() {
    if (trade.value?.setup) return
    const input = tradeMappingSchema.safeParse(tradeForm)
    if (input.success && await tradeSubmission.send('trade.configured', `/bff/api/finance/workspaces/${query.session.activeWorkspaceId}/trade/setup`, { accounts: input.data })) await query.refresh()
  }
  async function saveReceivables() {
    if (receivables.value?.accounts) return
    const input = receivableMappingSchema.safeParse(receivableForm)
    if (input.success && await receivableSubmission.send('receivables.configured', `/bff/api/finance/workspaces/${query.session.activeWorkspaceId}/receivables/setup`, { accounts: input.data })) await query.refresh()
  }
  async function recoverOwned(kind: 'trade' | 'receivables', action: 'resume' | 'check' | 'retry') {
    const submission = kind === 'trade' ? tradeSubmission : receivableSubmission
    if (action === 'resume') {
      await (kind === 'trade' ? finance.trade(query.session.activeWorkspaceId) : finance.receivables(query.session.activeWorkspaceId))
      const saved = submission.resume()
      if (saved) Object.assign(kind === 'trade' ? tradeForm : receivableForm, saved.payload.accounts)
      return
    }
    const result = action === 'retry'
      ? await submission.retry()
      : await submission.check(async () => {
          await (kind === 'trade' ? finance.trade(query.session.activeWorkspaceId) : finance.receivables(query.session.activeWorkspaceId))
          return null // Current mapping alone cannot prove which actor's operation committed.
        })
    if (result) await query.refresh()
  }
  async function recover(kind: 'trade' | 'receivables', action: 'resume' | 'check' | 'retry') {
    const captured = query.owner
    try {
      await recoverOwned(kind, action)
    } catch (error) {
      if (captured === query.owner) recoveryMessage.value = error instanceof Error ? error.message : '暂时无法恢复配置，请稍后重试。'
    }
  }
  return reactive({ recoveryMessage, query, on, flow, departmentId, warehouseId, warehouse, warehouseMessage, selectWarehouse,
    tradeForm, receivableForm, trade, receivables, tradeSubmission, receivableSubmission, saveTrade, saveReceivables, recover,
    checks: computed(() => query.data ? assessPrerequisites(query.data.snapshot, on.value) : []),
    mappingOptions: (field: MappingField) => mappingCandidates(chart.value?.accounts ?? [], field, query.data?.snapshot.banks.state === 'ready' ? query.data.snapshot.banks.data.map(bank => bank.accountId) : []).map(account => ({ value: account.id, label: account.code + ' ' + account.name })),
    departmentOptions: computed(() => query.data?.departments.state === 'ready' ? permittedOrderDepartments(query.data.departments.data, query.session.access, flow.value, on.value).map(value => ({ value: value.id, label: value.name })) : []),
    warehouseOptions: computed(() => query.data?.warehouses.state === 'ready' ? query.data.warehouses.data.warehouses.map(value => ({ value: value.id, label: value.code + ' ' + value.name + (value.canReceive ? ' · 可收货' : ' · 只读') })) : []) })
}
