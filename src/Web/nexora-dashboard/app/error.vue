<script setup lang="ts">
import type { NuxtError } from '#app'
import { workspaces } from '~/mocks'

const props = defineProps<{
  error: NuxtError
}>()

const workspaceStore = useWorkspaceStore()

const statusCode = computed(() => Number(props.error.statusCode) || 500)

const meta = computed(() => {
  if (statusCode.value === 403) {
    return {
      title: '没有访问权限',
      description: '当前演示身份没有该工作区或资源的访问权限。',
      icon: 'i-carbon-locked',
      hint: '纯 UI 阶段没有真实权限服务；可以切换到其他工作区，或返回工作台继续浏览。'
    }
  }
  if (statusCode.value === 404) {
    return {
      title: '页面不存在',
      description: '请检查地址是否正确，或返回工作台继续浏览本地原型。',
      icon: 'i-carbon-help',
      hint: '命令面板（⌘K）可以搜索页面、商品、伙伴与单据。'
    }
  }
  return {
    title: '页面出错了',
    description: '本地原型在渲染该页面时遇到异常，刷新后即可恢复模拟数据。',
    icon: 'i-carbon-warning-alt',
    hint: '这不会影响其他页面；所有数据仅存在于当前浏览器会话。'
  }
})

const workspaceItems = computed(() => workspaces.map(workspace => ({
  label: workspace.name,
  icon: workspace.id === workspaceStore.activeWorkspaceId ? 'i-carbon-checkmark' : 'i-carbon-workspace',
  onSelect: () => switchWorkspace(workspace.id)
})))

useSeoMeta({
  title: meta.value.title,
  description: meta.value.description
})

useHead({
  htmlAttrs: {
    lang: 'zh-CN'
  }
})

function goHome() {
  clearError({ redirect: '/' })
}

function switchWorkspace(id: string) {
  workspaceStore.setWorkspace(id)
  clearError({ redirect: '/' })
}

function reload() {
  reloadNuxtApp()
}
</script>

<template>
  <UApp>
    <div class="flex min-h-svh flex-col items-center justify-center gap-3 bg-muted px-6 py-16 text-center">
      <p class="text-xs font-semibold tracking-[0.16em] text-primary">
        NEXORA ERP · UI 原型
      </p>
      <div class="flex size-14 items-center justify-center rounded-sm bg-default text-primary ring ring-default">
        <UIcon :name="meta.icon" class="size-7" />
      </div>
      <p class="font-mono text-5xl font-semibold text-highlighted">
        {{ statusCode }}
      </p>
      <h1 class="text-xl font-semibold text-highlighted" data-testid="error-title">
        {{ meta.title }}
      </h1>
      <p class="max-w-md text-sm leading-6 text-muted">
        {{ props.error.message || meta.description }}
      </p>
      <p class="max-w-md text-xs text-dimmed">
        {{ meta.hint }}
      </p>

      <div class="mt-2 flex flex-wrap items-center justify-center gap-2">
        <UButton
          label="返回工作台"
          color="primary"
          icon="i-carbon-arrow-left"
          @click="goHome"
        />
        <UDropdownMenu
          v-if="statusCode === 403"
          :items="workspaceItems"
          :content="{ align: 'center' }"
        >
          <UButton
            label="切换工作区"
            color="neutral"
            variant="outline"
            icon="i-carbon-workspace"
            data-testid="error-switch-workspace"
          />
        </UDropdownMenu>
        <UButton
          v-if="statusCode === 500"
          label="重新加载"
          color="neutral"
          variant="outline"
          icon="i-carbon-renew"
          @click="reload"
        />
      </div>
      <p class="mt-6 text-xs text-dimmed">
        本地 UI 原型 · 模拟数据 · 不连接后端服务
      </p>
    </div>
  </UApp>
</template>
