<script setup lang="ts">
import { formatBillingAmount, type BillingPlanQuote } from '~/utils/billing/billing'
interface Intent { invoiceId: string; planCode: string; amountCents: number; currency: string; usesSavedCard: boolean; ticket: string }
interface State { hasSavedCard: boolean; pending: Intent | null }
const props = defineProps<{ base: string; plans: { code: string; name: string }[] }>()
const emit = defineEmits<{ paid: [] }>()
const path = computed(() => props.base + '/billing/local-checkout')
const selected = ref('')
const state = shallowRef<State>()
const quote = shallowRef<BillingPlanQuote>()
const useSaved = ref(false)
const saveCard = ref(false)
const busy = ref(false)
const notice = ref('')
const submit = useWorkspaceMutation()
const plans = computed(() => props.plans.filter(plan => plan.code !== 'free').map(plan => ({ label: plan.name, value: plan.code })))
watch(selected, () => { quote.value = undefined })
async function run(task: () => Promise<void>) {
  if (busy.value) return
  busy.value = true
  notice.value = ''
  try { await task() }
  catch (error) { notice.value = (error as { data?: { detail?: string } }).data?.detail ?? '结账操作未完成。' }
  finally { busy.value = false }
}
async function reload() {
  state.value = await $fetch<State>(path.value, { retry: 0 })
}
function getQuote() {
  return run(async () => {
    quote.value = await $fetch<BillingPlanQuote>(props.base + '/billing/plan-quote', { retry: 0, query: { planCode: selected.value } })
  })
}
function prepare() {
  return run(async () => {
    if (!quote.value || !state.value) return
    const pending = await submit<Intent>('local-checkout', path.value, 'POST', {
      planCode: quote.value.planCode, expectedAmountCents: quote.value.amountDueCents, useSavedCard: useSaved.value,
    })
    state.value = { ...state.value, pending }
    quote.value = undefined
  })
}
function confirm() {
  return run(async () => {
    const pending = state.value?.pending
    if (!pending) return
    await submit('local-checkout-confirm', path.value + '/' + pending.invoiceId + '/callback', 'POST', {
      ticket: pending.ticket, saveCard: saveCard.value,
    })
    await reload()
    notice.value = '测试付款完成。'
    emit('paid')
  })
}
</script>

<template>
  <section class="my-4" aria-label="本地测试结账">
    <UButton v-if="!state" type="button" variant="outline" :loading="busy" @click="run(reload)">打开或恢复测试结账</UButton>
    <template v-else>
      <h3>本地测试结账</h3>
      <template v-if="state.pending">
        <p>待付款 · {{ state.pending.planCode }} · {{ formatBillingAmount(state.pending.amountCents, state.pending.currency) }}</p>
        <UCheckbox v-if="!state.hasSavedCard" v-model="saveCard" label="保存测试卡" />
        <UButton type="button" :loading="busy" @click="confirm">{{ state.pending.usesSavedCard ? '确认用已保存测试卡支付' : '确认测试付款' }}</UButton>
      </template>
      <template v-else>
        <form class="my-3 flex flex-wrap items-end gap-3" @submit.prevent="getQuote">
          <UFormField label="测试结账套餐"><USelect v-model="selected" :items="plans" :disabled="busy" /></UFormField>
          <UButton type="submit" variant="outline" :disabled="busy || !selected">查看测试报价</UButton>
        </form>
        <template v-if="quote">
          <p>本次应付 {{ formatBillingAmount(quote.amountDueCents, quote.currency) }}</p>
          <UCheckbox v-if="state.hasSavedCard" v-model="useSaved" label="使用已保存的测试卡" />
          <UButton type="button" :loading="busy" @click="prepare">确认金额并继续结账</UButton>
        </template>
      </template>
    </template>
    <p v-if="notice" role="status">{{ notice }}</p>
  </section>
</template>
