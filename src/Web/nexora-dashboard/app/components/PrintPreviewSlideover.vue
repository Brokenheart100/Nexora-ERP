<script setup lang="ts">
const props = defineProps<{
  title: string
  alertDescription: string
  emptyTitle: string
  emptyDescription: string
  hasDocument: boolean
  testId: string
  alertTestId?: string
  closeTestId: string
  printTestId: string
}>()

const open = defineModel<boolean>('open', { default: false })
const toast = useToast()

function printNow() {
  if (!props.hasDocument) return
  window.print()
  toast.add({
    title: '已调用浏览器打印',
    description: '在系统打印对话框中选择打印机或「另存为 PDF」。',
    color: 'neutral',
    icon: 'i-carbon-printer'
  })
}
</script>

<template>
  <USlideover v-model:open="open" :ui="{ content: 'w-full sm:max-w-3xl' }" :data-testid="testId">
    <template #header>
      <div>
        <p class="text-xs text-muted">
          打印预览
        </p>
        <h2 class="mt-1 text-base font-semibold text-highlighted">
          {{ title }}
        </h2>
      </div>
    </template>

    <template #body>
      <div class="space-y-3" :data-testid="testId">
        <UAlert
          color="neutral"
          variant="soft"
          icon="i-carbon-printer"
          title="使用浏览器打印输出"
          :description="alertDescription"
          :data-testid="alertTestId"
        />
        <div v-if="hasDocument" class="rounded-sm border border-default bg-elevated/60 p-3">
          <div class="mx-auto max-w-180 shadow-sm">
            <slot />
          </div>
        </div>
        <UEmpty
          v-else
          icon="i-carbon-printer"
          :title="emptyTitle"
          :description="emptyDescription"
        />
      </div>
    </template>

    <template #footer>
      <div class="flex w-full items-center justify-between gap-2">
        <UButton
          label="关闭"
          color="neutral"
          variant="ghost"
          :data-testid="closeTestId"
          @click="open = false"
        />
        <UButton
          label="打印"
          icon="i-carbon-printer"
          :disabled="!hasDocument"
          :data-testid="printTestId"
          @click="printNow"
        />
      </div>
    </template>
  </USlideover>

  <Teleport v-if="open && hasDocument" to="body">
    <div data-print-document class="hidden print:block">
      <slot />
    </div>
  </Teleport>
</template>
