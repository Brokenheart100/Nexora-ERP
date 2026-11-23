<script setup lang="ts">
import type { TaxSnapshot } from '#shared/types/tax'
import { multiplyDecimals } from '#shared/utils/decimal'
import { displayDecimal } from '~/utils/api/decimal-display'

const props = defineProps<{ snapshot: TaxSnapshot }>()
const sources = { explicit: '显式税组', item: '商品税组', partner: '伙伴税组' }
const money = (value: string) => displayDecimal(value, props.snapshot.minorUnits)
</script>

<template>
  <div class="space-y-3">
    <p class="text-sm text-muted">
      {{ snapshot.on }} · {{ snapshot.group.code }} v{{ snapshot.group.version }} · {{ snapshot.currency }}
      <template v-if="snapshot.groupSource">
        · {{ sources[snapshot.groupSource] }}
      </template>
    </p>
    <p class="text-xs text-muted">
      {{ snapshot.includesTax ? '含税' : '未税' }}单价 {{ snapshot.unitPrice }} × {{ snapshot.quantity }}
      · 折扣 {{ multiplyDecimals(snapshot.discount, '100') }}%
    </p>
    <dl class="grid grid-cols-3 gap-2 rounded-sm bg-elevated/50 p-3 text-sm tabular-nums">
      <div>
        <dt class="text-muted">
          未税
        </dt><dd>{{ money(snapshot.amounts.net) }}</dd>
      </div>
      <div>
        <dt class="text-muted">
          税额
        </dt><dd>{{ money(snapshot.amounts.tax) }}</dd>
      </div>
      <div>
        <dt class="text-muted">
          含税合计
        </dt><dd>{{ money(snapshot.amounts.total) }}</dd>
      </div>
    </dl>
    <FinanceTaxComponents
      v-if="snapshot.amounts.components?.length"
      :components="snapshot.amounts.components"
      :minor-units="snapshot.minorUnits"
    />
  </div>
</template>
