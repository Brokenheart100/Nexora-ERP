<script setup lang="ts">
import type { SetupSnapshot } from '~/utils/workspaceSetup'

interface Presentation {
  legalName: string
  brandName: string
  accentColor: string
  dateFormat: string
  timeZone: string
  logoDataUrl: string | null
}
interface Settings { baseCurrency: string; version: number; presentation: Presentation; canManage: boolean }
interface BookSettings { baseCurrency: string; minorUnits: number; startsOn: string; fiscalYearStartMonth: number; template: string }
interface Account { id: string; code: string; name: string; category: string }
interface Book { isPersonal: boolean; canInitialize: boolean; settings: BookSettings | null; accounts: Account[] }
interface TaxRate { id: string; code: string; name: string; effectiveOn: string; rate: string }
interface TaxGroup { code: string; name: string; version: number; rateCodes: string[] }
interface TaxSetup { canManage: boolean; rates: TaxRate[]; groups: TaxGroup[]; classifications: unknown[] }

const props = defineProps<{ workspaceId: string }>()
const store = useWorkspaceStore()
const submit = useWorkspaceMutation()

const workspace = computed(() => store.workspaces.find(item => item.id === props.workspaceId))
const settingsPath = computed(() => '/bff/api/workspaces/' + props.workspaceId)
const financePath = computed(() => '/bff/api/finance/workspaces/' + props.workspaceId)

const settings = shallowRef<Settings>()
const book = shallowRef<Book>()
const tax = shallowRef<TaxSetup>()
const draft = ref<Presentation>()
const bookDraft = reactive({ startsOn: '', fiscalYearStartMonth: 1 })
const stepIndex = ref(0)
const loading = ref(true)
const busy = ref(false)
const taxBusy = ref(false)
const notice = ref('')
const error = ref('')
const dateFormatOptions = [
  { label: '年-月-日', value: 'yyyy-MM-dd' },
  { label: '日/月/年', value: 'dd/MM/yyyy' },
  { label: '中文日期', value: 'yyyy年MM月dd日' },
]
const monthOptions = Array.from({ length: 12 }, (_, index) => ({ label: `${index + 1} 月`, value: index + 1 }))
function setTrimmed(field: 'legalName' | 'brandName' | 'timeZone', value: string | number) {
  if (!draft.value) return
  draft.value[field] = String(value).trim()
}

const categoryLabels: Record<string, string> = {
  asset: '资产', liability: '负债', equity: '权益', income: '收入', expense: '费用',
}
const standardRates = [
  { code: 'VAT13', name: '增值税 13%（货物销售）', rate: '0.13' },
  { code: 'VAT09', name: '增值税 9%（交通运输与建筑）', rate: '0.09' },
  { code: 'VAT06', name: '增值税 6%（现代服务）', rate: '0.06' },
  { code: 'VAT00', name: '增值税 0%（免税项目）', rate: '0' },
]

function snapshot(): SetupSnapshot {
  return {
    settingsVersion: settings.value?.version ?? 0,
    bookInitialized: Boolean(book.value?.settings),
    taxConfigured: (tax.value?.rates.length ?? 0) > 0 || (tax.value?.groups.length ?? 0) > 0,
  }
}

const steps = computed(() => setupSteps(snapshot()))
const complete = computed(() => setupComplete(snapshot()))
const currentStep = computed(() => steps.value[stepIndex.value])
const canAdvance = computed(() => Boolean(currentStep.value?.done))
const canManage = computed(() => settings.value?.canManage ?? false)
const baseCurrency = computed(() => settings.value?.baseCurrency ?? workspace.value?.baseCurrency ?? 'CNY')
const countryCode = computed(() => workspace.value?.countryCode ?? 'CN')
const accountSummary = computed(() => {
  const counts = new Map<string, number>()
  for (const account of book.value?.accounts ?? []) counts.set(account.category, (counts.get(account.category) ?? 0) + 1)
  return [...counts.entries()].map(([category, count]) => (categoryLabels[category] ?? category) + ' ' + count)
})
const starterPreview = computed(() => (book.value?.accounts ?? []).slice(0, 12))
const hiddenAccounts = computed(() => Math.max((book.value?.accounts.length ?? 0) - starterPreview.value.length, 0))
const rateCount = computed(() => tax.value?.rates.length ?? 0)
const groupCount = computed(() => tax.value?.groups.length ?? 0)
const hasStandardRates = computed(() => Boolean(tax.value?.rates.some(entry => entry.code === 'VAT13')))

function todayIso() {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return String(now.getFullYear()) + '-' + month + '-' + day
}

async function refreshTax() {
  try { tax.value = await $fetch<TaxSetup>(financePath.value + '/tax', { retry: 0 }) }
  catch { tax.value = undefined }
}

async function load() {
  loading.value = true
  error.value = ''
  notice.value = ''
  try {
    const [loadedSettings, loadedBook] = await Promise.all([
      $fetch<Settings>(settingsPath.value + '/settings', { retry: 0 }),
      $fetch<Book>(financePath.value + '/book', { retry: 0 }),
    ])
    settings.value = loadedSettings
    book.value = loadedBook
    draft.value = { ...loadedSettings.presentation }
    if (loadedBook.settings) {
      bookDraft.startsOn = loadedBook.settings.startsOn
      bookDraft.fiscalYearStartMonth = loadedBook.settings.fiscalYearStartMonth
    } else {
      bookDraft.startsOn = todayIso()
    }
    await refreshTax()
    stepIndex.value = resumeStepIndex(snapshot())
  } catch {
    error.value = '暂时无法读取初始化数据，请重试。'
  } finally {
    loading.value = false
  }
}

async function saveCompany() {
  if (busy.value || !settings.value || !draft.value) return
  busy.value = true
  notice.value = ''
  error.value = ''
  try {
    const csrf = await $fetch<{ requestToken: string }>('/bff/antiforgery', { retry: 0 })
    settings.value = await $fetch<Settings>(settingsPath.value + '/settings', {
      method: 'PUT',
      headers: { 'X-CSRF-TOKEN': csrf.requestToken },
      body: { expectedVersion: settings.value.version, presentation: draft.value },
      retry: 0,
    })
    draft.value = { ...settings.value.presentation }
    notice.value = '公司资料已保存，可以继续下一步。'
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode
    error.value = status === 409 ? '设置版本已更新，请刷新后重试。'
      : status === 400 ? '请核对名称、时区、日期格式与 PNG 标志。'
      : '未能确认保存，请刷新后核对结果。'
  } finally {
    busy.value = false
  }
}

async function initializeBook() {
  if (busy.value || !book.value?.canInitialize) return
  busy.value = true
  notice.value = ''
  error.value = ''
  try {
    book.value = await submit<Book>('setup-book', financePath.value + '/book', 'POST', {
      baseCurrency: baseCurrency.value,
      startsOn: bookDraft.startsOn,
      fiscalYearStartMonth: bookDraft.fiscalYearStartMonth,
    })
    notice.value = '账簿已初始化，已生成标准科目模板。'
    await refreshTax()
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode
    if (status === 409) {
      await refreshBook()
      if (book.value?.settings) notice.value = '账簿已初始化，已载入现有设置。'
      else error.value = '账簿参数与已有设置不一致，请核对开账日期与会计年度。'
    } else {
      error.value = status === 400 ? '请核对开账日期与会计年度起始月。'
        : '初始化结果尚未确认，保持内容不变手动重试会复用操作编号。'
    }
  } finally {
    busy.value = false
  }
}

async function refreshBook() {
  try { book.value = await $fetch<Book>(financePath.value + '/book', { retry: 0 }) }
  catch { /* 保留现有状态，用户可重试 */ }
}

async function addStandardTaxes() {
  if (taxBusy.value) return
  taxBusy.value = true
  notice.value = ''
  error.value = ''
  try {
    const effectiveOn = todayIso()
    for (const entry of standardRates) {
      if (tax.value?.rates.some(rate => rate.code === entry.code)) continue
      await submit('setup-rate-' + entry.code, financePath.value + '/tax/rates', 'POST', { ...entry, effectiveOn })
    }
    const existing = tax.value?.groups.find(group => group.code === 'STANDARD')
    if (!existing || existing.rateCodes.length !== standardRates.length) {
      await submit('setup-group-STANDARD', financePath.value + '/tax/groups', 'POST', {
        code: 'STANDARD',
        name: '标准税率组',
        expectedVersion: existing?.version ?? 0,
        rateCodes: standardRates.map(entry => entry.code),
      })
    }
    await refreshTax()
    notice.value = '标准税率与税组已保存，税制步骤可完成。'
  } catch (err) {
    const detail = (err as { data?: { detail?: string } }).data?.detail
    error.value = detail || '税务配置未完成，请稍后重试。'
    await refreshTax()
  } finally {
    taxBusy.value = false
  }
}

function next() {
  if (stepIndex.value < steps.value.length - 1 && canAdvance.value) stepIndex.value += 1
}
function back() {
  if (stepIndex.value > 0) stepIndex.value -= 1
}
function later() {
  return navigateTo('/')
}
function finish() {
  return navigateTo('/?workspace=' + props.workspaceId)
}

onMounted(() => { void load() })
</script>

<template>
  <section class="setup card" aria-labelledby="setup-heading">
    <header class="setup-head">
      <div>
        <h2 id="setup-heading"><UIcon class="mr-2 inline-block size-[1.08em] align-[-0.16em] text-nx-primary" name="i-lucide-list-checks" aria-hidden="true" />工作区初始化</h2>
        <p class="setup-sub" data-testid="setup-sub">
          {{ workspace ? workspace.name : '新工作区' }} · 本位币 {{ baseCurrency }} · 国家/地区 {{ countryCode }}
        </p>
      </div>
      <span class="setup-progress">{{ steps.filter(step => step.done).length }} / {{ steps.length }} 步完成</span>
    </header>

    <UAlert v-if="notice" role="status" :description="notice" />
    <UAlert v-if="error" role="alert" color="error" icon="i-lucide-circle-alert" :description="error" />

    <ol class="setup-steps" aria-label="初始化步骤">
      <li v-for="(step, index) in steps" :key="step.id" :class="{ done: step.done, current: index === stepIndex }"
        :aria-current="index === stepIndex ? 'step' : undefined">
        <span class="setup-index" aria-hidden="true">{{ step.done ? '✓' : index + 1 }}</span>
        <span>{{ step.label }}</span>
        <span v-if="step.optional" class="setup-optional">可选</span>
      </li>
    </ol>

    <div v-if="loading" class="space-y-3 py-2" role="status" aria-label="正在读取初始化状态">
      <USkeleton class="h-5 w-48" />
      <USkeleton class="h-4 w-full" />
    </div>
    <div v-else-if="!settings" class="setup-empty">
      <UButton variant="outline" color="neutral" size="sm" type="button" @click="load">重试读取</UButton>
    </div>
    <template v-else-if="draft">
      <section v-if="stepIndex === 0" class="setup-step" aria-labelledby="setup-company">
        <h3 id="setup-company">第 1 步 · 公司资料</h3>
        <p class="setup-hint">本位币与注册国家/地区由创建工作区时确定；本步骤维护对外展示的名称、品牌与时区。</p>
        <form @submit.prevent="saveCompany">
          <fieldset :disabled="busy || !canManage">
            <UFormField label="法定名称" name="legalName" required>
              <UInput :model-value="draft.legalName" required maxlength="160" @update:model-value="value => setTrimmed('legalName', value)" />
            </UFormField>
            <UFormField label="品牌名称" name="brandName" required>
              <UInput :model-value="draft.brandName" required maxlength="160" @update:model-value="value => setTrimmed('brandName', value)" />
            </UFormField>
            <UFormField label="品牌颜色" name="accentColor">
              <UInput v-model="draft.accentColor" type="color" />
            </UFormField>
            <UFormField label="公司时区" name="timeZone" required>
              <UInput :model-value="draft.timeZone" required maxlength="80" placeholder="Asia/Shanghai" @update:model-value="value => setTrimmed('timeZone', value)" />
            </UFormField>
            <UFormField label="日期格式" name="dateFormat">
              <USelect v-model="draft.dateFormat" :items="dateFormatOptions" />
            </UFormField>
            <UButton color="primary" type="submit" :disabled="busy">保存公司资料</UButton>
          </fieldset>
        </form>
      </section>

      <section v-else-if="stepIndex === 1" class="setup-step" aria-labelledby="setup-book">
        <h3 id="setup-book">第 2 步 · 会计年度与开账</h3>
        <p class="setup-hint">初始化账簿会按模板生成起始科目，并固定核算起点与会计年度起始月。</p>
        <dl class="setup-summary">
          <dt>账簿本位币</dt><dd>{{ baseCurrency }}</dd>
          <dt>当前状态</dt><dd>{{ book?.settings ? '已初始化' : '未初始化' }}</dd>
        </dl>
        <form v-if="book && !book.settings" @submit.prevent="initializeBook">
          <fieldset :disabled="busy || !book.canInitialize">
            <UFormField label="开账日期" name="startsOn" required>
              <UInput v-model="bookDraft.startsOn" type="date" required />
            </UFormField>
            <UFormField label="会计年度起始月" name="fiscalYearStartMonth">
              <USelect v-model="bookDraft.fiscalYearStartMonth" :items="monthOptions" />
            </UFormField>
            <UButton color="primary" type="submit" :disabled="busy">初始化账簿</UButton>
          </fieldset>
        </form>
        <p v-else-if="book?.settings" class="setup-summary">
          账簿已初始化：核算起点 {{ book.settings.startsOn }} · 会计年度起始 {{ book.settings.fiscalYearStartMonth }} 月 · 模板
          {{ book.settings.template }}
        </p>
        <p v-if="book && !book.settings && !book.canInitialize" class="setup-hint">
          当前账号无权初始化账簿，请联系工作区所有者。
        </p>
      </section>

      <section v-else-if="stepIndex === 2" class="setup-step" aria-labelledby="setup-chart">
        <h3 id="setup-chart">第 3 步 · 科目模板</h3>
        <p class="setup-hint">初始化账簿时已按标准模板生成起始科目，可稍后在科目表中导入或调整。</p>
        <p v-if="accountSummary.length" class="setup-summary">科目构成：{{ accountSummary.join(' · ') }}</p>
        <ul v-if="starterPreview.length" class="setup-accounts">
          <li v-for="account in starterPreview" :key="account.id">{{ account.code }} · {{ account.name }}</li>
        </ul>
        <p v-if="hiddenAccounts" class="setup-hint">另有 {{ hiddenAccounts }} 个科目未展开。</p>
        <p v-if="!book?.settings" class="setup-hint">请先完成第 2 步初始化账簿。</p>
      </section>

      <section v-else class="setup-step" aria-labelledby="setup-tax">
        <h3 id="setup-tax">第 4 步 · 税制（可选）</h3>
        <p class="setup-hint">可一键生成中国增值税标准税率与标准税率组；也可稍后在税务配置中维护。</p>
        <dl class="setup-summary">
          <dt>税率</dt><dd>{{ rateCount }} 项</dd>
          <dt>税率组</dt><dd>{{ groupCount }} 组</dd>
        </dl>
        <ul v-if="tax?.rates.length" class="setup-accounts">
          <li v-for="entry in tax.rates" :key="entry.id">{{ entry.code }} · {{ entry.name }} · {{ entry.rate }}</li>
        </ul>
        <UButton variant="outline" color="neutral" size="sm" type="button" :disabled="taxBusy || !(tax?.canManage ?? false)" @click="addStandardTaxes">
          {{ hasStandardRates ? '补齐标准税率与税组' : '添加标准税率与税组' }}
        </UButton>
      </section>

      <div class="setup-actions">
        <UButton v-if="stepIndex > 0" variant="outline" color="neutral" size="sm" type="button" :disabled="busy" @click="back">上一步</UButton>
        <UButton variant="outline" color="neutral" size="sm" type="button" :disabled="busy" @click="later">稍后继续</UButton>
        <UButton v-if="stepIndex < steps.length - 1" color="primary" type="button" :disabled="busy || !canAdvance"
          @click="next">
          下一步
        </UButton>
        <UButton v-else color="primary" type="button" :disabled="busy || !complete" @click="finish">完成初始化</UButton>
      </div>
      <p class="setup-hint">稍后继续会保留已完成步骤；再次打开向导会从第一个未完成步骤继续。</p>
    </template>
  </section>
</template>

<style scoped>
.setup { margin-top: 20px; min-width: 0 }
.setup-head { display: flex; flex-wrap: wrap; align-items: flex-start; justify-content: space-between; gap: 12px }
.setup-sub { margin: 4px 0 0; color: var(--nx-ink-3) }
.setup-progress { font-size: 12px; font-weight: 600; color: var(--nx-ink-3) }
.setup-steps { display: flex; flex-wrap: wrap; gap: 8px; margin: 16px 0; padding: 0; list-style: none }
.setup-steps li { display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; border: 1px solid var(--nx-border); border-radius: 999px; font-size: 13px; color: var(--nx-ink-3) }
.setup-steps li.current { border-color: var(--nx-primary); color: var(--nx-primary-strong); font-weight: 600 }
.setup-steps li.done { color: var(--nx-ink) }
.setup-index { display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 20px; border-radius: 999px; background: var(--nx-surface-muted); font-size: 12px }
.setup-steps li.done .setup-index { background: var(--nx-primary-soft); color: var(--nx-primary-strong) }
.setup-optional { font-size: 11px; color: var(--nx-ink-4) }
.setup-step { border-top: 1px solid var(--nx-border); padding-top: 16px }
.setup-step h3 { margin: 0 0 8px }
.setup-hint { margin: 8px 0; color: var(--nx-ink-3); font-size: 13px }
.setup-summary { margin: 8px 0; display: flex; flex-wrap: wrap; gap: 8px 16px }
.setup-summary dt { font-weight: 600 }
.setup-summary dd { margin: 0 }
.setup-accounts { margin: 8px 0; padding-left: 18px; columns: 2; font-size: 13px }
.setup-empty { margin: 12px 0 }
.setup-actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 20px }
fieldset { display: grid; gap: 10px; margin: 12px 0; border: 1px solid var(--nx-border); border-radius: 8px; padding: 12px; min-width: 0 }
label { display: grid; gap: 4px }
select { font: inherit; padding: 8px; border: 1px solid var(--nx-border); border-radius: 6px; background: var(--nx-surface) }
input[type='color'] { width: 60px; height: 38px; padding: 4px }
</style>
