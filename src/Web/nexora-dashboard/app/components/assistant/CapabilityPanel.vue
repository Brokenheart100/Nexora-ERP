<script setup lang="ts">
import type { AssistantCapability } from '~/mocks'
import { assistantCapabilities } from '~/mocks'
import { useSessionStore } from '~/stores/session'

const props = defineProps<{
  planAvailable: boolean
  roleRestricted: boolean
}>()

const session = useSessionStore()
const { workspace } = useMockWorkspace()

const capabilityState = (capability: AssistantCapability) => {
  if (!props.planAvailable) return 'disabled'
  if (capability.financeOnly && props.roleRestricted) return 'restricted'
  if (capability.permission && !session.can(capability.permission)) return 'restricted'
  return 'ready'
}

const stateLabels = { ready: '可用', restricted: '角色受限', disabled: '套餐未包含' } as const
const stateColors = { ready: 'success', restricted: 'warning', disabled: 'neutral' } as const
</script>

<template>
  <aside class="space-y-3">
    <section class="rounded-sm border border-default p-3">
      <h2 class="text-sm font-semibold text-highlighted">
        能力状态
      </h2>
      <p class="mt-1 text-xs text-muted">
        {{ workspace.plan }} · {{ session.user.name }}（{{ session.user.roleLabel ?? session.user.title }}）
      </p>
      <div class="mt-3 space-y-2">
        <div
          v-for="capability in assistantCapabilities"
          :key="capability.id"
          class="rounded-sm border border-default p-2"
          :data-testid="'assistant-capability-' + capability.id"
        >
          <div class="flex items-center justify-between gap-2">
            <div class="flex items-center gap-2">
              <UIcon :name="capability.icon" class="size-3.5 text-muted" />
              <span class="text-xs font-medium text-toned">{{ capability.label }}</span>
            </div>
            <UBadge
              :label="stateLabels[capabilityState(capability)]"
              :color="stateColors[capabilityState(capability)]"
              variant="subtle"
              size="sm"
            />
          </div>
          <p class="mt-1 text-[11px] text-dimmed">
            {{ capability.detail }}
          </p>
        </div>
      </div>
    </section>

    <section class="rounded-sm border border-default p-3">
      <h2 class="text-sm font-semibold text-highlighted">
        工具与范围
      </h2>
      <ul class="mt-2 space-y-2 text-[11px] text-muted">
        <li class="flex gap-2">
          <UIcon name="i-carbon-view" class="mt-0.5 size-3 text-success" /> 只读：余额、账龄、报表与目录；不创建、不过账。
        </li>
        <li class="flex gap-2">
          <UIcon name="i-carbon-checkmark" class="mt-0.5 size-3 text-success" /> 每次工具调用都在会话中显示用途、参数摘要与执行范围。
        </li>
        <li class="flex gap-2">
          <UIcon name="i-carbon-close" class="mt-0.5 size-3 text-warning" /> 拒绝后不读取数据，可在结果区看到拒绝原因。
        </li>
      </ul>
    </section>

    <div class="rounded-sm border border-default bg-elevated/40 p-3 text-[11px] text-dimmed">
      角色与套餐影响可用能力。切换到标准版工作区可见套餐限制；切换到销售专员可见角色受限。
    </div>
  </aside>
</template>
