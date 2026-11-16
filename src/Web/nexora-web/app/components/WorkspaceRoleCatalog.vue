<script setup lang="ts">
import type { WorkspaceRole } from '~/utils/workspaceGovernance'

const props = defineProps<{ workspaceId: string }>()
const roles = shallowRef<WorkspaceRole[]>([])
const selectedCode = ref('')
const error = ref('')
const loading = ref(true)
const selected = computed(() => roles.value.find(role => role.code === selectedCode.value))
const roleOptions = computed(() => [
  ...roles.value.filter(item => !item.area), ...roles.value.filter(item => item.area),
].map(role => ({ label: workspaceRoleName(role.code), value: role.code })))

const permissionNames: Record<string, string> = {
  'organization.workspace.read': '查看工作区',
  'organization.workspace.manage': '管理工作区',
  'organization.members.read': '查看成员',
  'organization.members.invite': '邀请成员',
  'organization.members.suspend': '启用或停用成员',
  'organization.roles.assign': '分配工作区角色',
  'organization.business-roles.manage': '申请、审批和撤销业务角色',
  'organization.invitations.revoke': '撤销邀请',
  'organization.audit.read': '读取工作区审计',
  'organization.finance-roles.manage': '管理财务角色',
  'organization.purchase-roles.manage': '管理采购角色',
  'organization.sales-roles.manage': '管理销售角色',
  'reports.workspace.read': '查看工作区报表',
  'masterdata.catalog.read': '查看商品和服务',
  'masterdata.item.manage': '管理商品和服务',
  'masterdata.partner.read': '查看往来单位',
  'masterdata.partner.manage': '管理往来单位',
  'finance.accounts.manage': '管理会计科目',
  'finance.accounts.import': '导入会计科目',
  'finance.accounts.export': '导出会计科目',
  'finance.tax.manage': '管理税项',
  'finance.ledger.read': '查看总账',
  'finance.journal.create': '编制凭证',
  'finance.journal.post': '凭证过账',
  'finance.journal.reverse': '复核凭证冲销',
  'finance.period.manage': '管理会计期间',
  'purchasing.order.read-own': '查看自己的采购订单',
  'purchasing.order.read': '查看采购订单',
  'purchasing.order.create': '创建采购订单',
  'purchasing.order.submit': '提交采购订单',
  'purchasing.order.approve': '审批采购订单',
  'sales.order.read-own': '查看自己的销售订单',
  'sales.order.read': '查看销售订单',
  'sales.order.create': '创建销售订单',
  'sales.order.submit': '提交销售订单',
  'sales.order.approve': '审批销售订单',
  'inventory.warehouse.manage': '管理仓库',
  'inventory.stock.read': '查看仓库库存及收发流水',
}

onMounted(async () => {
  try {
    roles.value = await loadWorkspaceRoleCatalog(props.workspaceId)
    selectedCode.value = roles.value[0]?.code ?? ''
  } catch (cause) {
    error.value = (cause as { statusCode?: number }).statusCode === 403
      ? '工作区所有者或访问管理员可以查看角色明细。'
      : '角色明细加载失败，请刷新页面重试。'
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <section class="role-catalog rounded-nx border border-nx-border bg-nx-surface p-6 shadow-nx-sm" aria-label="工作区角色目录">
    <div v-if="loading" class="space-y-3 py-2" role="status" aria-label="正在加载角色">
      <USkeleton class="h-5 w-40" />
      <USkeleton class="h-10 w-full" />
      <USkeleton class="h-4 w-2/3" />
    </div>
    <UAlert v-else-if="error" role="alert" color="error" icon="i-lucide-circle-alert" :description="error" />
    <template v-else>
      <UFormField class="role-selection" label="选择角色" name="roleCode">
        <USelect :model-value="selectedCode" :items="roleOptions"
          @update:model-value="value => selectedCode = String(value)" />
      </UFormField>
      <template v-if="selected">
        <h2><UIcon class="mr-2 inline-block size-[1.08em] align-[-0.16em] text-nx-primary" name="i-lucide-shield" aria-hidden="true" />{{ workspaceRoleName(selected.code) }}</h2>
        <p class="mt-2 text-[12px] leading-[1.62] text-nx-ink-3">{{ selected.area ? executionAreaNames[selected.area] : '工作区' }} · {{ selected.permissions.length }} 项权限</p>
        <ul class="permissions" aria-label="权限明细">
          <li v-for="permission in selected.permissions" :key="permission">
            <span>{{ permissionNames[permission] ?? permission }}</span>
            <code v-if="permissionNames[permission]">{{ permission }}</code>
          </li>
        </ul>
      </template>
    </template>
  </section>
  <WorkspaceCustomRoleEditor v-if="!loading && !error" :workspace-id="workspaceId" :permission-names="permissionNames" />
</template>

<style scoped>
.role-selection { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 18px; }
.permissions { padding: 0; list-style: none; margin-bottom: 0; }
.permissions li { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 8px 16px; border-top: 1px solid var(--nx-border); padding: 9px 0; }
.permissions code { color: var(--nx-ink-3); font-size: 0.85em; overflow-wrap: anywhere; }
</style>
