<script setup lang="ts">
import type { SalesReceivablesConnection } from '~/composables/sales/useSalesReceivables'
import { displayDecimal } from '~/utils/api/decimal-display'

const props = defineProps<{ live: SalesReceivablesConnection }>()
const form = computed(() => props.live.form)
</script>

<template>
  <div class="space-y-3">
    <div class="grid gap-3 sm:grid-cols-3">
      <UFormField label="发票号" :required="!live.query.data?.home.fiscalNumbering">
        <UInput
          v-model="form.number"
          :placeholder="live.query.data?.home.fiscalNumbering ? '留空则在复核时编号' : '输入发票号'"
          :disabled="live.frozen || !!form.id"
          class="w-full"
          data-testid="sales-invoice-number"
        />
      </UFormField>
      <UFormField label="开票日期" required>
        <UInput
          v-model="form.on"
          type="date"
          :disabled="live.frozen"
          class="w-full"
          data-testid="sales-invoice-date"
        />
      </UFormField>
      <UFormField label="到期日">
        <UInput
          v-model="form.dueOn"
          type="date"
          :disabled="live.frozen"
          class="w-full"
          data-testid="sales-invoice-due"
        />
      </UFormField>
    </div>
    <UCard class="rounded-sm" :ui="{ body: 'p-3 sm:p-3', header: 'p-3 sm:p-3' }">
      <template #header>
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h3 class="text-sm font-medium">
            可开票发货行
          </h3>
          <div class="flex gap-2">
            <UButton
              label="上一页"
              size="xs"
              variant="outline"
              :disabled="live.pages.shipments <= 1 || live.frozen"
              @click="live.changePage('shipments', -1)"
            />
            <UButton
              label="下一页"
              size="xs"
              variant="outline"
              :disabled="(live.query.data?.shipments.length ?? 0) < live.pageSize || live.frozen"
              @click="live.changePage('shipments', 1)"
            />
          </div>
        </div>
      </template>
      <div v-if="!live.invoiceSources.length" class="text-sm text-muted">
        当前页没有可开票发货行。仓库发货后可刷新确认财务入账。
      </div>
      <div
        v-for="source in live.invoiceSources"
        :key="source.id"
        class="flex flex-wrap items-center justify-between gap-2 border-b border-default py-2"
        :data-testid="'invoice-source-' + source.id"
      >
        <div class="text-sm">
          <p>{{ source.name }}</p>
          <p class="text-xs text-muted">
            {{ source.customerName }} · {{ source.on || '—' }} · 可开 {{ source.available }} · 单价 {{ displayDecimal(source.unitPrice) }}
          </p>
        </div>
        <UInput
          :model-value="form.quantities[source.id]"
          inputmode="decimal"
          placeholder="开票数量"
          aria-label="开票数量"
          :disabled="live.frozen"
          class="w-28"
          data-testid="sales-invoice-quantity"
          @update:model-value="live.setSourceQuantity(source.id, $event)"
        />
      </div>
      <p class="mt-2 text-xs text-muted">
        税额与含税金额由财务服务按客户或商品税组计算。
      </p>
    </UCard>
  </div>
</template>
