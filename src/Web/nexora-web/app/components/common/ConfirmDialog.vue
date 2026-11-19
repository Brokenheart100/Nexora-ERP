<script setup lang="ts">
const open = defineModel<boolean>('open', { default: false })

withDefaults(defineProps<{
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  color?: 'primary' | 'error'
}>(), {
  description: undefined,
  confirmLabel: '确认',
  cancelLabel: '取消',
  color: 'primary',
})

const emit = defineEmits<{ close: [value: boolean] }>()
const settled = ref(false)

function settle(value: boolean) {
  if (settled.value) return
  settled.value = true
  emit('close', value)
}

watch(open, (value) => {
  if (!value) settle(false)
})
</script>

<template>
  <UModal v-model:open="open" :title="title" :description="description">
    <template #footer>
      <div class="confirm-actions">
        <UButton color="neutral" variant="ghost" @click="settle(false)">{{ cancelLabel }}</UButton>
        <UButton :color="color" @click="settle(true)">{{ confirmLabel }}</UButton>
      </div>
    </template>
  </UModal>
</template>

<style scoped>
.confirm-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  width: 100%;
}
</style>
