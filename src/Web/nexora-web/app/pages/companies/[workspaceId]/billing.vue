<script setup lang="ts">
const { t } = useI18n()
const { ready, workspace } = useCompanyWorkspace()
useHead({ title: () => t('app.billing') })
</script>

<template>
  <section class="heading">
    <div>
      <h1><UIcon class="heading-icon" name="i-lucide-receipt-text" aria-hidden="true" />{{ t('app.billing') }}</h1>
      <p v-if="workspace">{{ workspace.name }}</p>
    </div>
  </section>
  <WorkspaceBilling v-if="workspace" :key="workspace.id" :workspace-id="workspace.id" />
  <section v-else-if="ready" class="card">
    <UAlert role="alert" color="warning" icon="i-lucide-triangle-alert" :description="t('app.companyUnavailable')" />
    <NuxtLink to="/">{{ t('app.workspace') }}</NuxtLink>
  </section>
</template>
