import { useAuthSessionStore } from '~/stores/authSession'
import { useLiveSessionStore } from '~/stores/liveSession'
import { useDashboardApi } from '~/composables/api/useDashboardApi'
import { useMasterDataApi } from '~/composables/api/useMasterDataApi'
import { ApiFailure } from '~/utils/api/client'
import { catalogProduct } from '~/utils/catalog/adapter'
import type { WireCatalog } from '#shared/types/wire'

interface CatalogRead {
  owner: string
  page: number
  catalog: WireCatalog | null
  problem: { message: string, status: number, kind: string, traceId: string } | null
}

/** The original catalog consumes the same typed GETs in MSW and real BFF modes. */
export function useCatalogConnection() {
  const auth = useAuthSessionStore()
  const session = useLiveSessionStore()
  const api = useDashboardApi()
  const masterData = useMasterDataApi()
  const page = ref(1)
  const pageSize = 8
  const owner = computed(() => JSON.stringify([auth.user?.subject ?? '', session.activeWorkspaceId,
    String(session.access?.authorizationVersion ?? ''), session.epoch]))
  const eligible = computed(() => auth.connected && !!auth.user && !!session.access && !session.denied && session.canVisit('/catalog'))
  const key = computed(() => 'dashboard:' + api.scope.key('catalog', { page: page.value, pageSize }) + ':' + owner.value)
  const empty = (): CatalogRead => ({ owner: '', page: 0, catalog: null, problem: null })
  const query = useAsyncData<CatalogRead>(key, async (_app, { signal }) => {
    const captured = { owner: owner.value, page: page.value }
    if (!eligible.value) return { ...captured, catalog: null, problem: null }
    try {
      const response = await masterData.catalog(session.activeWorkspaceId, captured.page, signal, pageSize)
      return { ...captured, catalog: response.data, problem: null }
    } catch (failure) {
      const problem = failure instanceof ApiFailure
        ? { message: failure.message, status: failure.status, kind: failure.kind, traceId: failure.traceId }
        : { message: '商品目录暂不可用，请重试。', status: 0, kind: 'unavailable', traceId: '' }
      return { ...captured, catalog: null, problem }
    }
  }, { server: false, lazy: true, enabled: eligible, deep: false, default: empty })
  const visible = computed(() => eligible.value && query.data.value?.owner === owner.value && query.data.value.page === page.value ? query.data.value : empty())
  const catalog = computed(() => visible.value.catalog)
  const definitions = computed(() => catalog.value?.definitions ?? [])
  const rows = computed(() => catalog.value?.page.items.map(item => catalogProduct(item, definitions.value)) ?? [])
  const canEdit = computed(() => eligible.value && catalog.value?.canManage === true && session.access!.permissions.includes('masterdata.item.manage'))
  watch(owner, () => {
    page.value = 1
  }, { flush: 'sync' })
  return reactive({ connected: computed(() => auth.connected), auth, session, owner, page, pageSize,
    rows, definitions, canEdit, problem: computed(() => visible.value.problem),
    loading: computed(() => session.loading || (eligible.value && query.status.value === 'pending')),
    hasMore: computed(() => catalog.value?.page.hasMore ?? false),
    item: (id: string) => catalog.value?.page.items.find(item => item.id === id) ?? null,
    refresh: () => query.refresh(),
    categoryOptions: computed(() => definitions.value.filter(item => item.kind === 'category').map(item => ({ value: item.id, label: item.name + (item.isActive ? '' : '（已停用）'), disabled: !item.isActive }))),
    unitOptions: computed(() => definitions.value.filter(item => item.kind === 'unit').map(item => ({ value: item.id, label: item.name + (item.isActive ? '' : '（已停用）'), disabled: !item.isActive }))) })
}

export type CatalogConnection = ReturnType<typeof useCatalogConnection>
