<script setup lang="ts">
definePageMeta({ alias: ['/join'] })

const toast = useToast()
const auth = useAuthSessionStore()
const live = useLiveSessionStore()
const org = useOrganizationStore()
const setup = useWorkspaceSetupStore()
const route = useRoute()
const { workspace } = useMockWorkspace()

const tabIds = ['company', 'members', 'invitations', 'roles', 'departments', 'governance', 'billing', 'audit'] as const
type SettingsTab = (typeof tabIds)[number]
const tab = ref<SettingsTab>('company')

watch(() => [route.path, route.query.tab], () => {
  if (route.path === '/join') {
    tab.value = 'invitations'
    return
  }
  const requested = String(route.query.tab ?? '')
  tab.value = (tabIds as readonly string[]).includes(requested) ? requested as SettingsTab : 'company'
}, { immediate: true })

const tabItems = [
  { label: '公司', value: 'company', icon: 'i-carbon-building' },
  { label: '成员', value: 'members', icon: 'i-carbon-user-multiple' },
  { label: '邀请', value: 'invitations', icon: 'i-carbon-email' },
  { label: '角色', value: 'roles', icon: 'i-carbon-user-role' },
  { label: '部门', value: 'departments', icon: 'i-carbon-tree-view-alt' },
  { label: '治理', value: 'governance', icon: 'i-carbon-flow' },
  { label: '订阅', value: 'billing', icon: 'i-carbon-receipt' },
  { label: '审计', value: 'audit', icon: 'i-carbon-document' }
]

const liveTabItems = computed(() => tabItems.filter((item) => {
  const permissions: Partial<Record<SettingsTab, string>> = { members: 'organization.members.read', invitations: 'organization.members.invite', roles: 'organization.roles.assign', governance: 'organization.roles.assign', audit: 'organization.audit.read' }
  const permission = permissions[item.value as SettingsTab]
  return !permission || (live.access?.permissions.includes(permission) && (item.value !== 'audit' || live.canVisit('/change-log')))
}))
const liveTab = computed(() => liveTabItems.value.some(item => item.value === tab.value) ? tab.value : 'company')

const tabHint = computed(() => {
  const map: Record<SettingsTab, string> = {
    company: '公司资料用于单据抬头、发票与报表。',
    members: '调整角色、部门，停用或恢复成员，并批量发出邀请。',
    invitations: '查看邀请状态，复制链接、重发过期邀请或撤销。',
    roles: '按模块勾选角色权限；按部门、仓库与财务期间配置数据范围，范围变更需独立审批。',
    departments: '维护部门树与成员归属。',
    governance: '工作区创建与个人账本链接、邀请独立审批、成员业务角色、自定义角色授权范围与公告可见范围。',
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
        <UDashboardNavbar :title="auth.connected && route.path === '/join' ? '工作区邀请' : '设置'" icon="i-carbon-settings">
          <template #leading>
            <UDashboardSidebarCollapse />
          </template>
          <template #right>
            <UBadge
              v-if="!auth.connected"
              color="neutral"
              variant="subtle"
              size="sm"
              class="max-sm:hidden"
            >
              本地演示
            </UBadge>
            <UButton
              v-if="route.path !== '/join' && (!auth.connected || live.canVisit('/setup'))"
              :to="auth.connected ? { path: '/setup', query: { workspace: live.activeWorkspaceId } } : '/setup'"
              icon="i-carbon-rocket"
              color="neutral"
              variant="outline"
              size="sm"
              label="初始化向导"
              data-testid="settings-setup"
            />
            <UButton
              v-if="!auth.connected"
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

        <UDashboardToolbar v-if="!auth.connected || (route.path !== '/join' && live.canVisit('/settings'))" :ui="{ root: 'flex-wrap gap-3 py-2.5' }">
          <template #left>
            <UTabs
              v-model="tab"
              :items="auth.connected ? liveTabItems : tabItems"
              :content="false"
              size="sm"
              data-testid="settings-tabs"
            />
          </template>
          <template #right>
            <span class="text-xs text-muted">{{ auth.connected ? live.workspace?.name : workspace.name }}</span>
          </template>
        </UDashboardToolbar>
      </template>

      <template #body>
        <AppBreadcrumb :current="route.path === '/join' ? '工作区邀请' : '设置'" />
        <div v-if="auth.connected" class="mt-3">
          <SettingsLiveJoin v-if="route.path === '/join'" />
          <USkeleton v-else-if="!auth.ready || live.loading" class="h-20 w-full" />
          <UAlert v-else-if="!live.canVisit('/settings')"
                  color="warning"
                  variant="subtle"
                  :title="live.error || '请登录并选择有权访问的企业工作区'" />
          <SettingsLiveCompany v-else-if="liveTab === 'company'" />
          <SettingsLiveMembers v-else-if="liveTab === 'members'" />
          <SettingsLiveInvitations v-else-if="liveTab === 'invitations'" />
          <SettingsLiveRoles v-else-if="liveTab === 'roles'" />
          <SettingsLiveDepartments v-else-if="liveTab === 'departments'" />
          <SettingsLiveRoleGrants v-else-if="liveTab === 'governance'" />
          <SettingsLiveBilling v-else-if="liveTab === 'billing'" />
          <SettingsLiveAudit v-else view="audit" />
        </div>
        <template v-else>
          <UAlert
            v-if="route.path === '/join'"
            class="mt-3"
            color="neutral"
            variant="subtle"
            icon="i-carbon-email"
            :title="auth.user ? '登录成功，当前邀请尚未接受' : '请先登录以继续处理邀请'"
            :description="auth.user ? '邀请接受功能暂不可用，请联系邀请人确认后续安排。' : '从左下角用户菜单选择登录方式，登录后会回到此处。'"
            data-testid="invitation-login-status"
          />
          <div class="mt-3">
            <p class="mb-3 text-xs text-muted">
              {{ tabHint }}
            </p>

            <SettingsCompanyPanel v-if="tab === 'company'" />
            <SettingsMembersPanel v-else-if="tab === 'members'" />
            <SettingsInvitationsPanel v-else-if="tab === 'invitations'" />
            <SettingsRolesPanel v-else-if="tab === 'roles'" />
            <SettingsDepartmentsPanel v-else-if="tab === 'departments'" />
            <SettingsGovernanceCenter v-else-if="tab === 'governance'" />
            <SettingsBillingPanel v-else-if="tab === 'billing'" />
            <SettingsAuditPanel v-else />
          </div>

          <p class="mt-4 text-[11px] text-dimmed">
            本地原型 · 模拟数据 · 组织与订阅写操作仅本次预览，刷新后恢复
          </p>
        </template>
      </template>
    </UDashboardPanel>
  </div>
</template>
