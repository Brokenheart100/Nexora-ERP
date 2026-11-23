import { useMasterDataApi } from '~/composables/api/useMasterDataApi'
import { useWorkspaceQuery } from '~/composables/api/useWorkspaceQuery'
import { useScopedSubmission } from '~/composables/api/useScopedSubmission'
import type { WireDefinition } from '#shared/types/masterdata'

export function useDefinitionsConnection() {
  const api = useMasterDataApi()
  const query = useWorkspaceQuery('definitions', '/definitions', (id, signal) => api.catalog(id, 1, signal, 1).then(result => result.data))
  const canEdit = computed(() => query.enabled && query.data?.canManage === true && query.session.access?.permissions.includes('masterdata.item.manage') === true)
  const submission = useScopedSubmission('definitions', () => canEdit.value)
  const baseline = shallowRef<{ definition: WireDefinition, etag: string } | null>(null)
  const message = ref('')
  let selection = 0
  watch(() => query.owner, () => {
    selection++
    baseline.value = null
    message.value = ''
  }, { flush: 'sync' })
  async function read(id: string) {
    const ticket = ++selection
    try {
      const response = await api.definition(query.session.activeWorkspaceId, id)
      if (ticket !== selection) return null
      const etag = response.headers.get('etag')
      if (!etag) throw new Error('缺少记录版本，暂不能保存。')
      baseline.value = { definition: response.data, etag }
      return response.data
    } catch (error) {
      if (ticket === selection) message.value = error instanceof Error ? error.message : '记录暂不可用。'
      return null
    }
  }
  async function open(id?: string) {
    if (!canEdit.value) return null
    if (submission.record) {
      message.value = '请先恢复上次提交并核对结果。'
      return null
    }
    submission.reset()
    message.value = ''
    baseline.value = null
    return id ? read(id) : true
  }
  async function save(input: { code: string, name: string, status: string }, kind: 'category' | 'unit') {
    const current = baseline.value
    const root = `/bff/api/masterdata/workspaces/${query.session.activeWorkspaceId}/definitions`
    const saved = await submission.send(current ? 'catalog.definition.revised' : 'catalog.definition.created', current ? root + '/' + current.definition.id : root,
      current ? { name: input.name, isActive: input.status === 'active' } : { code: input.code, name: input.name, kind },
      current ? { method: 'PUT', etag: current.etag, resourceId: current.definition.id } : {})
    if (saved) await query.refresh()
    return saved
  }
  async function check(retry = false) {
    const result = retry ? await submission.retry() : await submission.check(saved => api.receipt(saved.workspaceId, saved.operationId, saved.action, saved.resourceId))
    if (result) await query.refresh()
    return result
  }
  async function resume() {
    const saved = submission.record
    if (!saved) return null
    if (saved.resourceId && !await read(saved.resourceId)) return null
    const record = submission.resume()
    return record ? { record, definition: baseline.value?.definition } : null
  }
  return reactive({ query, canEdit, submission, baseline, open, read, save, check, resume, message,
    readCurrent: () => baseline.value ? read(baseline.value.definition.id) : null })
}
