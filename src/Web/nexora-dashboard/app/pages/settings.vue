<script setup lang="ts">
const toast = useToast()
const org = useOrganizationStore()
const setup = useWorkspaceSetupStore()
const route = useRoute()
const { workspace } = useMockWorkspace()

const tabIds = ['company', 'members', 'invitations', 'roles', 'departments', 'billing', 'audit'] as const
type SettingsTab = (typeof tabIds)[number]
const tab = ref<SettingsTab>('company')

onMounted(() => {
  const requested = String(route.query.tab ?? '')
  if ((tabIds as readonly string[]).includes(requested)) tab.value = requested as SettingsTab
})

const tabItems = [
  { label: '公司', value: 'company', icon: 'i-carbon-building' },
  { label: '成员', value: 'members', icon: 'i-carbon-user-multiple' },
  { label: '邀请', value: 'invitations', icon: 'i-carbon-email' },
  { label: '角色', value: 'roles', icon: 'i-carbon-user-role' },
  { label: '部门', value: 'departments', icon: 'i-carbon-tree-view-alt' },
  { label: '订阅', value: 'billing', icon: 'i-carbon-receipt' },
  { label: '审计', value: 'audit', icon: 'i-carbon-document' }
]

const tabHint = computed(() => {
  const map: Record<SettingsTab, string> = {
    company: '公司资料用于单据抬头、发票与报表。',
    members: '调整角色、部门，停用或恢复成员，并批量发出邀请。',
    invitations: '查看邀请状态，复制链接、重发过期邀请或撤销。',
    roles: '按模块勾选角色权限；按部门、仓库与财务期间配置数据范围，范围变更需独立审批。',
    departments: '维护部门树与成员归属。',
    billing: '对比套餐、查看用量并演示升级或取消。',
    audit: '按操作者、类型与时间筛选，支持分页与 CSV 导出。'
  }
  return map[tab.value]
})

function resetDemoData() {
  org.reset()
  setup.reset()
  toast.add({
    title: '演示数据已重置',
    description: '初始化进度、成员、邀请、角色、部门、订阅与审计恢复初始样例。',
    color: 'neutral',
    icon: 'i-carbon-reset'
  })
}
</script>

<template>
  <div class="contents">
    <UDashboardPanel id="settings">
      <template #header>
        <UDashboardNavbar title="设置" icon="i-carbon-settings">
          <template #leading>
            <UDashboardSidebarCollapse />
          </template>
          <template #right>
            <UBadge
              color="neutral"
              variant="subtle"
              size="sm"
              class="max-sm:hidden"
            >
              本地演示
            </UBadge>
            <UButton
              to="/setup"
              icon="i-carbon-rocket"
              color="neutral"
              variant="outline"
              size="sm"
              label="初始化向导"
              data-testid="settings-setup"
            />
            <UButton
              icon="i-carbon-reset"
              color="neutral"
              variant="ghost"
              size="sm"
              label="重置"
              data-testid="settings-reset"
              @click="resetDemoData"
            />
            <UDashboardSearchButton />
          </template>
        </UDashboardNavbar>

        <UDashboardToolbar :ui="{ root: 'flex-wrap gap-3 py-2.5' }">
          <template #left>
            <UTabs
              v-model="tab"
              :items="tabItems"
              :content="false"
              size="sm"
              data-testid="settings-tabs"
            />
          </template>
          <template #right>
            <span class="text-xs text-muted">{{ workspace.name }}</span>
          </template>
        </UDashboardToolbar>
      </template>

      <template #body>
        <AppBreadcrumb current="设置" />
        <div class="mt-3">
          <p class="mb-3 text-xs text-muted">
            {{ tabHint }}
          </p>

          <SettingsCompanyPanel v-if="tab === 'company'" />
          <SettingsMembersPanel v-else-if="tab === 'members'" />
          <SettingsInvitationsPanel v-else-if="tab === 'invitations'" />
          <SettingsRolesPanel v-else-if="tab === 'roles'" />
          <SettingsDepartmentsPanel v-else-if="tab === 'departments'" />
          <SettingsBillingPanel v-else-if="tab === 'billing'" />
          <SettingsAuditPanel v-else />
        </div>

        <p class="mt-4 text-[11px] text-dimmed">
          本地原型 · 模拟数据 · 组织与订阅写操作仅本次预览，刷新后恢复
        </p>
      </template>
    </UDashboardPanel>
  </div>
</template>
