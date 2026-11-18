<script setup lang="ts">
import type { PurchaseOrder } from '~/mocks'
import PrintPreviewSlideover from '~/components/PrintPreviewSlideover.vue'

defineProps<{
  order: PurchaseOrder | null
  companyName: string
}>()

const open = defineModel<boolean>('open', { default: false })
</script>

<template>
  <PrintPreviewSlideover
    v-model:open="open"
    :title="(order?.id ?? '—') + ' · 单据摘要与明细'"
    alert-description="预览包含单据摘要与明细行；@media print 样式会隐藏应用界面，只打印单据内容。"
    empty-title="请选择采购单"
    empty-description="关闭预览后从详情抽屉重新打开。"
    :has-document="Boolean(order)"
    test-id="print-preview"
    alert-test-id="print-preview-alert"
    close-test-id="print-close"
    print-test-id="print-trigger"
  >
    <PurchasePrintDocument v-if="order" :order="order" :company-name="companyName" />
  </PrintPreviewSlideover>
</template>
