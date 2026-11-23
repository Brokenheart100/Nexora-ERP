<script setup lang="ts">
import type { CompanyProfile } from '~/mocks'
import { companyProfiles } from '~/mocks'
import type { ChartTemplateId, SetupStepId, TaxRegimeId } from '~/stores/workspaceSetup'
import { chartTemplateOptions, setupStepIds, taxRegimeOptions } from '~/stores/workspaceSetup'

const auth = useAuthSessionStore()
const live = useLiveSessionStore()

const toast = useToast()
const route = useRoute()
const setup = useWorkspaceSetupStore()
const org = useOrganizationStore()
const session = useSessionStore()
const { workspace, activeWorkspaceId } = useMockWorkspace()

const stepMeta: Array<{ id: SetupStepId, title: string, description: string, icon: string }> = [
  { id: 'company', title: '公司资料', description: '确认开票与报表使用的主体信息', icon: 'i-carbon-building' },
  { id: 'fiscal', title: '会计年度与开账', description: '设置年度区间和期初余额', icon: 'i-carbon-calendar' },
  { id: 'accounts', title: '科目模板', description: '选择一套可用的会计科目表', icon: 'i-carbon-book' },
  { id: 'tax', title: '可选税制', description: '选择增值税处理方式，可稍后调整', icon: 'i-carbon-receipt' }
]

const activeStep = ref<SetupStepId>('company')
const setupError = ref('')
const openingConfirmed = ref(setup.openingConfirmed)
const selectedTemplate = ref<ChartTemplateId>(setup.chartTemplate)
const selectedTax = ref<TaxRegimeId>(setup.taxRegime)
const fiscalYearStart = ref(setup.fiscalYearStart)
const fiscalYearEnd = ref(setup.fiscalYearEnd)
const openingDate = ref(setup.openingDate)

const profile = computed<CompanyProfile>(
  () => org.profileMap[activeWorkspaceId.value] ?? companyProfiles['ws-hq']!
)
const form = reactive<CompanyProfile>({ ...profile.value })

const currentMeta = computed(() => stepMeta.find(item => item.id === activeStep.value) ?? stepMeta[0]!)
const completedCount = computed(() => setup.completedSteps.length)

const openingRows = [
  { label: '库存商品', value: 286400, hint: '按仓库结存与移动平均成本' },
  { label: '应收账款', value: 486200, hint: '未结发票与未核销收款' },
  { label: '应付账款', value: 528400, hint: '未结账单与暂估' },
  { label: '银行存款', value: 1268400, hint: '基本户与一般户余额' }
]
const openingTotal = openingRows.reduce((sum, row) => sum + row.value, 0)

const selectedTemplateMeta = computed(
  () => chartTemplateOptions.find(item => item.id === selectedTemplate.value) ?? chartTemplateOptions[0]!
)
const selectedTaxMeta = computed(
  () => taxRegimeOptions.find(item => item.id === selectedTax.value) ?? taxRegimeOptions[0]!
)

function resetForm() {
  Object.assign(form, org.profileMap[activeWorkspaceId.value] ?? companyProfiles['ws-hq']!)
}

watch(activeWorkspaceId, () => {
  resetForm()
  setupError.value = ''
})

function canVisit(step: SetupStepId) {
  const index = setupStepIds.indexOf(step)
  if (index <= 0) return true
  return setupStepIds.slice(0, index).every(item => setup.completedSteps.includes(item))
}

function goStep(step: SetupStepId) {
  if (!canVisit(step)) return
  setupError.value = ''
  activeStep.value = step
}

function goNext(step: SetupStepId) {
  setupError.value = ''
  activeStep.value = step
}

function saveCompany() {
  if (!form.name.trim() || !form.legalName.trim()) {
    setupError.value = '请填写公司简称和公司全称。'
    return
  }
  if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
    setupError.value = '联系邮箱格式不正确。'
    return
  }
  org.saveCompanyProfile({ ...form, id: activeWorkspaceId.value })
  org.recordAudit(activeWorkspaceId.value, session.user.name, '完成初始化公司资料', form.name)
  setup.markStep('company')
  toast.add({ title: '公司资料已保存', description: '下一步设置会计年度和开账日期。', color: 'success' })
  goNext('fiscal')
}

function saveFiscal() {
  if (!fiscalYearStart.value || !fiscalYearEnd.value || !openingDate.value) {
    setupError.value = '请填写会计年度起止日期和开账日期。'
    return
  }
  if (fiscalYearEnd.value <= fiscalYearStart.value) {
    setupError.value = '会计年度结束日期必须晚于开始日期。'
    return
  }
  if (!openingConfirmed.value) {
    setupError.value = '请先确认期初余额与开账日期已核对。'
    return
  }
  setup.setFiscal({
    fiscalYearStart: fiscalYearStart.value,
    fiscalYearEnd: fiscalYearEnd.value,
    openingDate: openingDate.value,
    openingConfirmed: true
  })
  org.recordAudit(activeWorkspaceId.value, session.user.name, '完成初始化会计年度', fiscalYearStart.value + ' 至 ' + fiscalYearEnd.value)
  toast.add({ title: '会计年度与开账已确认', description: '请选择科目模板。', color: 'success' })
  goNext('accounts')
}

function applyTemplate() {
  setup.setAccounts(selectedTemplate.value)
  org.recordAudit(activeWorkspaceId.value, session.user.name, '应用科目模板', selectedTemplateMeta.value.name)
  toast.add({ title: '科目模板已应用', description: selectedTemplateMeta.value.name + ' · 仅本次预览', color: 'success' })
  goNext('tax')
}

function finishSetup() {
  setup.setTax(selectedTax.value)
  setup.complete()
  org.recordAudit(activeWorkspaceId.value, session.user.name, '完成工作区初始化', workspace.value.name)
  toast.add({ title: '工作区初始化已完成', description: '公司资料、会计年度、科目模板与税制已保存。', color: 'success' })
}

function deferSetup() {
  setup.defer()
  toast.add({ title: '初始化进度已暂存', description: '可从设置的公司页签继续。', color: 'neutral' })
  navigateTo('/settings?tab=company')
}

function restartSetup() {
  setup.reset()
  openingConfirmed.value = false
  selectedTemplate.value = 'standard'
  selectedTax.value = 'general'
  fiscalYearStart.value = '2026-01-01'
  fiscalYearEnd.value = '2026-12-31'
  openingDate.value = '2026-01-01'
  setupError.value = ''
  activeStep.value = 'company'
}

onMounted(() => {
  if (setup.isComplete) return
  const requested = String(route.query.step ?? '')
  const requestedStep = setupStepIds.find(item => item === requested)
  if (requestedStep && canVisit(requestedStep)) {
    activeStep.value = requestedStep
    return
  }
  activeStep.value = setup.nextStep ?? 'company'
})
</script>

<template>
  <div class="contents">
    <UDashboardPanel id="setup">
      <template #header>
        <UDashboardNavbar title="工作区初始化" icon="i-carbon-rocket">
          <template #right>
            <div class="flex items-center gap-2">
              <UButton v-if="auth.connected && live.canVisit('/settings')"
                       :to="{ path: '/settings', query: { tab: 'company', workspace: live.activeWorkspaceId } }"
                       label="返回设置"
                       color="neutral"
                       variant="outline"
                       size="sm" />
              <template v-if="!auth.connected">
                <UBadge color="neutral" variant="subtle" size="sm">
                  {{ workspace.name }}
                </UBadge>
                <UButton
                  v-if="!setup.isComplete"
                  label="稍后继续"
                  color="neutral"
                  variant="ghost"
                  size="sm"
                  data-testid="setup-defer"
                  @click="deferSetup"
                />
                <UButton
                  v-else
                  to="/settings?tab=company"
                  label="返回设置"
                  color="neutral"
                  variant="ghost"
                  size="sm"
                  data-testid="setup-back-settings"
                />
              </template>
            </div>
          </template>
        </UDashboardNavbar>
      </template>

      <template #body>
        <div v-if="auth.connected" class="mx-auto w-full max-w-5xl p-4 sm:p-6">
          <USkeleton v-if="!auth.ready || live.loading" class="h-20" />
          <SettingsLiveSetup v-else-if="live.canVisit('/setup')" />
          <UAlert v-else
                  color="warning"
                  variant="subtle"
                  :title="live.error || '请选择有权访问的企业工作区'" />
        </div>
        <div v-else class="mx-auto max-w-5xl space-y-4 p-4 sm:p-6" data-testid="setup-page">
          <div v-if="setup.isComplete" class="space-y-4" data-testid="setup-complete">
            <UCard :ui="{ body: 'p-5 sm:p-7' }">
              <div class="mx-auto max-w-2xl text-center">
                <div class="mx-auto flex size-14 items-center justify-center rounded-full bg-success/10 text-success">
                  <UIcon name="i-carbon-checkmark" class="size-8" />
                </div>
                <h1 class="mt-4 text-xl font-semibold text-highlighted">
                  工作区初始化已完成
                </h1>
                <p class="mt-2 text-sm text-muted">
                  {{ workspace.name }} 已具备公司资料、会计年度、科目模板和税制配置。演示状态只在当前浏览器内生效。
                </p>
                <div class="mt-5 flex flex-wrap justify-center gap-2">
                  <UButton
                    to="/"
                    label="进入工作台"
                    icon="i-carbon-arrow-right"
                    data-testid="setup-enter-workbench"
                  />
                  <UButton
                    color="neutral"
                    variant="outline"
                    label="查看公司设置"
                    to="/settings?tab=company"
                    data-testid="setup-open-settings"
                  />
                </div>
              </div>
            </UCard>

            <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <UCard v-for="step in stepMeta" :key="step.id" :ui="{ body: 'p-4' }">
                <div class="flex items-start gap-3">
                  <div class="flex size-8 shrink-0 items-center justify-center rounded-full bg-success/10 text-success">
                    <UIcon name="i-carbon-checkmark" class="size-4" />
                  </div>
                  <div>
                    <p class="text-sm font-medium text-highlighted">
                      {{ step.title }}
                    </p>
                    <p class="mt-0.5 text-xs text-muted">
                      {{ step.description }}
                    </p>
                  </div>
                </div>
              </UCard>
            </div>

            <UCard :ui="{ body: 'p-4 sm:p-5' }">
              <div class="flex flex-wrap items-center justify-between gap-3 text-sm">
                <div class="space-y-1 text-xs text-muted">
                  <p>会计年度：{{ setup.fiscalYearStart }} 至 {{ setup.fiscalYearEnd }} · 开账日 {{ setup.openingDate }}</p>
                  <p>
                    科目模板：{{ chartTemplateOptions.find(item => item.id === setup.chartTemplate)?.name }} · 税制：{{
                      taxRegimeOptions.find(item => item.id === setup.taxRegime)?.name }}
                  </p>
                </div>
                <UButton
                  color="neutral"
                  variant="ghost"
                  label="重新演示初始化"
                  icon="i-carbon-reset"
                  size="sm"
                  data-testid="setup-restart"
                  @click="restartSetup"
                />
              </div>
            </UCard>
          </div>

          <template v-else>
            <UCard :ui="{ body: 'p-4 sm:p-5' }">
              <div class="flex flex-wrap items-start justify-between gap-4">
                <div class="max-w-2xl">
                  <p class="text-xs font-medium uppercase tracking-wide text-primary">
                    首次使用 · {{ completedCount }}/4 已完成
                  </p>
                  <h1 class="mt-1 text-lg font-semibold text-highlighted">
                    {{ currentMeta.title }}
                  </h1>
                  <p class="mt-1 text-sm text-muted">
                    {{ currentMeta.description }}。完成四步后进入工作台，也可以随时暂存后从设置继续。
                  </p>
                </div>
                <UProgress :model-value="setup.progress" size="sm" class="w-full sm:w-48" />
              </div>

              <div class="mt-5 grid gap-2 sm:grid-cols-4" data-testid="setup-steps">
                <button
                  v-for="(step, index) in stepMeta"
                  :key="step.id"
                  type="button"
                  class="flex items-center gap-2 rounded-sm border px-3 py-2 text-left transition-colors"
                  :class="step.id === activeStep
                    ? 'border-primary bg-primary/5'
                    : 'border-default hover:bg-elevated/50'"
                  :disabled="!canVisit(step.id)"
                  :data-testid="'setup-step-' + step.id"
                  @click="goStep(step.id)"
                >
                  <span
                    class="flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold"
                    :class="setup.completedSteps.includes(step.id)
                      ? 'bg-success/10 text-success'
                      : step.id === activeStep
                        ? 'bg-primary text-inverted'
                        : 'bg-elevated text-muted'"
                  >
                    <UIcon v-if="setup.completedSteps.includes(step.id)" name="i-carbon-checkmark" class="size-3.5" />
                    <template v-else>{{ index + 1 }}</template>
                  </span>
                  <span class="min-w-0">
                    <span class="block truncate text-xs font-medium text-highlighted">{{ step.title }}</span>
                    <span class="block truncate text-[11px] text-muted">{{ step.id === activeStep ? '当前步骤'
                      : step.description }}</span>
                  </span>
                </button>
              </div>

              <UAlert
                v-if="setup.deferredAt"
                class="mt-4"
                color="info"
                variant="subtle"
                icon="i-carbon-time"
                title="已暂存初始化进度"
                :description="'上次暂存于 ' + setup.deferredAt + '，请从当前步骤继续。'"
                data-testid="setup-deferred-alert"
              />
            </UCard>

            <UCard :ui="{ body: 'p-4 sm:p-6' }">
              <UAlert
                v-if="setupError"
                color="error"
                variant="subtle"
                icon="i-carbon-warning"
                :title="setupError"
                class="mb-4"
                data-testid="setup-error"
              />

              <div v-if="activeStep === 'company'" class="space-y-4" data-testid="setup-company">
                <div class="flex items-start justify-between gap-3">
                  <div>
                    <h2 class="text-base font-semibold text-highlighted">
                      公司资料
                    </h2>
                    <p class="mt-1 text-xs text-muted">
                      这些信息会出现在采购、销售单据抬头、发票和财务报表中。可稍后在设置中修改。
                    </p>
                  </div>
                  <UBadge color="neutral" variant="subtle" size="sm">
                    {{ activeWorkspaceId }}
                  </UBadge>
                </div>
                <div class="grid gap-4 sm:grid-cols-2">
                  <UFormField label="公司简称" required>
                    <UInput v-model="form.name" class="w-full" data-testid="setup-company-name" />
                  </UFormField>
                  <UFormField label="公司全称" required>
                    <UInput v-model="form.legalName" class="w-full" data-testid="setup-company-legal-name" />
                  </UFormField>
                  <UFormField label="统一社会信用代码">
                    <UInput
                      v-model="form.registrationNo"
                      class="w-full font-mono"
                      data-testid="setup-company-registration"
                    />
                  </UFormField>
                  <UFormField label="纳税人识别号">
                    <UInput v-model="form.taxNo" class="w-full font-mono" data-testid="setup-company-tax-no" />
                  </UFormField>
                  <UFormField label="所属行业">
                    <UInput v-model="form.industry" class="w-full" data-testid="setup-company-industry" />
                  </UFormField>
                  <UFormField label="公司规模">
                    <USelect
                      v-model="form.scale"
                      :items="['1–9 人', '10–29 人', '30–99 人', '100–299 人', '300 人以上']"
                      class="w-full"
                      data-testid="setup-company-scale"
                    />
                  </UFormField>
                  <UFormField label="联系电话">
                    <UInput v-model="form.phone" class="w-full" data-testid="setup-company-phone" />
                  </UFormField>
                  <UFormField label="联系邮箱">
                    <UInput
                      v-model="form.email"
                      type="email"
                      class="w-full"
                      data-testid="setup-company-email"
                    />
                  </UFormField>
                  <UFormField label="注册地址" class="sm:col-span-2">
                    <UInput v-model="form.address" class="w-full" data-testid="setup-company-address" />
                  </UFormField>
                  <UFormField label="发票抬头" class="sm:col-span-2">
                    <UInput v-model="form.invoiceTitle" class="w-full" data-testid="setup-company-invoice-title" />
                  </UFormField>
                </div>
                <div class="flex justify-end border-t border-default pt-4">
                  <UButton
                    label="保存并继续"
                    icon="i-carbon-arrow-right"
                    data-testid="setup-company-next"
                    @click="saveCompany"
                  />
                </div>
              </div>

              <div v-else-if="activeStep === 'fiscal'" class="space-y-5" data-testid="setup-fiscal">
                <div>
                  <h2 class="text-base font-semibold text-highlighted">
                    会计年度与开账
                  </h2>
                  <p class="mt-1 text-xs text-muted">
                    设置当前工作区的会计年度和开账日，确认期初余额后再进入科目模板。
                  </p>
                </div>
                <div class="grid gap-4 sm:grid-cols-3">
                  <UFormField label="年度开始">
                    <UInput
                      v-model="fiscalYearStart"
                      type="date"
                      class="w-full"
                      data-testid="setup-fiscal-start"
                    />
                  </UFormField>
                  <UFormField label="年度结束">
                    <UInput
                      v-model="fiscalYearEnd"
                      type="date"
                      class="w-full"
                      data-testid="setup-fiscal-end"
                    />
                  </UFormField>
                  <UFormField label="开账日期">
                    <UInput
                      v-model="openingDate"
                      type="date"
                      class="w-full"
                      data-testid="setup-opening-date"
                    />
                  </UFormField>
                </div>

                <div class="rounded-sm border border-default bg-elevated/30" data-testid="setup-opening-summary">
                  <div class="flex items-center justify-between border-b border-default px-4 py-3">
                    <div>
                      <h3 class="text-sm font-semibold text-highlighted">
                        期初余额预览
                      </h3>
                      <p class="mt-0.5 text-[11px] text-muted">
                        样例数字，用于演示开账顺序，不写入总账。
                      </p>
                    </div>
                    <UBadge color="warning" variant="subtle" size="sm">
                      待确认
                    </UBadge>
                  </div>
                  <div class="grid gap-px bg-default sm:grid-cols-2 lg:grid-cols-4">
                    <div v-for="row in openingRows" :key="row.label" class="bg-default px-4 py-3">
                      <p class="text-[11px] text-muted">
                        {{ row.label }}
                      </p>
                      <p class="mt-1 text-base font-semibold tabular-nums text-highlighted">
                        {{ formatMoney(row.value) }}
                      </p>
                      <p class="mt-0.5 text-[10px] text-muted">
                        {{ row.hint }}
                      </p>
                    </div>
                  </div>
                  <div class="flex items-center justify-between border-t border-default px-4 py-2.5 text-xs">
                    <span class="text-muted">合计</span>
                    <span class="font-semibold tabular-nums text-highlighted">{{ formatMoney(openingTotal) }}</span>
                  </div>
                </div>

                <UCheckbox
                  v-model="openingConfirmed"
                  label="我已核对期初余额与开账日期"
                  description="确认后采购、销售、库存与财务使用同一开账日。"
                  data-testid="setup-opening-confirm"
                />

                <div class="flex flex-wrap justify-between gap-2 border-t border-default pt-4">
                  <UButton
                    label="上一步"
                    color="neutral"
                    variant="ghost"
                    icon="i-carbon-arrow-left"
                    data-testid="setup-fiscal-back"
                    @click="goStep('company')"
                  />
                  <UButton
                    label="确认开账并继续"
                    icon="i-carbon-arrow-right"
                    data-testid="setup-fiscal-next"
                    @click="saveFiscal"
                  />
                </div>
              </div>

              <div v-else-if="activeStep === 'accounts'" class="space-y-5" data-testid="setup-accounts">
                <div>
                  <h2 class="text-base font-semibold text-highlighted">
                    选择科目模板
                  </h2>
                  <p class="mt-1 text-xs text-muted">
                    模板只用于初始化演示，不会覆盖当前已有科目。后续可在财务科目表中增删科目。
                  </p>
                </div>
                <div class="grid gap-3 lg:grid-cols-3">
                  <button
                    v-for="template in chartTemplateOptions"
                    :key="template.id"
                    type="button"
                    class="rounded-sm border p-4 text-left transition-colors"
                    :class="selectedTemplate === template.id
                      ? 'border-primary bg-primary/5'
                      : 'border-default hover:bg-elevated/50'"
                    :data-testid="'setup-template-' + template.id"
                    @click="selectedTemplate = template.id"
                  >
                    <div class="flex items-start justify-between gap-2">
                      <div>
                        <p class="text-sm font-semibold text-highlighted">
                          {{ template.name }}
                        </p>
                        <p class="mt-1 text-xs text-muted">
                          {{ template.description }}
                        </p>
                      </div>
                      <UBadge color="neutral" variant="subtle" size="sm">
                        {{ template.accountCount }} 个
                      </UBadge>
                    </div>
                    <div class="mt-3 space-y-1 border-t border-default pt-3">
                      <p v-for="sample in template.samples" :key="sample" class="font-mono text-[11px] text-muted">
                        {{ sample }}
                      </p>
                    </div>
                  </button>
                </div>
                <div class="flex flex-wrap items-center justify-between gap-2 border-t border-default pt-4">
                  <p class="text-xs text-muted">
                    当前选择：<span class="font-medium text-highlighted">{{ selectedTemplateMeta.name }}</span>
                  </p>
                  <div class="flex gap-2">
                    <UButton
                      label="上一步"
                      color="neutral"
                      variant="ghost"
                      icon="i-carbon-arrow-left"
                      data-testid="setup-accounts-back"
                      @click="goStep('fiscal')"
                    />
                    <UButton
                      label="应用模板并继续"
                      icon="i-carbon-arrow-right"
                      data-testid="setup-accounts-next"
                      @click="applyTemplate"
                    />
                  </div>
                </div>
              </div>

              <div v-else class="space-y-5" data-testid="setup-tax">
                <div>
                  <h2 class="text-base font-semibold text-highlighted">
                    选择税制
                  </h2>
                  <p class="mt-1 text-xs text-muted">
                    税制决定销项与进项税码的默认组合，稍后可以在定义维护中调整。
                  </p>
                </div>
                <div class="grid gap-3 lg:grid-cols-3">
                  <button
                    v-for="tax in taxRegimeOptions"
                    :key="tax.id"
                    type="button"
                    class="rounded-sm border p-4 text-left transition-colors"
                    :class="selectedTax === tax.id
                      ? 'border-primary bg-primary/5'
                      : 'border-default hover:bg-elevated/50'"
                    :data-testid="'setup-tax-' + tax.id"
                    @click="selectedTax = tax.id"
                  >
                    <div class="flex items-center justify-between gap-2">
                      <p class="text-sm font-semibold text-highlighted">
                        {{ tax.name }}
                      </p>
                      <UIcon
                        v-if="selectedTax === tax.id"
                        name="i-carbon-checkmark-filled"
                        class="size-4 text-primary"
                      />
                    </div>
                    <p class="mt-1 text-xs text-muted">
                      {{ tax.description }}
                    </p>
                    <p class="mt-2 text-[11px] text-muted">
                      {{ tax.detail }}
                    </p>
                  </button>
                </div>
                <div
                  class="rounded-sm border border-default bg-elevated/30 p-4 text-xs text-muted"
                  data-testid="setup-tax-summary"
                >
                  <p class="font-medium text-highlighted">
                    完成前的配置摘要
                  </p>
                  <p class="mt-1">
                    公司：{{ form.name || '未填写' }} · 会计年度：{{ fiscalYearStart }} 至 {{ fiscalYearEnd }}
                  </p>
                  <p>科目模板：{{ selectedTemplateMeta.name }} · 税制：{{ selectedTaxMeta.name }}</p>
                </div>
                <div class="flex flex-wrap justify-between gap-2 border-t border-default pt-4">
                  <UButton
                    label="上一步"
                    color="neutral"
                    variant="ghost"
                    icon="i-carbon-arrow-left"
                    data-testid="setup-tax-back"
                    @click="goStep('accounts')"
                  />
                  <div class="flex gap-2">
                    <UButton
                      label="稍后继续"
                      color="neutral"
                      variant="ghost"
                      data-testid="setup-tax-defer"
                      @click="deferSetup"
                    />
                    <UButton
                      label="完成初始化"
                      icon="i-carbon-checkmark"
                      data-testid="setup-tax-complete"
                      @click="finishSetup"
                    />
                  </div>
                </div>
              </div>
            </UCard>
          </template>
        </div>
      </template>
    </UDashboardPanel>
  </div>
</template>
