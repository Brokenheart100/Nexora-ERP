<script setup lang="ts">
import { formatBillingAmount, publicPlans } from '~/utils/billing'

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
    <article
      v-for="plan in publicPlans"
      :key="plan.code"
      class="pricing-card"
      :class="{ recommended: plan.recommended }"
      :data-testid="'pricing-' + plan.code"
    >
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

  <section class="pricing-note card">
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

<style scoped>
.pricing-hero { max-width: 780px; margin: 28px 0 22px }
.pricing-hero h1 { font-size: 32px; margin: 6px 0 12px; letter-spacing: -0.03em }
.pricing-hero .eyebrow { display: flex; gap: 10px; align-items: center; color: var(--nx-primary); font-size: 0.78em; font-weight: 700; letter-spacing: 0.16em; margin: 0 }
.pricing-hero .eyebrow::before { display: block; width: 24px; height: 1px; content: ""; background: linear-gradient(90deg, #7292d4, transparent) }
.lede { color: var(--nx-ink-2); font-size: 15px; line-height: 1.8; margin: 0 }
.pricing-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 16px; align-items: stretch }
.pricing-card {
  background: var(--nx-surface); border: 1px solid var(--nx-border); border-radius: var(--nx-radius);
  box-shadow: var(--nx-shadow-sm); display: grid; gap: 14px; align-content: start; padding: 20px; position: relative;
}
.pricing-card.recommended { border-color: var(--nx-primary); box-shadow: 0 0 0 1px var(--nx-primary), var(--nx-shadow-md) }
.pricing-card header { display: flex; gap: 12px; justify-content: space-between; align-items: start }
.pricing-card h2 { font-size: 19px; margin: 0 0 6px }
.summary { color: var(--nx-ink-3); font-size: 0.9em; line-height: 1.6; margin: 0 }
.recommended-badge {
  background: var(--nx-primary-soft); border-radius: 999px; color: var(--nx-primary); flex: none;
  font-size: 0.75em; font-weight: 700; padding: 3px 9px;
}
.price { align-items: baseline; display: flex; gap: 6px; margin: 0 }
.price strong { font-family: var(--nx-display); font-size: 32px; letter-spacing: -0.04em }
.price span { color: var(--nx-ink-3); font-size: 0.9em }
.limits { color: var(--nx-ink-2); display: grid; gap: 3px; list-style: none; margin: 0; padding: 0 }
.limits li::before { color: var(--nx-primary); content: "·"; font-weight: 800; margin-right: 8px }
.modules { color: var(--nx-ink-3); font-size: 0.82em; line-height: 1.7; margin: 0 }
.pricing-action {
  align-items: center; background: var(--nx-primary); border-radius: var(--nx-radius-sm); color: #fff;
  display: inline-flex; font-weight: 650; justify-content: center; margin-top: 4px; min-height: 40px; padding: 8px 14px;
}
.pricing-action:hover { background: var(--nx-primary-strong) }
.pricing-note { color: var(--nx-ink-2); margin-top: 22px; max-width: 900px }
.pricing-note h2 { margin-bottom: 10px }
.pricing-note p { line-height: 1.8; margin: 0 0 10px }
.pricing-links { display: flex; flex-wrap: wrap; gap: 16px; margin-top: 12px }
/* Phase 5: scoped equivalents of the removed global article/list rules. */
article { margin: 10px 0 }
article p { font-size: 12.5px; color: var(--nx-ink-3) }
li { overflow-wrap: anywhere }
@media (max-width: 640px) {
  .pricing-hero h1 { font-size: 26px }
  .pricing-card { padding: 16px }
}
</style>
