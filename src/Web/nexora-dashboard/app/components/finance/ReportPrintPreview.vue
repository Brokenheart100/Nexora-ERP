<script setup lang="ts">
import ReportPrintDocument from '~/components/finance/ReportPrintDocument.vue'
import PrintPreviewSlideover from '~/components/PrintPreviewSlideover.vue'

interface ReportPrintRow {
  id: string
  label: string
  level: number
  debit?: number
  credit?: number
  amount?: number
}

export interface ReportPrintData {
  title: string
  period: string
  trial: boolean
  rows: ReportPrintRow[]
  debitTotal: number
  creditTotal: number
  balanced: boolean
}

defineProps<{
  report: ReportPrintData | null
}>()

const open = defineModel<boolean>('open', { default: false })
</script>

<template>
  <PrintPreviewSlideover
    v-model:open="open"
    :title="report?.title ?? '财务报表'"
    alert-description="A4 纵向；打印时会隐藏应用界面，只保留报表内容。图表不在打印范围内。"
    empty-title="暂无可打印报表"
    empty-description="请先切换报表页签。"
    :has-document="Boolean(report)"
    test-id="report-print-preview"
    close-test-id="report-print-close"
    print-test-id="report-print-trigger"
  >
    <ReportPrintDocument v-if="report" v-bind="report" />
  </PrintPreviewSlideover>
</template>
