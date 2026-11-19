<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { ChangeEntry, Partner, PartnerContact, PartnerRole, PartnerStatus, PartnerType } from '~/mocks'
import {
  changeLogEntries,
  partnerRoleLabel,
  partnerRoleLabels,
  partnerRolesOf,
  partnerStatusColors,
  partnerStatusLabels,
  partnerTypeFromRoles,
  partnerTypeLabels,
  partners
} from '~/mocks'
import { z } from 'zod'

const toast = useToast()
const route = useRoute()
const { activeWorkspaceId } = useMockWorkspace()
const { loading, run: runRefresh } = useMockRefresh()
const { isLoading: stateLoading, isEmpty, isError, isForbidden } = useMockState()
const { can } = useMockPermissions()

const rows = ref<Partner[]>(partners.map(partner => ({ ...partner })))
const searchInput = ref('')
const search = ref('')
const type = ref<'all' | PartnerType>('all')
const status = ref<'all' | PartnerStatus>('all')
const pageSize = 8

const canEdit = computed(() => can('catalog.edit'))
const showSkeleton = computed(() => loading.value || stateLoading.value)

const applySearch = useDebounceFn((value: string) => {
  search.value = value
}, 220)

watch(searchInput, value => applySearch(value))

const typeItems = [
  { label: '全部类型', value: 'all' },
  { label: '供应商', value: 'supplier' },
  { label: '客户', value: 'customer' },
  { label: '捐赠人', value: 'donor' },
  { label: '供应商 / 客户', value: 'both' }
]

const statusItems = [
  { label: '全部状态', value: 'all' },
  { label: '合作中', value: 'active' },
  { label: '已停用', value: 'inactive' }
]

const partnerTypeColors: Record<PartnerType, 'primary' | 'info' | 'success' | 'warning'> = {
  supplier: 'info',
  customer: 'success',
  donor: 'warning',
  both: 'primary'
}

const filteredRows = computed(() => {
  if (isForbidden.value || isError.value || isEmpty.value) return []
  const keyword = search.value.trim().toLowerCase()
  return rows.value.filter((partner) => {
    if (type.value === 'both' && !(partnerRolesOf(partner).includes('supplier') && partnerRolesOf(partner).includes('customer'))) return false
    if (type.value !== 'all' && type.value !== 'both' && !partnerRolesOf(partner).includes(type.value)) return false
    if (status.value !== 'all' && partner.status !== status.value) return false
    if (!keyword) return true
    return [partner.name, partner.code, partner.contact, partner.email, partner.phone]
      .some(value => value.toLowerCase().includes(keyword))
  })
})

const {
  page,
  pageRows,
  pageStart,
  pageEnd,
  resetPage
} = useClientPagination(filteredRows, pageSize)

watch([search, type, status], resetPage)

const activeFilters = computed(() => searchInput.value.trim() !== '' || type.value !== 'all' || status.value !== 'all')

function resetFilters() {
  searchInput.value = ''
  search.value = ''
  type.value = 'all'
  status.value = 'all'
}

const emptyTitle = computed(() => {
  if (search.value.trim()) return '没有找到匹配的伙伴'
  if (type.value !== 'all' || status.value !== 'all') return '当前筛选下没有伙伴'
  return '还没有伙伴档案'
})

const emptyDescription = computed(() => {
  if (search.value.trim()) return '没有与关键词匹配的伙伴，试试更换关键词或清空筛选。'
  if (type.value !== 'all' || status.value !== 'all') return '当前类型或状态筛选没有匹配结果，试试调整筛选条件。'
  return '新增伙伴后会显示在这里；本原型使用模拟数据。'
})

const columns: TableColumn<Partner>[] = [{
  accessorKey: 'code',
  header: '编码',
  meta: { class: { td: 'whitespace-nowrap font-mono text-[12px] text-muted' } }
}, {
  accessorKey: 'name',
  header: '伙伴名称',
  meta: { class: { td: 'min-w-[220px] whitespace-normal' } }
}, {
  accessorKey: 'type',
  header: '类型'
}, {
  accessorKey: 'contact',
  header: '联系人',
  meta: { class: { td: 'whitespace-nowrap' } }
}, {
  accessorKey: 'email',
  header: '邮箱',
  meta: { class: { td: 'max-w-[200px] truncate text-muted' } }
}, {
  accessorKey: 'status',
  header: '状态'
}, {
  accessorKey: 'updatedAt',
  header: '更新时间',
  meta: { class: { td: 'whitespace-nowrap text-muted' } }
}, {
  id: 'actions',
  header: '操作',
  meta: { class: { th: 'w-24', td: 'w-24 text-right' } }
}]

function pad(value: number) {
  return String(value).padStart(2, '0')
}

function formatNow() {
  const now = new Date()
  return now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate()) + ' ' + pad(now.getHours()) + ':' + pad(now.getMinutes())
}

const detailOpen = ref(false)
const detailPartner = ref<Partner | null>(null)
const localEntries = ref<ChangeEntry[]>([])

function openDetail(partner: Partner) {
  detailPartner.value = partner
  detailOpen.value = true
}

const detailEntries = computed(() => {
  const partner = detailPartner.value
  if (!partner) return []
  return [
    ...changeLogEntries.filter(entry => entry.entityType === 'partner' && entry.entityId === partner.id),
    ...localEntries.value.filter(entry => entry.entityId === partner.id)
  ].sort((a, b) => b.at.localeCompare(a.at))
})

const detailTypeLabel = computed(() => detailPartner.value ? partnerRoleLabel(detailPartner.value) : '')
const detailStatusLabel = computed(() => detailPartner.value ? partnerStatusLabels[detailPartner.value.status] : '')
const detailStatusColor = computed(() => detailPartner.value ? partnerStatusColors[detailPartner.value.status] : 'neutral')

const editOpen = ref(false)
const editing = ref<Partner | null>(null)
const editForm = reactive({
  name: '',
  code: '',
  roles: [] as PartnerRole[],
  contact: '',
  phone: '',
  email: '',
  taxNo: '',
  status: 'active' as PartnerStatus,
  province: '',
  city: '',
  line: '',
  postalCode: '',
  contacts: [] as PartnerContact[]
})

const partnerEditSchema = z.object({
  name: z.string().trim().min(1, '请填写伙伴名称').max(80, '伙伴名称不能超过 80 个字符'),
  roles: z.array(z.enum(['supplier', 'customer', 'donor'])).min(1, '至少选择一个业务角色'),
  contact: z.string().trim().max(20, '联系人不能超过 20 个字符'),
  phone: z.string().trim().max(30, '联系电话不能超过 30 个字符'),
  email: z.string().trim().refine(value => !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value), '邮箱格式不正确'),
  taxNo: z.string().trim().max(30, '税号不能超过 30 个字符'),
  status: z.enum(['active', 'inactive']),
  province: z.string().trim().max(20, '省份不能超过 20 个字符'),
  city: z.string().trim().max(20, '城市不能超过 20 个字符'),
  line: z.string().trim().max(80, '详细地址不能超过 80 个字符'),
  postalCode: z.string().trim().max(10, '邮编不能超过 10 个字符'),
  contacts: z.array(z.object({
    id: z.string(),
    name: z.string().trim().min(1, '联系人姓名不能为空').max(20, '联系人姓名不能超过 20 个字符'),
    title: z.string().trim().max(20, '联系人职务不能超过 20 个字符'),
    phone: z.string().trim().max(30, '联系电话不能超过 30 个字符'),
    email: z.string().trim().refine(value => !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value), '联系人邮箱格式不正确')
  })).min(1, '至少保留一个联系人')
})

const roleOptions: { value: PartnerRole, label: string }[] = [
  { value: 'supplier', label: '供应商' },
  { value: 'customer', label: '客户' },
  { value: 'donor', label: '捐赠人' }
]

let contactSequence = 0
function makeContact(name = '', title = '', phone = '', email = ''): PartnerContact {
  contactSequence += 1
  return { id: 'local-contact-' + contactSequence, name, title, phone, email }
}

function resetEditForm() {
  editForm.name = ''
  editForm.code = ''
  editForm.roles = ['supplier']
  editForm.contact = ''
  editForm.phone = ''
  editForm.email = ''
  editForm.taxNo = ''
  editForm.status = 'active'
  editForm.province = '浙江省'
  editForm.city = '杭州市'
  editForm.line = ''
  editForm.postalCode = ''
  editForm.contacts = [makeContact()]
}

function openEditor(partner: Partner) {
  editing.value = partner
  editForm.name = partner.name
  editForm.code = partner.code
  editForm.roles = partnerRolesOf(partner)
  editForm.contact = partner.contact
  editForm.phone = partner.phone
  editForm.email = partner.email
  editForm.taxNo = partner.taxNo
  editForm.status = partner.status
  editForm.province = partner.address?.province ?? ''
  editForm.city = partner.address?.city ?? ''
  editForm.line = partner.address?.line ?? ''
  editForm.postalCode = partner.address?.postalCode ?? ''
  editForm.contacts = (partner.contacts ?? [makeContact(partner.contact, '主联系人', partner.phone, partner.email)])
    .map(contact => ({ ...contact }))
  detailOpen.value = false
  editOpen.value = true
}

function openCreate() {
  if (!canEdit.value) {
    toast.add({ title: '没有新建权限', description: '?state=forbidden 演示只读身份。', color: 'error' })
    return
  }
  editing.value = null
  resetEditForm()
  detailOpen.value = false
  editOpen.value = true
}

function openEditorFromDetail() {
  if (detailPartner.value) openEditor(detailPartner.value)
}

function toggleRole(role: PartnerRole) {
  if (editForm.roles.includes(role)) {
    if (editForm.roles.length === 1) {
      toast.add({ title: '至少保留一个业务角色', description: '客户、供应商、捐赠人可以同时选择。', color: 'warning' })
      return
    }
    editForm.roles = editForm.roles.filter(item => item !== role)
    return
  }
  editForm.roles = [...editForm.roles, role]
}

function addContact() {
  editForm.contacts.push(makeContact())
}

function removeContact(index: number) {
  if (editForm.contacts.length === 1) {
    toast.add({ title: '至少保留一个联系人', description: '请先新增其他联系人再移除。', color: 'warning' })
    return
  }
  editForm.contacts.splice(index, 1)
}

function nextPartnerCode(roles: PartnerRole[]) {
  const prefix = roles.length > 1 ? 'PT' : roles[0] === 'customer' ? 'CUS' : roles[0] === 'donor' ? 'DON' : 'SUP'
  const max = rows.value
    .filter(item => item.code.startsWith(prefix + '-'))
    .reduce((value, item) => Math.max(value, Number(item.code.split('-').pop()) || 0), 0)
  return prefix + '-' + String(max + 1).padStart(3, '0')
}

function nextPartnerId() {
  const max = rows.value.reduce((value, item) => Math.max(value, Number(item.id.replace('pt-', '')) || 0), 1000)
  return 'pt-' + (max + 1)
}

function saveEditor() {
  if (!canEdit.value) {
    toast.add({ title: '没有编辑权限', description: '?state=forbidden 演示只读身份。', color: 'error' })
    return
  }

  const parsed = partnerEditSchema.safeParse(editForm)
  if (!parsed.success) {
    toast.add({ title: '请检查伙伴信息', description: parsed.error.issues[0]?.message ?? '表单校验未通过', color: 'error' })
    return
  }

  const primary = parsed.data.contacts[0]!
  const partner = editing.value
  const code = partner?.code ?? nextPartnerCode(parsed.data.roles)
  if (rows.value.some(item => item.code === code && item.id !== partner?.id)) {
    toast.add({ title: '伙伴编码已存在', description: '请更换编码后再保存。', color: 'error' })
    return
  }

  const saved: Partner = {
    ...(partner ?? {
      id: nextPartnerId(),
      code,
      currency: 'CNY' as const
    }),
    name: parsed.data.name,
    code,
    roles: parsed.data.roles,
    type: partnerTypeFromRoles(parsed.data.roles),
    contact: primary.name,
    phone: primary.phone,
    email: primary.email,
    taxNo: parsed.data.taxNo,
    status: parsed.data.status,
    address: {
      province: parsed.data.province,
      city: parsed.data.city,
      line: parsed.data.line,
      postalCode: parsed.data.postalCode
    },
    contacts: parsed.data.contacts.map(contact => ({ ...contact })),
    updatedAt: formatNow()
  }

  const index = rows.value.findIndex(item => item.id === saved.id)
  if (index >= 0) rows.value[index] = saved
  else rows.value = [saved, ...rows.value]
  detailPartner.value = saved
  detailOpen.value = true

  localEntries.value.unshift({
    id: 'local-partner-' + Date.now(),
    workspaceId: activeWorkspaceId.value,
    entityType: 'partner',
    entityId: saved.id,
    entityName: saved.name,
    action: partner ? '更新' : '新建',
    actor: '当前用户',
    summary: partner ? '更新伙伴档案与多角色信息（本地预览）。' : '新建伙伴档案并设置业务角色（本地预览）。',
    at: formatNow()
  })

  editOpen.value = false
  toast.add({
    title: partner ? '已保存伙伴档案' : '已新建伙伴档案',
    description: saved.code + ' · ' + partnerRoleLabel(saved) + ' · 仅本次预览有效。',
    color: 'success'
  })
}

const overflowItems = [[{
  label: '导出当前结果（CSV）',
  icon: 'i-carbon-document-export',
  onSelect: exportPartners
}]]

function exportPartners() {
  downloadCsv(
    '伙伴档案-' + new Date().toISOString().slice(0, 10) + '.csv',
    ['编码', '伙伴名称', '类型', '联系人', '电话', '邮箱', '税号', '币种', '状态', '更新时间'],
    filteredRows.value.map(partner => [
      partner.code,
      partner.name,
      partnerTypeLabels[partner.type],
      partner.contact,
      partner.phone,
      partner.email,
      partner.taxNo,
      partner.currency,
      partnerStatusLabels[partner.status],
      partner.updatedAt
    ])
  )
  toast.add({
    title: '已导出 ' + filteredRows.value.length + ' 条伙伴',
    description: 'CSV 由浏览器本地生成，未经过后端。',
    color: 'success',
    icon: 'i-carbon-document-export'
  })
}

function refreshPartners() {
  runRefresh(() => {
    toast.add({
      title: '伙伴列表已刷新',
      description: '本地模拟数据刷新后恢复初始值。',
      color: 'neutral',
      icon: 'i-carbon-renew'
    })
  })
}

async function reloadPage() {
  await navigateTo({ path: route.path, query: {} })
}
</script>

<template>
  <div class="contents">
    <UDashboardPanel id="partners">
      <template #header>
        <UDashboardNavbar title="伙伴档案">
          <template #leading>
            <UDashboardSidebarCollapse />
          </template>

          <template #right>
            <UBadge
              label="本地原型 · 模拟数据"
              color="neutral"
              variant="subtle"
              size="sm"
            />
            <NotificationButton />
            <UButton
              label="新建伙伴"
              icon="i-carbon-add"
              color="primary"
              size="sm"
              :disabled="!canEdit"
              data-testid="partners-new"
              @click="openCreate"
            />
            <UDropdownMenu :items="overflowItems" :content="{ align: 'end' }">
              <UButton
                icon="i-carbon-overflow-menu-horizontal"
                color="neutral"
                variant="ghost"
                size="sm"
                aria-label="更多伙伴操作"
                data-testid="partners-more"
              />
            </UDropdownMenu>
          </template>
        </UDashboardNavbar>

        <UDashboardToolbar :ui="{ root: 'flex-wrap gap-3 py-2.5' }">
          <template #left>
            <UInput
              v-model="searchInput"
              icon="i-carbon-search"
              placeholder="搜索伙伴名称、编码或联系人"
              size="sm"
              class="w-64 max-w-full"
              data-testid="partners-search"
            />
            <USelect
              v-model="type"
              :items="typeItems"
              size="sm"
              class="w-44"
              data-testid="partners-type"
            />
            <USelect
              v-model="status"
              :items="statusItems"
              size="sm"
              class="w-36"
              data-testid="partners-status"
            />
            <UButton
              v-if="activeFilters"
              label="重置"
              icon="i-carbon-reset"
              color="neutral"
              variant="ghost"
              size="sm"
              data-testid="partners-reset"
              @click="resetFilters"
            />
          </template>

          <template #right>
            <p class="text-xs text-muted">
              共 {{ filteredRows.length }} 条结果
            </p>
            <UTooltip text="刷新列表">
              <UButton
                icon="i-carbon-renew"
                color="neutral"
                variant="ghost"
                size="sm"
                :loading="loading"
                aria-label="刷新伙伴列表"
                data-testid="partners-refresh"
                @click="refreshPartners"
              />
            </UTooltip>
          </template>
        </UDashboardToolbar>
      </template>

      <template #body>
        <AppBreadcrumb current="伙伴档案" class="mb-3" />
        <UCard class="nx-reveal rounded-sm" :ui="{ body: 'p-0 sm:p-0', footer: 'p-0 sm:p-0' }">
          <div v-if="showSkeleton" class="space-y-2 p-4" data-testid="partners-skeleton">
            <USkeleton v-for="n in 8" :key="n" class="h-9 w-full" />
          </div>
          <div v-else-if="isError" class="p-6" data-testid="partners-state-error">
            <UAlert
              color="error"
              variant="soft"
              icon="i-carbon-warning-alt"
              title="伙伴加载失败（演示）"
              description="?state=error 会模拟一次加载失败。本原型不会访问后端。"
              :actions="[{ label: '恢复正常', color: 'neutral', variant: 'outline', size: 'sm', onClick: reloadPage }]"
            />
          </div>
          <div v-else-if="isForbidden" class="py-6" data-testid="partners-state-forbidden">
            <UEmpty
              variant="naked"
              icon="i-carbon-view-off"
              title="没有伙伴读取权限（演示）"
              description="?state=forbidden 模拟演示身份缺少 catalog.view 权限。"
              :actions="[{ label: '恢复正常', color: 'neutral', variant: 'outline', size: 'sm', onClick: reloadPage }]"
            />
          </div>
          <div v-else-if="isEmpty" class="py-6" data-testid="partners-state-empty">
            <UEmpty
              variant="naked"
              icon="i-carbon-user-multiple"
              title="空状态演示"
              description="?state=empty 让伙伴列表返回 0 条数据；真实空态会引导清空筛选。"
              :actions="[{ label: '恢复正常', color: 'neutral', variant: 'outline', size: 'sm', onClick: reloadPage }]"
            />
          </div>
          <div v-else :key="'partners-page-' + page" class="nx-fade">
            <ResizableTable
              :data="pageRows"
              :columns="columns"
              class="nx-table"
              :ui="{ th: 'py-2.5', td: 'py-3' }"
              :row-activate="openDetail"
              data-testid="partners-table"
            >
              <template #type-cell="{ row }">
                <UBadge
                  :color="partnerTypeColors[row.original.type]"
                  variant="subtle"
                  size="sm"
                  :label="partnerRoleLabel(row.original)"
                />
              </template>
              <template #contact-cell="{ row }">
                <p class="text-[13px] leading-5 text-default">
                  {{ row.original.contact }}
                </p>
                <p class="mt-0.5 text-[11px] text-muted">
                  {{ row.original.phone }}
                </p>
              </template>
              <template #status-cell="{ row }">
                <UBadge
                  :color="partnerStatusColors[row.original.status]"
                  variant="subtle"
                  size="sm"
                  :label="partnerStatusLabels[row.original.status]"
                />
              </template>
              <template #actions-cell="{ row }">
                <div class="flex justify-end gap-1">
                  <UButton
                    label="详情"
                    color="neutral"
                    variant="ghost"
                    size="xs"
                    data-testid="partners-detail"
                    @click="openDetail(row.original)"
                  />
                  <UButton
                    label="编辑"
                    color="neutral"
                    variant="ghost"
                    size="xs"
                    :disabled="!canEdit"
                    data-testid="partners-edit"
                    @click="openEditor(row.original)"
                  />
                </div>
              </template>
              <template #empty>
                <UEmpty
                  variant="naked"
                  icon="i-carbon-user-multiple"
                  :title="emptyTitle"
                  :description="emptyDescription"
                  :actions="[{ label: '清空筛选', color: 'neutral', variant: 'outline', size: 'sm', onClick: resetFilters }]"
                />
              </template>
            </ResizableTable>
          </div>

          <template #footer>
            <div
              v-if="!showSkeleton && !isError && !isForbidden && !isEmpty"
              class="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5"
            >
              <p class="text-xs text-muted">
                第 {{ pageStart }}–{{ pageEnd }} 条，共 {{ filteredRows.length }} 条
              </p>
              <UPagination
                v-model:page="page"
                :total="filteredRows.length"
                :items-per-page="pageSize"
                size="sm"
                data-testid="partners-pagination"
              />
            </div>
          </template>
        </UCard>
        <p class="mt-2 text-[11px] text-dimmed">
          本地原型 · 模拟数据 · 写操作仅本次预览，刷新后恢复
        </p>
      </template>
    </UDashboardPanel>

    <USlideover v-model:open="detailOpen" title="伙伴详情" :ui="{ content: 'sm:max-w-lg' }">
      <template #description>
        <span class="text-sm text-muted">{{ detailPartner?.code }} · {{ detailTypeLabel }}</span>
      </template>

      <template #body>
        <div v-if="detailPartner" class="space-y-6">
          <section>
            <h3 class="text-xs font-semibold tracking-wide text-muted">
              基本信息
            </h3>
            <dl class="mt-2 grid gap-x-4 gap-y-3 text-sm sm:grid-cols-2">
              <div>
                <dt class="text-xs text-muted">
                  伙伴名称
                </dt>
                <dd class="mt-0.5 text-default">
                  {{ detailPartner.name }}
                </dd>
              </div>
              <div>
                <dt class="text-xs text-muted">
                  业务角色
                </dt>
                <dd class="mt-0.5 flex flex-wrap gap-1">
                  <UBadge
                    v-for="role in partnerRolesOf(detailPartner)"
                    :key="role"
                    :color="role === 'supplier' ? 'info' : role === 'customer' ? 'success' : 'warning'"
                    variant="subtle"
                    size="sm"
                    :label="partnerRoleLabels[role]"
                    data-testid="partners-detail-role"
                  />
                </dd>
              </div>
              <div>
                <dt class="text-xs text-muted">
                  联系人
                </dt>
                <dd class="mt-0.5 text-default">
                  {{ detailPartner.contact }}
                </dd>
              </div>
              <div>
                <dt class="text-xs text-muted">
                  联系电话
                </dt>
                <dd class="mt-0.5 text-default">
                  {{ detailPartner.phone }}
                </dd>
              </div>
              <div>
                <dt class="text-xs text-muted">
                  邮箱
                </dt>
                <dd class="mt-0.5 break-all text-default">
                  {{ detailPartner.email }}
                </dd>
              </div>
              <div>
                <dt class="text-xs text-muted">
                  税号
                </dt>
                <dd class="mt-0.5 font-mono text-[12px] text-default">
                  {{ detailPartner.taxNo }}
                </dd>
              </div>
              <div>
                <dt class="text-xs text-muted">
                  币种
                </dt>
                <dd class="mt-0.5 text-default">
                  {{ detailPartner.currency }}
                </dd>
              </div>
              <div>
                <dt class="text-xs text-muted">
                  状态
                </dt>
                <dd class="mt-0.5">
                  <UBadge
                    :color="detailStatusColor"
                    variant="subtle"
                    size="sm"
                    :label="detailStatusLabel"
                  />
                </dd>
              </div>
              <div>
                <dt class="text-xs text-muted">
                  更新时间
                </dt>
                <dd class="mt-0.5 text-default">
                  {{ detailPartner.updatedAt }}
                </dd>
              </div>
            </dl>
          </section>

          <section data-testid="partners-detail-address">
            <h3 class="text-xs font-semibold tracking-wide text-muted">
              地址
            </h3>
            <p class="mt-2 text-sm text-default">
              {{ detailPartner.address?.province }}{{ detailPartner.address?.city }}{{ detailPartner.address?.line }}
            </p>
            <p v-if="detailPartner.address?.postalCode" class="mt-0.5 font-mono text-xs text-muted">
              邮编 {{ detailPartner.address.postalCode }}
            </p>
          </section>

          <section data-testid="partners-detail-contacts">
            <h3 class="text-xs font-semibold tracking-wide text-muted">
              联系人（{{ detailPartner.contacts?.length ?? 1 }}）
            </h3>
            <ul class="mt-2 divide-y divide-default rounded-sm border border-default">
              <li
                v-for="contact in detailPartner.contacts"
                :key="contact.id"
                class="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
                data-testid="partners-detail-contact"
              >
                <div>
                  <p class="text-sm text-default">
                    {{ contact.name }}
                    <span v-if="contact.title" class="ml-1 text-xs text-muted">{{ contact.title }}</span>
                  </p>
                  <p class="mt-0.5 text-xs text-muted">
                    {{ contact.phone || '未填写电话' }} · {{ contact.email || '未填写邮箱' }}
                  </p>
                </div>
              </li>
            </ul>
          </section>

          <section data-testid="partners-detail-changelog">
            <h3 class="text-xs font-semibold tracking-wide text-muted">
              变更记录
            </h3>
            <div class="mt-2">
              <ChangeLogTimeline
                :entries="detailEntries"
                compact
                empty-title="该伙伴暂无变更记录"
                empty-description="创建或编辑伙伴后，变更会记录在这里。"
              />
            </div>
          </section>
        </div>
      </template>

      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            label="关闭"
            color="neutral"
            variant="ghost"
            @click="detailOpen = false"
          />
          <UButton
            label="编辑"
            icon="i-carbon-edit"
            color="primary"
            :disabled="!canEdit"
            data-testid="partners-detail-edit"
            @click="openEditorFromDetail"
          />
        </div>
      </template>
    </USlideover>

    <USlideover
      v-model:open="editOpen"
      :title="editing ? '编辑伙伴' : '新建伙伴'"
      :ui="{ content: 'sm:max-w-xl' }"
    >
      <template #description>
        <span class="text-sm text-muted">
          {{ editing ? editing.code + ' · 档案编号只读' : '保存后自动生成档案编号' }} · 修改后仅作用于本次预览
        </span>
      </template>

      <template #body>
        <UForm
          id="partner-editor"
          :schema="partnerEditSchema"
          :state="editForm"
          class="space-y-4"
          @submit="saveEditor"
        >
          <UFormField label="伙伴名称" name="name" required>
            <UInput v-model="editForm.name" class="w-full" data-testid="partners-edit-name" />
          </UFormField>

          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField label="档案编号">
              <UInput
                :model-value="editing?.code ?? '保存后自动生成'"
                class="w-full font-mono"
                readonly
                data-testid="partners-edit-code"
              />
            </UFormField>
            <UFormField label="状态" name="status">
              <USelect
                v-model="editForm.status"
                :items="[{ label: '合作中', value: 'active' }, { label: '已停用', value: 'inactive' }]"
                class="w-full"
                data-testid="partners-edit-status"
              />
            </UFormField>
          </div>

          <UFormField label="业务角色（可多选）" name="roles" required>
            <div class="flex flex-wrap gap-2" data-testid="partners-edit-roles">
              <UButton
                v-for="option in roleOptions"
                :key="option.value"
                :label="option.label"
                size="sm"
                :color="editForm.roles.includes(option.value) ? 'primary' : 'neutral'"
                :variant="editForm.roles.includes(option.value) ? 'solid' : 'outline'"
                :data-testid="'partners-edit-role-' + option.value"
                @click="toggleRole(option.value)"
              />
            </div>
            <p class="mt-1 text-[11px] text-muted">
              同一主体可同时是供应商、客户或捐赠人；停用后会退出新单据的选择项，历史单据仍保留原名称。
            </p>
          </UFormField>

          <UFormField label="税号" name="taxNo">
            <UInput v-model="editForm.taxNo" class="w-full" data-testid="partners-edit-taxno" />
          </UFormField>

          <div class="space-y-2">
            <div class="flex items-center justify-between">
              <p class="text-xs font-medium text-default">
                地址
              </p>
            </div>
            <div class="grid gap-3 sm:grid-cols-2">
              <UFormField label="省份" name="province">
                <UInput v-model="editForm.province" class="w-full" data-testid="partners-edit-province" />
              </UFormField>
              <UFormField label="城市" name="city">
                <UInput v-model="editForm.city" class="w-full" data-testid="partners-edit-city" />
              </UFormField>
            </div>
            <UFormField label="详细地址" name="line">
              <UInput v-model="editForm.line" class="w-full" data-testid="partners-edit-line" />
            </UFormField>
            <UFormField label="邮编" name="postalCode">
              <UInput v-model="editForm.postalCode" class="w-full" data-testid="partners-edit-postal" />
            </UFormField>
          </div>

          <div class="space-y-3">
            <div class="flex items-center justify-between">
              <p class="text-xs font-medium text-default">
                联系人（{{ editForm.contacts.length }}）
              </p>
              <UButton
                label="新增联系人"
                icon="i-carbon-add"
                size="xs"
                color="neutral"
                variant="outline"
                data-testid="partners-edit-contact-add"
                @click="addContact"
              />
            </div>
            <div
              v-for="(contact, index) in editForm.contacts"
              :key="contact.id"
              class="rounded-sm border border-default p-3"
              :data-testid="'partners-edit-contact-' + index"
            >
              <div class="grid gap-3 sm:grid-cols-2">
                <UFormField :label="index === 0 ? '主联系人' : '联系人 ' + (index + 1)" required>
                  <UInput
                    v-model="contact.name"
                    class="w-full"
                    :data-testid="index === 0 ? 'partners-edit-contact' : 'partners-edit-contact-name-' + index"
                  />
                </UFormField>
                <UFormField label="职务">
                  <UInput v-model="contact.title" class="w-full" :data-testid="'partners-edit-contact-title-' + index" />
                </UFormField>
                <UFormField label="联系电话">
                  <UInput
                    v-model="contact.phone"
                    class="w-full"
                    :data-testid="index === 0 ? 'partners-edit-phone' : 'partners-edit-contact-phone-' + index"
                  />
                </UFormField>
                <UFormField label="邮箱">
                  <UInput
                    v-model="contact.email"
                    class="w-full"
                    :data-testid="index === 0 ? 'partners-edit-email' : 'partners-edit-contact-email-' + index"
                  />
                </UFormField>
              </div>
              <div class="mt-2 flex justify-end">
                <UButton
                  label="移除"
                  icon="i-carbon-trash-can"
                  size="xs"
                  color="error"
                  variant="ghost"
                  :disabled="editForm.contacts.length === 1"
                  :data-testid="'partners-edit-contact-remove-' + index"
                  @click="removeContact(index)"
                />
              </div>
            </div>
          </div>
        </UForm>
      </template>

      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            label="取消"
            color="neutral"
            variant="ghost"
            @click="editOpen = false"
          />
          <UButton
            :label="editing ? '保存' : '创建伙伴'"
            type="submit"
            form="partner-editor"
            color="primary"
            data-testid="partners-edit-save"
          />
        </div>
      </template>
    </USlideover>
  </div>
</template>
