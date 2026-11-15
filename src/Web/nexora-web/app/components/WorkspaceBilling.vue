<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type {
  BillingEntitlements, BillingInvoice, BillingPlan, BillingPlanQuote, WorkspaceBillingView,
} from '~/utils/billing'
import {
  billingStatusLabel, billingWarningLabel, canSelectPlan, formatBillingAmount, invoiceStatusLabel,
  isCurrentPlan, planLabel, quoteIsZeroDue, signupPlanCode, usageRatio,
} from '~/utils/billing'

const props = defineProps<{ workspaceId: string }>()
const base = `/bff/api/workspaces/${props.workspaceId}`

const view = shallowRef<WorkspaceBillingView | null>(null)
const entitlements = shallowRef<BillingEntitlements | null>(null)
const busy = ref(true)
const acting = ref('')
const notice = ref('')
const error = ref('')
const paymentReference = ref<Record<string, string>>({})
const signupPlan = useCookie<string | null>('nexora-signup-plan')
const pendingQuote = shallowRef<{ plan: BillingPlan; quote: BillingPlanQuote } | null>(null)
const quoting = ref('')

const signupPlanCodeValue = computed(() => signupPlanCode(signupPlan.value))
const quotePlanCode = computed(() => pendingQuote.value?.plan.code ?? '')
const signupPlanName = computed(() => {
  const code = signupPlanCodeValue.value
  return code ? plans.value.find(plan => plan.code === code)?.name ?? planLabel(code) : ''
})
const subscription = computed(() => view.value?.subscription ?? null)
const plans = computed(() => view.value?.plans ?? [])
const invoices = computed(() => view.value?.invoices ?? [])
const canManage = computed(() => view.value?.canManage ?? false)
const warnings = computed(() => entitlements.value?.warnings.map(billingWarningLabel) ?? [])
const usageRows = computed(() => {
  const usage = entitlements.value?.usage
  if (!usage) return []
  return [
    { key: 'workspaces', label: '工作区', used: usage.workspaces, limit: usage.workspacesLimit },
    { key: 'members', label: '成员席位', used: usage.members, limit: usage.membersLimit },
    { key: 'documents', label: '本月单据', used: usage.documentsThisMonth, limit: usage.documentsLimit },
  ]
})

const moduleNames: Record<string, string> = {
  company: '公司设置', book: '账簿', reports: '财务报表', aging: '财务概览', partners: '往来单位',
  catalog: '商品目录', inventory: '库存', purchasing: '采购', sales: '销售', receivables: '应收',
  audit: '审计', assistant: 'AI 助手',
}

const moduleName = (key: string) => moduleNames[key] ?? key
const moment = (value: string | null) => value ? value.replace('T', ' ').slice(0, 19) + ' UTC' : '—'
const current = (plan: BillingPlan) => isCurrentPlan(plan.code, subscription.value)
const selectable = (plan: BillingPlan) => canManage.value && canSelectPlan(plan.code, subscription.value)
const canCancel = computed(() => canManage.value && !!subscription.value && subscription.value.effectivePlanCode !== 'free')
const columns = computed<TableColumn<BillingInvoice>[]>(() => [
  { id: 'issuedAtUtc', header: '开立时间', accessorFn: invoice => moment(invoice.issuedAtUtc) },
  { id: 'plan', header: '套餐', accessorFn: invoice => planLabel(invoice.planCode) },
  { id: 'amount', header: '金额', accessorFn: invoice => formatBillingAmount(invoice.amountCents, invoice.currency) },
  { id: 'status', header: '状态', accessorFn: invoice => invoiceStatusLabel(invoice.status) },
  { id: 'paymentReference', header: '付款参考号', accessorFn: invoice => invoice.paymentReference ?? '—' },
  { id: 'actions', header: '操作' },
])

function problemMessage(failure: unknown): string {
  const data = (failure as { data?: { detail?: string; title?: string } }).data
  return data?.detail ?? data?.title ?? '操作未完成或尚未确认，请刷新后核对。'
}

async function load() {
  try {
    const [billing, current] = await Promise.all([
      $fetch<WorkspaceBillingView>(base + '/billing', { retry: 0 }),
      $fetch<BillingEntitlements>(base + '/billing/entitlements', { retry: 0 }),
    ])
    view.value = billing
    entitlements.value = current
  } catch (failure) {
    error.value = problemMessage(failure)
  } finally {
    busy.value = false
  }
}

async function write<T>(path: string, body: object): Promise<T> {
  const csrf = await $fetch<{ requestToken: string }>('/bff/antiforgery', { retry: 0 })
  return $fetch<T>(base + path, {
    method: 'POST', body, headers: { 'X-CSRF-TOKEN': csrf.requestToken }, retry: 0,
  })
}

async function run(action: () => Promise<void>) {
  if (acting.value) return
  acting.value = 'busy'
  notice.value = ''
  error.value = ''
  try {
    await action()
    await load()
  } catch (failure) {
    error.value = problemMessage(failure)
  } finally {
    acting.value = ''
  }
}

async function quoteFor(plan: BillingPlan) {
  if (!selectable(plan) || quoting.value || acting.value) return
  quoting.value = plan.code
  notice.value = ''
  error.value = ''
  try {
    const quote = await $fetch<BillingPlanQuote>(base + '/billing/plan-quote', {
      query: { planCode: plan.code }, retry: 0,
    })
    pendingQuote.value = { plan, quote }
  } catch (failure) {
    error.value = problemMessage(failure)
  } finally {
    quoting.value = ''
  }
}

function requestPlan(plan: BillingPlan) {
  if (!selectable(plan)) return
  if (plan.code === 'free') {
    void change(plan, null)
    return
  }
  void quoteFor(plan)
}

async function change(plan: BillingPlan, quote: BillingPlanQuote | null) {
  const reference = (paymentReference.value[plan.code] ?? '').trim()
  const due = quote?.amountDueCents ?? 0
  if (due > 0 && !reference) {
    notice.value = '请填写线下付款参考号（银行流水号或收据号），以便登记账单并激活订阅。'
    return
  }
  await run(async () => {
    await write('/billing/subscription', {
      planCode: plan.code, operationId: crypto.randomUUID(), paymentReference: reference || null,
    })
    if (quote) {
      notice.value = due > 0
        ? `套餐已变更为${plan.name}，本次应付 ${formatBillingAmount(due, quote.currency)}，生效日期 ${moment(quote.effectiveAtUtc)}。`
        : `套餐已变更为${plan.name}，本次无需补款，生效日期 ${moment(quote.effectiveAtUtc)}。`
    } else {
      notice.value = '已切换到免费版。'
    }
    pendingQuote.value = null
    if (signupPlanCodeValue.value === plan.code) signupPlan.value = null
  })
}

function confirmQuote() {
  if (pendingQuote.value) void change(pendingQuote.value.plan, pendingQuote.value.quote)
}

function dismissQuote() {
  pendingQuote.value = null
}

function pay(invoice: BillingInvoice) {
  const reference = (paymentReference.value[invoice.id] ?? '').trim()
  if (!reference) {
    notice.value = '请填写付款参考号后再登记付款。'
    return
  }
  void run(async () => {
    await write('/billing/invoices/' + invoice.id + '/pay', { operationId: crypto.randomUUID(), reference })
    notice.value = '付款已登记，账单已结清。'
  })
}

function cancel() {
  void run(async () => {
    await write('/billing/subscription/cancel', { operationId: crypto.randomUUID() })
    notice.value = '订阅已取消，立即降级到免费版。'
  })
}

onMounted(load)
</script>

<template>
  <section class="card billing" aria-labelledby="billing-title">
    <h2 id="billing-title"><UIcon class="heading-icon" name="i-lucide-credit-card" aria-hidden="true" />计费与套餐</h2>
    <p class="hint">
      自托管手工计费：选择套餐并登记线下付款参考号后订阅立即生效；免费版可直接切换。取消订阅会立即降级到免费版。计费按工作区独立结算。
    </p>
    <div v-if="signupPlanCodeValue" data-testid="billing-signup-plan">
      <UAlert
        role="status"
        color="info"
        icon="i-lucide-sparkles"
        :description="`你在注册时选择了「${signupPlanName}」，激活前会一直保留并高亮该套餐。`"
      />
    </div>
    <UAlert v-if="notice" role="status" :description="notice" />
    <UAlert v-if="error" role="alert" color="error" icon="i-lucide-circle-alert" :description="error" />
    <div v-if="busy" class="space-y-3 py-2" role="status" aria-label="正在读取计费信息">
      <USkeleton class="h-6 w-48" />
      <USkeleton class="h-4 w-full" />
      <USkeleton class="h-4 w-2/3" />
    </div>
    <template v-else-if="view && subscription">
      <div class="plan-summary">
        <div><span>当前套餐</span><strong data-testid="billing-plan">{{ planLabel(subscription.planCode) }}</strong></div>
        <div><span>订阅状态</span><strong data-testid="billing-status">{{ billingStatusLabel(subscription.status) }}</strong></div>
        <div><span>生效套餐</span><strong data-testid="billing-effective">{{ planLabel(subscription.effectivePlanCode) }}</strong></div>
        <div><span>本周期结束</span><strong>{{ moment(subscription.periodEndUtc) }}</strong></div>
        <button class="quiet" type="button" :disabled="acting !== ''" @click="load">刷新计费信息</button>
      </div>
      <UAlert v-for="warning in warnings" :key="warning" role="status" color="warning" icon="i-lucide-triangle-alert"
        :description="warning" />

      <h3>用量与配额</h3>
      <div class="usage">
        <div v-for="row in usageRows" :key="row.key" class="usage-row" :data-testid="'billing-usage-' + row.key">
          <span>{{ row.label }}</span>
          <div class="bar" role="progressbar" :aria-valuenow="row.used" :aria-valuemin="0" :aria-valuemax="row.limit"
            :aria-label="row.label">
            <span :style="{ width: usageRatio(row.used, row.limit) * 100 + '%' }" />
          </div>
          <strong>{{ row.used }} / {{ row.limit }}</strong>
        </div>
        <p class="hint">
          统计周期 {{ entitlements?.usage.period }}；单据配额按月重置，工作区与成员配额为硬上限。
          配额不足或需要更高限额？<a
            href="mailto:support@nexora.example?subject=套餐与限额咨询"
            data-testid="billing-contact"
          >联系服务团队</a>。
        </p>
      </div>

      <h3>套餐</h3>
      <div class="plans">
        <article
          v-for="plan in plans"
          :key="plan.code"
          class="plan"
          :class="{ current: current(plan), signup: signupPlanCodeValue === plan.code }"
        >
          <header>
            <div>
              <h4>{{ plan.name }}</h4>
              <span v-if="signupPlanCodeValue === plan.code" class="signup-label">注册时选择</span>
            </div>
            <p>{{ formatBillingAmount(plan.monthlyPriceCents, plan.currency) }} / 月</p>
          </header>
          <ul>
            <li>工作区 {{ plan.limits.workspaces }}</li>
            <li>成员席位 {{ plan.limits.members }}</li>
            <li>单据 {{ plan.limits.documentsPerMonth }} / 月</li>
          </ul>
          <p class="modules">模块：{{ plan.modules.map(moduleName).join('、') }}</p>
          <template v-if="selectable(plan)">
            <button
              class="primary"
              type="button"
              :disabled="acting !== '' || quoting !== ''"
              @click="requestPlan(plan)"
            >
              {{ plan.code === 'free' ? '切换到免费版' : quoting === plan.code ? '正在计算费用…' : '查看费用并变更' }}
            </button>
          </template>
          <p v-else-if="current(plan)" class="current-label">当前套餐</p>
        </article>
      </div>
      <section v-if="pendingQuote" class="quote" data-testid="billing-quote" aria-live="polite">
        <h3>确认套餐变更</h3>
        <dl class="quote-grid">
          <div><dt>原套餐</dt><dd data-testid="quote-current">{{ planLabel(pendingQuote.quote.currentPlanCode) }}</dd></div>
          <div><dt>新套餐</dt><dd data-testid="quote-target">{{ pendingQuote.plan.name }}</dd></div>
          <div><dt>剩余天数</dt><dd data-testid="quote-remaining">{{ pendingQuote.quote.remainingDays }} 天</dd></div>
          <div><dt>原套餐抵扣</dt><dd data-testid="quote-credit">{{ formatBillingAmount(pendingQuote.quote.creditCents, pendingQuote.quote.currency) }}</dd></div>
          <div>
            <dt>{{ pendingQuote.quote.prorated ? '按比例费用' : '整月费用' }}</dt>
            <dd data-testid="quote-charge">{{ formatBillingAmount(pendingQuote.quote.chargeCents, pendingQuote.quote.currency) }}</dd>
          </div>
          <div><dt>本次应付</dt><dd data-testid="quote-due">{{ formatBillingAmount(pendingQuote.quote.amountDueCents, pendingQuote.quote.currency) }}</dd></div>
          <div><dt>生效日期</dt><dd data-testid="quote-effective">{{ moment(pendingQuote.quote.effectiveAtUtc) }}</dd></div>
          <div><dt>本周期结束</dt><dd data-testid="quote-period-end">{{ moment(pendingQuote.quote.periodEndUtc) }}</dd></div>
        </dl>
        <p class="hint">
          {{ pendingQuote.quote.prorated
            ? `按当前周期剩余 ${pendingQuote.quote.remainingDays} 天折算新套餐费用，并抵扣原套餐未使用部分。`
            : '当前没有可抵扣的付费周期，将按整月计费。' }}
          确认前不会创建账单，也不会扣费。
        </p>
        <UFormField v-if="!quoteIsZeroDue(pendingQuote.quote)" label="付款参考号" :name="'quotePayment-' + pendingQuote.plan.code">
          <UInput
            :model-value="paymentReference[pendingQuote.plan.code]"
            type="text"
            maxlength="120"
            placeholder="银行流水号或收据号"
            @update:model-value="value => paymentReference[quotePlanCode] = String(value)"
          />
        </UFormField>
        <div class="actions">
          <button class="primary" type="button" :disabled="acting !== ''" @click="confirmQuote">
            {{ quoteIsZeroDue(pendingQuote.quote) ? '确认变更' : '确认变更并登记付款' }}
          </button>
          <button class="quiet" type="button" :disabled="acting !== ''" @click="dismissQuote">取消</button>
        </div>
      </section>
      <p v-if="!canManage" class="hint">只有工作区所有者可以切换套餐、登记付款或取消订阅。</p>
      <div class="actions">
        <button class="quiet" type="button" :disabled="!canCancel || acting !== ''" @click="cancel">
          取消订阅并降级到免费版
        </button>
      </div>

      <h3>账单与收据</h3>
      <p v-if="!invoices.length" class="hint">暂无账单。</p>
      <UTable
        v-else
        data-testid="billing-invoices"
        :loading="busy"
        :data="invoices"
        :columns="columns"
        :get-row-id="invoice => invoice.id"
        :ui="{ td: 'align-top whitespace-normal', th: 'whitespace-nowrap' }"
      >
        <template #actions-cell="{ row }">
          <template v-if="row.original.status === 'pending' && canManage">
            <UInput :model-value="paymentReference[row.original.id]" type="text" maxlength="120" placeholder="付款参考号"
              class="w-[150px] mr-1.5"
              @update:model-value="value => paymentReference[row.original.id] = String(value)" />
            <button class="quiet" type="button" :disabled="acting !== ''" @click="pay(row.original)">登记付款</button>
          </template>
          <span v-else>{{ row.original.paidAtUtc ? moment(row.original.paidAtUtc) : '—' }}</span>
        </template>
      </UTable>
    </template>
  </section>
</template>

<style scoped>
.billing { margin-top: 24px }
.plan-summary { display: flex; flex-wrap: wrap; gap: 18px; align-items: end; margin: 12px 0 }
.plan-summary div { display: grid; gap: 2px }
.plan-summary span { font-size: 0.85em; opacity: 0.7 }
.usage { display: grid; gap: 8px; margin: 8px 0 16px; max-width: 560px }
.usage-row { display: grid; grid-template-columns: 90px 1fr 110px; align-items: center; gap: 10px }
.bar { height: 8px; border-radius: 999px; background: var(--nx-border); overflow: hidden }
.bar span { display: block; height: 100%; background: var(--nx-primary) }
.plans { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 14px; margin: 8px 0 16px }
.plan { border: 1px solid var(--nx-border); border-radius: var(--nx-radius-sm); padding: 14px; display: grid; gap: 8px; align-content: start }
.plan.current { border-color: var(--nx-primary); box-shadow: 0 0 0 1px var(--nx-primary) }
.plan.signup { border-color: var(--nx-warning, #d97706); box-shadow: 0 0 0 1px var(--nx-warning, #d97706) }
.plan h4 { margin: 0 }
.signup-label {
  background: #fff7ed; border-radius: 999px; color: #b45309; display: inline-block;
  font-size: 0.72em; font-weight: 700; margin-top: 4px; padding: 2px 8px;
}
.quote {
  background: var(--nx-surface-2, #f8fafc); border: 1px solid var(--nx-border);
  border-radius: var(--nx-radius-sm); display: grid; gap: 10px; margin: 8px 0 16px; padding: 16px;
}
.quote h3 { margin: 0 }
.quote-grid { display: grid; gap: 10px; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); margin: 0 }
.quote-grid div { display: grid; gap: 2px }
.quote-grid dt { color: var(--nx-ink-3); font-size: 0.8em }
.quote-grid dd { font-weight: 650; margin: 0 }
.plan ul { margin: 0; padding-left: 18px }
.plan .modules { font-size: 0.85em; opacity: 0.8; margin: 0 }
.current-label { font-weight: 600; color: var(--nx-primary); margin: 0 }
.actions { display: flex; flex-wrap: wrap; gap: 8px; margin: 12px 0 }
</style>
