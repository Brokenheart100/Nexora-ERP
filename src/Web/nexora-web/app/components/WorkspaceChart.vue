<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'

interface AccountInput { code: string; name: string; category: string; parentCode: string | null; purpose: string; isArchived: boolean }
interface Account extends AccountInput { id: string; version: number; isUsed: boolean }
interface Chart { revision: number; canManage: boolean; canImport: boolean; canExport: boolean; accounts: Account[] }
interface Preview {
  previewId: string | null
  revision: number
  fileHash: string
  changes: { row: number | null; code: string; name: string; action: string }[]
  errors: { row: number | null; code: string | null; message: string }[]
}
const props = defineProps<{ workspaceId: string }>()
const path = computed(() => `/bff/api/finance/workspaces/${props.workspaceId}/chart`)
const submit = useWorkspaceMutation()
const chart = shallowRef<Chart>()
const preview = shallowRef<Preview>()
const draft = ref<{ revision: number; version: number | null; account: AccountInput }>()
const file = ref('')
const format = ref('nexora-json')
const mode = ref('append')
const confirmReplace = ref(false)
const busy = ref(false)
const message = ref('')
const categories = { asset: '资产', liability: '负债', equity: '权益', income: '收入', expense: '费用' }
const purposes = { posting: '可过账', group: '分组', control: '统驭' }
const actions = { add: '新增', update: '更新', keep: '保留', archive: '归档' }
const parentChoices = computed(() => chart.value?.accounts.filter(x => x.purpose === 'group'
  && x.category === draft.value?.account.category && x.code !== draft.value?.account.code) ?? [])
const categoryOptions = Object.entries(categories).map(([value, label]) => ({ label, value }))
const purposeOptions = Object.entries(purposes).map(([value, label]) => ({ label, value }))
const formatOptions = [
  { label: 'Nexora JSON', value: 'nexora-json' },
  { label: 'Nexora CSV', value: 'nexora-csv' },
  { label: 'Xero CSV', value: 'xero-csv' },
  { label: 'QuickBooks CSV', value: 'qbo-csv' },
]
const modeOptions = [
  { label: '追加', value: 'append' },
  { label: '按编码更新', value: 'upsert' },
  { label: '空账替换', value: 'replace' },
]
const parentOptions = computed(() => [
  { label: '根科目', value: 'root' },
  ...parentChoices.value.map(account => ({ label: `${account.code} · ${account.name}`, value: account.code })),
])
const columns = computed<TableColumn<Account>[]>(() => {
  const base: TableColumn<Account>[] = [
    { accessorKey: 'code', header: '编码' },
    { accessorKey: 'name', header: '名称' },
    { id: 'parent', header: '上级', accessorFn: account => account.parentCode || '—' },
    { id: 'purpose', header: '用途', accessorFn: account => purposes[account.purpose as keyof typeof purposes] },
    { id: 'state', header: '状态', accessorFn: account => account.isArchived ? '已归档' : '启用' },
  ]
  if (chart.value?.canManage) base.push({ id: 'actions', header: '操作' })
  return base
})

watch([file, format, mode], () => {
  preview.value = undefined
  confirmReplace.value = false
})

function updateDraft(field: 'code' | 'name' | 'category' | 'parentCode' | 'purpose', value: unknown) {
  if (!draft.value) return
  const account = draft.value.account
  if (field === 'parentCode') account.parentCode = value === 'root' ? null : String(value)
  else if (field === 'code' || field === 'name') account[field] = String(value).trim()
  else account[field] = String(value)
}

function describeError(error: unknown) {
  const response = error as { statusCode?: number; data?: { detail?: string } }
  return response.data?.detail ?? (response.statusCode === 409 ? '版本或操作冲突，请刷新后核对。'
    : response.statusCode === 403 ? '当前账号没有操作权限。' : '未能确认结果，请刷新后核对。')
}

async function load() { chart.value = await $fetch<Chart>(path.value, { retry: 0 }) }

async function run(action: () => Promise<void>) {
  if (busy.value) return
  busy.value = true
  message.value = ''
  try { await action() }
  catch (error) { message.value = describeError(error) }
  finally { busy.value = false }
}

function edit(account?: Account) {
  if (!chart.value) return
  draft.value = {
    revision: chart.value.revision,
    version: account?.version ?? null,
    account: account
      ? { code: account.code, name: account.name, category: account.category, parentCode: account.parentCode, purpose: account.purpose, isArchived: account.isArchived }
      : { code: '', name: '', category: 'asset', parentCode: null, purpose: 'posting', isArchived: false },
  }
}

function save() {
  const current = draft.value
  if (!current) return
  return run(async () => {
    await submit('chart-account', `${path.value}/accounts`, 'POST', {
      expectedRevision: current.revision, expectedVersion: current.version, account: current.account,
    })
    draft.value = undefined
    await load()
    message.value = '科目已保存。'
  })
}

async function pickFile(event: Event) {
  const input = event.target as HTMLInputElement
  const selected = input.files?.[0]
  if (!selected) return
  if (selected.size > 256 * 1024) {
    message.value = '请选择不超过 256 KiB 的文件。'
    input.value = ''
    return
  }
  await run(async () => { file.value = await selected.text() })
}

function previewImport() {
  return run(async () => {
    preview.value = undefined
    const csrf = await $fetch<{ requestToken: string }>('/bff/antiforgery', { retry: 0 })
    preview.value = await $fetch<Preview>(`${path.value}/imports/preview`, {
      method: 'POST', headers: { 'X-CSRF-TOKEN': csrf.requestToken }, retry: 0,
      body: { mode: mode.value, format: format.value, file: file.value },
    })
  })
}

function commit() {
  const id = preview.value?.previewId
  if (!id || (mode.value === 'replace' && !confirmReplace.value)) return
  return run(async () => {
    await submit('chart-import', `${path.value}/imports/${id}/commit`, 'POST', {})
    preview.value = undefined
    await load()
    message.value = '科目导入已提交。'
  })
}

function download(kind: 'template' | 'structure' | 'snapshot') {
  return run(async () => {
    const payload = await $fetch(`${path.value}/exports/${kind}`, { retry: 0 })
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `nexora-chart-${kind}.json`
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  })
}
</script>

<template>
  <section class="chart" aria-labelledby="chart-heading">
    <h3 id="chart-heading">科目管理</h3>
    <UButton variant="outline" color="neutral" size="sm" :disabled="busy" @click="run(load)">{{ chart ? '刷新科目' : '打开科目管理' }}</UButton>
    <UAlert v-if="message" role="status" :description="message" />
    <template v-if="chart">
      <div class="mb-3 mt-2 flex flex-wrap gap-2">
        <UButton v-if="chart.canManage" color="primary" :disabled="busy" @click="edit()">新增科目</UButton>
        <template v-if="chart.canExport">
          <UButton variant="outline" color="neutral" size="sm" :disabled="busy" @click="download('template')">导出模板</UButton>
          <UButton variant="outline" color="neutral" size="sm" :disabled="busy" @click="download('structure')">导出科目结构</UButton>
          <UButton variant="outline" color="neutral" size="sm" :disabled="busy" @click="download('snapshot')">导出科目快照</UButton>
        </template>
      </div>
      <UTable
        data-testid="chart-accounts"
        :loading="busy"
        :data="chart.accounts"
        :columns="columns"
        :get-row-id="account => account.id"
        :ui="{ td: 'align-top whitespace-normal', th: 'whitespace-nowrap' }"
      >
        <template #actions-cell="{ row }">
          <UButton v-if="chart?.canManage" variant="outline" color="neutral" size="xs" :disabled="busy" @click="edit(row.original)">编辑科目 {{ row.original.code }}</UButton>
        </template>
      </UTable>
      <form v-if="chart.canManage && draft" @submit.prevent="save">
        <fieldset :disabled="busy">
          <legend>{{ draft.version ? '编辑科目' : '新建科目' }}</legend>
          <UFormField label="科目编码" name="accountCode">
            <UInput :model-value="draft.account.code" :readonly="draft.version !== null" required maxlength="40" @update:model-value="value => updateDraft('code', value)" />
          </UFormField>
          <UFormField label="科目名称" name="accountName">
            <UInput :model-value="draft.account.name" required maxlength="160" @update:model-value="value => updateDraft('name', value)" />
          </UFormField>
          <UFormField label="科目类别" name="accountCategory">
            <USelect :model-value="draft.account.category" :items="categoryOptions" :disabled="draft.version !== null" @update:model-value="value => updateDraft('category', value)" />
          </UFormField>
          <UFormField label="上级科目" name="accountParentCode">
            <USelect :model-value="draft.account.parentCode ?? 'root'" :items="parentOptions" @update:model-value="value => updateDraft('parentCode', value)" />
          </UFormField>
          <UFormField label="科目用途" name="accountPurpose">
            <USelect :model-value="draft.account.purpose" :items="purposeOptions" @update:model-value="value => updateDraft('purpose', value)" />
          </UFormField>
          <UCheckbox v-model="draft.account.isArchived" label="归档科目" />
          <div class="mb-3 mt-2 flex flex-wrap gap-2"><UButton type="submit" color="primary">保存科目</UButton><UButton type="button" variant="outline" color="neutral" size="sm" @click="draft = undefined">取消</UButton></div>
        </fieldset>
      </form>
      <form v-if="chart.canImport" @submit.prevent="previewImport">
        <fieldset :disabled="busy">
          <legend>导入科目</legend>
          <UFormField label="来源格式" name="importFormat">
            <USelect :model-value="format" :items="formatOptions" @update:model-value="value => format = String(value)" />
          </UFormField>
          <UFormField label="导入模式" name="importMode">
            <USelect :model-value="mode" :items="modeOptions" @update:model-value="value => mode = String(value)" />
          </UFormField>
          <label>科目文件<input type="file" accept=".json,.csv" @change="pickFile"></label>
          <UFormField label="科目文件内容" name="chartFileContent">
            <UTextarea :model-value="file" :rows="4" maxlength="262144" required @update:model-value="value => file = String(value)" />
          </UFormField>
          <UButton type="submit" color="primary">预览导入</UButton>
        </fieldset>
      </form>
      <section v-if="preview" aria-label="导入预览">
        <h4>导入预览</h4>
        <ul v-if="preview.errors.length">
          <li v-for="(issue, index) in preview.errors" :key="index">{{ issue.row ? `第 ${issue.row} 行 ` : '' }}{{ issue.code }} {{ issue.message }}</li>
        </ul>
        <ul>
          <li v-for="change in preview.changes" :key="change.code">
            {{ actions[change.action as keyof typeof actions] }} · {{ change.code }} · {{ change.name }}
          </li>
        </ul>
        <UCheckbox v-if="preview.previewId && mode === 'replace'" v-model="confirmReplace" label="确认归档本次未包含的科目" />
        <UButton v-if="preview.previewId" color="primary" :disabled="busy || (mode === 'replace' && !confirmReplace)" @click="commit">提交导入</UButton>
      </section>
    </template>
  </section>
</template>

<style scoped>
.chart { margin-top: 20px; min-width: 0 }
fieldset { min-width: 0; display: grid; gap: 10px; border: 1px solid #d1d9e6; border-radius: 8px; margin: 12px 0; padding: 12px }
label { display: grid; gap: 4px }
</style>
