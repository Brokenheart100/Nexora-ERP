<script setup lang="ts">
import type { DeviceAuthorization } from '~/mocks'
import { deviceAuthStatusColors, deviceAuthStatusLabels, deviceClientLabels } from '~/mocks'
import { useDeviceAuthStore } from '~/stores/deviceAuth'

const auth = useDeviceAuthStore()
const code = ref(auth.selected?.code ?? '')
const codeMessage = ref('')
const deviceMessage = ref('')

const selectedAuth = computed(() => auth.selected)

function lookupCode() {
  const result = auth.lookup(code.value)
  codeMessage.value = result.message
  deviceMessage.value = ''
  if (result.ok && auth.selected) code.value = auth.selected.code
}

function useExample(item: DeviceAuthorization) {
  auth.select(item.id)
  code.value = item.code
  codeMessage.value = ''
  deviceMessage.value = ''
}

function approveDevice() {
  const result = auth.approve()
  deviceMessage.value = result.message
}

function denyDevice() {
  const result = auth.deny()
  deviceMessage.value = result.message
}

function revokeDevice() {
  const result = auth.revoke()
  deviceMessage.value = result.message
}
</script>

<template>
  <div class="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
    <section class="rounded-sm border border-default p-4">
      <div class="mb-3">
        <h3 class="text-sm font-semibold text-highlighted">
          CLI / MCP 设备授权
        </h3>
        <p class="mt-1 text-xs text-muted">
          同一界面处理设备代码核验、范围确认、同意、拒绝、过期与撤销。演示数据均为只读。
        </p>
      </div>
      <div class="flex gap-2">
        <UInput
          v-model="code"
          size="sm"
          placeholder="输入设备上显示的 8 位代码"
          class="flex-1"
          data-testid="security-device-code"
          @keyup.enter="lookupCode"
        />
        <UButton
          size="sm"
          color="primary"
          label="核验"
          data-testid="security-device-lookup"
          @click="lookupCode"
        />
      </div>
      <p
        v-if="codeMessage"
        class="mt-2 text-xs"
        :class="codeMessage.startsWith('已找到') ? 'text-success' : 'text-error'"
        data-testid="security-device-message"
      >
        {{ codeMessage }}
      </p>
      <div class="mt-3 flex flex-wrap gap-2">
        <UButton
          size="xs"
          color="neutral"
          variant="subtle"
          label="CLI 待确认"
          data-testid="security-device-example-cli"
          @click="useExample(auth.authorizations[0]!)"
        />
        <UButton
          size="xs"
          color="neutral"
          variant="subtle"
          label="MCP 待确认"
          data-testid="security-device-example-mcp"
          @click="useExample(auth.authorizations[1]!)"
        />
        <UButton
          size="xs"
          color="neutral"
          variant="subtle"
          label="过期代码"
          data-testid="security-device-example-expired"
          @click="useExample(auth.authorizations[3]!)"
        />
      </div>

      <div v-if="selectedAuth" class="mt-4 rounded-sm bg-elevated/60 p-3" data-testid="security-device-selected">
        <div class="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p class="text-sm font-medium text-highlighted">
              {{ selectedAuth.clientName }}
            </p>
            <p class="text-xs text-muted">
              {{ selectedAuth.clientDetail }}
            </p>
          </div>
          <UBadge
            :label="deviceClientLabels[selectedAuth.clientType]"
            color="neutral"
            variant="subtle"
            size="sm"
          />
        </div>
        <div class="mt-3 grid grid-cols-2 gap-2 text-xs">
          <p class="text-muted">
            授权码
          </p><p class="text-right font-mono text-toned" data-testid="security-device-code-value">
            {{ selectedAuth.code }}
          </p>
          <p class="text-muted">
            设备
          </p><p class="text-right text-toned">
            {{ selectedAuth.device }}
          </p>
          <p class="text-muted">
            地点
          </p><p class="text-right text-toned">
            {{ selectedAuth.location }}
          </p>
          <p class="text-muted">
            请求 / 过期
          </p><p class="text-right text-toned">
            {{ selectedAuth.requestedAt }} / {{ selectedAuth.expiresAt }}
          </p>
          <p class="text-muted">
            状态
          </p>
          <p class="text-right">
            <UBadge
              :label="deviceAuthStatusLabels[selectedAuth.status]"
              :color="deviceAuthStatusColors[selectedAuth.status]"
              variant="subtle"
              size="sm"
              data-testid="security-device-status"
            />
          </p>
        </div>

        <div class="mt-3 border-t border-default pt-3">
          <p class="mb-2 text-xs font-medium text-highlighted">
            授予范围 · 只读
          </p>
          <div class="space-y-2">
            <div
              v-for="scope in selectedAuth.scopes"
              :key="scope.id"
              class="rounded-sm border border-default p-2"
              :data-testid="'security-device-scope-' + scope.id"
            >
              <p class="text-xs font-medium text-toned">
                {{ scope.label }}
              </p>
              <p class="mt-0.5 text-xs text-muted">
                {{ scope.detail }}
              </p>
            </div>
          </div>
          <p class="mt-2 flex items-center gap-1 text-xs text-dimmed" data-testid="security-device-readonly">
            <UIcon name="i-carbon-view" class="size-3" /> 仅只读范围，不包含创建、修改、过账或删除权限。
          </p>
        </div>

        <p v-if="selectedAuth.note" class="mt-3 text-xs text-muted" data-testid="security-device-note">
          {{ selectedAuth.note }}
        </p>

        <div class="mt-3 flex flex-wrap gap-2">
          <UButton
            v-if="selectedAuth.status === 'pending'"
            size="sm"
            color="primary"
            label="同意授权"
            data-testid="security-device-approve"
            @click="approveDevice"
          />
          <UButton
            v-if="selectedAuth.status === 'pending'"
            size="sm"
            color="neutral"
            variant="subtle"
            label="拒绝"
            data-testid="security-device-deny"
            @click="denyDevice"
          />
          <UButton
            v-if="selectedAuth.status === 'approved'"
            size="sm"
            color="error"
            variant="subtle"
            label="撤销设备授权"
            data-testid="security-device-revoke"
            @click="revokeDevice"
          />
        </div>
        <p v-if="deviceMessage" class="mt-2 text-xs text-success" data-testid="security-device-result">
          {{ deviceMessage }}
        </p>
      </div>
    </section>

    <section class="space-y-4">
      <div class="rounded-sm border border-default p-4">
        <h3 class="mb-2 text-sm font-semibold text-highlighted">
          设备授权记录
        </h3>
        <div class="space-y-2">
          <button
            v-for="item in auth.authorizations"
            :key="item.id"
            type="button"
            class="w-full rounded-sm border border-default p-2 text-left transition hover:bg-elevated/70"
            :data-testid="'security-device-record-' + item.id"
            @click="useExample(item)"
          >
            <div class="flex items-center justify-between gap-2">
              <span class="text-xs font-medium text-toned">{{ item.clientName }}</span>
              <UBadge
                :label="deviceAuthStatusLabels[item.status]"
                :color="deviceAuthStatusColors[item.status]"
                variant="subtle"
                size="sm"
              />
            </div>
            <p class="mt-1 text-xs text-muted">
              {{ item.code }} · {{ item.device }} · {{ item.requestedAt }}
            </p>
          </button>
        </div>
      </div>
      <div class="rounded-sm border border-default p-4">
        <h3 class="mb-2 text-sm font-semibold text-highlighted">
          只读能力说明
        </h3>
        <ul class="space-y-2 text-xs text-muted">
          <li>CLI 仅申请工作区列表只读范围，用于选择目标工作区。</li>
          <li>MCP 仅申请财务、总账与报表读取，工具调用仍需在助手中逐次审批。</li>
          <li>授权码 15 分钟未确认自动过期；撤销后设备令牌立即失效。</li>
        </ul>
      </div>
    </section>
  </div>
</template>
