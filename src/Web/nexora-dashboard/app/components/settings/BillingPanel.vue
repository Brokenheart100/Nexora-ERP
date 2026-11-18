<script setup lang="ts">
import { billingPlans, subscriptionStatusLabels } from '~/mocks'

const toast = useToast()
const org = useOrganizationStore()
const session = useSessionStore()
const { workspace, activeWorkspaceId } = useMockWorkspace()

const cycle = ref<'monthly' | 'annual'>('annual')
const subscription = computed(() => org.subscriptionMap[activeWorkspaceId.value])
const currentPlan = computed(() => billingPlans.find(item => item.id === subscription.value?.planId) ?? billingPlans[0]!)
const priceOf = (plan: typeof billingPlans[number]) => (cycle.value === 'annual' ? plan.annualPrice : plan.monthlyPrice)
const cycleSuffix = computed(() => (cycle.value === 'annual' ? '/ 年' : '/ 月'))
const seatPercent = computed(() => Math.min(100, Math.round(((subscription.value?.seatsUsed ?? 0) / currentPlan.value.seatLimit) * 100)))
const storagePercent = computed(() => Math.min(100, Math.round(((subscription.value?.storageUsedGb ?? 0) / currentPlan.value.storageLimitGb) * 100)))
const invoicePercent = computed(() => Math.min(100, Math.round(((subscription.value?.invoicesUsed ?? 0) / currentPlan.value.invoiceLimit) * 100)))
const usageColor = (value: number) => (value >= 95 ? 'error' : value >= 80 ? 'warning' : 'primary')

const pendingPlan = ref<typeof billingPlans[number] | null>(null)
const changeOpen = ref(false)

function askChange(plan: typeof billingPlans[number]) {
  pendingPlan.value = plan
  changeOpen.value = true
}

function confirmChange() {
  if (!pendingPlan.value) return
  const target = pendingPlan.value
  org.changePlan(activeWorkspaceId.value, target.id)
  org.recordAudit(activeWorkspaceId.value, session.user.name, '变更订阅套餐', target.name)
  toast.add({
    title: '套餐已切换为' + target.name,
    description: '演示环境不会产生真实扣费，刷新后恢复初始套餐。',
    color: 'success',
    icon: 'i-carbon-upgrade'
  })
  changeOpen.value = false
  pendingPlan.value = null
}

const cancelOpen = ref(false)
function confirmCancel() {
  org.cancelSubscription(activeWorkspaceId.value)
  org.recordAudit(activeWorkspaceId.value, session.user.name, '取消订阅', currentPlan.value.name)
  toast.add({ title: '订阅已取消', description: '演示环境仅在本地标记；可随时恢复。', color: 'warning', icon: 'i-carbon-warning-alt' })
  cancelOpen.value = false
}

function scrollToPlans() {
  document.getElementById('billing-plan-list')?.scrollIntoView({ behavior: 'smooth' })
}

function restore() {
  if (!subscription.value) return
  org.changePlan(activeWorkspaceId.value, subscription.value.planId)
  org.recordAudit(activeWorkspaceId.value, session.user.name, '恢复订阅', currentPlan.value.name)
  toast.add({ title: '订阅已恢复', description: currentPlan.value.name, color: 'success', icon: 'i-carbon-checkmark' })
}
</script>

<template>
  <div class="space-y-4" data-testid="settings-billing">
    <UCard v-if="subscription" :ui="{ body: 'p-4 sm:p-5' }">
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div class="flex flex-wrap items-center gap-2">
            <h3 class="text-sm font-semibold text-highlighted">
              当前订阅
            </h3>
            <UBadge :color="subscription.status === 'active' ? 'success' : 'warning'" variant="subtle" size="sm">
              {{ subscriptionStatusLabels[subscription.status] }}
            </UBadge>
            <UBadge color="primary" variant="subtle" size="sm">
              {{ currentPlan.name }}
            </UBadge>
          </div>
          <p class="mt-1 text-xs text-muted">
            {{ workspace.name }} · 自 {{ subscription.startedAt }} 起订阅 ·
            <span v-if="subscription.status === 'active'">下次续费 {{ subscription.renewsAt }}</span>
            <span v-else>将于 {{ subscription.renewsAt }} 到期</span>
          </p>
        </div>
        <div class="flex flex-wrap gap-2">
          <UButton
            v-if="subscription.status === 'active'"
            label="取消订阅"
            color="neutral"
            variant="outline"
            size="sm"
            data-testid="billing-cancel"
            @click="cancelOpen = true"
          />
          <UButton
            v-else
            label="恢复订阅"
            icon="i-carbon-renew"
            color="success"
            variant="outline"
            size="sm"
            data-testid="billing-restore"
            @click="restore"
          />
          <UButton
            label="查看套餐"
            icon="i-carbon-arrow-down"
            color="neutral"
            variant="ghost"
            size="sm"
            @click="scrollToPlans"
          />
        </div>
      </div>

      <div class="mt-5 grid gap-4 md:grid-cols-3">
        <div>
          <div class="mb-1 flex items-center justify-between text-xs">
            <span class="text-muted">成员席位</span>
            <span class="font-mono text-default">{{ subscription.seatsUsed }} / {{ currentPlan.seatLimit }}</span>
          </div>
          <UProgress
            :model-value="seatPercent"
            :color="usageColor(seatPercent)"
            size="sm"
            data-testid="billing-usage-seats"
          />
        </div>
        <div>
          <div class="mb-1 flex items-center justify-between text-xs">
            <span class="text-muted">存储空间</span>
            <span class="font-mono text-default">{{ subscription.storageUsedGb }} / {{ currentPlan.storageLimitGb }} GB</span>
          </div>
          <UProgress
            :model-value="storagePercent"
            :color="usageColor(storagePercent)"
            size="sm"
            data-testid="billing-usage-storage"
          />
        </div>
        <div>
          <div class="mb-1 flex items-center justify-between text-xs">
            <span class="text-muted">本月发票</span>
            <span class="font-mono text-default">{{ subscription.invoicesUsed }} / {{ currentPlan.invoiceLimit }}</span>
          </div>
          <UProgress
            :model-value="invoicePercent"
            :color="usageColor(invoicePercent)"
            size="sm"
            data-testid="billing-usage-invoices"
          />
        </div>
      </div>
    </UCard>

    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h3 class="text-sm font-semibold text-highlighted">
          套餐对比
        </h3>
        <p class="mt-0.5 text-xs text-muted">
          升级与取消只改本地演示状态，不产生支付或扣费。
        </p>
      </div>
      <div class="flex rounded-sm border border-default p-0.5">
        <button
          type="button"
          class="rounded-sm px-3 py-1 text-xs"
          :class="cycle === 'monthly' ? 'bg-elevated text-highlighted' : 'text-muted'"
          data-testid="billing-cycle-monthly"
          @click="cycle = 'monthly'"
        >
          按月
        </button>
        <button
          type="button"
          class="rounded-sm px-3 py-1 text-xs"
          :class="cycle === 'annual' ? 'bg-elevated text-highlighted' : 'text-muted'"
          data-testid="billing-cycle-annual"
          @click="cycle = 'annual'"
        >
          按年 <span class="text-success">省 2 个月</span>
        </button>
      </div>
    </div>

    <div id="billing-plan-list" class="grid gap-4 lg:grid-cols-3" data-testid="billing-plans">
      <UCard
        v-for="plan in billingPlans"
        :key="plan.id"
        :ui="{ root: plan.id === currentPlan.id ? 'ring-1 ring-primary' : '', body: 'p-4 sm:p-5' }"
        :data-testid="'billing-plan-' + plan.id"
      >
        <div class="flex items-center justify-between gap-2">
          <h4 class="text-sm font-semibold text-highlighted">
            {{ plan.name }}
          </h4>
          <UBadge
            v-if="plan.recommended"
            color="primary"
            variant="subtle"
            size="sm"
          >
            推荐
          </UBadge>
          <UBadge
            v-if="plan.id === currentPlan.id"
            color="success"
            variant="subtle"
            size="sm"
          >
            当前
          </UBadge>
        </div>
        <p class="mt-1 min-h-8 text-xs text-muted">
          {{ plan.description }}
        </p>
        <p class="mt-3">
          <span class="text-2xl font-semibold text-highlighted">¥{{ formatMoney(priceOf(plan)) }}</span>
          <span class="ml-1 text-xs text-muted">{{ cycleSuffix }}</span>
        </p>
        <div class="mt-3 flex flex-wrap gap-1.5 text-xs text-muted">
          <UBadge color="neutral" variant="subtle" size="sm">
            {{ plan.seatLimit }} 席位
          </UBadge>
          <UBadge color="neutral" variant="subtle" size="sm">
            {{ plan.storageLimitGb }} GB
          </UBadge>
          <UBadge color="neutral" variant="subtle" size="sm">
            {{ plan.invoiceLimit }} 张/月
          </UBadge>
        </div>
        <ul class="mt-4 space-y-1.5 text-xs text-default">
          <li v-for="feature in plan.features" :key="feature" class="flex items-start gap-1.5">
            <UIcon name="i-carbon-checkmark" class="mt-0.5 size-3.5 shrink-0 text-success" />
            <span>{{ feature }}</span>
          </li>
        </ul>
        <UButton
          v-if="plan.id !== currentPlan.id"
          class="mt-4 w-full"
          :label="plan.monthlyPrice > currentPlan.monthlyPrice ? '升级到' + plan.name : '切换至' + plan.name"
          :color="plan.monthlyPrice > currentPlan.monthlyPrice ? 'primary' : 'neutral'"
          :variant="plan.monthlyPrice > currentPlan.monthlyPrice ? 'solid' : 'outline'"
          size="sm"
          :data-testid="'billing-select-' + plan.id"
          @click="askChange(plan)"
        />
        <UButton
          v-else
          class="mt-4 w-full"
          label="当前套餐"
          color="neutral"
          variant="ghost"
          size="sm"
          disabled
        />
      </UCard>
    </div>

    <UModal v-model:open="changeOpen" title="确认切换套餐">
      <template #body>
        <div class="space-y-3" data-testid="billing-change-dialog">
          <p class="text-sm text-default">
            将「{{ workspace.name }}」从 <strong>{{ currentPlan.name }}</strong> 切换至
            <strong>{{ pendingPlan?.name }}</strong>？
          </p>
          <UAlert
            color="info"
            variant="soft"
            icon="i-carbon-information"
            title="演示范围"
            description="不会触发真实支付；切换后仅更新本地套餐与用量口径。"
          />
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            label="取消"
            color="neutral"
            variant="ghost"
            data-testid="billing-change-cancel"
            @click="changeOpen = false"
          />
          <UButton label="确认切换" data-testid="billing-change-confirm" @click="confirmChange" />
        </div>
      </template>
    </UModal>

    <UModal v-model:open="cancelOpen" title="取消订阅">
      <template #body>
        <div class="space-y-3" data-testid="billing-cancel-dialog">
          <p class="text-sm text-default">
            取消后，{{ workspace.name }} 将在 {{ subscription?.renewsAt }} 到期，期间仍可使用至到期日。
          </p>
          <UAlert
            color="warning"
            variant="soft"
            icon="i-carbon-warning-alt"
            title="演示环境不会真正取消订阅"
            description="可随时点击「恢复订阅」撤销此标记。"
          />
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            label="保留订阅"
            color="neutral"
            variant="ghost"
            data-testid="billing-cancel-dismiss"
            @click="cancelOpen = false"
          />
          <UButton
            label="确认取消"
            color="error"
            data-testid="billing-cancel-confirm"
            @click="confirmCancel"
          />
        </div>
      </template>
    </UModal>
  </div>
</template>
