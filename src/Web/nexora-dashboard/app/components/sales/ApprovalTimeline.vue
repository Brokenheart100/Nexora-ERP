<script setup lang="ts">
import type { SalesApprovalStep } from '~/mocks'
import { salesApprovalColors, salesApprovalLabels } from '~/mocks'
import ApprovalTimeline from '~/components/ApprovalTimeline.vue'

defineProps<{ steps: SalesApprovalStep[] }>()
</script>

<template>
  <ApprovalTimeline
    :steps="steps"
    :labels="salesApprovalLabels"
    :colors="salesApprovalColors"
    test-id="sales-order-approval-timeline"
    step-test-id="sales-order-approval-step"
    empty-test-id="sales-order-approval-empty"
  />
</template>
