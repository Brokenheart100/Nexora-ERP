<script setup lang="ts">
import { formatBillingAmount, publicPlans } from '~/utils/billing/billing'

useHead({ title: '套餐与价格' })

const moduleNames: Record<string, string> = {
  company: '公司设置', book: '账簿', reports: '财务报表', aging: '财务概览', partners: '往来单位',
  catalog: '商品目录', inventory: '库存', purchasing: '采购', sales: '销售', receivables: '应收',
  audit: '审计', assistant: 'AI 助手',
}
const moduleName = (key: string) => moduleNames[key] ?? key
</script>

<template>
  <section class="pricing-hero">
    <p class="eyebrow">NEXORA ERP</p>
    <h1>按团队阶段选择套餐</h1>
    <p class="lede">
      先选套餐再注册，工作区创建后会保留你的选择并高亮对应套餐。注册本身不会扣费；进入工作区计费页确认金额与生效日期后才会变更订阅。
    </p>
  </section>

  <section class="pricing-grid" aria-label="套餐列表">
    <article v-for="plan in publicPlans" :key="plan.code" class="pricing-card"
      :class="{ recommended: plan.recommended }" :data-testid="'pricing-' + plan.code">
      <header>
        <div>
          <h2>{{ plan.name }}</h2>
          <p class="summary">{{ plan.summary }}</p>
        </div>
        <span v-if="plan.recommended" class="recommended-badge">推荐</span>
      </header>
      <p class="price">
        <strong>{{ formatBillingAmount(plan.monthlyPriceCents, plan.currency) }}</strong>
        <span>/ 月</span>
      </p>
      <ul class="limits">
        <li>工作区 {{ plan.limits.workspaces }}</li>
        <li>成员席位 {{ plan.limits.members }}</li>
        <li>单据 {{ plan.limits.documentsPerMonth }} / 月</li>
      </ul>
      <p class="modules">包含：{{ plan.modules.map(moduleName).join('、') }}</p>
      <a class="pricing-action" :href="'/bff/register?plan=' + plan.code">
        {{ plan.code === 'free' ? '免费开始' : '选择' + plan.name + '并注册' }}
      </a>
    </article>
  </section>

  <section class="pricing-note">
    <h2>套餐变更如何计费？</h2>
    <p>
      升级时按当前付费周期剩余天数折算新套餐费用，并抵扣原套餐未使用部分；降级不会产生补款，也不会退还未使用差额。
      确认面板会列出本次应付金额与生效日期，确认前不会创建账单或扣费。
    </p>
    <p>
      配额不足或需要更高限额？<a href="mailto:support@nexora.example?subject=套餐与限额咨询">联系服务团队</a>。
    </p>
    <div class="pricing-links">
      <NuxtLink to="/">返回登录</NuxtLink>
      <a href="/bff/email-login">已有账号，直接登录</a>
    </div>
  </section>
</template>

<style scoped src="~/assets/css/billing/pricing.css"></style>
