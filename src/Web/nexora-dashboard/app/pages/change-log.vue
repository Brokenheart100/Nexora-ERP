<script setup lang="ts">
import type { ChangeEntityType } from '~/mocks'
import { changeEntityLabels, changeLogEntries } from '~/mocks'

const toast = useToast()
const route = useRoute()
const { workspace, activeWorkspaceId } = useMockWorkspace()
const { loading, run: runRefresh } = useMockRefresh()
const { isLoading: stateLoading, isEmpty, isError, isForbidden } = useMockState()

const type = ref<'all' | ChangeEntityType>('all')
const actor = ref('all')
const pageSize = 10

const showSkeleton = computed(() => loading.value || stateLoading.value)

const workspaceEntries = computed(() => changeLogEntries
  .filter(entry => entry.workspaceId === activeWorkspaceId.value)
  .slice()
  .sort((a, b) => b.at.localeCompare(a.at)))

const typeItems = [
  { label: '全部实体类型', value: 'all' },
  ...(Object.entries(changeEntityLabels) as [ChangeEntityType, string][]).map(([value, label]) => ({ label, value }))
]

const actorItems = computed(() => {
  const actors = [...new Set(workspaceEntries.value.map(entry => entry.actor))]
  return [{ label: '全部操作者', value: 'all' }, ...actors.map(value => ({ label: value, value }))]
})

const filteredEntries = computed(() => {
  if (isForbidden.value || isError.value || isEmpty.value) return []
  return workspaceEntries.value.filter((entry) => {
    if (type.value !== 'all' && entry.entityType !== type.value) return false
    if (actor.value !== 'all' && entry.actor !== actor.value) return false
    return true
  })
})

const {
  page,
  pageRows,
  pageStart,
  pageEnd,
  resetPage
} = useClientPagination(filteredEntries, pageSize)

watch([type, actor], resetPage)

const activeFilters = computed(() => type.value !== 'all' || actor.value !== 'all')

function resetFilters() {
  type.value = 'all'
  actor.value = 'all'
}

const emptyTitle = computed(() => (activeFilters.value ? '没有匹配的变更记录' : '当前工作区还没有变更记录'))

const emptyDescription = computed(() => (activeFilters.value
  ? '当前实体类型或操作者筛选没有匹配结果，试试调整筛选条件。'
  : '创建或修改商品、伙伴、采购单后，变更会自动记录在这里。'))

function refreshChangeLog() {
  runRefresh(() => {
    toast.add({
      title: '变更记录已刷新',
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
    <UDashboardPanel id="change-log">
      <template #header>
        <UDashboardNavbar title="变更记录">
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
          </template>
        </UDashboardNavbar>

        <UDashboardToolbar :ui="{ root: 'flex-wrap gap-3 py-2.5' }">
          <template #left>
            <USelect
              v-model="type"
              :items="typeItems"
              size="sm"
              class="w-44"
              data-testid="change-log-type"
            />
            <USelect
              v-model="actor"
              :items="actorItems"
              size="sm"
              class="w-36"
              data-testid="change-log-actor"
            />
            <UButton
              v-if="activeFilters"
              label="重置"
              icon="i-carbon-reset"
              color="neutral"
              variant="ghost"
              size="sm"
              data-testid="change-log-reset"
              @click="resetFilters"
            />
          </template>

          <template #right>
            <p class="text-xs text-muted">
              共 {{ filteredEntries.length }} 条记录
            </p>
            <UTooltip text="刷新记录">
              <UButton
                icon="i-carbon-renew"
                color="neutral"
                variant="ghost"
                size="sm"
                :loading="loading"
                aria-label="刷新变更记录"
                data-testid="change-log-refresh"
                @click="refreshChangeLog"
              />
            </UTooltip>
          </template>
        </UDashboardToolbar>
      </template>

      <template #body>
        <AppBreadcrumb current="变更记录" class="mb-3" />
        <UCard class="nx-reveal rounded-sm" :ui="{ body: 'p-0 sm:p-0', footer: 'p-0 sm:p-0' }">
          <div v-if="showSkeleton" class="space-y-3 p-4" data-testid="change-log-skeleton">
            <USkeleton v-for="n in 6" :key="n" class="h-12 w-full" />
          </div>
          <div v-else-if="isError" class="p-6" data-testid="change-log-state-error">
            <UAlert
              color="error"
              variant="soft"
              icon="i-carbon-warning-alt"
              title="变更记录加载失败（演示）"
              description="?state=error 会模拟一次加载失败。本原型不会访问后端。"
              :actions="[{ label: '恢复正常', color: 'neutral', variant: 'outline', size: 'sm', onClick: reloadPage }]"
            />
          </div>
          <div v-else-if="isForbidden" class="py-6" data-testid="change-log-state-forbidden">
            <UEmpty
              variant="naked"
              icon="i-carbon-view-off"
              title="没有变更记录读取权限（演示）"
              description="?state=forbidden 模拟演示身份缺少 catalog.view 权限。"
              :actions="[{ label: '恢复正常', color: 'neutral', variant: 'outline', size: 'sm', onClick: reloadPage }]"
            />
          </div>
          <div v-else-if="isEmpty" class="py-6" data-testid="change-log-state-empty">
            <UEmpty
              variant="naked"
              icon="i-carbon-time"
              title="空状态演示"
              description="?state=empty 让变更记录返回 0 条数据；真实空态会引导清空筛选。"
              :actions="[{ label: '恢复正常', color: 'neutral', variant: 'outline', size: 'sm', onClick: reloadPage }]"
            />
          </div>
          <div v-else :key="'change-log-page-' + page" class="p-4 sm:p-5">
            <p class="mb-4 text-[11px] text-dimmed">
              当前工作区：{{ workspace?.name ?? activeWorkspaceId }} · 仅展示该工作区的变更
            </p>
            <ChangeLogTimeline :entries="pageRows" :empty-title="emptyTitle" :empty-description="emptyDescription">
              <template #empty>
                <div data-testid="change-log-empty-panel">
                  <UEmpty
                    variant="naked"
                    icon="i-carbon-time"
                    :title="emptyTitle"
                    :description="emptyDescription"
                    :actions="[{ label: '清空筛选', color: 'neutral', variant: 'outline', size: 'sm', onClick: resetFilters }]"
                  />
                </div>
              </template>
            </ChangeLogTimeline>
          </div>

          <template #footer>
            <div v-if="!showSkeleton && !isError && !isForbidden && !isEmpty" class="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5">
              <p class="text-xs text-muted">
                第 {{ pageStart }}–{{ pageEnd }} 条，共 {{ filteredEntries.length }} 条
              </p>
              <UPagination
                v-model:page="page"
                :total="filteredEntries.length"
                :items-per-page="pageSize"
                size="sm"
                data-testid="change-log-pagination"
              />
            </div>
          </template>
        </UCard>
        <p class="mt-2 text-[11px] text-dimmed">
          本地原型 · 模拟数据 · 变更记录来自 app/mocks/changeLog.ts
        </p>
      </template>
    </UDashboardPanel>
  </div>
</template>
