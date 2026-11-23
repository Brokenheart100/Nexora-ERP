<script setup lang="ts">
import { useAdministration, useAdministrationMutation } from '~/composables/settings/useAdministration'
import type { TableColumn } from '@nuxt/ui'
import type { BillingCheckoutIntent, BillingQuote, OrganizationBilling, OrganizationBillingInvoice } from '#shared/types/organization-billing'
import { ApiFailure } from '~/utils/api/client'

const { api, workspace, owner, session } = useAdministration()
const organization = useOrganizationApi()
const { locale } = useI18n()
const planCode = ref('')
const quoteProblem = ref('')
const checkingQuote = ref(false)
const checkedQuote = shallowRef<BillingQuote | null>(null)
const billing = useWorkspaceQuery('workspace-billing', '/settings', api.billing)
const entitlements = useWorkspaceQuery('workspace-entitlements', '/settings', organization.entitlements)
const checkout = useWorkspaceQuery('workspace-local-checkout', '/settings', async (id, signal) => {
  if (!billing.data?.canManage) return null
  try {
    return await api.checkout(id, signal)
  } catch (failure) {
    if (failure instanceof ApiFailure && failure.status === 404) return null
    throw failure
  }
}, () => billing.data?.canManage === true)
const checkoutIntent = shallowRef<BillingCheckoutIntent | null>(null)
const pending = computed(() => checkoutIntent.value ?? checkout.data?.pending ?? null)
const saved = ref(false)
const saveCard = ref(false)
const payment = reactive({ invoice: '', reference: '' })
const cancelOpen = ref(false)
const mutation = useAdministrationMutation<OrganizationBilling>(owner)
const start = useAdministrationMutation<BillingCheckoutIntent>(owner)
const blocked = computed(() => mutation.busy || mutation.unknown || start.busy || start.unknown || checkingQuote.value)
const columns: TableColumn<OrganizationBillingInvoice>[] = [
  { id: 'plan', header: '套餐' }, { id: 'amount', header: '金额' }, { id: 'state', header: '状态' },
  { accessorKey: 'paymentReference', header: '付款引用' }, { accessorKey: 'issuedAtUtc', header: '开具时间' }, { id: 'action', header: '' }
]
const statuses: Record<string, string> = { active: '生效中', trial: '试用', past_due: '逾期', canceled: '已取消', pending: '待付款', paid: '已付款', void: '作废' }
const money = (cents: number, currency: string) => new Intl.NumberFormat(locale.value, { style: 'currency', currency }).format(cents / 100)

watch(owner, () => {
  planCode.value = ''
  checkedQuote.value = null
  checkoutIntent.value = null
  quoteProblem.value = ''
  checkingQuote.value = false
  saved.value = saveCard.value = false
  payment.invoice = payment.reference = ''
  cancelOpen.value = false
}, { flush: 'sync' })

function terms(quote: BillingQuote) {
  return JSON.stringify([quote.planCode, quote.currentPlanCode, quote.subscriptionStatus, quote.currency, quote.monthlyPriceCents,
    quote.chargeCents, quote.creditCents, quote.amountDueCents, quote.prorated, quote.prorated ? quote.periodEndUtc : null])
}

async function readQuote(code: string) {
  const current = owner()
  planCode.value = code
  quoteProblem.value = ''
  checkingQuote.value = true
  try {
    const value = await api.quote(workspace(), code)
    if (current !== owner() || code !== planCode.value) return null
    const previous = checkedQuote.value
    checkedQuote.value = value
    if (previous?.planCode === code && terms(previous) !== terms(value)) {
      quoteProblem.value = '报价已更新，请核对费用后重新确认。'
      return null
    }
    return value
  } catch (failure) {
    if (current === owner()) {
      checkedQuote.value = null
      quoteProblem.value = failure instanceof ApiFailure ? failure.message : '报价读取失败，请重试。'
    }
    return null
  } finally {
    if (current === owner()) checkingQuote.value = false
  }
}

async function refresh() {
  checkoutIntent.value = null
  await Promise.all([billing.refresh(), entitlements.refresh(), checkout.refresh()])
  if (!billing.data || !entitlements.data || checkout.problem) throw new Error(billing.problem || entitlements.problem || checkout.problem || '读取订阅失败。')
}

async function updated() {
  payment.invoice = payment.reference = ''
  cancelOpen.value = false
  await session.refreshAccess()
}

async function selectPlan(local: boolean) {
  if (!checkedQuote.value || blocked.value || !billing.data?.canManage) return
  const quote = await readQuote(checkedQuote.value.planCode)
  if (!quote) return
  if (local) {
    await start.run(() => api.startCheckout(workspace(), {
      planCode: quote.planCode, expectedAmountCents: quote.amountDueCents, useSavedCard: saved.value
    }), async (intent) => {
      checkoutIntent.value = intent
      await billing.refresh()
    })
  } else await mutation.run(() => api.selectPlan(workspace(), quote.planCode), updated)
}

function confirm() {
  const intent = pending.value
  if (!intent || blocked.value) return
  return mutation.run(() => api.confirmCheckout(workspace(), intent.invoiceId, intent.ticket, saveCard.value), updated)
}

function pay() {
  if (!payment.invoice || !payment.reference.trim() || blocked.value) return
  return mutation.run(() => api.payInvoice(workspace(), payment.invoice, payment.reference.trim()), updated)
}
</script>

<template>
  <div class="space-y-4" data-testid="live-billing">
    <SettingsAdministrationQueryState :query="billing" />
    <SettingsAdministrationQueryState v-if="entitlements.problem" :query="entitlements" />
    <SettingsAdministrationQueryState v-if="checkout.problem" :query="checkout" />
    <SettingsAdministrationStatus :state="mutation" @refresh="mutation.readCurrent(refresh)" @acknowledge="mutation.acknowledge" />
    <SettingsAdministrationStatus :state="start" @refresh="start.readCurrent(refresh)" @acknowledge="start.acknowledge" />
    <UCard v-if="entitlements.data">
      <template #header>
        <p class="font-medium">
          当前订阅与权益
        </p>
      </template>
      <div class="space-y-3" data-testid="live-billing-entitlements">
        <p>{{ entitlements.data.planName }} · {{ statuses[entitlements.data.status] ?? entitlements.data.status }}</p>
        <p class="text-sm text-muted">
          生效套餐 {{ entitlements.data.effectivePlanCode }}<template v-if="entitlements.data.periodEndUtc">
            · 截止 {{ entitlements.data.periodEndUtc }}
          </template>
        </p>
        <dl class="grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
          <div>
            <dt class="text-muted">
              工作区
            </dt><dd>{{ entitlements.data.usage.workspaces }}/{{ entitlements.data.usage.workspacesLimit }}</dd>
          </div>
          <div>
            <dt class="text-muted">
              成员
            </dt><dd>{{ entitlements.data.usage.members }}/{{ entitlements.data.usage.membersLimit }}</dd>
          </div>
          <div>
            <dt class="text-muted">
              本期单据
            </dt><dd>{{ entitlements.data.usage.documentsThisMonth }}/{{ entitlements.data.usage.documentsLimit }}</dd>
          </div>
        </dl>
        <div class="flex flex-wrap gap-1">
          <UBadge
            v-for="module in entitlements.data.modules"
            :key="module"
            :label="module"
            color="neutral"
            variant="subtle"
          />
        </div>
        <UAlert
          v-for="warning in entitlements.data.warnings"
          :key="warning"
          :title="warning"
          color="warning"
          variant="subtle"
        />
      </div>
    </UCard>
    <UCard v-if="billing.data">
      <template #header>
        <div class="flex flex-wrap items-center justify-between gap-2">
          <p class="font-medium">
            套餐
          </p>
          <UButton
            v-if="billing.data.canManage && billing.data.subscription.status !== 'canceled' && billing.data.subscription.planCode !== 'free'"
            label="取消订阅"
            color="error"
            variant="outline"
            size="sm"
            :disabled="blocked"
            @click="cancelOpen = true"
          />
        </div>
      </template>
      <div class="grid gap-3 md:grid-cols-3">
        <div v-for="plan in billing.data.plans" :key="plan.code" class="space-y-2 border border-default p-3">
          <p class="font-medium">
            {{ plan.name }}
          </p>
          <p class="text-sm">
            {{ money(plan.monthlyPriceCents, plan.currency) }} / 月
          </p>
          <p class="text-xs text-muted">
            {{ plan.limits.workspaces }} 工作区 · {{ plan.limits.members }} 成员 · {{ plan.limits.documentsPerMonth }} 单据/月
          </p>
          <UButton
            v-if="billing.data.canManage"
            label="查看报价"
            color="neutral"
            variant="outline"
            size="sm"
            :disabled="blocked"
            :data-testid="'live-billing-quote-' + plan.code"
            @click="readQuote(plan.code)"
          />
        </div>
      </div>
    </UCard>
    <UAlert
      v-if="quoteProblem"
      color="warning"
      variant="subtle"
      :title="quoteProblem"
      data-testid="live-billing-quote-problem"
    />
    <UCard v-if="checkedQuote && billing.data?.canManage" data-testid="live-billing-quote">
      <template #header>
        <p class="font-medium">
          {{ checkedQuote.planName }} 报价
        </p>
      </template>
      <div class="space-y-3">
        <dl class="grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
          <div>
            <dt class="text-muted">
              费用
            </dt><dd>{{ money(checkedQuote.chargeCents, checkedQuote.currency) }}</dd>
          </div>
          <div>
            <dt class="text-muted">
              抵扣
            </dt><dd>{{ money(checkedQuote.creditCents, checkedQuote.currency) }}</dd>
          </div>
          <div>
            <dt class="text-muted">
              应付
            </dt><dd>{{ money(checkedQuote.amountDueCents, checkedQuote.currency) }}</dd>
          </div>
        </dl>
        <p class="text-sm text-muted">
          {{ checkedQuote.prorated ? '按剩余 ' + checkedQuote.remainingDays + ' 天折算' : '完整计费周期' }} · 周期至 {{ checkedQuote.periodEndUtc }}
        </p>
        <div class="flex flex-wrap items-center gap-2">
          <UButton
            :label="checkedQuote.amountDueCents ? '创建应付账单' : '确认切换套餐'"
            color="neutral"
            variant="outline"
            :disabled="blocked"
            @click="selectPlan(false)"
          />
          <template v-if="checkout.data && checkedQuote.planCode !== 'free'">
            <UButton
              label="开始本地测试结账"
              :disabled="blocked"
              data-testid="live-checkout-start"
              @click="selectPlan(true)"
            />
            <UCheckbox v-if="checkout.data.hasSavedCard" v-model="saved" label="使用已保存的测试卡" />
          </template>
        </div>
      </div>
    </UCard>
    <UCard v-if="pending && billing.data?.canManage" data-testid="live-checkout-pending">
      <template #header>
        <p class="font-medium">
          待确认的本地测试结账
        </p>
      </template>
      <div class="space-y-3">
        <p class="text-sm">
          {{ pending.planCode }} · {{ money(pending.amountCents, pending.currency) }} · {{ pending.usesSavedCard ? '已保存的测试卡' : '本地测试卡' }}
        </p>
        <UCheckbox v-model="saveCard" label="保留测试卡供后续结账" />
        <UButton
          label="确认测试付款"
          :disabled="blocked"
          data-testid="live-checkout-confirm"
          @click="confirm"
        />
      </div>
    </UCard>
    <UCard v-if="billing.data">
      <template #header>
        <p class="font-medium">
          订阅账单
        </p>
      </template>
      <UTable
        :data="billing.data.invoices"
        :columns="columns"
        empty="当前工作区没有订阅账单"
        data-testid="live-billing-invoices"
      >
        <template #plan-cell="{ row }">
          {{ billing.data.plans.find(plan => plan.code === row.original.planCode)?.name || row.original.planCode }}
        </template>
        <template #amount-cell="{ row }">
          {{ money(row.original.amountCents, row.original.currency) }}
        </template>
        <template #state-cell="{ row }">
          <UBadge :label="statuses[row.original.status] ?? row.original.status" color="neutral" variant="subtle" />
        </template>
        <template #action-cell="{ row }">
          <UButton
            v-if="billing.data.canManage && row.original.status === 'pending' && pending?.invoiceId !== row.original.id && !checkout.loading && !checkout.problem"
            label="登记付款"
            size="sm"
            color="neutral"
            variant="outline"
            :disabled="blocked"
            @click="payment.invoice = row.original.id; payment.reference = ''"
          />
        </template>
      </UTable>
      <form v-if="payment.invoice" class="flex flex-wrap items-end gap-2 pt-3" @submit.prevent="pay">
        <UFormField label="付款引用" required>
          <UInput
            v-model="payment.reference"
            required
            maxlength="120"
            data-testid="live-billing-payment-reference"
          />
        </UFormField>
        <UButton type="submit" label="确认付款引用" :disabled="blocked || !payment.reference.trim()" />
      </form>
    </UCard>
    <UModal v-model:open="cancelOpen" title="取消订阅" description="确认后，服务将重新计算套餐权益与限额。">
      <template #footer>
        <UButton
          label="返回"
          color="neutral"
          variant="outline"
          @click="cancelOpen = false"
        />
        <UButton
          label="确认取消订阅"
          color="error"
          :disabled="blocked"
          @click="mutation.run(() => api.cancelPlan(workspace()), updated)"
        />
      </template>
    </UModal>
  </div>
</template>
