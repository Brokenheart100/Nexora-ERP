<script setup lang="ts">
interface Row {
  id: string; kind: number; reference: string; name: string; quantity: string; amount: string; dueOn?: string
}
interface Preview {
  fileHash: string; chartRevision: number; on: string; currency: string; rows: Row[]
  errors: { row: number | null; message: string }[]
}
interface Batch {
  id: string; state: string; version: number; on: string; currency: string; fileHash: string; isMaker: boolean
  rejection: string | null; rows: Row[]; postings: { rowId: string; journalId: string | null }[]
  checks: { rowId: string; imported: string; subledger: string; ledger: string; matched: boolean }[]
}
const props = defineProps<{
  base: string; minorUnits: number; canDraft: boolean; canPost: boolean
  equity: { id: string; code: string; name: string }[]
}>()
const emit = defineEmits<{ journal: [id: string] }>()
const submit = useWorkspaceMutation()
const open = ref(false)
const busy = ref(false)
const message = ref('')
const file = ref('')
const equityId = ref('')
const previewed = shallowRef<{ file: string; equityId: string; result: Preview }>()
const batch = shallowRef<Batch>()
const preview = computed(() => previewed.value?.file === file.value && previewed.value.equityId === equityId.value
  ? previewed.value.result : undefined)
const canSubmit = computed(() => props.canDraft && (!batch.value || ['cancelled', 'rejected'].includes(batch.value.state)))
const equityOptions = computed(() => props.equity.map(x => ({ label: `${x.code} · ${x.name}`, value: x.id })))
const labels = ['期初库存', '客户未结应收', '供应商未结应付', '银行现金']
const states: Record<string, string> = {
  submitted: '待独立复核', applyingstock: '库存入账处理中', posted: '已过账', rejected: '库存校验拒绝', cancelled: '已撤销',
}
const money = (value: string) => formatDecimal(value, props.minorUnits)

async function run(action: () => Promise<void>) {
  if (busy.value) return
  busy.value = true
  message.value = ''
  try { await action() }
  catch (error) { message.value = (error as { data?: { detail?: string } }).data?.detail ?? '期初子账操作失败，请刷新核对。' }
  finally { busy.value = false }
}

async function refresh() {
  batch.value = (await $fetch<Batch[]>(props.base, { retry: 0 }))[0]
}

function show() {
  open.value = true
  return run(refresh)
}

async function readFile(event: Event) {
  const selected = (event.target as HTMLInputElement).files?.[0]
  if (!selected) return
  if (selected.size > 256 * 1024) {
    file.value = ''
    message.value = '请选择不超过 256 KiB 的 CSV。'
    return
  }
  file.value = await selected.text()
}

function previewFile() {
  return run(async () => {
    const input = { file: file.value, equityAccountId: equityId.value }
    const csrf = await $fetch<{ requestToken: string }>('/bff/antiforgery', { retry: 0 })
    const result = await $fetch<Preview>(props.base + '/preview', {
      method: 'POST', retry: 0, body: input, headers: { 'X-CSRF-TOKEN': csrf.requestToken },
    })
    previewed.value = { file: input.file, equityId: input.equityAccountId, result }
  })
}

function submitBatch() {
  if (!preview.value || preview.value.errors.length) return
  const { fileHash, chartRevision } = preview.value
  return run(async () => {
    batch.value = await submit<Batch>('submit-opening-subledger', props.base, 'POST', {
      equityAccountId: equityId.value, file: file.value, fileHash, chartRevision,
    })
    file.value = ''
    previewed.value = undefined
  })
}

function decide(decision: 'approve' | 'cancel') {
  const current = batch.value
  if (!current) return
  return run(async () => {
    await submit('decide-opening-subledger', `${props.base}/${current.id}/decision`, 'POST', { expectedVersion: current.version, decision })
    await refresh()
  })
}
</script>

<template>
  <section aria-label="期初子账批量导入" class="my-4 space-y-3">
    <UButton v-if="!open" type="button" variant="outline" color="neutral" @click="show">打开期初子账导入</UButton>
    <template v-else>
      <h4>期初子账批量导入</h4>
      <p v-if="message" role="alert">{{ message }}</p>
      <UButton type="button" variant="outline" color="neutral" :disabled="busy" @click="run(refresh)">刷新期初批次</UButton>
      <form v-if="canSubmit" @submit.prevent="previewFile">
        <fieldset :disabled="busy" class="space-y-2">
          <legend>期初库存、未结应收应付及银行现金</legend>
          <UFormField label="期初权益对方科目" name="openingSubledgerEquity">
            <USelect v-model="equityId" :items="equityOptions" placeholder="选择权益科目" />
          </UFormField>
          <UFormField label="期初子账 CSV" name="openingSubledgerCsv">
            <UTextarea v-model="file" placeholder="Kind,Reference,ResourceId,WarehouseId,Quantity,Amount,DueOn"
              class="w-full" required maxlength="262144" />
          </UFormField>
          <p>类型为 stock、receivable、payable、bank。库存填写仓库 UUID 和数量，应收应付填写原到期日。</p>
          <UFormField label="选择期初子账文件" name="openingSubledgerFile">
            <UInput type="file" accept=".csv,text/csv" @change="readFile" />
          </UFormField>
          <UButton type="submit" :disabled="!equityId">预览期初子账</UButton>
        </fieldset>
      </form>
      <template v-if="preview">
        <ul v-if="preview.errors.length">
          <li v-for="error in preview.errors" :key="String(error.row) + error.message">{{ error.row }} {{ error.message }}</li>
        </ul>
        <template v-else>
          <p>切账 {{ preview.on }} · {{ preview.currency }}</p>
          <ul><li v-for="row in preview.rows" :key="row.id">{{ labels[row.kind] }} · {{ row.reference }} · {{ row.name }} · {{ money(row.amount) }}</li></ul>
          <UButton type="button" :disabled="busy" @click="submitBatch">提交期初批次</UButton>
        </template>
      </template>
      <template v-if="batch">
        <p role="status">批次状态 {{ states[batch.state] }} · {{ batch.on }} · {{ batch.currency }}</p>
        <p v-if="batch.rejection" role="alert">{{ batch.rejection }}</p>
        <ul v-if="batch.state !== 'posted'">
          <li v-for="row in batch.rows" :key="row.id">{{ labels[row.kind] }} · {{ row.reference }} · {{ row.name }} · {{ money(row.amount) }}</li>
        </ul>
        <UButton v-if="batch.state === 'submitted' && canPost && !batch.isMaker" type="button" :disabled="busy" @click="decide('approve')">复核并过账期初批次</UButton>
        <UButton v-if="batch.state === 'submitted' && canDraft && batch.isMaker" type="button" :disabled="busy" @click="decide('cancel')">撤销期初批次</UButton>
        <template v-if="batch.state === 'posted'">
          <h5>批次对账</h5>
          <ul>
            <li v-for="(check, index) in batch.checks" :key="check.rowId" class="flex flex-wrap items-center gap-2">
              {{ batch.rows[index]?.reference }} · 导入 {{ money(check.imported) }} · 子账 {{ money(check.subledger) }} · 总账 {{ money(check.ledger) }}
              · {{ check.matched ? '一致' : '存在差异' }}
              <UButton
                v-if="batch.postings[index]?.journalId" type="button" size="xs" variant="outline"
                @click="emit('journal', batch.postings[index]!.journalId!)">查看期初凭证</UButton>
            </li>
          </ul>
        </template>
      </template>
    </template>
  </section>
</template>
