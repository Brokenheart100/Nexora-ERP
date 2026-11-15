<script setup lang="ts">
const { t } = useI18n()
const { ready, workspace } = useCompanyWorkspace()
useHead({ title: () => t('app.teamMembers') })
</script>

<template>
  <section class="heading">
    <div>
      <h1><UIcon class="heading-icon" name="i-lucide-users-round" aria-hidden="true" />{{ t('app.teamMembers') }}</h1>
      <p v-if="workspace">{{ workspace.name }}</p>
    </div>
  </section>
  <WorkspaceGovernance v-if="workspace" :key="workspace.id" :workspace-id="workspace.id" />
  <section v-else-if="ready" class="card">
    <UAlert role="alert" color="warning" icon="i-lucide-triangle-alert" :description="t('app.companyUnavailable')" />
    <NuxtLink to="/">{{ t('app.workspace') }}</NuxtLink>
  </section>
</template>
