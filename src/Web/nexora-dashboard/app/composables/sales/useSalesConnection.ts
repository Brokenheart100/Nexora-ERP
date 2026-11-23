import { z } from 'zod'
import { salesDraftSchema, salesNumberSchema, type SalesDecision } from '#shared/types/sales'
import { salesOrdersPath, useSalesApi } from '~/composables/api/useSalesApi'
import { useMasterDataApi } from '~/composables/api/useMasterDataApi'
import { useOrganizationApi } from '~/composables/api/useOrganizationApi'
import { usePartnersApi } from '~/composables/api/usePartnersApi'
import { useWorkspaceQuery } from '~/composables/api/useWorkspaceQuery'
import { useScopedSubmission } from '~/composables/api/useScopedSubmission'
import { hasPermission } from '~/utils/api/access'
import { ApiFailure } from '~/utils/api/client'

const create = 'sales.order.create'
const submit = 'sales.order.submit'
const approve = 'sales.order.approve'

export function useSalesConnection(tab: Ref<string>, pageSize: number) {
  const api = useSalesApi()
  const master = useMasterDataApi()
  const partners = usePartnersApi()
  const organization = useOrganizationApi()
  const page = ref(1)
  const itemPage = ref(1)
  const customerPage = ref(1)
  const query = useWorkspaceQuery('sales-orders', '/sales',
    (id, signal) => api.list(id, tab.value === 'quotes', page.value, pageSize, signal), () => [tab.value, page.value])
  const choices = useWorkspaceQuery('sales-choices', '/sales', async (id, signal) => {
    const [catalog, customers, departments] = await Promise.all([
      master.catalog(id, itemPage.value, signal, 100).then(value => value.data).catch(() => null),
      partners.list(id, customerPage.value, 'customer', signal, 100).catch(() => null),
      organization.departments(id, signal).catch(() => null)
    ])
    return { catalog, customers, departments }
  }, () => [itemPage.value, customerPage.value])

  const submission = useScopedSubmission('sales-orders', () => query.enabled)
  const selectedId = ref('')
  const current = shallowRef<Awaited<ReturnType<typeof api.detail>> | null>(null)
  const detailLoading = ref(false)
  const detailError = ref('')
  const reason = ref('')
  const actionError = ref('')
  const editor = reactive({ id: '', number: '', on: '', customerId: '', departmentId: 'company', note: '',
    lines: [] as { key: number, itemId: string, quantity: string, unitPrice: string, label?: string }[], error: '' })
  const editorBaseline = shallowRef<typeof current.value>(null)
  let selection: AbortController | null = null
  let lineKey = 0
  const detail = computed(() => current.value?.data ?? null)
  const frozen = computed(() => !!submission.record || submission.mutation.busy)
  const conflict = computed(() => submission.failure?.status === 412)
  const canCreate = computed(() => query.data?.canCreate === true && !frozen.value)
  const allowed = (permission: string, departmentId?: string | null) =>
    hasPermission(query.session.access, permission, departmentId ? { departmentId } : undefined)
  const canAct = (permission: string) => !!detail.value && !detailLoading.value && !frozen.value && !conflict.value
    && allowed(permission, detail.value.order.departmentId)
  const owns = (state: string) => detail.value?.isMaker === true && detail.value.order.state === state
  const canEdit = computed(() => owns('draft') && canAct(create))
  const canConvert = computed(() => owns('quoted') && canAct(create))
  const selfApproval = computed(() => owns('submitted') && allowed(approve, detail.value?.order.departmentId))
  const decisions = computed<SalesDecision[]>(() => {
    if (detail.value?.order.isQuote) {
      if (owns('draft') && canAct(submit)) return ['issue-quote', 'cancel']
      return []
    }
    if (owns('draft') && canAct(submit)) return ['submit', 'cancel']
    if (owns('submitted') && canAct(submit)) return ['withdraw']
    if (detail.value?.order.state === 'submitted' && !detail.value.isMaker && canAct(approve)) return ['approve', 'return']
    return []
  })
  const departments = computed(() => choices.data?.departments?.filter(value => allowed(create, value.id)) ?? [])
  const customers = computed(() => choices.data?.customers?.items.filter(value => value.isActive)
    .map(value => ({ label: `${value.code} ${value.name}`, value: value.id })) ?? [])
  const items = computed(() => {
    const definitions = new Set(choices.data?.catalog?.definitions.filter(value => value.isActive).map(value => value.id))
    return choices.data?.catalog?.page.items.filter(value => value.isActive && value.tracksInventory && value.kind === 'product'
      && definitions.has(value.categoryId) && definitions.has(value.unitId))
      .map(value => ({ label: `${value.code} ${value.name}`, value: value.id })) ?? []
  })

  function clearSelection() {
    selection?.abort()
    selection = null
    selectedId.value = ''
    current.value = null
    detailLoading.value = false
    detailError.value = ''
    reason.value = ''
    actionError.value = ''
  }
  async function select(id: string) {
    selection?.abort()
    const request = new AbortController()
    selection = request
    if (selectedId.value !== id) {
      reason.value = ''
      submission.reset()
    }
    selectedId.value = id
    current.value = null
    detailError.value = ''
    actionError.value = ''
    if (!query.enabled || !z.uuid().safeParse(id).success) {
      detailLoading.value = false
      detailError.value = '此单据暂不可用。'
      return false
    }
    detailLoading.value = true
    try {
      const result = await api.detail(query.session.activeWorkspaceId, id, request.signal)
      if (selection !== request) return false
      current.value = result
      return true
    } catch (error) {
      if (selection === request) detailError.value = error instanceof ApiFailure ? error.message : '销售详情暂不可用。'
      return false
    } finally {
      if (selection === request) detailLoading.value = false
    }
  }
  async function refresh() {
    const id = selectedId.value
    await Promise.all([query.refresh(), ...(id ? [select(id)] : [])])
  }
  function addLine() {
    editor.lines.push({ key: ++lineKey, itemId: '', quantity: '1', unitPrice: '' })
  }
  function moveChoicesPage(area: 'items' | 'customers', offset: -1 | 1) {
    const target = area === 'items' ? itemPage : customerPage
    target.value = Math.max(1, target.value + offset)
  }
  function startEditor(edit = false) {
    if (frozen.value || (edit ? !canEdit.value : !canCreate.value)) return false
    submission.reset()
    const source = edit ? detail.value : null
    editorBaseline.value = edit ? current.value : null
    Object.assign(editor, {
      id: source?.order.id ?? '', number: source?.order.number ?? '', on: source?.order.on ?? new Date().toLocaleDateString('en-CA'),
      customerId: source?.customerId ?? '', departmentId: source?.order.departmentId ?? 'company', note: source?.note ?? '', error: '',
      lines: source?.lines.map(line => ({ key: ++lineKey, itemId: line.itemId, label: `${line.itemCode} ${line.itemName}`,
        quantity: line.quantity, unitPrice: line.unitPrice })) ?? []
    })
    if (!editor.lines.length) addLine()
    return true
  }
  async function reloadBaseline(edit = false) {
    if (frozen.value) return
    const id = edit ? editor.id : selectedId.value
    if (id && await select(id)) {
      if (edit) editorBaseline.value = current.value
      submission.reset()
    }
  }
  async function decide(decision: SalesDecision) {
    if (!current.value || !decisions.value.includes(decision) || conflict.value) return false
    actionError.value = ''
    if (['return', 'cancel'].includes(decision) && !reason.value.trim()) {
      actionError.value = '请填写退回或取消原因。'
      return false
    }
    const { data, etag } = current.value
    const success = await submission.send('sales.' + decision,
      `${salesOrdersPath(query.session.activeWorkspaceId)}/${data.order.id}/decision`,
      { decision, reason: reason.value.trim() || null, expectedVersion: data.order.version }, { etag, resourceId: data.order.id })
    if (success) {
      reason.value = ''
      await refresh()
    }
    return success
  }
  async function saveEditor(kind: 'order' | 'quote', mode: 'draft' | 'submit') {
    if (frozen.value || conflict.value) return false
    editor.error = ''
    const baseline = editorBaseline.value
    if (editor.id && (!baseline?.data.isMaker || baseline.data.order.state !== 'draft')) {
      editor.error = '请读取当前草稿状态后再保存。'
      return false
    }
    const departmentId = editor.departmentId === 'company' ? null : editor.departmentId
    if (!allowed(create, departmentId)) {
      editor.error = '请选择有制单权限的范围。'
      return false
    }
    const number = salesNumberSchema.safeParse(editor.number)
    const draft = salesDraftSchema.safeParse({ ...editor, departmentId })
    if (!number.success || !draft.success) {
      const issues = [...(number.error?.issues ?? []), ...(draft.error?.issues ?? [])]
      editor.error = issues.map(issue => typeof issue.path[1] === 'number' ? `第 ${issue.path[1] + 1} 行 · ${issue.message}` : issue.message).join(' ')
      return false
    }
    const owner = query.owner
    const root = salesOrdersPath(query.session.activeWorkspaceId)
    const ok = await submission.send(baseline ? 'sales.edited' : 'sales.created', baseline ? `${root}/${editor.id}` : root,
      baseline ? { draft: draft.data, expectedVersion: baseline.data.order.version } : { number: number.data, draft: draft.data, isQuote: kind === 'quote' },
      { method: baseline ? 'PUT' : 'POST', etag: baseline?.etag, resourceId: editor.id || undefined, draft: { kind } })
    if (!ok || !submission.result || owner !== query.owner) return false
    editor.id = submission.result.id
    editor.number = number.data
    const loaded = await select(editor.id)
    if (owner !== query.owner) return false
    editorBaseline.value = current.value
    await query.refresh()
    if (mode === 'draft') return true
    return loaded && await decide(kind === 'quote' ? 'issue-quote' : 'submit')
  }
  async function convert(orderNumber: string) {
    actionError.value = ''
    if (!canConvert.value || !current.value || conflict.value) return null
    const number = salesNumberSchema.safeParse(orderNumber)
    if (!number.success) {
      actionError.value = number.error.issues[0]?.message ?? '请输入销售订单号。'
      return null
    }
    const { data, etag } = current.value
    const success = await submission.send('sales.quote-converted',
      `${salesOrdersPath(query.session.activeWorkspaceId)}/${data.order.id}/convert`,
      { orderNumber: number.data, expectedVersion: data.order.version }, { etag, resourceId: data.order.id })
    return success ? submission.result : null
  }
  async function checkSubmission() {
    await submission.check(async (saved) => {
      if (saved.resourceId) {
        const result = await api.detail(saved.workspaceId, saved.resourceId)
        if (selectedId.value === saved.resourceId && submission.record?.operationId === saved.operationId) current.value = result
      } else {
        await query.refresh()
        if (!query.data) throw new Error(query.problem || '暂无法读取销售单据。')
      }
      // A newer document does not prove that this exact operation was applied.
      return null
    })
  }
  watch(() => query.owner, () => {
    clearSelection()
    page.value = itemPage.value = customerPage.value = 1
    editorBaseline.value = null
    Object.assign(editor, { id: '', number: '', on: '', customerId: '', departmentId: 'company', note: '', lines: [], error: '' })
  }, { flush: 'sync' })
  watch(tab, () => {
    page.value = 1
  }, { flush: 'sync' })
  onScopeDispose(clearSelection)

  return reactive({ query, choices, submission, page, itemPage, customerPage, detail, selectedId,
    etag: computed(() => current.value?.etag), detailLoading, detailError, reason, actionError,
    editor, frozen, conflict, canCreate, canEdit, canConvert, selfApproval, decisions, departments, customers, items,
    companyAllowed: computed(() => allowed(create)), editorCanSubmit: computed(() => allowed(submit, editor.departmentId === 'company' ? null : editor.departmentId)),
    select, clearSelection, refresh, addLine, moveChoicesPage, startEditor, reloadBaseline, saveEditor, decide, convert, checkSubmission })
}

export type SalesConnection = ReturnType<typeof useSalesConnection>
