import { z } from 'zod'
import { invoiceScheduleInputSchema, scheduleChangeSchema, type InvoiceScheduleInput } from '#shared/types/invoicing'
import { compareDecimal } from '#shared/utils/decimal'
import type { WireItem } from '#shared/types/wire'
import { useMasterDataApi } from '~/composables/api/useMasterDataApi'
import { usePartnersApi } from '~/composables/api/usePartnersApi'
import { receivablesPath, useReceivablesApi } from '~/composables/api/useReceivablesApi'
import { useScopedSubmission } from '~/composables/api/useScopedSubmission'
import { useWorkspaceQuery } from '~/composables/api/useWorkspaceQuery'
import { historyRow, scheduleRow } from '~/utils/sales/recurring'

export function useRecurringConnection(tab: Ref<string>, selected: Ref<string | null>, formOpen: Ref<boolean>) {
  const api = useReceivablesApi()
  const master = useMasterDataApi()
  const partners = usePartnersApi()
  const page = ref(1)
  const historyPage = ref(1)
  const error = ref('')
  const query = useWorkspaceQuery('invoice-schedules', '/sales', async (id, signal) => {
    if (tab.value !== 'recurring') return null
    const [home, schedules] = await Promise.all([api.home(id, signal), api.schedules(id, page.value, signal)])
    return { home, schedules }
  }, () => [tab.value, page.value])
  const selectedSchedule = computed(() => query.data?.schedules.find(row => row.id === selected.value) ?? null)
  const ws = () => query.session.activeWorkspaceId
  const history = useWorkspaceQuery('invoice-occurrences', '/sales', (id, signal) =>
    tab.value === 'recurring' && selectedSchedule.value
      ? api.occurrences(id, selectedSchedule.value.id, historyPage.value, signal) : Promise.resolve([]), () => [selected.value, historyPage.value])
  const options = useWorkspaceQuery('recurring-master-data', '/sales', async (id, signal) => {
    if (tab.value !== 'recurring' || !formOpen.value) return null
    async function customers() {
      const values: { label: string, value: string }[] = []
      for (let page = 1; ; page++) {
        const result = await partners.list(id, page, 'customer', signal, 100)
        values.push(...result.items.filter(row => row.isActive).map(row => ({ label: row.code + ' · ' + row.name, value: row.id })))
        if (!result.hasMore) return values
      }
    }
    async function services() {
      const values: WireItem[] = []
      for (let page = 1; ; page++) {
        const { data } = await master.catalog(id, page, signal, 100)
        values.push(...data.page.items.filter(row => row.kind === 'service' && row.isActive))
        if (!data.page.hasMore) return values.map(row => ({ label: row.code + ' · ' + row.name, value: row.id }))
      }
    }
    const [customerOptions, serviceOptions] = await Promise.all([customers(), services()])
    return { customers: customerOptions, services: serviceOptions }
  }, () => [tab.value, formOpen.value])
  const submission = useScopedSubmission('recurring-invoices', () => query.enabled && tab.value === 'recurring', scheduleChangeSchema.parse)
  const canManage = computed(() => !!query.data?.home.accounts && query.data.home.canDraft && !submission.record && !submission.mutation.busy)
  const rows = computed(() => (query.data?.schedules ?? []).map(row => scheduleRow(row, ws())))
  const plan = computed(() => selectedSchedule.value ? scheduleRow(selectedSchedule.value, ws()) : null)
  const occurrences = computed(() => (history.data ?? []).map(row => historyRow(row, ws())))
  watch(selected, () => { historyPage.value = 1; error.value = '' }, { flush: 'sync' })
  watch(() => query.owner, () => { page.value = historyPage.value = 1; error.value = '' }, { flush: 'sync' })

  async function refresh() {
    await query.refresh()
    if (selected.value) await history.refresh()
  }
  async function send(action: string, path: string, payload: Record<string, unknown>, resourceId?: string, method: 'POST' | 'PUT' = 'POST') {
    error.value = ''
    const ok = await submission.send(action, receivablesPath(ws()) + '/schedules' + path, payload, { resourceId, method })
    if (ok || [409, 412].includes(submission.failure?.status ?? 0)) await refresh()
    return ok
  }
  async function save(id: string | null, input: InvoiceScheduleInput) {
    if (!canManage.value) return false
    const current = id ? query.data?.schedules.find(row => row.id === id) : undefined
    const value = invoiceScheduleInputSchema.safeParse(input)
    if (!value.success || (id && !current) || (input.endsOn && input.endsOn < input.nextOn)
      || (current?.lastOn && input.nextOn <= current.lastOn)
      || ![input.quantity, input.unitPrice].every(amount => /^\d{1,8}(?:\.\d{1,6})?$/.test(amount) && compareDecimal(amount, '0') > 0)
      || compareDecimal(input.quantity, '1000000') > 0 || compareDecimal(input.unitPrice, '10000000') > 0) {
      error.value = '请核对客户、服务项目、日期、周期、账期以及数量和单价。数量和单价最多六位小数。'
      return false
    }
    if (!await send('schedule.save', id ? '/' + id : '', { expectedVersion: current?.version ?? 0, input: value.data }, id ?? undefined, id ? 'PUT' : 'POST')) return false
    if (!id) page.value = 1
    selected.value = submission.result?.id ?? id
    return true
  }
  async function pause(id: string) {
    const row = query.data?.schedules.find(row => row.id === id)
    if (canManage.value && row)
      await send('schedule.pause', '/' + id + '/pause', { expectedVersion: row.version, paused: !row.paused }, id)
  }
  async function occurrence(action: 'run' | 'skip', on: string) {
    const row = selectedSchedule.value
    if (!canManage.value || !row || !z.iso.date().safeParse(on).success) return false
    return send('schedule.' + action, `/${row.id}/${action}`, { on, ...(action === 'skip' ? { expectedVersion: row.version } : {}) }, row.id)
  }
  async function check() {
    if (!submission.mutation.unknown && submission.record?.state === 'unknown') submission.resume()
    if (!submission.record) { await refresh(); return }
    await submission.check(async (saved) => {
      await refresh()
      const row = query.data?.schedules.find(item => item.id === saved.resourceId)
      if (!row || (saved.action !== 'schedule.run' && saved.action !== 'schedule.skip')) return null
      const records = await api.occurrences(ws(), row.id, 1)
      const found = records.find(item => item.on === saved.payload.on)
      if (!found || (saved.action === 'schedule.skip' && found.documentId)) return null
      return { id: row.id, version: row.version, invoiceId: found.documentId, pendingReason: row.pendingReason }
    })
  }
  async function retry() {
    if (await submission.retry()) await refresh()
  }
  return reactive({ query, rows, plan, history, occurrences, options, page, historyPage, canManage, submission, error,
    preview: computed(() => selectedSchedule.value?.preview ?? []), save, pause, occurrence, refresh, check, retry })
}
