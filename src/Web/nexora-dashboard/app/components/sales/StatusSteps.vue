<script setup lang="ts">
import type { QuoteStatus, SalesOrderStatus } from '~/mocks'

const props = defineProps<{
  kind: 'order' | 'quote'
  status: SalesOrderStatus | QuoteStatus
}>()

interface StatusStep {
  slot: string
  value: number
  title: string
  description: string
  icon: string
}

const orderSteps: StatusStep[] = [
  { slot: 'draft', value: 0, title: '草稿', description: '录入客户与明细', icon: 'i-carbon-document' },
  { slot: 'pending', value: 1, title: '待审批', description: '进入销售审批', icon: 'i-carbon-send-alt' },
  { slot: 'approved', value: 2, title: '已批准', description: '可发起履约', icon: 'i-carbon-checkmark' },
  { slot: 'partial', value: 3, title: '部分履约', description: '分批发货中', icon: 'i-carbon-truck' },
  { slot: 'fulfilled', value: 4, title: '已履约', description: '交付完成', icon: 'i-carbon-checkmark-filled' }
]

const quoteSteps: StatusStep[] = [
  { slot: 'draft', value: 0, title: '草稿', description: '准备报价内容', icon: 'i-carbon-document' },
  { slot: 'sent', value: 1, title: '已发送', description: '等待客户确认', icon: 'i-carbon-send-alt' },
  { slot: 'accepted', value: 2, title: '已接受', description: '可转为销售单', icon: 'i-carbon-checkmark-filled' }
]

const items = computed(() => (props.kind === 'order' ? orderSteps : quoteSteps))

// UStepper 的数字 modelValue 是「步骤索引」。
const stepValue = computed(() => {
  if (props.kind === 'order') {
    const status = props.status as SalesOrderStatus
    if (status === 'pending') return 1
    if (status === 'approved') return 2
    if (status === 'partial') return 3
    if (status === 'fulfilled' || status === 'closed') return 4
    return 0
  }
  const status = props.status as QuoteStatus
  if (status === 'sent') return 1
  if (status === 'accepted') return 2
  return 0
})

const testId = computed(() => (props.kind === 'order' ? 'sales-order-status-steps' : 'quote-status-steps'))
</script>

<template>
  <div :data-testid="testId">
    <UStepper
      :model-value="stepValue"
      :items="items"
      size="sm"
      class="pb-1"
    />
  </div>
</template>
