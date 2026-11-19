<script setup lang="ts">
import type { BadgeColor } from '~/mocks'

interface ApprovalTimelineStep {
  id: string
  action: string
  actor: string
  at: string
  note?: string
}

defineProps<{
  steps: ApprovalTimelineStep[]
  labels: Record<string, string>
  colors: Record<string, BadgeColor>
  testId: string
  stepTestId: string
  emptyTestId: string
}>()

const iconMap: Record<string, string> = {
  submitted: 'i-carbon-send-alt',
  approved: 'i-carbon-checkmark-filled',
  rejected: 'i-carbon-close-filled'
}

const toneMap: Record<string, string> = {
  submitted: 'bg-warning/10 text-warning',
  approved: 'bg-success/10 text-success',
  rejected: 'bg-error/10 text-error'
}
</script>

<template>
  <div :data-testid="testId">
    <ol v-if="steps.length" class="space-y-3">
      <li
        v-for="(step, index) in steps"
        :key="step.id"
        class="flex gap-2.5"
        :data-testid="stepTestId"
      >
        <div class="flex flex-col items-center">
          <span class="flex size-5 shrink-0 items-center justify-center rounded-full" :class="toneMap[step.action]">
            <UIcon :name="iconMap[step.action]" class="size-3" />
          </span>
          <span v-if="index < steps.length - 1" class="mt-1 flex-1 border-l border-default" />
        </div>
        <div class="min-w-0 flex-1 pb-0.5">
          <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
            <UBadge
              :color="colors[step.action]"
              variant="subtle"
              size="sm"
              :label="labels[step.action]"
            />
            <span class="text-xs font-medium text-default">{{ step.actor }}</span>
            <span class="text-[11px] tabular-nums text-muted">{{ step.at }}</span>
          </div>
          <p v-if="step.note" class="mt-1 text-xs text-muted">
            {{ step.note }}
          </p>
        </div>
      </li>
    </ol>
    <p v-else class="text-xs text-muted" :data-testid="emptyTestId">
      暂无审批轨迹
    </p>
  </div>
</template>
