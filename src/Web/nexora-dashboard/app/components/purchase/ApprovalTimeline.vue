<script setup lang="ts">
import type { PurchaseApprovalStep } from '~/mocks'
import { approvalActionColors, approvalActionLabels } from '~/mocks'
import ApprovalTimeline from '~/components/ApprovalTimeline.vue'

defineProps<{ steps: PurchaseApprovalStep[] }>()
</script>

<template>
  <ApprovalTimeline
    :steps="steps"
    :labels="approvalActionLabels"
    :colors="approvalActionColors"
    test-id="order-approval-timeline"
    step-test-id="order-approval-step"
    empty-test-id="order-approval-empty"
  />
</template>
