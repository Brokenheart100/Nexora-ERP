<script setup lang="ts">
interface Preview {
  chartRevision: number; fileHash: string; currency: string; debit: string; credit: string
  rows: { row: number; code: string; name: string; debit: string; credit: string }[]
  errors: { row: number | null; message: string }[]
}
const props = defineProps<{ path: string; startsOn: string; minorUnits: number }>()
const emit = defineEmits<{ imported: [id: string] }>()
const submit = useWorkspaceMutation()
const file = ref('')
const memo = ref('')
const preview = shallowRef<Preview>()
const previewedFile = ref('')
const busy = ref(false)
const shown = ref(false)
const message = ref('')

const money = (value: string) => formatDecimal(value, props.minorUnits)
async function run(action: () => Promise<void>) {
  if (busy.value) return
  busy.value = true
  message.value = ''
  try { await action() }
  catch (error) { message.value = (error as { data?: { detail?: string } }).data?.detail ?? '期初导入未完成，请重新核对。' }
  finally { busy.value = false }
}
async function readFile(event: Event) {
  const selected = (event.target as HTMLInputElement).files?.[0]
  if (!selected) return
  if (selected.size > 256 * 1024) {
    file.value = ''
    preview.value = undefined
    message.value = '请选择不超过 256 KiB 的期初余额 CSV。'
    return
  }
  file.value = await selected.text()
}
function previewFile() {
  return run(async () => {
    const input = file.value
    const csrf = await $fetch<{ requestToken: string }>('/bff/antiforgery', { retry: 0 })
    preview.value = await $fetch<Preview>(props.path + '/opening-balances/preview', {
      method: 'POST', retry: 0, body: { on: props.startsOn, file: input }, headers: { 'X-CSRF-TOKEN': csrf.requestToken },
    })
    previewedFile.value = input
  })
}
function createDraft() {
  const current = preview.value
  if (!current || current.errors.length || file.value !== previewedFile.value) return
  return run(async () => {
    const result = await submit<{ id: string }>('opening-balances-import', props.path + '/opening-balances/import', 'POST', {
      on: props.startsOn, memo: memo.value, file: file.value, fileHash: current.fileHash, chartRevision: current.chartRevision,
    })
    preview.value = undefined
    file.value = ''
    emit('imported', result.id)
  })
}
</script>

<template>
  <section aria-label="导入总账期初" class="my-4 space-y-3">
    <UButton v-if="!shown" type="button" variant="outline" color="neutral" @click="shown = true">导入总账期初</UButton>
    <template v-else>
      <h4>导入总账期初</h4>
      <form @submit.prevent="previewFile">
        <fieldset :disabled="busy" class="space-y-2">
          <legend>开账日期 {{ startsOn }}</legend>
          <UFormField label="期初余额 CSV" name="openingCsv">
            <UTextarea v-model="file" placeholder="Code,Debit,Credit" class="w-full" required maxlength="262144" />
          </UFormField>
          <UFormField label="选择 CSV 文件" name="openingFile">
            <UInput type="file" accept=".csv,text/csv" @change="readFile" />
          </UFormField>
          <UButton type="submit">预览期初余额</UButton>
        </fieldset>
      </form>
      <p v-if="message" role="alert">{{ message }}</p>
      <template v-if="preview && file === previewedFile">
        <p>合计借方 {{ money(preview.debit) }} · 贷方 {{ money(preview.credit) }} {{ preview.currency }}</p>
        <ul v-if="preview.errors.length">
          <li v-for="error in preview.errors" :key="String(error.row) + error.message">{{ error.row ? '第 ' + error.row + ' 行 · ' : '' }}{{ error.message }}</li>
        </ul>
        <ul v-else>
          <li v-for="row in preview.rows" :key="row.code">{{ row.code }} · {{ row.name }} · 借 {{ money(row.debit) }} / 贷 {{ money(row.credit) }}</li>
        </ul>
        <form v-if="!preview.errors.length" @submit.prevent="createDraft">
          <UFormField label="期初摘要" name="openingMemo">
            <UInput v-model="memo" :disabled="busy" required maxlength="300" />
          </UFormField>
          <UButton type="submit" :disabled="busy">创建期初导入草稿</UButton>
        </form>
      </template>
    </template>
  </section>
</template>
