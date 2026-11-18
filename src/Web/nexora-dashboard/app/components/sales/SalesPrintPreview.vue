<script setup lang="ts">
import PrintPreviewSlideover from '~/components/PrintPreviewSlideover.vue'

export interface SalesPrintData {
  kind: '销售订单' | '发票'
  documentNo: string
  customer: string
  status: string
  dateLabel: string
  dateValue: string
  owner?: string
  note?: string
  lines: {
    lineNo: number
    sku: string
    name: string
    quantity: number
    unitPrice: string
    amount: string
  }[]
  subtotal: number
  tax: number
  total: number
}

defineProps<{
  document: SalesPrintData | null
}>()

const open = defineModel<boolean>('open', { default: false })
</script>

<template>
  <PrintPreviewSlideover
    v-model:open="open"
    :title="(document?.kind ?? '单据') + ' · ' + (document?.documentNo ?? '—')"
    alert-description="预览包含客户、明细与合计；@media print 会隐藏应用界面，只打印单据内容。"
    empty-title="请选择单据"
    empty-description="关闭预览后从详情抽屉重新打开。"
    :has-document="Boolean(document)"
    test-id="sales-print-preview"
    alert-test-id="sales-print-preview-alert"
    close-test-id="sales-print-close"
    print-test-id="sales-print-trigger"
  >
    <SalesPrintDocument v-if="document" v-bind="document" />
  </PrintPreviewSlideover>
</template>
