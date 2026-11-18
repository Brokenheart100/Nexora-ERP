<script setup lang="ts">
import type { PurchaseOrder } from '~/mocks'
import { approvalActionLabels, latestApproval, statusLabels } from '~/mocks'

const props = defineProps<{
  order: PurchaseOrder
  companyName: string
}>()

const approval = computed(() => latestApproval(props.order))
const subtotal = computed(() => orderTotal(props.order))
const tax = computed(() => subtotal.value * 0.13)
const total = computed(() => subtotal.value + tax.value)
const printedAt = computed(() => new Date().toLocaleString('zh-CN', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit'
}))
</script>

<template>
  <div class="bg-white p-8 text-[13px] text-black" data-print-document data-testid="print-document">
    <header class="flex flex-wrap items-start justify-between gap-4 border-b border-black/80 pb-3">
      <div>
        <p class="text-xs text-black/60">
          {{ companyName }}
        </p>
        <h1 class="mt-0.5 text-xl font-semibold">
          采购订单
        </h1>
        <p class="mt-1 text-xs text-black/60">
          单号 {{ order.id }} · 状态 {{ statusLabels[order.status] }}
        </p>
      </div>
      <div class="text-right text-xs text-black/70">
        <p>打印时间 {{ printedAt }}</p>
        <p class="mt-0.5">
          明细 {{ order.lines.length }} 行
        </p>
      </div>
    </header>

    <section class="grid gap-x-8 gap-y-2 py-4 text-xs sm:grid-cols-2" data-testid="print-summary">
      <p><span class="text-black/60">供应商：</span>{{ order.supplier }}</p>
      <p><span class="text-black/60">联系人：</span>{{ order.contact || '—' }}</p>
      <p><span class="text-black/60">下单日期：</span>{{ order.orderedAt }}</p>
      <p><span class="text-black/60">预计到货：</span>{{ order.expectedAt }}</p>
      <p><span class="text-black/60">审批：</span>{{ approval ? approvalActionLabels[approval.action] + ' · ' + approval.actor : '待审批' }}</p>
      <p><span class="text-black/60">备注：</span>{{ order.note || '—' }}</p>
    </section>

    <table class="w-full border-collapse text-xs" data-testid="print-lines">
      <thead>
        <tr class="bg-black/[0.04] text-left">
          <th class="border border-black/20 px-2 py-1.5">
            行号
          </th>
          <th class="border border-black/20 px-2 py-1.5">
            商品
          </th>
          <th class="border border-black/20 px-2 py-1.5">
            SKU
          </th>
          <th class="border border-black/20 px-2 py-1.5 text-right">
            数量
          </th>
          <th class="border border-black/20 px-2 py-1.5 text-right">
            已收
          </th>
          <th class="border border-black/20 px-2 py-1.5 text-right">
            单价
          </th>
          <th class="border border-black/20 px-2 py-1.5 text-right">
            金额
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="line in order.lines" :key="line.lineNo">
          <td class="border border-black/20 px-2 py-1.5 tabular-nums">
            {{ line.lineNo }}
          </td>
          <td class="border border-black/20 px-2 py-1.5">
            <span>{{ line.name }}</span>
            <span v-if="line.spec" class="ml-1 text-[11px] text-black/60">{{ line.spec }}</span>
          </td>
          <td class="border border-black/20 px-2 py-1.5 text-[11px] text-black/70">
            {{ line.sku }}
          </td>
          <td class="border border-black/20 px-2 py-1.5 text-right tabular-nums">
            {{ line.quantity }}
          </td>
          <td class="border border-black/20 px-2 py-1.5 text-right tabular-nums">
            {{ line.received }}
          </td>
          <td class="border border-black/20 px-2 py-1.5 text-right tabular-nums">
            {{ formatMoney(line.unitPrice) }}
          </td>
          <td class="border border-black/20 px-2 py-1.5 text-right tabular-nums">
            {{ formatMoney(line.quantity * line.unitPrice) }}
          </td>
        </tr>
      </tbody>
    </table>

    <div class="mt-3 flex justify-end">
      <dl class="w-52 space-y-1 text-xs">
        <div class="flex justify-between gap-4">
          <dt class="text-black/60">
            未税合计
          </dt>
          <dd class="tabular-nums">
            {{ formatMoney(subtotal) }}
          </dd>
        </div>
        <div class="flex justify-between gap-4">
          <dt class="text-black/60">
            税额（13%）
          </dt>
          <dd class="tabular-nums">
            {{ formatMoney(tax) }}
          </dd>
        </div>
        <div class="flex justify-between gap-4 border-t border-black/60 pt-1 font-semibold">
          <dt>价税合计</dt>
          <dd class="tabular-nums">
            {{ formatMoney(total) }}
          </dd>
        </div>
      </dl>
    </div>

    <footer class="mt-6 flex flex-wrap justify-between gap-2 border-t border-black/30 pt-2 text-[11px] text-black/60">
      <span>本打印件由纯 UI 原型生成，不接 PDF 服务。</span>
      <span>{{ companyName }} · 采购订单 {{ order.id }}</span>
    </footer>
  </div>
</template>
