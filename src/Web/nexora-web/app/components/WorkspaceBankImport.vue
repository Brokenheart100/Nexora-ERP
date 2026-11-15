<script setup lang="ts">
interface Line { id: string; bankId: string; on: string; amount: string; description: string; externalId: string; matched: string; excluded: boolean; version: number }
interface Movement { id: string; on: string; amount: string; matched: string; voided: boolean; journalId: string }
interface Match { id: string; amount: string; reversed: boolean }
interface Preview { previewId: string | null; rows: { entry: { row: number; externalId: string; amount: string }; duplicate: boolean }[]; errors: { row: number; message: string }[] }
const props = defineProps<{ path: string; bankId: string; canSubmit: boolean; canApprove: boolean }>()
const emit = defineEmits<{ useLine: [line: Line] }>()
const submit = useWorkspaceMutation()
const base = computed(() => `${props.path}/banks/${props.bankId}`)
const busy = ref(false)
const notice = ref('')
const mapping = reactive({ externalId: 'Reference', date: 'Date', amount: 'Amount', description: 'Description' })
const file = ref('')
const preview = shallowRef<Preview>()
const lines = shallowRef<Line[]>([])
const movements = shallowRef<Movement[]>([])
const matches = shallowRef<Match[]>([])
const lineId = ref('')
const movementId = ref('')
const amount = ref('')
const reason = ref('')
const selected = computed(() => lines.value.find(x => x.id === lineId.value))
const lineOptions = computed(() => lines.value.map(line => ({
  label: `${line.on} · ${line.externalId} · ${line.amount} · ${line.description}`, value: line.id,
})))
const movementOptions = computed(() => availableMovements.value.map(movement => ({
  label: `${movement.on} · ${movement.amount} · 已匹配 ${movement.matched}`, value: movement.id,
})))
function setText<T extends object>(target: T, key: keyof T, value: string | number) {
  ;(target as Record<string, unknown>)[key as string] = String(value).trim()
}
const availableMovements = computed(() => movements.value.filter(x => !x.voided && x.amount.startsWith('-') === selected.value?.amount.startsWith('-')))
watch([file, mapping], () => { preview.value = undefined })

async function run(action: () => Promise<void>) {
  if (busy.value) return
  busy.value = true; notice.value = ''
  try { await action() }
  catch (error) { notice.value = (error as { data?: { detail?: string } }).data?.detail || '操作结果待确认，请先刷新。' }
  finally { busy.value = false }
}
async function reload() {
  const options = { retry: 0 as const }
  const [loadedLines, loadedMovements] = await Promise.all([
    $fetch<Line[]>(`${base.value}/statement`, options), $fetch<Movement[]>(`${base.value}/movements`, options),
  ])
  lines.value = loadedLines; movements.value = loadedMovements
  await loadMatches()
}
async function loadMatches() {
  matches.value = selected.value ? await $fetch<Match[]>(`${props.path}/statement/${lineId.value}/matches`, { retry: 0 }) : []
}
function selectLine() {
  movementId.value = ''
  amount.value = ''
  return run(loadMatches)
}
function importPreview() {
  return run(async () => {
    const csrf = await $fetch<{ requestToken: string }>('/bff/antiforgery', { retry: 0 })
    preview.value = await $fetch<Preview>(`${props.path}/imports/preview`, {
      method: 'POST',
      headers: { 'X-CSRF-TOKEN': csrf.requestToken }, retry: 0,
      body: { bankId: props.bankId, file: file.value, mapping: { ...mapping } }
    })
  })
}
function importCommit() {
  return run(async () => {
    const id = preview.value?.previewId
    if (!id) return
    const result = await submit<{ count: number }>('bank-import', `${props.path}/imports/${id}/commit`, 'POST', {})
    file.value = ''
    await reload()
    notice.value = `导入完成，新增 ${result.count} 行待审核数据。`
  })
}
function attach() {
  return run(async () => {
    if (!selected.value) return
    await submit('attach-statement', `${props.path}/statement/${lineId.value}/matches`, 'POST', {
      expectedVersion: selected.value.version, movementId: movementId.value, amount: amount.value,
    })
    amount.value = ''
    await reload()
  })
}
function release(match: Match) {
  return run(async () => {
    await submit('release-statement', `${props.path}/matches/${match.id}/release`, 'POST', { reason: reason.value })
    reason.value = ''
    await reload()
  })
}
function toggleExcluded() {
  return run(async () => {
    if (!selected.value) return
    await submit('exclude-statement', `${props.path}/statement/${lineId.value}/exclude`, 'POST', {
      expectedVersion: selected.value.version, exclude: !selected.value.excluded, reason: reason.value,
    })
    reason.value = ''
    await reload()
  })
}
async function pickFile(event: Event) {
  const upload = (event.target as HTMLInputElement).files?.[0]
  if (!upload) return
  if (upload.size > 262144) { notice.value = '文件超过 256 KiB。'; return }
  file.value = await upload.text()
}
</script>

<template>
  <section aria-label="对账单导入与审核">
    <UButton type="button" variant="outline" color="neutral" size="sm" :disabled="busy" @click="run(reload)">读取银行流水与待审核行</UButton>
    <UAlert v-if="notice" role="status" :description="notice" />
    <form v-if="canSubmit" @submit.prevent="importPreview">
      <fieldset :disabled="busy">
        <legend>银行 CSV 预览</legend>
        <p>使用 UTF-8，日期为 YYYY-MM-DD。收入填正数，支出填负数。</p>
        <label>对账单文件<input type="file" accept=".csv,text/csv" @change="pickFile"></label>
        <UFormField label="CSV 内容" name="csvContent" required>
          <UTextarea v-model="file" :rows="5" required class="w-full" />
        </UFormField>
        <UFormField label="流水标识列" name="externalIdColumn" required>
          <UInput :model-value="mapping.externalId" required @update:model-value="value => setText(mapping, 'externalId', value)" />
        </UFormField>
        <UFormField label="日期列" name="dateColumn" required>
          <UInput :model-value="mapping.date" required @update:model-value="value => setText(mapping, 'date', value)" />
        </UFormField>
        <UFormField label="带符号金额列" name="amountColumn" required>
          <UInput :model-value="mapping.amount" required @update:model-value="value => setText(mapping, 'amount', value)" />
        </UFormField>
        <UFormField label="摘要列" name="descriptionColumn" required>
          <UInput :model-value="mapping.description" required @update:model-value="value => setText(mapping, 'description', value)" />
        </UFormField>
        <UButton variant="outline" color="neutral" size="sm" type="submit">预览银行导入</UButton>
        <template v-if="preview">
          <ul>
            <li v-for="issue in preview.errors" :key="issue.row + issue.message">第 {{ issue.row }} 行 · {{ issue.message
            }}</li>
          </ul>
          <ul>
            <li v-for="row in preview.rows" :key="row.entry.row">
              {{ row.entry.externalId }} · {{ row.entry.amount }} · {{ row.duplicate ? '已存在' : '待导入' }}
            </li>
          </ul>
          <UButton v-if="preview.previewId" color="primary" type="button" @click="importCommit">提交银行导入</UButton>
        </template>
      </fieldset>
    </form>
    <ul>
      <li v-for="movement in movements" :key="movement.id">
        {{ movement.on }} · {{ movement.amount }} · 已匹配 {{ movement.matched }} · 凭证 {{ movement.journalId }}{{
          movement.voided ? ' · 已作废' : '' }}
      </li>
    </ul>
    <UFormField v-if="lines.length" label="待审核对账单行" name="statementLine">
      <USelect :model-value="lineId" :items="lineOptions" :disabled="busy" placeholder="选择一行"
        @update:model-value="value => { lineId = String(value); void selectLine() }" />
    </UFormField>
    <template v-if="selected">
      <p>{{ selected.excluded ? '已排除' : '待审核' }} · 已匹配 {{ selected.matched }} · 账单金额 {{ selected.amount }}</p>
      <UButton
v-if="canSubmit && !selected.excluded && selected.matched === '0'" type="button" variant="outline" color="neutral" size="sm"
        @click="emit('useLine', selected)">用该行创建收付单据</UButton>
      <form v-if="canApprove && !selected.excluded" @submit.prevent="attach">
        <fieldset :disabled="busy">
          <legend>匹配已过账流水</legend>
          <UFormField label="已过账银行流水" name="movementId" required>
            <USelect v-model="movementId" :items="movementOptions" placeholder="选择流水" />
          </UFormField>
          <UFormField label="分配金额" name="allocateAmount" required>
            <UInput :model-value="amount" required inputmode="decimal" @update:model-value="value => amount = String(value).trim()" />
          </UFormField>
          <UButton type="submit" color="primary">确认分配</UButton>
        </fieldset>
      </form>
      <UFormField v-if="canApprove" label="撤销或排除原因" name="reason">
        <UInput :model-value="reason" maxlength="300" @update:model-value="value => reason = String(value).trim()" />
      </UFormField>
      <UButton
v-if="canApprove && selected.matched === '0'" variant="outline" color="neutral" size="sm" type="button" :disabled="busy || !reason"
        @click="toggleExcluded">{{ selected.excluded ? '恢复审核' : '排除对账行' }}</UButton>
      <ul>
        <li v-for="match in matches" :key="match.id">
          {{ match.amount }} · {{ match.reversed ? '已撤销' : '有效匹配' }}
          <UButton
v-if="canApprove && !match.reversed" variant="outline" color="neutral" size="xs" type="button" :disabled="busy || !reason"
            @click="release(match)">撤销匹配</UButton>
        </li>
      </ul>
    </template>
  </section>
</template>

<style scoped>
fieldset,
label {
  display: grid;
  gap: 6px;
  min-width: 0
}

fieldset {
  margin: 12px 0;
  border: 1px solid #d1d9e6;
  border-radius: 8px
}

select,
textarea {
  max-width: 100%;
  font: inherit
}

li {
  overflow-wrap: anywhere
}
</style>
