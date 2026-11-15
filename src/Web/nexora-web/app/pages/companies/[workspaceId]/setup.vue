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
