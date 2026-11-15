<script setup lang="ts">
const { t } = useI18n()
const { ready, workspace } = useCompanyWorkspace()
useHead({ title: '初始化向导' })
</script>

<template>
  <section class="heading">
    <div>
      <h1><UIcon class="mr-2 inline-block size-[1.08em] align-[-0.16em] text-nx-primary" name="i-lucide-list-checks" aria-hidden="true" />初始化向导</h1>
      <p v-if="workspace">{{ workspace.name }} · 本位币 {{ workspace.baseCurrency }} · 国家/地区 {{ workspace.countryCode }}</p>
    </div>
    <NuxtLink to="/">返回工作台</NuxtLink>
  </section>
  <WorkspaceSetup v-if="workspace" :key="workspace.id" :workspace-id="workspace.id" />
  <section v-else-if="ready" class="card">
    <UAlert role="alert" color="warning" icon="i-lucide-triangle-alert" :description="t('app.companyUnavailable')" />
    <NuxtLink to="/">{{ t('app.workspace') }}</NuxtLink>
  </section>
</template>

<style scoped>
.heading { display: flex; gap: 36px; align-items: flex-end; justify-content: space-between; padding: 46px 0 30px }
.heading > div:first-child { min-width: 0 }
.heading h1 { margin: 13px 0 10px; font-size: clamp(28px, 3.1vw, 37px); font-weight: 750; letter-spacing: -0.035em }
.heading > div:first-child > p:last-child { max-width: 58ch; margin: 0; font-size: 14px; color: #5f6f88 }
@media (max-width: 980px) {
  .heading { align-items: flex-start }
}
@media (max-width: 700px) {
  .heading { display: block; padding: 30px 0 22px }
  .heading h1 { font-size: 27px }
}
@media (max-width: 420px) {
  .heading h1 { font-size: 24px }
}
html.dark .heading > div:first-child > p:last-child { color: var(--nx-ink-3) }
</style>
