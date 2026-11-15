<script setup lang="ts">
interface Book {
  isPersonal: boolean
  canInitialize: boolean
  settings: { baseCurrency: string; minorUnits: number; startsOn: string; fiscalYearStartMonth: number; template: string } | null
  accounts: { id: string; code: string; name: string; category: string }[]
}
const props = defineProps<{ workspaceId: string }>()
const path = computed(() => `/bff/api/finance/workspaces/${props.workspaceId}/book`)
const submit = useWorkspaceMutation()
const book = shallowRef<Book>()
const busy = ref(false)
const notice = ref('')
const draft = reactive({ baseCurrency: 'CNY', startsOn: '', fiscalYearStartMonth: 1 })
const currencyOptions = [
  { label: 'CNY', value: 'CNY' },
  { label: 'USD', value: 'USD' },
  { label: 'EUR', value: 'EUR' },
  { label: 'JPY', value: 'JPY' },
]
const categoryLabels: Record<string, string> = { asset: '资产', liability: '负债', equity: '权益', income: '收入', expense: '费用' }

async function open() {
  busy.value = true
  notice.value = ''
  try { book.value = await $fetch<Book>(path.value, { retry: 0 }) }
  catch { book.value = undefined; notice.value = '暂时无法读取账簿。' }
  finally { busy.value = false }
}

async function initialize() {
  if (busy.value) return
  busy.value = true
  notice.value = ''
  try {
    book.value = await submit<Book>('book-initialize', path.value, 'POST', { ...draft })
    notice.value = '账簿已初始化。'
  } catch (error) {
    const status = (error as { statusCode?: number }).statusCode
    notice.value = status === 409 ? '账簿已初始化，请刷新查看。'
      : status === 400 ? '请核对币种、核算起点和会计年度。'
      : '初始化结果尚未确认。保持内容不变手动重试会复用操作编号。'
  } finally { busy.value = false }
}

function exportChart() {
  const current = book.value
  if (!current?.settings) return
  const structure = {
    format: 'nexora.chart-structure.v1',
    template: current.settings.template,
    accounts: current.accounts.map(({ code, name, category }) => ({ code, name, category })),
  }
  const url = URL.createObjectURL(new Blob([JSON.stringify(structure, null, 2)], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = 'nexora-chart-structure.json'
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

onMounted(() => { void open().catch(() => { /* 首屏加载失败时保留空状态，可用模块内按钮重试 */ }) })
</script>

<template>
  <section class="card book" aria-labelledby="book-heading">
    <h2 id="book-heading"><UIcon class="heading-icon" name="i-lucide-book-open" aria-hidden="true" />账簿设置</h2>
    <button class="quiet" :disabled="busy" @click="open">{{ book ? '刷新账簿' : '打开账簿设置' }}</button>
    <UAlert v-if="notice" role="status" :description="notice" />
    <template v-if="book">
      <template v-if="book.settings">
        <h3>{{ book.isPersonal ? '个人起始科目' : '商贸起始科目' }}</h3>
        <dl>
          <dt>账簿本位币</dt><dd>{{ book.settings.baseCurrency }}</dd>
          <dt>核算起点</dt><dd>{{ book.settings.startsOn }}</dd>
          <dt>会计年度</dt><dd>每年 {{ book.settings.fiscalYearStartMonth }} 月开始</dd>
        </dl>
        <ul>
          <li v-for="account in book.accounts" :key="account.id">
            {{ account.code }} · {{ account.name }} · {{ categoryLabels[account.category] }}
          </li>
        </ul>
        <button class="quiet" :disabled="busy" @click="exportChart">导出起始科目</button>
        <WorkspaceChart :workspace-id="workspaceId" />
        <WorkspaceTaxes :workspace-id="workspaceId" />
        <WorkspaceReadiness v-if="book.canInitialize || !book.isPersonal" :workspace-id="workspaceId" />
        <WorkspaceLedger v-if="book.canInitialize || !book.isPersonal" :workspace-id="workspaceId" />
        <WorkspaceTrade v-if="!book.isPersonal" :workspace-id="workspaceId" />
      </template>
      <form v-else-if="book.canInitialize" @submit.prevent="initialize">
        <fieldset :disabled="busy">
          <legend>初始化{{ book.isPersonal ? '个人' : '企业' }}账簿</legend>
          <UFormField label="账簿本位币" name="baseCurrency">
            <USelect :model-value="draft.baseCurrency" :items="currencyOptions" @update:model-value="value => draft.baseCurrency = String(value)" />
          </UFormField>
          <UFormField label="核算起点" name="startsOn">
            <UInput :model-value="draft.startsOn" type="date" required min="1900-01-01" max="9998-12-31" @update:model-value="value => draft.startsOn = String(value)" />
          </UFormField>
          <UFormField label="会计年度起始月" name="fiscalYearStartMonth">
            <UInput :model-value="draft.fiscalYearStartMonth" type="number" required min="1" max="12" @update:model-value="value => draft.fiscalYearStartMonth = Number(value) || 0" />
          </UFormField>
          <p>初始化将建立起始科目，并固定本位币、核算起点和年度设置。</p>
          <button class="primary">初始化账簿</button>
        </fieldset>
      </form>
      <p v-else>等待工作区所有者初始化账簿。</p>
    </template>
  </section>
</template>

<style scoped>
.book { margin-top: 20px; min-width: 0 }
fieldset { margin-top: 16px; border: 1px solid #d1d9e6; border-radius: 8px; padding: 12px; display: grid; gap: 10px; min-width: 0 }
</style>
