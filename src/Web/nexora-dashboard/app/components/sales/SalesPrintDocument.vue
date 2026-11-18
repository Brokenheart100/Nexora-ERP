<script setup lang="ts">
interface PrintLine {
  lineNo: number
  sku: string
  name: string
  quantity: number
  unitPrice: string
  amount: string
}

defineProps<{
  kind: '销售订单' | '发票'
  documentNo: string
  customer: string
  status: string
  dateLabel: string
  dateValue: string
  owner?: string
  note?: string
  lines: PrintLine[]
  subtotal: number
  tax: number
  total: number
}>()

const printedAt = new Date().toLocaleString('zh-CN', { hour12: false })
</script>

<template>
  <article class="mx-auto max-w-[720px] bg-white p-6 text-[#161616]" data-print-document data-testid="sales-print-document">
    <header class="flex items-start justify-between border-b border-[#c6c6c6] pb-3">
      <div>
        <p class="text-[11px] uppercase tracking-wide text-[#525252]">
          Nexora ERP · 华东总部
        </p>
        <h1 class="mt-1 text-xl font-semibold text-black">
          {{ kind }}
        </h1>
      </div>
      <div class="text-right text-[11px] text-[#525252]">
        <p class="font-mono text-[13px] text-black">
          {{ documentNo }}
        </p>
        <p class="mt-1">
          {{ status }}
        </p>
      </div>
    </header>

    <dl class="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-[12px]">
      <div>
        <dt class="text-[#6f6f6f]">
          客户
        </dt>
        <dd class="mt-0.5 font-medium text-black">
          {{ customer }}
        </dd>
      </div>
      <div>
        <dt class="text-[#6f6f6f]">
          {{ dateLabel }}
        </dt>
        <dd class="mt-0.5 text-black">
          {{ dateValue }}
        </dd>
      </div>
      <div v-if="owner">
        <dt class="text-[#6f6f6f]">
          负责人
        </dt>
        <dd class="mt-0.5 text-black">
          {{ owner }}
        </dd>
      </div>
      <div>
        <dt class="text-[#6f6f6f]">
          打印时间
        </dt>
        <dd class="mt-0.5 text-black">
          {{ printedAt }}
        </dd>
      </div>
    </dl>

    <table class="mt-5 w-full border-collapse text-[12px]">
      <thead>
        <tr class="border-b border-[#8d8d8d] text-left text-[#525252]">
          <th class="py-2 pr-3 font-medium">
            序号
          </th>
          <th class="py-2 pr-3 font-medium">
            商品
          </th>
          <th class="py-2 pr-3 text-right font-medium">
            数量
          </th>
          <th class="py-2 pr-3 text-right font-medium">
            单价
          </th>
          <th class="py-2 text-right font-medium">
            金额
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="line in lines" :key="line.lineNo" class="border-b border-[#e0e0e0]">
          <td class="py-2 pr-3 tabular-nums text-[#525252]">
            {{ line.lineNo }}
          </td>
          <td class="py-2 pr-3">
            <p class="text-black">
              {{ line.name }}
            </p>
            <p class="font-mono text-[10px] text-[#6f6f6f]">
              {{ line.sku }}
            </p>
          </td>
          <td class="py-2 pr-3 text-right tabular-nums">
            {{ line.quantity }}
          </td>
          <td class="py-2 pr-3 text-right tabular-nums">
            {{ formatMoney(Number(line.unitPrice)) }}
          </td>
          <td class="py-2 text-right tabular-nums">
            {{ formatMoney(Number(line.amount)) }}
          </td>
        </tr>
      </tbody>
    </table>

    <div class="mt-4 flex justify-end">
      <dl class="w-64 space-y-1.5 text-[12px]">
        <div class="flex justify-between gap-3">
          <dt class="text-[#6f6f6f]">
            未税合计
          </dt>
          <dd class="tabular-nums">
            {{ formatMoney(subtotal) }}
          </dd>
        </div>
        <div class="flex justify-between gap-3">
          <dt class="text-[#6f6f6f]">
            税额
          </dt>
          <dd class="tabular-nums">
            {{ formatMoney(tax) }}
          </dd>
        </div>
        <div class="flex justify-between gap-3 border-t border-[#8d8d8d] pt-1.5 text-[13px] font-semibold">
          <dt>价税合计</dt>
          <dd class="tabular-nums">
            {{ formatMoney(total) }}
          </dd>
        </div>
      </dl>
    </div>

    <p v-if="note" class="mt-5 border-t border-[#e0e0e0] pt-3 text-[11px] leading-5 text-[#525252]">
      备注：{{ note }}
    </p>
    <p class="mt-3 text-[10px] text-[#8d8d8d]">
      本单据由 Nexora ERP UI 原型生成，仅使用本地模拟数据，不构成真实业务凭证。
    </p>
  </article>
</template>
