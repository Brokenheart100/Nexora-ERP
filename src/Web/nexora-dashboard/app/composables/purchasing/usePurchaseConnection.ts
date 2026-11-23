import { z } from 'zod'
import { useWorkspaceQuery } from '~/composables/api/useWorkspaceQuery'
import { usePurchasingApi } from '~/composables/api/usePurchasingApi'
import { useMasterDataApi } from '~/composables/api/useMasterDataApi'
import { usePartnersApi } from '~/composables/api/usePartnersApi'
import { useOrganizationApi } from '~/composables/api/useOrganizationApi'
import { useInventoryApi } from '~/composables/api/useInventoryApi'
import { useScopedSubmission } from '~/composables/api/useScopedSubmission'
import {
  changeSchema,
  permitChangeSchema,
  purchaseInputSchema,
  type PurchaseDetail,
  type PurchaseInput
} from '#shared/types/purchasing'
import { purchaseActions, remainingAllowance, type PurchaseDecision } from '~/utils/purchasing/order-policy'
import { hasPermission } from '~/utils/api/access'
import { compareDecimal, multiplyDecimals, sumDecimals } from '#shared/utils/decimal'

export function usePurchaseConnection() {
  const api = usePurchasingApi(),
    master = useMasterDataApi(),
    partners = usePartnersApi(),
    organization = useOrganizationApi(),
    inventory = useInventoryApi()
  const page = ref(1),
    itemPage = ref(1),
    supplierPage = ref(1)
  const query = useWorkspaceQuery(
    'purchase-orders',
    '/purchase-orders',
    (id, signal) => api.list(id, page.value, signal, 8),
    () => page.value
  )
  const choices = useWorkspaceQuery(
    'purchase-choices',
    '/purchase-orders',
    async (id, signal) => {
      const [catalog, suppliers, departments, warehouses] = await Promise.all([
        master.catalog(id, itemPage.value, signal, 100).catch(() => null),
        partners.list(id, supplierPage.value, 'supplier', signal, 100).catch(() => null),
        organization.departments(id, signal).catch(() => null),
        inventory.warehouses(id, signal).catch(() => null)
      ])
      return { catalog: catalog?.data ?? null, suppliers, departments, warehouses }
    },
    () => [itemPage.value, supplierPage.value]
  )
  const detail = shallowRef<PurchaseDetail | null>(null),
    permits = shallowRef<Awaited<ReturnType<typeof api.permits>> | null>(null)
  const detailLoading = ref(false),
    detailError = ref(''),
    selectedId = ref(''),
    reason = ref(''),
    readingEditor = ref(false),
    syncingPermit = ref(false)
  let selection = 0,
    lineKey = 0
  const form = reactive({ number: '', supplier: '', contact: '', expectedAt: '', note: '', departmentId: '' })
  const lines = ref<
    {
      key: number
      itemId: string
      sku: string
      name: string
      spec: string
      quantity: string | number
      unitPrice: string | number
    }[]
  >([])
  const editor = reactive({ id: '', version: 0 as number | string, form, lines, error: '' })
  const receiptForm = reactive({ lineId: '', warehouseId: '', quantity: '', reason: '' })
  const writable = () => query.enabled && !!query.session.user
  const submission = useScopedSubmission('purchase-orders', writable, changeSchema.parse)
  const permitSubmission = useScopedSubmission('purchase-permits', writable, permitChangeSchema.parse)
  const actions = computed(() =>
    detail.value ? purchaseActions({ ...detail.value.order, isMaker: detail.value.isMaker }, query.session.access) : []
  )
  const frozen = computed(() => !!submission.record || submission.mutation.busy || readingEditor.value)
  const canCreate = computed(() => query.data?.canCreate === true)
  const departments = computed(
    () =>
      choices.data?.departments?.filter(value =>
        hasPermission(query.session.access, 'purchasing.order.create', { departmentId: value.id, on: form.expectedAt })
      ) ?? []
  )
  async function select(id: string) {
    const ticket = ++selection
    selectedId.value = id
    detail.value = null
    permits.value = null
    detailError.value = ''
    if (!query.enabled || !z.uuid().safeParse(id).success) {
      detailLoading.value = false
      detailError.value = '采购单暂不可用。'
      return false
    }
    detailLoading.value = true
    try {
      const [value, allowances] = await Promise.all([
        api.detail(query.session.activeWorkspaceId, id),
        api.permits(query.session.activeWorkspaceId, id)
      ])
      if (ticket === selection) {
        detail.value = value
        permits.value = allowances
        return true
      }
    } catch (error) {
      if (ticket === selection) detailError.value = error instanceof Error ? error.message : '采购详情暂不可用。'
    } finally {
      if (ticket === selection) detailLoading.value = false
    }
    return false
  }
  async function refresh() {
    const owner = query.owner
    await query.refresh()
    if (owner === query.owner && selectedId.value) await select(selectedId.value)
  }
  function addLine() {
    lines.value.push({ key: ++lineKey, itemId: '', sku: '', name: '', spec: '', quantity: '1', unitPrice: '' })
  }
  function startEditor(edit = false) {
    if (frozen.value) return
    editor.error = ''
    editor.id = edit ? (detail.value?.order.id ?? '') : ''
    editor.version = edit ? (detail.value?.order.version ?? 0) : 0
    const current = edit ? detail.value : null
    Object.assign(form, {
      number: current?.order.number ?? '',
      supplier: current?.supplierId ?? '',
      contact: '',
      expectedAt: current?.order.on ?? new Date().toLocaleDateString('en-CA'),
      note: current?.note ?? '',
      departmentId: current?.order.departmentId ?? 'company'
    })
    lines.value
      = current?.lines.map(line => ({
        key: ++lineKey,
        itemId: line.itemId,
        sku: line.itemCode,
        name: line.itemName,
        spec: line.unitCode,
        quantity: line.quantity,
        unitPrice: line.unitPrice
      })) ?? []
    if (!lines.value.length) addLine()
  }
  async function saveEditor(mode: 'draft' | 'submit') {
    if (frozen.value || (editor.id && [409, 412].includes(submission.failure?.status ?? 0))) return false
    editor.error = ''
    if (
      form.departmentId === 'company'
      && !hasPermission(query.session.access, 'purchasing.order.create', { on: form.expectedAt })
    ) {
      editor.error = '请选择有创建权限的部门。'
      return false
    }
    const input = purchaseInputSchema.safeParse({
      number: form.number,
      draft: {
        on: form.expectedAt,
        supplierId: form.supplier,
        departmentId: form.departmentId && form.departmentId !== 'company' ? form.departmentId : null,
        note: form.note,
        lines: lines.value.map(line => ({
          itemId: line.itemId,
          quantity: String(line.quantity),
          unitPrice: String(line.unitPrice)
        }))
      }
    })
    if (!input.success) {
      editor.error = input.error.issues.map((issue) => {
        const [, field, index] = issue.path
        return field === 'lines' && typeof index === 'number' ? `第 ${index + 1} 行 · ${issue.message}` : issue.message
      }).join(' ')
      return false
    }
    if (editor.id && !actions.value.includes('edit')) return false
    const root = `/bff/api/purchasing/workspaces/${query.session.activeWorkspaceId}/orders`
    const success = await submission.send(
      editor.id ? 'purchase.edited' : 'purchase.created',
      editor.id ? root + '/' + editor.id : root,
      editor.id ? { expectedVersion: editor.version, draft: input.data.draft } : input.data,
      { method: editor.id ? 'PUT' : 'POST', resourceId: editor.id || undefined }
    )
    if (!success || !submission.result) return false
    editor.id = submission.result.id
    await select(editor.id)
    editor.version = detail.value?.order.version ?? submission.result.version
    if (mode === 'submit' && !(await decide('submit'))) return false
    await query.refresh()
    return true
  }
  async function readEditorBaseline() {
    if (!editor.id || frozen.value) return
    const owner = query.owner
    readingEditor.value = true
    try {
      if (await select(editor.id) && owner === query.owner && detail.value?.order.id === editor.id) {
        editor.version = detail.value.order.version
        submission.reset()
      }
    } finally {
      if (owner === query.owner) readingEditor.value = false
    }
  }
  async function decide(decision: PurchaseDecision) {
    if (!detail.value || !actions.value.includes(decision) || frozen.value) return false
    const success = await submission.send(
      'purchase.' + decision,
      `/bff/api/purchasing/workspaces/${query.session.activeWorkspaceId}/orders/${detail.value.order.id}/decision`,
      { expectedVersion: detail.value.order.version, decision, reason: reason.value },
      { resourceId: detail.value.order.id }
    )
    if (success) await refresh()
    return success
  }
  function startReceipt() {
    Object.assign(receiptForm, { lineId: detail.value?.lines[0]?.id ?? '', warehouseId: '', quantity: '', reason: '' })
  }
  async function issue() {
    const current = detail.value
    if (!current || !permits.value?.canManage || syncingPermit.value) return false
    const owner = query.owner
    const input = z
      .object({
        lineId: z.uuid(),
        warehouseId: z.uuid(),
        quantity: z
          .string()
          .regex(/^\d+(\.\d{1,6})?$/)
          .refine(value => compareDecimal(value, '0') > 0)
      })
      .safeParse(receiptForm)
    if (!input.success) {
      detailError.value = '请选择订单行、仓库并填写正数数量（最多六位小数）。'
      return false
    }
    const line = current.lines.find(value => value.id === input.data.lineId)
    if (!line || compareDecimal(input.data.quantity, remainingAllowance(line.quantity, line.id, permits.value.permits)) > 0) {
      detailError.value = '签发数量超过当前可签发余量。'
      return false
    }
    const success = await permitSubmission.send(
      'purchase.permit',
      `/bff/api/purchasing/workspaces/${query.session.activeWorkspaceId}/orders/${current.order.id}/receipts`,
      { ...input.data, expectedVersion: current.order.version },
      { resourceId: current.order.id }
    )
    if (!success) return false
    const location = permitSubmission.mutation.operation?.result?.headers.get('location')
    const issued = permitSubmission.result
    syncingPermit.value = true
    try {
      await refresh()
      if (owner === query.owner && selectedId.value === current.order.id && location && issued) {
        let confirmed = true
        try {
          await api.waitForPermit(location, issued.permitId)
        } catch {
          confirmed = false
        }
        if (owner === query.owner && selectedId.value === current.order.id) {
          await refresh()
          if (!confirmed && owner === query.owner && selectedId.value === current.order.id)
            detailError.value = '许可仍在同步中，请刷新查看。'
        }
      }
    } finally {
      if (owner === query.owner) syncingPermit.value = false
    }
    return owner === query.owner
  }
  async function cancelPermit(id: string) {
    if (!detail.value || !permits.value?.canManage || !reason.value.trim()) {
      detailError.value = '请填写取消原因。'
      return
    }
    if (
      await permitSubmission.send(
        'purchase.permit.cancel',
        `/bff/api/purchasing/workspaces/${query.session.activeWorkspaceId}/orders/${detail.value.order.id}/receipts/${id}/cancel`,
        { expectedVersion: detail.value.order.version, reason: reason.value },
        { resourceId: detail.value.order.id }
      )
    )
      await refresh()
  }
  async function closeRemaining() {
    if (!detail.value || !permits.value?.canManage || !reason.value.trim()) {
      detailError.value = '请填写关闭原因。'
      return
    }
    if (
      await submission.send(
        'purchase.close',
        `/bff/api/purchasing/workspaces/${query.session.activeWorkspaceId}/orders/${detail.value.order.id}/receipts/close`,
        { expectedVersion: detail.value.order.version, reason: reason.value },
        { resourceId: detail.value.order.id }
      )
    )
      await refresh()
  }
  async function recover(kind: 'order' | 'permit', action: 'resume' | 'check' | 'retry') {
    const owner = query.owner
    const savedSubmission = kind === 'order' ? submission : permitSubmission
    const saved = savedSubmission.record
    if (!saved) return
    try {
      if (action === 'resume') {
        if (!savedSubmission.resume()) return
        if (saved.resourceId) await select(saved.resourceId)
        if (owner !== query.owner) return
        if (saved.action === 'purchase.created' || saved.action === 'purchase.edited') {
          const input = saved.payload as unknown as PurchaseInput
          editor.id = saved.resourceId ?? ''
          editor.version = (saved.payload.expectedVersion ?? 0) as number | string
          Object.assign(form, {
            number: input.number ?? detail.value?.order.number ?? '',
            supplier: input.draft.supplierId,
            expectedAt: input.draft.on,
            note: input.draft.note,
            departmentId: input.draft.departmentId ?? 'company'
          })
          lines.value = input.draft.lines.map(line => ({ ...line, key: ++lineKey, sku: '', name: '', spec: '' }))
        }
      } else if (action === 'check') {
        await savedSubmission.check(async () => {
          const id = query.session.activeWorkspaceId
          if (!saved.resourceId) await api.list(id, page.value)
          else if (kind === 'permit') await api.permits(id, saved.resourceId)
          else await api.detail(id, saved.resourceId)
          return null
        })
      } else if (await savedSubmission.retry()) {
        if (kind === 'order' && submission.result) await select(submission.result.id)
        await refresh()
      }
    } catch (error) {
      if (owner === query.owner) detailError.value = error instanceof Error ? error.message : '恢复暂不可用。'
    }
  }
  watch(
    () => query.owner,
    () => {
      selection++
      page.value = 1
      itemPage.value = 1
      supplierPage.value = 1
      selectedId.value = ''
      detail.value = null
      permits.value = null
      detailError.value = ''
      detailLoading.value = false
      readingEditor.value = false
      syncingPermit.value = false
      editor.id = ''
      lines.value = []
      Object.keys(form).forEach((key) => {
        form[key as keyof typeof form] = ''
      })
      Object.assign(receiptForm, { lineId: '', warehouseId: '', quantity: '', reason: '' })
      reason.value = ''
    },
    { flush: 'sync' }
  )
  return reactive({
    query,
    choices,
    page,
    itemPage,
    supplierPage,
    detail,
    permits,
    detailLoading,
    detailError,
    readingEditor,
    syncingPermit,
    selectedId,
    reason,
    editor,
    receiptForm,
    canCreate,
    actions,
    submission,
    permitSubmission,
    frozen,
    departments,
    removeLine: (key: number) => {
      if (!frozen.value) lines.value = lines.value.filter(row => row.key !== key)
    },
    changeChoicePage: (kind: 'item' | 'supplier', step: number) => {
      const target = kind === 'item' ? itemPage : supplierPage
      target.value = Math.max(1, target.value + step)
    },
    updateReceipt: (key: 'lineId' | 'warehouseId' | 'quantity', value: string) => {
      if (!permitSubmission.record && !permitSubmission.mutation.busy) receiptForm[key] = value
    },
    companyScope: computed(() => hasPermission(query.session.access, 'purchasing.order.create', { on: form.expectedAt })),
    startEditor,
    addLine,
    saveEditor,
    readEditorBaseline,
    select,
    refresh,
    decide,
    startReceipt,
    issue,
    cancelPermit,
    closeRemaining,
    recover,
    editorTotal: computed(() => {
      try {
        return sumDecimals(lines.value.map(line => multiplyDecimals(String(line.quantity), String(line.unitPrice))))
      } catch {
        return '—'
      }
    })
  })
}
