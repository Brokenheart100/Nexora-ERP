<script setup lang="ts">
const { t } = useI18n()
const { ready, workspace } = useCompanyWorkspace()
useHead({ title: () => t('app.rolesPermissions') })
</script>

<template>
  <section class="heading">
    <div>
      <h1><UIcon class="mr-2 inline-block size-[1.08em] align-[-0.16em] text-nx-primary" name="i-lucide-shield-check" aria-hidden="true" />{{ t('app.rolesPermissions') }}</h1>
      <p v-if="workspace">{{ workspace.name }}</p>
    </div>
  </section>
  <WorkspaceRoleCatalog v-if="workspace" :key="workspace.id" :workspace-id="workspace.id" />
  <section v-else-if="ready" class="card">
    <UAlert role="alert" color="warning" icon="i-lucide-triangle-alert" :description="t('app.companyUnavailable')" />
    <NuxtLink to="/">{{ t('app.workspace') }}</NuxtLink>
  </section>
</template>
