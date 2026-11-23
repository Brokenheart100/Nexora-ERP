<script setup lang="ts">
import { useTaxSetup } from '~/composables/api/useTaxApi'

const setup = useTaxSetup()
const filings = ref<{ refresh: () => Promise<void> } | null>(null)
const noBook = computed(() => setup.status === 404)
async function refresh() {
  await Promise.all([setup.refresh(), filings.value?.refresh()])
}
defineExpose({ refresh })
</script>

<template>
  <section class="space-y-5" data-testid="finance-tax-center">
    <h1 class="text-lg font-semibold text-highlighted">
      税务中心
    </h1>
    <USkeleton v-if="setup.loading && !setup.data" class="h-32 w-full" />
    <UAlert
      v-else-if="setup.problem"
      :color="noBook ? 'warning' : 'error'"
      :title="noBook ? '当前账簿尚未就绪或不可访问。' : setup.problem"
      :description="setup.traceId || undefined"
      data-testid="tax-setup-error"
    >
      <template #actions>
        <UButton label="重新读取" variant="outline" @click="refresh" />
      </template>
    </UAlert>
    <template v-else-if="setup.data">
      <FinanceTaxRates :setup="setup" />
      <FinanceTaxConfiguration :setup="setup" />
      <FinanceTaxAssessment :setup="setup" />
      <FinanceTaxFilings ref="filings" />
    </template>
  </section>
</template>
