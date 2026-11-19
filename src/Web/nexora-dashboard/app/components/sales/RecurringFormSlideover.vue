<script setup lang="ts">
import type { RecurringInvoicePlan } from '~/mocks'
import { recurringIntervalLabels, recurringServiceOptions } from '~/mocks'
import type { RecurringPlanInput } from '~/stores/recurringInvoices'
import { addMonths, RECURRING_DEMO_TODAY } from '~/stores/recurringInvoices'

const props = defineProps<{
  plan: RecurringInvoicePlan | null
  customers: string[]
  canManage: boolean
  error?: string
}>()

const emit = defineEmits<{ save: [input: RecurringPlanInput] }>()
const open = defineModel<boolean>('open', { default: false })

const customerName = ref('')
const serviceId = ref('svc-it')
const quantity = ref(1)
const unitPrice = ref(12800)
const firstOn = ref('2026-12-01')
const endsOn = ref('')
const intervalMonths = ref<1 | 3 | 6 | 12>(1)
const dueDays = ref(30)

const intervalItems = computed(() => ([1, 3, 6, 12] as (1 | 3 | 6 | 12)[])
  .map(value => ({ label: recurringIntervalLabels[value], value })))

const service = computed(() => recurringServiceOptions.find(item => item.value === serviceId.value))
const amount = computed(() => quantity.value * unitPrice.value)

const preview = computed(() => {
  if (!firstOn.value) return []
  let cursor = firstOn.value
  let guard = 0
  while (cursor < RECURRING_DEMO_TODAY && guard < 240) {
    cursor = addMonths(cursor, intervalMonths.value)
    guard += 1
  }
  const dates: string[] = []
  while (dates.length < 6 && guard < 300) {
    if (endsOn.value && cursor > endsOn.value) break
    dates.push(cursor)
    cursor = addMonths(cursor, intervalMonths.value)
    guard += 1
  }
  return dates
})

watch([open, () => props.plan?.id], () => {
  if (!open.value) return
  if (props.plan) {
    customerName.value = props.plan.customerName
    serviceId.value = props.plan.serviceId
    quantity.value = props.plan.quantity
    unitPrice.value = props.plan.unitPrice
    firstOn.value = props.plan.firstOn
    endsOn.value = props.plan.endsOn ?? ''
    intervalMonths.value = props.plan.intervalMonths
    dueDays.value = props.plan.dueDays
    return
  }
  customerName.value = props.customers[0] ?? ''
  serviceId.value = 'svc-it'
  quantity.value = 1
  unitPrice.value = 12800
  firstOn.value = '2026-12-01'
  endsOn.value = ''
  intervalMonths.value = 1
  dueDays.value = 30
}, { immediate: true })

watch(serviceId, (value) => {
  const item = recurringServiceOptions.find(option => option.value === value)
  if (item) unitPrice.value = item.unitPrice
})

function submit() {
  if (!props.canManage) return
  emit('save', {
    customerName: customerName.value,
    serviceId: serviceId.value,
    serviceName: service.value?.label ?? '',
    quantity: Number(quantity.value),
    unitPrice: Number(unitPrice.value),
    intervalMonths: intervalMonths.value,
    dueDays: Number(dueDays.value),
    firstOn: firstOn.value,
    ...(endsOn.value ? { endsOn: endsOn.value } : {}),
    owner: '李婉'
  })
}
</script>

<template>
  <USlideover v-model:open="open" :ui="{ content: 'w-full sm:max-w-xl' }">
    <template #header>
      <div class="flex w-full items-start justify-between gap-2">
        <div>
          <h2 class="text-sm font-semibold text-highlighted">
            {{ plan ? '编辑定期开票计划' : '新建定期开票计划' }}
          </h2>
          <p class="mt-0.5 text-xs text-muted">
            选择客户与服务项目，录入数量、单价和计划区间；保存后会重新计算下次执行日。
          </p>
        </div>
        <UBadge
          v-if="plan"
          :label="'v' + plan.version"
          color="neutral"
          variant="subtle"
          size="sm"
        />
      </div>
    </template>

    <template #body>
      <div class="space-y-3" data-testid="recurring-form">
        <UAlert
          v-if="error"
          color="error"
          variant="subtle"
          icon="i-carbon-warning"
          :title="error"
          data-testid="recurring-form-error"
        />
        <div class="grid gap-3 sm:grid-cols-2">
          <UFormField label="客户" required>
            <USelect
              v-model="customerName"
              :items="customers"
              class="w-full"
              data-testid="recurring-form-customer"
            />
          </UFormField>
          <UFormField label="服务项目" required>
            <USelect
              v-model="serviceId"
              :items="recurringServiceOptions"
              class="w-full"
              data-testid="recurring-form-service"
            />
          </UFormField>
          <UFormField label="数量" required>
            <UInput
              v-model.number="quantity"
              type="number"
              min="1"
              class="w-full"
              data-testid="recurring-form-qty"
            />
          </UFormField>
          <UFormField label="单价（未税）" required>
            <UInput
              v-model.number="unitPrice"
              type="number"
              min="0"
              step="0.01"
              class="w-full"
              data-testid="recurring-form-price"
            />
          </UFormField>
          <UFormField label="首期日期" required>
            <UInput
              v-model="firstOn"
              type="date"
              class="w-full"
              data-testid="recurring-form-first"
            />
          </UFormField>
          <UFormField label="结束日期">
            <UInput
              v-model="endsOn"
              type="date"
              class="w-full"
              data-testid="recurring-form-end"
            />
          </UFormField>
          <UFormField label="按月间隔">
            <USelect
              v-model="intervalMonths"
              :items="intervalItems"
              class="w-full"
              data-testid="recurring-form-interval"
            />
          </UFormField>
          <UFormField label="付款账期（天）">
            <UInput
              v-model.number="dueDays"
              type="number"
              min="0"
              class="w-full"
              data-testid="recurring-form-due"
            />
          </UFormField>
        </div>

        <div class="rounded-sm border border-default p-3">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <p class="text-xs font-medium text-highlighted">
              未来执行日期
            </p>
            <span class="text-xs text-muted">每期未税 {{ formatMoney(amount) }}</span>
          </div>
          <div class="mt-2 flex flex-wrap gap-1.5" data-testid="recurring-form-preview">
            <UBadge
              v-for="date in preview"
              :key="date"
              :label="date"
              color="neutral"
              variant="subtle"
              size="sm"
            />
            <span v-if="!preview.length" class="text-xs text-muted">请先填写有效的首期日期。</span>
          </div>
        </div>
      </div>
    </template>

    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton
          label="取消"
          color="neutral"
          variant="ghost"
          data-testid="recurring-form-cancel"
          @click="open = false"
        />
        <UButton
          label="保存计划"
          icon="i-carbon-checkmark"
          :disabled="!canManage"
          data-testid="recurring-form-save"
          @click="submit"
        />
      </div>
    </template>
  </USlideover>
</template>
