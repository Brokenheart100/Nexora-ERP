<script setup lang="ts">
interface ReportPrintRow {
  id: string
  label: string
  level: number
  debit?: number
  credit?: number
  amount?: number
}

defineProps<{
  title: string
  period: string
  trial: boolean
  rows: ReportPrintRow[]
  debitTotal: number
  creditTotal: number
  balanced: boolean
}>()

const printedAt = new Date().toLocaleString('zh-CN', { hour12: false })
</script>

<template>
  <article class="mx-auto max-w-[720px] bg-white p-6 text-[#161616]" data-print-document data-testid="report-print-document">
    <header class="flex items-start justify-between border-b border-[#c6c6c6] pb-3">
      <div>
        <p class="text-[11px] uppercase tracking-wide text-[#525252]">
          Nexora ERP · 华东总部
        </p>
        <h1 class="mt-1 text-xl font-semibold text-black">
          {{ title }}
        </h1>
        <p class="mt-1 text-[11px] text-[#525252]">
          会计期间 {{ period }}
        </p>
      </div>
      <div class="text-right text-[11px] text-[#525252]">
        <p>{{ trial ? (balanced ? '借贷平衡' : '借贷不平衡') : '本期快照' }}</p>
        <p class="mt-1">
          打印 {{ printedAt }}
        </p>
      </div>
    </header>

    <table v-if="trial" class="mt-5 w-full border-collapse text-[12px]">
      <thead>
        <tr class="border-b border-[#8d8d8d] text-left text-[#525252]">
          <th class="py-2 pr-3 font-medium">
            项目
          </th>
          <th class="py-2 pr-3 text-right font-medium">
            借方余额
          </th>
          <th class="py-2 text-right font-medium">
            贷方余额
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="row.id" class="border-b border-[#e0e0e0]">
          <td class="py-2 pr-3" :style="{ paddingLeft: (row.level - 1) * 12 + 'px' }">
            {{ row.label }}
          </td>
          <td class="py-2 pr-3 text-right tabular-nums">
            {{ row.debit ? formatMoney(row.debit) : '—' }}
          </td>
          <td class="py-2 text-right tabular-nums">
            {{ row.credit ? formatMoney(row.credit) : '—' }}
          </td>
        </tr>
        <tr class="border-t border-[#8d8d8d] text-[13px] font-semibold">
          <td class="py-2 pr-3">
            合计
          </td>
          <td class="py-2 pr-3 text-right tabular-nums">
            {{ formatMoney(debitTotal) }}
          </td>
          <td class="py-2 text-right tabular-nums">
            {{ formatMoney(creditTotal) }}
          </td>
        </tr>
      </tbody>
    </table>

    <table v-else class="mt-5 w-full border-collapse text-[12px]">
      <thead>
        <tr class="border-b border-[#8d8d8d] text-left text-[#525252]">
          <th class="py-2 pr-3 font-medium">
            项目
          </th>
          <th class="py-2 text-right font-medium">
            本期金额
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="row.id" class="border-b border-[#e0e0e0]">
          <td class="py-2 pr-3" :style="{ paddingLeft: (row.level - 1) * 12 + 'px' }">
            {{ row.label }}
          </td>
          <td class="py-2 text-right tabular-nums">
            {{ formatMoney(row.amount ?? 0) }}
          </td>
        </tr>
      </tbody>
    </table>

    <p class="mt-5 border-t border-[#e0e0e0] pt-3 text-[10px] text-[#8d8d8d]">
      本报表由 Nexora ERP UI 原型生成，使用本地模拟快照，不构成真实财务报告。
    </p>
  </article>
</template>
