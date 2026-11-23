import { usePartnersApi } from '~/composables/api/usePartnersApi'
import { useMasterDataApi } from '~/composables/api/useMasterDataApi'
import { useWorkspaceQuery } from '~/composables/api/useWorkspaceQuery'
import { useScopedSubmission } from '~/composables/api/useScopedSubmission'
import { partnerModel } from '~/utils/catalog/partner'
import type { PartnerInput, WirePartner } from '#shared/types/masterdata'

export function usePartnersConnection() {
  const api = usePartnersApi(), masterData = useMasterDataApi(), page = ref(1)
  const query = useWorkspaceQuery('partners', '/partners', (id, signal) => api.list(id, page.value, undefined, signal, 8), () => ({ page: page.value, pageSize: 8 }))
  const canEdit = computed(() => query.enabled && query.data?.canManage === true && query.session.access?.permissions.includes('masterdata.partner.manage') === true)
  const submission = useScopedSubmission('partners', () => canEdit.value)
  const baseline = shallowRef<{ partner: WirePartner, etag: string } | null>(null)
  const message = ref('')
  let selection = 0
  watch(() => query.owner, () => {
    selection++
    page.value = 1
    baseline.value = null
    message.value = ''
  }, { flush: 'sync' })
  async function read(id: string) {
    const ticket = ++selection
    try {
      const result = await api.detail(query.session.activeWorkspaceId, id)
      if (ticket !== selection) return null
      const etag = result.headers.get('etag')
      if (!etag) throw new Error('缺少记录版本，暂不能保存。')
      baseline.value = { partner: result.data, etag }
      return result.data
    } catch (error) {
      if (ticket === selection) message.value = error instanceof Error ? error.message : '伙伴暂不可用。'
      return null
    }
  }
  function start() {
    if (submission.record) {
      message.value = '请先恢复并核对上次提交。'
      return false
    };
    submission.reset()
    baseline.value = null
    message.value = ''
    return true
  }
  async function save(input: PartnerInput) {
    const current = baseline.value, root = `/bff/api/masterdata/workspaces/${query.session.activeWorkspaceId}/partners`
    const saved = await submission.send(current ? 'partner.revised' : 'partner.created', current ? root + '/' + current.partner.id : root,
      current ? { profile: api.profile(input), isActive: input.isActive } : { code: input.code, profile: api.profile(input) },
      current ? { method: 'PUT', etag: current.etag, resourceId: current.partner.id } : {})
    if (saved) await query.refresh()
    return saved
  }
  async function check(retry = false) {
    const result = retry ? await submission.retry() : await submission.check(saved => masterData.receipt(saved.workspaceId, saved.operationId, saved.action, saved.resourceId))
    if (result) await query.refresh()
    return result
  }
  async function resume() {
    const saved = submission.record
    if (!saved || (saved.resourceId && !await read(saved.resourceId))) return null
    return submission.resume()
  }
  return reactive({ query, canEdit, submission, baseline, page, read, start, save, check, resume, message,
    rows: computed(() => query.data?.items.map(partnerModel) ?? []), hasMore: computed(() => query.data?.hasMore ?? false),
    readCurrent: () => baseline.value ? read(baseline.value.partner.id) : null })
}
