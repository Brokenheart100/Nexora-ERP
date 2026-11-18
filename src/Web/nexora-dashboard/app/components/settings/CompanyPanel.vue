<script setup lang="ts">
import type { CompanyProfile } from '~/mocks'
import { companyProfiles } from '~/mocks'

const toast = useToast()
const org = useOrganizationStore()
const setup = useWorkspaceSetupStore()
const session = useSessionStore()
const { workspace, activeWorkspaceId } = useMockWorkspace()

const setupStepNames: Record<string, string> = {
  company: '公司资料',
  fiscal: '会计年度与开账',
  accounts: '科目模板',
  tax: '可选税制'
}
const setupTarget = computed(() => setup.nextStep ? '/setup?step=' + setup.nextStep : '/setup')
const setupNextName = computed(() => setup.nextStep ? setupStepNames[setup.nextStep] : '查看配置')
const setupSummary = computed(() => setup.isComplete
  ? '四步配置已完成，可随时重新演示。'
  : '已完成 ' + setup.completedSteps.length + '/4 步，下一步：' + setupNextName.value + '。')

const currentProfile = computed<CompanyProfile>(
  () => org.profileMap[activeWorkspaceId.value] ?? companyProfiles['ws-hq']!
)
const form = reactive<CompanyProfile>({ ...currentProfile.value })

watch(activeWorkspaceId, () => {
  Object.assign(form, currentProfile.value)
})

const dirty = computed(() => JSON.stringify(form) !== JSON.stringify(currentProfile.value))

function saveProfile() {
  org.saveCompanyProfile({ ...form, id: activeWorkspaceId.value })
  org.recordAudit(activeWorkspaceId.value, session.user.name, '更新公司资料', form.name)
  Object.assign(form, currentProfile.value)
  toast.add({
    title: '公司资料已保存',
    description: '仅更新本次浏览器预览，刷新后恢复初始样例。',
    color: 'success',
    icon: 'i-carbon-checkmark'
  })
}

function resetProfile() {
  Object.assign(form, currentProfile.value)
  toast.add({ title: '已还原未保存的修改', color: 'neutral', icon: 'i-carbon-reset' })
}
</script>

<template>
  <div class="space-y-4" data-testid="settings-company">
    <UCard :ui="{ body: 'p-4 sm:p-5' }" data-testid="settings-company-setup">
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div class="flex min-w-0 items-start gap-3">
          <div
            class="flex size-9 shrink-0 items-center justify-center rounded-full"
            :class="setup.isComplete ? 'bg-success/10 text-success' : 'bg-primary/10 text-primary'"
          >
            <UIcon :name="setup.isComplete ? 'i-carbon-checkmark' : 'i-carbon-rocket'" class="size-5" />
          </div>
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-2">
              <h3 class="text-sm font-semibold text-highlighted">
                工作区初始化
              </h3>
              <UBadge
                :color="setup.isComplete ? 'success' : 'warning'"
                variant="subtle"
                size="sm"
                data-testid="settings-company-setup-status"
              >
                {{ setup.isComplete ? '已完成' : setup.completedSteps.length + '/4' }}
              </UBadge>
            </div>
            <p class="mt-0.5 text-xs text-muted" data-testid="settings-company-setup-summary">
              {{ setupSummary }}
            </p>
            <p v-if="setup.deferredAt" class="mt-1 text-[11px] text-muted">
              上次暂存于 {{ setup.deferredAt }}
            </p>
          </div>
        </div>
        <UButton
          :to="setupTarget"
          :label="setup.isComplete ? '查看完成配置' : '继续初始化'"
          :icon="setup.isComplete ? 'i-carbon-view' : 'i-carbon-arrow-right'"
          size="sm"
          :color="setup.isComplete ? 'neutral' : 'primary'"
          :variant="setup.isComplete ? 'outline' : 'solid'"
          data-testid="settings-company-setup-open"
        />
      </div>
      <UProgress
        v-if="!setup.isComplete"
        :model-value="setup.progress"
        size="sm"
        class="mt-3"
        data-testid="settings-company-setup-progress"
      />
    </UCard>

    <UCard :ui="{ body: 'p-0 sm:p-0' }">
      <template #header>
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 class="text-sm font-semibold text-highlighted">
              公司资料
            </h3>
            <p class="mt-0.5 text-xs text-muted">
              {{ workspace.name }} · 用于单据抬头、发票与报表
            </p>
          </div>
          <UBadge color="neutral" variant="subtle">
            本地演示
          </UBadge>
        </div>
      </template>

      <UForm :state="form" class="space-y-4 p-4 sm:p-5" @submit="saveProfile">
        <div class="grid gap-4 lg:grid-cols-2">
          <UFormField label="公司简称" name="name" required>
            <UInput v-model="form.name" class="w-full" data-testid="settings-company-name" />
          </UFormField>
          <UFormField label="公司全称" name="legalName" required>
            <UInput v-model="form.legalName" class="w-full" data-testid="settings-company-legal-name" />
          </UFormField>
          <UFormField label="统一社会信用代码" name="registrationNo">
            <UInput v-model="form.registrationNo" class="w-full font-mono" data-testid="settings-company-registration" />
          </UFormField>
          <UFormField label="纳税人识别号" name="taxNo">
            <UInput v-model="form.taxNo" class="w-full font-mono" data-testid="settings-company-tax-no" />
          </UFormField>
          <UFormField label="所属行业" name="industry">
            <UInput v-model="form.industry" class="w-full" data-testid="settings-company-industry" />
          </UFormField>
          <UFormField label="公司规模" name="scale">
            <USelect
              v-model="form.scale"
              :items="['1–9 人', '10–29 人', '30–99 人', '100–299 人', '300 人以上']"
              class="w-full"
              data-testid="settings-company-scale"
            />
          </UFormField>
          <UFormField label="联系电话" name="phone">
            <UInput v-model="form.phone" class="w-full" data-testid="settings-company-phone" />
          </UFormField>
          <UFormField label="联系邮箱" name="email">
            <UInput
              v-model="form.email"
              type="email"
              class="w-full"
              data-testid="settings-company-email"
            />
          </UFormField>
          <UFormField label="官网" name="website">
            <UInput v-model="form.website" class="w-full" data-testid="settings-company-website" />
          </UFormField>
          <UFormField label="记账本位币" name="baseCurrency">
            <UInput :model-value="'人民币 CNY'" disabled class="w-full" />
          </UFormField>
          <UFormField label="注册地址" name="address" class="lg:col-span-2">
            <UInput v-model="form.address" class="w-full" data-testid="settings-company-address" />
          </UFormField>
        </div>

        <UCard :ui="{ body: 'p-4 sm:p-4', root: 'bg-elevated/40' }">
          <div class="grid gap-4 lg:grid-cols-2">
            <UFormField label="发票抬头" name="invoiceTitle">
              <UInput v-model="form.invoiceTitle" class="w-full" data-testid="settings-company-invoice-title" />
            </UFormField>
            <UFormField label="会计年度起始" name="fiscalYearStart">
              <USelect
                v-model="form.fiscalYearStart"
                :items="['01-01', '04-01', '07-01', '10-01']"
                class="w-full"
                data-testid="settings-company-fiscal-year"
              />
            </UFormField>
            <UFormField label="时区" name="timezone">
              <USelect
                v-model="form.timezone"
                :items="['Asia/Shanghai', 'Asia/Hong_Kong', 'Asia/Singapore', 'UTC']"
                class="w-full"
                data-testid="settings-company-timezone"
              />
            </UFormField>
            <UFormField label="工作区编号" name="id">
              <UInput :model-value="form.id" disabled class="w-full font-mono" />
            </UFormField>
          </div>
        </UCard>

        <div class="flex flex-wrap items-center justify-between gap-3 border-t border-default pt-4">
          <p class="text-xs text-muted">
            修改只保存在当前页面状态；刷新后恢复初始模拟资料。
          </p>
          <div class="flex gap-2">
            <UButton
              label="还原"
              color="neutral"
              variant="ghost"
              :disabled="!dirty"
              data-testid="settings-company-reset"
              @click="resetProfile"
            />
            <UButton
              label="保存公司资料"
              type="submit"
              icon="i-carbon-save"
              :disabled="!dirty"
              data-testid="settings-company-save"
            />
          </div>
        </div>
      </UForm>
    </UCard>
  </div>
</template>
