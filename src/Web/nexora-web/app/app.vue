<script setup lang="ts">
const head = useLocaleHead()
useHead(() => ({ htmlAttrs: head.value.htmlAttrs }))
</script>

<template>
  <UApp>
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
    <AppVersionNotice />
    <AppStatusOverlay />
    <AppOfflineNotice />
    <AppSessionGuard />
    <AppInstallPrompt />
  </UApp>
</template>
