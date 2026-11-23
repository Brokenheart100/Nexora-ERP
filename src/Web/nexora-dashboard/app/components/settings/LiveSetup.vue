<script setup lang="ts">
import { useAccountingBook } from '~/composables/finance/useAccountingBook'

const live = useAccountingBook(ref('workbench'))
</script>

<template>
  <div class="space-y-4" data-testid="live-workspace-setup">
    <SettingsLiveCompany setup />
    <FinanceBookSettings v-if="live.query.enabled || live.query.loading" :live="live" />
    <UButton
      :to="{ path: '/finance', query: { workspace: live.workspace(), tab: 'tax-center' } }"
      color="neutral"
      variant="outline"
      label="继续设置税务"
      :disabled="!live.query.data?.book.settings"
    />
  </div>
</template>
