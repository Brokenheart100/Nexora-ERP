<script setup lang="ts">
import type { WireWarehouse } from '#shared/types/prerequisites'
import type { Warehouse, WarehouseSummary } from '~/mocks'
import { warehouseStatusColors, warehouseStatusLabels } from '~/mocks'

defineProps<{
  wire?: WireWarehouse
  warehouse?: Warehouse
  address?: string
  summary?: WarehouseSummary
}>()

const emit = defineEmits<{ open: [] }>()
</script>

<template>
  <UCard
    class="h-full rounded-sm nx-lift"
    :ui="{ body: 'p-4 sm:p-4', footer: 'px-4 py-2.5 sm:px-4' }"
    data-testid="warehouse-card"
  >
    <div class="flex items-start justify-between gap-2">
      <div class="min-w-0">
        <p class="font-mono text-[11px] text-muted">
          {{ wire?.code ?? warehouse?.code }}
        </p>
        <h3 class="mt-1 truncate text-sm font-semibold text-highlighted">
          {{ wire?.name ?? warehouse?.name }}
        </h3>
        <p v-if="!wire" class="mt-1.5 flex items-start gap-1 text-xs text-muted">
          <UIcon name="i-carbon-location" class="mt-0.5 size-3.5 shrink-0" />
          <span class="whitespace-normal">{{ address }}</span>
        </p>
      </div>
      <UBadge
        v-if="warehouse && !wire"
        :color="warehouseStatusColors[warehouse.status]"
        variant="subtle"
        size="sm"
        :label="warehouseStatusLabels[warehouse.status]"
      />
    </div>

    <dl v-if="warehouse && summary && !wire" class="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-[12.5px]">
      <div>
        <dt class="text-[11px] text-muted">
          负责人
        </dt>
        <dd class="mt-0.5 text-default">
          {{ warehouse.manager }}
        </dd>
      </div>
      <div>
        <dt class="text-[11px] text-muted">
          库存种类
        </dt>
        <dd class="mt-0.5 tabular-nums text-default">
          {{ summary.skuCount }} 种
        </dd>
      </div>
      <div>
        <dt class="text-[11px] text-muted">
          库存位置
        </dt>
        <dd class="mt-0.5 tabular-nums text-default">
          {{ summary.positionCount }} 个
        </dd>
      </div>
      <div>
        <dt class="text-[11px] text-muted">
          库存数量
        </dt>
        <dd class="mt-0.5 tabular-nums text-default">
          {{ formatNumber(summary.totalQuantity) }} 件
        </dd>
      </div>
    </dl>

    <dl v-if="wire" class="mt-3 grid grid-cols-2 gap-2 text-xs" data-testid="warehouse-capabilities">
      <dt>库存查看</dt><dd>{{ wire.canReadStock ? '可查看' : '无读取权限' }}</dd><dt>收货执行</dt><dd>{{ wire.canReceive ? '可执行' : '不可执行' }}</dd>
    </dl>
    <div v-if="summary && !wire" class="mt-3 flex items-center justify-between gap-2 rounded-sm bg-elevated/60 px-2.5 py-1.5" data-testid="warehouse-summary">
      <span class="text-xs text-muted">低于演示阈值的位置</span>
      <UBadge
        :color="summary.warningCount ? 'warning' : 'neutral'"
        variant="subtle"
        size="sm"
        data-testid="warehouse-warning-count"
      >
        {{ summary.warningCount }} 个
      </UBadge>
    </div>

    <template #footer>
      <div class="flex items-center justify-between gap-2">
        <span v-if="summary && !wire" class="text-xs text-muted">{{ summary.zeroCount }} 个位置零库存</span>
        <UButton
          :label="wire ? '查看许可与库存' : '查看库存位置'"
          trailing-icon="i-carbon-arrow-right"
          color="neutral"
          variant="ghost"
          size="xs"
          data-testid="warehouse-open"
          @click="emit('open')"
        />
      </div>
    </template>
  </UCard>
</template>
