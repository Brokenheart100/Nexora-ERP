<script setup lang="ts">
import type { Invoice } from '~/mocks'

const props = defineProps<{ invoice: Invoice }>()

const lines = computed(() => props.invoice.lines ?? [])
const previewLines = computed(() => lines.value.slice(0, 3))
</script>

<template>
  <div
    class="rounded-sm border border-dashed border-default bg-elevated/30 p-3"
    data-testid="invoice-pdf"
  >
    <div class="mb-2.5 flex flex-wrap items-center justify-between gap-2">
      <p class="text-xs font-medium text-muted">
        PDF 预览（占位面板）
      </p>
      <UBadge
        color="warning"
        variant="subtle"
        size="sm"
        label="演示"
        data-testid="invoice-pdf-demo"
      />
    </div>

    <div class="relative mx-auto max-w-md overflow-hidden rounded-sm border border-default bg-default p-5">
      <div class="flex items-start justify-between gap-3 border-b border-default pb-3">
        <div>
          <p class="text-sm font-semibold text-highlighted">
            Nexora 演示公司
          </p>
          <p class="mt-0.5 text-[11px] text-muted">
            增值税专用发票（演示样式）
          </p>
        </div>
        <p class="font-mono text-[11px] text-muted">
          {{ invoice.id }}
        </p>
      </div>

      <dl class="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
        <div>
          <dt class="text-muted">
            购方
          </dt>
          <dd class="mt-0.5 text-default">
            {{ invoice.customerName }}
          </dd>
        </div>
        <div class="text-right">
          <dt class="text-muted">
            开票日期
          </dt>
          <dd class="mt-0.5 tabular-nums text-default">
            {{ invoice.issuedAt }}
          </dd>
        </div>
      </dl>

      <table class="mt-3 w-full text-[11px]">
        <thead>
          <tr class="border-b border-default text-muted">
            <th class="py-1 text-left font-medium">
              商品
            </th>
            <th class="py-1 text-right font-medium">
              数量
            </th>
            <th class="py-1 text-right font-medium">
              金额
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="line in previewLines" :key="line.lineNo" class="border-b border-default/60">
            <td class="max-w-[190px] truncate py-1 text-default">
              {{ line.name }}
            </td>
            <td class="py-1 text-right tabular-nums text-default">
              {{ line.quantity }}
            </td>
            <td class="py-1 text-right tabular-nums text-default">
              {{ formatMoney(Number(line.amount)) }}
            </td>
          </tr>
        </tbody>
      </table>

      <p v-if="lines.length > previewLines.length" class="mt-1 text-[10px] text-muted">
        另有 {{ lines.length - previewLines.length }} 行明细未在预览中展示
      </p>

      <div class="mt-3 space-y-0.5 text-[11px]">
        <div class="flex justify-between gap-3">
          <span class="text-muted">税额</span>
          <span class="tabular-nums text-default">{{ formatMoney(Number(invoice.taxAmount)) }}</span>
        </div>
        <div class="flex justify-between gap-3 border-t border-default pt-1 font-semibold">
          <span class="text-highlighted">价税合计</span>
          <span class="tabular-nums text-highlighted">{{ formatMoney(Number(invoice.amount)) }}</span>
        </div>
      </div>

      <p class="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 rotate-[-18deg] text-3xl font-bold text-primary/10">
        演示
      </p>
    </div>

    <p class="mt-2 text-center text-[11px] text-muted">
      原型不生成真实 PDF，也不会发起下载请求。
    </p>
  </div>
</template>
