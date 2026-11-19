<script setup lang="ts">
interface Numbering { pattern: string | null; startingNumber: number; version: number }
const props = defineProps<{ base: string }>()
const emit = defineEmits<{ changed: [] }>()
const settings = shallowRef<Numbering>()
const pattern = ref('')
const start = ref(1)
const on = ref('')
const preview = ref('')
const error = ref('')
const busy = ref(false)
const submit = useWorkspaceMutation()
const path = computed(() => props.base + '/invoice-numbering')

async function run(task: () => Promise<void>) {
  if (busy.value) return
  error.value = ''
  busy.value = true
  try { await task() }
  catch (failure) { error.value = (failure as { data?: { detail?: string } }).data?.detail ?? '无法读取或保存发票编号设置。' }
  finally { busy.value = false }
}
function opened(value: Numbering) {
  settings.value = value
  pattern.value = value.pattern ?? ''
  start.value = value.startingNumber
  preview.value = ''
}
function load() {
  return run(async () => opened(await $fetch<Numbering>(path.value, { retry: 0 })))
}
function save() {
  return run(async () => {
    if (!settings.value) return
    opened(await submit<Numbering>('invoice-numbering', path.value, 'PUT', {
      expectedVersion: settings.value.version, pattern: pattern.value.trim() || null, startingNumber: start.value,
    }))
    emit('changed')
  })
}
function showPreview() {
  return run(async () => {
    preview.value = (await $fetch<{ number: string }>(path.value + '/preview', { query: { on: on.value }, retry: 0 })).number
  })
}
</script>

<template>
  <section class="my-4">
    <UButton v-if="!settings" type="button" variant="outline" :loading="busy" @click="load">发票编号设置</UButton>
    <UAlert v-if="error" role="alert" color="error" :description="error" />
    <template v-if="settings">
      <form class="flex flex-wrap items-end gap-3" @submit.prevent="save">
        <UFormField label="财年编号格式" description="留空使用手工编号。格式示例 INV-{FY}-{####}">
          <UInput v-model="pattern" maxlength="55" />
        </UFormField>
        <UFormField label="起始号" required>
          <UInput v-model.number="start" type="number" :min="settings.startingNumber" :max="999999999" required />
        </UFormField>
        <UButton type="submit" :loading="busy">保存编号设置</UButton>
      </form>
      <form v-if="settings.pattern" class="my-3 flex flex-wrap items-end gap-3" @submit.prevent="showPreview">
        <UFormField label="预览开票日期" required><UInput v-model="on" type="date" required @update:model-value="preview = ''" /></UFormField>
        <UButton type="submit" variant="outline" :disabled="busy">预览发票编号</UButton>
      </form>
      <p v-if="preview" role="status">预计编号 {{ preview }}</p>
    </template>
  </section>
</template>
