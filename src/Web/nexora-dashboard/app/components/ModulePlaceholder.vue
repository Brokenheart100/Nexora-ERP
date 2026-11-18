<script setup lang="ts">
defineProps<{
  id: string
  title: string
  description: string
  icon: string
  mockSummary: string
  features: string[]
}>()

const { workspace } = useMockWorkspace()
const { loading, run } = useMockRefresh(360)

const card = ref<HTMLElement | null>(null)
const entered = ref(false)

// 切换工作区后重新“取”一次模拟数据：展示骨架并让汇总文案跟随工作区变化。
watch(() => workspace.value.id, () => run())

useIntersectionObserver(card, ([entry]) => {
  if (entry?.isIntersecting) entered.value = true
}, { threshold: 0.2 })
</script>

<template>
  <div class="contents">
    <UDashboardPanel :id="id">
      <template #header>
        <UDashboardNavbar :title="title">
          <template #leading>
            <UDashboardSidebarCollapse />
          </template>

          <template #right>
            <NotificationButton />
            <UBadge
              label="纯 UI 阶段"
              color="neutral"
              variant="subtle"
              size="sm"
            />
          </template>
        </UDashboardNavbar>
      </template>

      <template #body>
        <AppBreadcrumb :current="title" class="mb-3" />

        <div v-if="loading" class="space-y-4" data-testid="module-skeleton">
          <UCard class="rounded-sm" :ui="{ body: 'space-y-3 p-6 sm:p-8' }">
            <USkeleton class="h-4 w-40" />
            <USkeleton class="h-3 w-full max-w-2xl" />
            <USkeleton class="h-3 w-3/4 max-w-xl" />
          </UCard>
          <UCard class="rounded-sm" :ui="{ body: 'space-y-2 p-6 sm:p-8' }">
            <USkeleton class="h-3 w-24" />
            <USkeleton class="h-3 w-full" />
            <USkeleton class="h-3 w-5/6" />
          </UCard>
        </div>

        <div v-else ref="card" class="space-y-4">
          <UCard
            class="rounded-sm"
            :class="entered ? 'nx-reveal' : ''"
            :ui="{ body: 'p-6 sm:p-8' }"
          >
            <div class="flex flex-wrap items-start gap-4">
              <div class="flex size-12 items-center justify-center rounded-sm bg-primary/10 text-primary">
                <UIcon :name="icon" class="size-6" />
              </div>
              <div class="min-w-0 flex-1">
                <h2 class="text-lg font-semibold text-highlighted">
                  {{ title }}
                </h2>
                <p class="mt-1 max-w-2xl text-sm text-muted">
                  {{ description }}
                </p>
              </div>
              <UBadge
                label="模拟数据已就绪"
                color="info"
                variant="subtle"
                size="sm"
              />
            </div>

            <div class="mt-6 flex flex-wrap gap-2">
              <UBadge
                v-for="feature in features"
                :key="feature"
                :label="feature"
                color="neutral"
                variant="outline"
                size="sm"
                icon="i-carbon-checkmark"
              />
            </div>

            <p class="mt-4 text-xs text-dimmed">
              当前工作区 · {{ workspace.name }} · 本地原型 · {{ mockSummary }}
            </p>
          </UCard>

          <UAlert
            color="neutral"
            variant="soft"
            icon="i-carbon-information"
            title="B1 壳层页面"
            description="面包屑、侧栏入口与工作区切换已就绪；业务界面将在后续波次使用本地模拟数据实现，本页面不会发起网络请求。"
          />
        </div>
      </template>
    </UDashboardPanel>
  </div>
</template>
