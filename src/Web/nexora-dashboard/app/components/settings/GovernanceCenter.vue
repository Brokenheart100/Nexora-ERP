<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import { permissionLabels } from '~/mocks/organization'
import { useWorkspaceStore } from '~/stores/workspace'
import { formatMoney } from '~/utils/format'
import {
  announcementLevelColors,
  announcementLevelLabels,
  brandColorOptions,
  businessRoleLevelLabels,
  businessScopeLabels,
  createGovernanceSeed,
  customRoleStatusColors,
  customRoleStatusLabels,
  dateFormatOptions,
  daysFromToday,
  DEMO_TODAY,
  departmentOptions,
  documentTypeOptions,
  idleTimeoutOptions,
  invitationStateColors,
  invitationStateLabels,
  invitationStateOptions,
  isPastDate,
  memberStatusColors,
  memberStatusLabels,
  orgRoleLabels,
  sampleDocuments,
  serviceActionKeys,
  serviceActionLabels,
  serviceKeys,
  serviceLabels,
  timezoneOptions
} from '~/mocks/governance'
import type {
  BusinessRoleLevel,
  BusinessScope,
  CustomRole,
  CustomRoleServiceGrant,
  CustomRoleStatus,
  GovernanceAnnouncement,
  GovernanceCompanySettings,
  GovernanceInvitation,
  GovernanceMember,
  GovernanceWorkspace,
  InvitationState,
  OrgRoleKey,
  ServiceActionKey,
  ServiceKey
} from '~/mocks/governance'

type GovernanceTab = 'workspace' | 'invitations' | 'members' | 'authorizations' | 'announcements'
type MemberStatusFilter = 'all' | 'active' | 'invited' | 'disabled'
type RoleTypeFilter = 'all' | 'organization' | 'business'
type AnnouncementValidityFilter = 'all' | 'active' | 'expiring' | 'expired'

interface CompanyDraft {
  name: string
  registrationNo: string
  industry: string
  scale: string
  fiscalStart: string
  fiscalEnd: string
  openingDate: string
  chartTemplate: string
  fiscalConfirmed: boolean
  inviteEmails: string
  inviteRole: OrgRoleKey
}

interface PersonalDraft {
  name: string
  linkedCompanyId: string
  privateLedger: boolean
}

interface LedgerLinkDraft {
  companyId: string
  confirmed: boolean
}

interface InvitationDraft {
  inviteeName: string
  email: string
  roleType: 'organization' | 'business'
  orgRole: OrgRoleKey
  businessServices: ServiceKey[]
  businessLevel: BusinessRoleLevel
  departmentName: string
  validityDays: number
}

interface MemberBusinessRoleDraft {
  enabled: boolean
  level: BusinessRoleLevel
  scope: BusinessScope
  departmentName: string
}

interface MemberDraft {
  orgRole: OrgRoleKey
  departmentName: string
  businessRoles: MemberBusinessRoleDraft[]
}

interface RoleCreateDraft {
  name: string
  description: string
  approvalMode: 1 | 2
  validityDays: number
  services: ServiceKey[]
  departments: string[]
}

interface PermissionCheckResult {
  allowed: boolean
  title: string
  reason: string
}

const props = withDefaults(defineProps<{
  initialIntent?: string
}>(), {
  initialIntent: 'overview'
})

const toast = useToast()
const workspaceStore = useWorkspaceStore()

const DEFAULT_IDENTITY_ID = 'gov-id-chen'
const ANNOUNCEMENT_READ_KEY = 'nexora.governance.announcement-read'
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const seed = createGovernanceSeed()
const workspaces = ref<GovernanceWorkspace[]>(seed.workspaces)
const identities = ref(seed.identities)
const companySettings = ref<GovernanceCompanySettings[]>(seed.companySettings)
const invitations = ref<GovernanceInvitation[]>(seed.invitations)
const members = ref<GovernanceMember[]>(seed.members)
const customRoles = ref<CustomRole[]>(seed.customRoles)
const announcements = ref<GovernanceAnnouncement[]>(seed.announcements)

const activeIdentityId = ref(DEFAULT_IDENTITY_ID)
const activeWorkspaceId = ref('ws-hq')
const activeTab = ref<GovernanceTab>('workspace')

const tabItems: { label: string, value: GovernanceTab, icon: string }[] = [
  { label: '工作区与公司', value: 'workspace', icon: 'i-carbon-enterprise' },
  { label: '邀请与接受', value: 'invitations', icon: 'i-carbon-mail-all' },
  { label: '成员与角色', value: 'members', icon: 'i-carbon-user-multiple' },
  { label: '授权审批', value: 'authorizations', icon: 'i-carbon-certificate' },
  { label: '公告', value: 'announcements', icon: 'i-carbon-notification' }
]

const activeIdentity = computed(() => identities.value.find(identity => identity.id === activeIdentityId.value) ?? identities.value[0]!)
const activePermissions = computed(() => activeIdentity.value.permissions)
const canManageSettings = computed(() => activePermissions.value.includes('settings.manage'))
const accessibleWorkspaces = computed(() => workspaces.value.filter(workspace => activeIdentity.value.workspaceIds.includes(workspace.id)))
const activeWorkspace = computed(() => workspaces.value.find(workspace => workspace.id === activeWorkspaceId.value) ?? accessibleWorkspaces.value[0] ?? workspaces.value[0]!)
const isPersonalWorkspace = computed(() => activeWorkspace.value.kind === 'personal')
const identityOptions = computed(() => identities.value.map(identity => ({ label: identity.name + ' · ' + identity.title, value: identity.id })))
const workspaceOptions = computed(() => accessibleWorkspaces.value.map(workspace => ({ label: workspace.name, value: workspace.id })))

const orgRoleOptions = Object.entries(orgRoleLabels).map(([value, label]) => ({ label, value: value as OrgRoleKey }))
const businessLevelOptions = Object.entries(businessRoleLevelLabels).map(([value, label]) => ({ label, value: value as BusinessRoleLevel }))
const businessScopeOptions = Object.entries(businessScopeLabels).map(([value, label]) => ({ label, value: value as BusinessScope }))
const industryOptions = ['批发与零售', '制造业', '服务业', '科技与软件', '其他']
const scaleOptions = ['1-50 人', '51-200 人', '201-500 人', '500 人以上']
const chartTemplateOptions = [
  { label: '标准企业科目表', value: 'standard' },
  { label: '零售行业科目表', value: 'retail' },
  { label: '服务业科目表', value: 'service' }
]
const validityOptions = [
  { label: '30 天', value: 30 },
  { label: '90 天', value: 90 },
  { label: '180 天', value: 180 },
  { label: '365 天', value: 365 }
]
const companySteps = [
  { value: 1, label: '企业信息' },
  { value: 2, label: '会计期间' },
  { value: 3, label: '邀请成员' }
]
const inviteTypeOptions: { label: string, value: RoleTypeFilter }[] = [
  { label: '全部类型', value: 'all' },
  { label: '组织角色', value: 'organization' },
  { label: '业务角色', value: 'business' }
]
const inviteStateFilterOptions = [
  { label: '全部状态', value: 'all' as const },
  ...invitationStateOptions.map(option => ({ label: option.label, value: option.value }))
]
const memberStatusOptions: { label: string, value: MemberStatusFilter }[] = [
  { label: '全部状态', value: 'all' },
  ...Object.entries(memberStatusLabels).map(([value, label]) => ({ label, value: value as MemberStatusFilter }))
]
const memberServiceOptions: { label: string, value: 'all' | ServiceKey }[] = [
  { label: '全部业务角色', value: 'all' },
  ...serviceKeys.map(service => ({ label: serviceLabels[service], value: service }))
]
const customRoleStatusOptions: { label: string, value: 'all' | CustomRoleStatus }[] = [
  { label: '全部状态', value: 'all' },
  ...Object.entries(customRoleStatusLabels).map(([value, label]) => ({ label, value: value as CustomRoleStatus }))
]
const customRoleServiceOptions: { label: string, value: 'all' | ServiceKey }[] = [
  { label: '全部服务', value: 'all' },
  ...serviceKeys.map(service => ({ label: serviceLabels[service], value: service }))
]
const announcementValidityOptions: { label: string, value: AnnouncementValidityFilter }[] = [
  { label: '全部有效期', value: 'all' },
  { label: '有效中', value: 'active' },
  { label: '7 天内到期', value: 'expiring' },
  { label: '已过期', value: 'expired' }
]
const roleValidityOptions = validityOptions

function workspaceName(id: string | null): string {
  if (!id) return '未链接公司'
  return workspaces.value.find(workspace => workspace.id === id)?.name ?? id
}

function memberCountOf(workspaceId: string): number {
  return members.value.filter(member => member.workspaceId === workspaceId).length
}

function addDays(date: string, days: number): string {
  const value = new Date(date + 'T00:00:00Z')
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

function toggleValue<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter(item => item !== value) : [...list, value]
}

function splitEmails(value: string): string[] {
  return value.split(/[,，;；\n]/).map(item => item.trim()).filter(item => item.length > 0)
}

function emailValid(email: string): boolean {
  return EMAIL_PATTERN.test(email)
}

function expiryLabel(date: string): string {
  if (isPastDate(date)) return '已过期（' + date + '）'
  const days = daysFromToday(date)
  if (days === 0) return '今天到期（' + date + '）'
  return days + ' 天后到期（' + date + '）'
}

watch(activeIdentityId, () => {
  if (!activeIdentity.value.workspaceIds.includes(activeWorkspaceId.value)) {
    activeWorkspaceId.value = activeIdentity.value.workspaceIds[0] ?? workspaces.value[0]?.id ?? 'ws-hq'
  }
  if (!['current', 'all'].includes(announcementWorkspaceFilter.value) && !activeIdentity.value.workspaceIds.includes(announcementWorkspaceFilter.value)) {
    announcementWorkspaceFilter.value = 'current'
  }
  toast.add({
    title: '已切换演示身份：' + activeIdentity.value.name,
    description: '可见工作区、可审批范围与公告可见范围已重新确认；本地公告已读记录保留。',
    color: 'info',
    icon: 'i-carbon-user-switch'
  })
})

watch(activeWorkspaceId, (id, previous) => {
  if (!id || id === previous) return
  const mockWorkspace = workspaceStore.workspaces.find(item => item.id === id)
  if (mockWorkspace) workspaceStore.setWorkspace(id)
  inviteDetailOpen.value = false
  acceptancePreviewOpen.value = false
  memberDetailOpen.value = false
  announcementDetailOpen.value = false
  toast.add({
    title: '已切换工作区：' + workspaceName(id),
    description: '邀请、成员、授权与公告均按新工作区隔离；公告可见范围与本地已读状态已重新确认。',
    color: 'success',
    icon: 'i-carbon-switch-layer-2'
  })
})

// ---------- 公司设置 ----------
function blankSettings(workspaceId: string): GovernanceCompanySettings {
  return {
    workspaceId,
    companyName: '',
    brandName: '',
    brandColor: '#0f766e',
    registrationNo: '',
    invoiceTitle: '',
    dateFormat: 'YYYY-MM-DD',
    timezone: 'Asia/Shanghai',
    idleTimeoutMinutes: 30,
    approverCount: 2
  }
}

function cloneSettings(value: GovernanceCompanySettings): GovernanceCompanySettings {
  return { ...value }
}

const companyForm = ref<GovernanceCompanySettings>(blankSettings('ws-hq'))
const settingsBaseline = ref<GovernanceCompanySettings>(blankSettings('ws-hq'))

function resetCompanyForm() {
  const existing = companySettings.value.find(item => item.workspaceId === activeWorkspaceId.value)
  const value = existing ? existing : blankSettings(activeWorkspaceId.value)
  companyForm.value = cloneSettings(value)
  settingsBaseline.value = cloneSettings(value)
}

watch(activeWorkspaceId, resetCompanyForm, { immediate: true })

const companyDirty = computed(() => JSON.stringify(companyForm.value) !== JSON.stringify(settingsBaseline.value))
const companyFormError = computed(() => {
  if (isPersonalWorkspace.value) return ''
  if (!companyForm.value.companyName.trim()) return '请填写公司标识（公司简称）。'
  if (!companyForm.value.brandName.trim()) return '请填写品牌名称。'
  if (!/^[0-9A-Z]{18}$/.test(companyForm.value.registrationNo.trim().toUpperCase())) return '统一社会信用代码需为 18 位大写字母或数字。'
  if (!companyForm.value.invoiceTitle.trim()) return '请填写发票抬头或公司全称。'
  return ''
})
const companyFormValid = computed(() => companyFormError.value.length === 0)
const canSaveCompany = computed(() => !isPersonalWorkspace.value && companyDirty.value && companyFormValid.value && canManageSettings.value)

function saveCompanySettings() {
  if (!canSaveCompany.value) {
    if (!canManageSettings.value) {
      toast.add({ title: '当前身份无管理设置权限', description: '请切换为所有者或管理员身份后保存公司设置。', color: 'warning', icon: 'i-carbon-locked' })
    }
    return
  }
  const next = cloneSettings(companyForm.value)
  next.registrationNo = next.registrationNo.trim().toUpperCase()
  const index = companySettings.value.findIndex(item => item.workspaceId === activeWorkspaceId.value)
  if (index >= 0) {
    companySettings.value[index] = next
  } else {
    companySettings.value.push(next)
  }
  const target = workspaces.value.find(workspace => workspace.id === activeWorkspaceId.value)
  if (target) target.brandColor = next.brandColor
  settingsBaseline.value = cloneSettings(next)
  toast.add({ title: '公司设置已保存', description: '公司标识、品牌、日期格式、时区、会话空闲期限与授权审批人数已按当前工作区生效。', color: 'success', icon: 'i-carbon-checkmark' })
}

function setApproverCount(value: 1 | 2) {
  if (!canManageSettings.value) {
    toast.add({ title: '无权限调整审批人数', description: '只有所有者或管理员可以调整授权审批人数。', color: 'warning', icon: 'i-carbon-locked' })
    return
  }
  companyForm.value.approverCount = value
}

watch(() => companyForm.value, () => {
  if (companyForm.value.registrationNo) {
    companyForm.value.registrationNo = companyForm.value.registrationNo.toUpperCase()
  }
}, { deep: true })

// ---------- 工作区创建 ----------
const companyWizardOpen = ref(false)
const companyStep = ref(1)
const companyEditId = ref<string | null>(null)
const companyWizardError = ref('')
const companyDraft = ref<CompanyDraft>({
  name: '',
  registrationNo: '',
  industry: industryOptions[0]!,
  scale: scaleOptions[1]!,
  fiscalStart: '2026-01-01',
  fiscalEnd: '2026-12-31',
  openingDate: DEMO_TODAY,
  chartTemplate: 'standard',
  fiscalConfirmed: true,
  inviteEmails: '',
  inviteRole: 'purchaser'
})

function openCompanyWizard(workspace?: GovernanceWorkspace) {
  companyEditId.value = workspace?.id ?? null
  const settings = workspace ? companySettings.value.find(item => item.workspaceId === workspace.id) : undefined
  companyDraft.value = {
    name: workspace?.name ?? '',
    registrationNo: settings?.registrationNo ?? '',
    industry: industryOptions[0]!,
    scale: scaleOptions[1]!,
    fiscalStart: '2026-01-01',
    fiscalEnd: '2026-12-31',
    openingDate: DEMO_TODAY,
    chartTemplate: 'standard',
    fiscalConfirmed: true,
    inviteEmails: '',
    inviteRole: 'purchaser'
  }
  companyStep.value = 1
  companyWizardError.value = ''
  companyWizardOpen.value = true
}

function validateCompanyStep(): boolean {
  companyWizardError.value = ''
  if (companyStep.value === 1) {
    if (companyDraft.value.name.trim().length < 2) {
      companyWizardError.value = '企业名称至少需要 2 个字符。'
      return false
    }
    if (!/^[0-9A-Z]{18}$/.test(companyDraft.value.registrationNo.trim().toUpperCase())) {
      companyWizardError.value = '统一社会信用代码需为 18 位大写字母或数字。'
      return false
    }
  }
  if (companyStep.value === 2) {
    if (!companyDraft.value.fiscalStart || !companyDraft.value.fiscalEnd) {
      companyWizardError.value = '请填写完整的会计期间开始与结束日期。'
      return false
    }
    if (companyDraft.value.fiscalEnd <= companyDraft.value.fiscalStart) {
      companyWizardError.value = '会计期间结束日期必须晚于开始日期。'
      return false
    }
    if (!companyDraft.value.openingDate) {
      companyWizardError.value = '请填写启用日期。'
      return false
    }
    if (!companyDraft.value.fiscalConfirmed) {
      companyWizardError.value = '请确认会计期间与启用日期。'
      return false
    }
  }
  return true
}

function nextCompanyStep() {
  if (!validateCompanyStep()) return
  companyStep.value = Math.min(3, companyStep.value + 1)
}

let workspaceSequence = 0
let memberSequence = 0
let invitationSequence = 0
let roleSequence = 0

function appendCompanyWorkspace(workspaceId: string, name: string, registrationNo: string): void {
  workspaces.value.push({
    id: workspaceId,
    name,
    kind: 'company',
    planLabel: '标准版',
    ownerName: activeIdentity.value.name,
    createdAt: DEMO_TODAY,
    initialized: true,
    linkedCompanyId: null,
    linkedAt: null,
    brandColor: '#0f766e'
  })
  companySettings.value.push({
    workspaceId,
    companyName: name,
    brandName: name.slice(0, 12),
    brandColor: '#0f766e',
    registrationNo,
    invoiceTitle: name,
    dateFormat: 'YYYY-MM-DD',
    timezone: 'Asia/Shanghai',
    idleTimeoutMinutes: 30,
    approverCount: 2
  })
  memberSequence += 1
  members.value.push({
    id: 'gov-m-created-' + memberSequence,
    workspaceId,
    name: activeIdentity.value.name,
    email: activeIdentity.value.email,
    phone: '138-0000-0000',
    departmentName: '总经办',
    orgRole: 'owner',
    status: 'active',
    businessRoles: [],
    joinedAt: DEMO_TODAY,
    lastActiveAt: DEMO_TODAY,
    note: '创建工作区后自动成为所有者。'
  })
  if (!activeIdentity.value.workspaceIds.includes(workspaceId)) {
    activeIdentity.value.workspaceIds = [...activeIdentity.value.workspaceIds, workspaceId]
  }
}

function createInvitationsForWorkspace(workspaceId: string, emails: string[], role: OrgRoleKey) {
  emails.forEach((email) => {
    invitationSequence += 1
    invitations.value.unshift({
      id: 'gov-inv-new-' + invitationSequence,
      workspaceId,
      inviteeName: email.split('@')[0] ?? '新成员',
      email,
      invitedBy: activeIdentity.value.name,
      roleType: 'organization',
      orgRoleLabel: orgRoleLabels[role],
      businessRoles: [],
      departments: ['总经办'],
      status: 'valid',
      sentAt: DEMO_TODAY,
      expiresAt: addDays(DEMO_TODAY, 14),
      note: '企业初始化时发送的组织角色邀请，接受后进入总经办。',
      requiredApprover: null,
      approvedBy: null,
      approvedAt: null,
      revokedReason: null,
      revokedAt: null,
      redeemedBy: null,
      redeemedAt: null,
      mismatchAccount: null,
      link: 'https://app.nexora.example/join#invite=gov-inv-new-' + invitationSequence
    })
  })
}

function submitCompanyWizard() {
  const emails = splitEmails(companyDraft.value.inviteEmails)
  const invalidEmail = emails.find(email => !emailValid(email))
  if (invalidEmail) {
    companyWizardError.value = '邀请邮箱格式不正确：' + invalidEmail
    return
  }
  const name = companyDraft.value.name.trim()
  const registrationNo = companyDraft.value.registrationNo.trim().toUpperCase()
  if (!name || registrationNo.length !== 18) {
    companyWizardError.value = '企业信息不完整，请返回第一步检查。'
    return
  }
  const editingId = companyEditId.value
  const workspaceId = editingId ?? 'ws-created-' + (workspaceSequence + 1)
  if (editingId) {
    const target = workspaces.value.find(workspace => workspace.id === editingId)
    if (target) {
      target.name = name
      target.initialized = true
      target.createdAt = target.createdAt || DEMO_TODAY
    }
    const settings = companySettings.value.find(item => item.workspaceId === editingId)
    if (settings) {
      settings.companyName = name
      settings.registrationNo = registrationNo
      settings.invoiceTitle = name
    } else {
      appendCompanyWorkspace(editingId, name, registrationNo)
    }
  } else {
    workspaceSequence += 1
    appendCompanyWorkspace(workspaceId, name, registrationNo)
  }
  createInvitationsForWorkspace(workspaceId, emails, companyDraft.value.inviteRole)
  activeWorkspaceId.value = workspaceId
  companyWizardOpen.value = false
  toast.add({
    title: editingId ? '企业初始化已完成' : '企业工作区已创建',
    description: name + ' 已切换为当前工作区；' + (emails.length ? '已向 ' + emails.length + ' 个邮箱发送邀请。' : '后续可在「邀请与接受」页签补充邀请。'),
    color: 'success',
    icon: 'i-carbon-enterprise'
  })
}

// ---------- 个人账本创建 ----------
const personalDialogOpen = ref(false)
const personalError = ref('')
const personalDraft = ref<PersonalDraft>({ name: '', linkedCompanyId: '', privateLedger: true })

function openPersonalDialog() {
  personalDraft.value = {
    name: activeIdentity.value.name + '的个人账本',
    linkedCompanyId: accessibleWorkspaces.value.find(workspace => workspace.kind === 'company')?.id ?? '',
    privateLedger: true
  }
  personalError.value = ''
  personalDialogOpen.value = true
}

function submitPersonalWorkspace() {
  const name = personalDraft.value.name.trim()
  if (name.length < 2) {
    personalError.value = '个人账本名称至少需要 2 个字符。'
    return
  }
  workspaceSequence += 1
  const workspaceId = 'ws-created-personal-' + workspaceSequence
  workspaces.value.push({
    id: workspaceId,
    name,
    kind: 'personal',
    planLabel: '个人账本',
    ownerName: activeIdentity.value.name,
    createdAt: DEMO_TODAY,
    initialized: true,
    linkedCompanyId: personalDraft.value.linkedCompanyId || null,
    linkedAt: personalDraft.value.linkedCompanyId ? DEMO_TODAY : null,
    brandColor: '#334155'
  })
  memberSequence += 1
  members.value.push({
    id: 'gov-m-created-' + memberSequence,
    workspaceId,
    name: activeIdentity.value.name,
    email: activeIdentity.value.email,
    phone: '138-0000-0000',
    departmentName: '个人账本',
    orgRole: 'owner',
    status: 'active',
    businessRoles: [],
    joinedAt: DEMO_TODAY,
    lastActiveAt: DEMO_TODAY,
    note: '个人账本所有者。'
  })
  if (!activeIdentity.value.workspaceIds.includes(workspaceId)) {
    activeIdentity.value.workspaceIds = [...activeIdentity.value.workspaceIds, workspaceId]
  }
  activeWorkspaceId.value = workspaceId
  personalDialogOpen.value = false
  toast.add({ title: '个人账本已创建', description: '账本仅对当前账户可见；链接公司后只共享品牌与审批规则，不共享单据。', color: 'success', icon: 'i-carbon-user-data' })
}

// ---------- 个人账本链接 ----------
const ledgerLinkOpen = ref(false)
const ledgerLinkTargetId = ref('')
const ledgerLinkDraft = ref<LedgerLinkDraft>({ companyId: '', confirmed: false })
const ledgerLinkError = ref('')
const ledgerUnlinkOpen = ref(false)
const ledgerUnlinkTargetId = ref('')
const ledgerUnlinkCheck = ref(false)
const ledgerUnlinkError = ref('')

const ledgerLinkTarget = computed(() => workspaces.value.find(workspace => workspace.id === ledgerLinkTargetId.value) ?? null)
const ledgerUnlinkTarget = computed(() => workspaces.value.find(workspace => workspace.id === ledgerUnlinkTargetId.value) ?? null)
const ledgerCompanyOptions = computed(() => accessibleWorkspaces.value.filter(workspace => workspace.kind === 'company').map(workspace => ({ label: workspace.name, value: workspace.id })))

function openLedgerLink(workspace?: GovernanceWorkspace) {
  const target = workspace ?? accessibleWorkspaces.value.find(item => item.kind === 'personal')
  ledgerLinkTargetId.value = target?.id ?? ''
  ledgerLinkDraft.value = {
    companyId: accessibleWorkspaces.value.find(item => item.kind === 'company')?.id ?? '',
    confirmed: false
  }
  ledgerLinkError.value = ''
  ledgerLinkOpen.value = true
}

function submitLedgerLink() {
  if (!ledgerLinkTarget.value) {
    ledgerLinkError.value = '当前身份没有个人账本，请先创建个人工作区后再链接。'
    return
  }
  if (!ledgerLinkDraft.value.companyId) {
    ledgerLinkError.value = '请选择要链接的公司工作区。'
    return
  }
  if (!ledgerLinkDraft.value.confirmed) {
    ledgerLinkError.value = '请确认已了解个人账本与公司账套的数据隔离规则。'
    return
  }
  const target = ledgerLinkTarget.value
  target.linkedCompanyId = ledgerLinkDraft.value.companyId
  target.linkedAt = DEMO_TODAY
  const companySetting = companySettings.value.find(item => item.workspaceId === ledgerLinkDraft.value.companyId)
  if (companySetting) {
    target.brandColor = companySetting.brandColor
    companySettings.value.push({
      ...companySetting,
      workspaceId: target.id,
      companyName: target.name,
      invoiceTitle: target.name,
      brandName: target.name
    })
  }
  ledgerLinkOpen.value = false
  toast.add({ title: '个人账本已链接公司', description: '已继承 ' + workspaceName(target.linkedCompanyId) + ' 的品牌与授权审批规则，账本数据仍独立保存。', color: 'success', icon: 'i-carbon-link' })
}

function openLedgerUnlink(workspace?: GovernanceWorkspace) {
  const target = workspace ?? accessibleWorkspaces.value.find(item => item.kind === 'personal' && item.linkedCompanyId)
  ledgerUnlinkTargetId.value = target?.id ?? ''
  ledgerUnlinkCheck.value = false
  ledgerUnlinkError.value = ''
  ledgerUnlinkOpen.value = true
}

function confirmLedgerUnlink() {
  if (!ledgerUnlinkTarget.value) return
  if (!ledgerUnlinkCheck.value) {
    ledgerUnlinkError.value = '请确认解除链接后的影响，再执行解除。'
    return
  }
  ledgerUnlinkTarget.value.linkedCompanyId = null
  ledgerUnlinkTarget.value.linkedAt = null
  ledgerUnlinkOpen.value = false
  toast.add({ title: '已解除个人账本链接', description: '个人账本与公司账套的数据保持隔离，历史单据不会回写公司。', color: 'success', icon: 'i-carbon-unlink' })
}

// ---------- 邀请 ----------
const inviteStateFilter = ref<'all' | InvitationState>('all')
const inviteTypeFilter = ref<RoleTypeFilter>('all')
const inviteSearch = ref('')
const inviteAllWorkspaces = ref(false)

const inviteScopedRows = computed(() => invitations.value
  .filter(invitation => inviteAllWorkspaces.value
    ? activeIdentity.value.workspaceIds.includes(invitation.workspaceId)
    : invitation.workspaceId === activeWorkspaceId.value)
  .filter(invitation => inviteTypeFilter.value === 'all' || invitation.roleType === inviteTypeFilter.value)
  .filter((invitation) => {
    const keyword = inviteSearch.value.trim().toLowerCase()
    return keyword.length === 0 || (invitation.inviteeName + ' ' + invitation.email).toLowerCase().includes(keyword)
  })
  .sort((left, right) => right.sentAt.localeCompare(left.sentAt)))

const inviteRows = computed(() => inviteScopedRows.value.filter(invitation => inviteStateFilter.value === 'all' || invitation.status === inviteStateFilter.value))
const inviteStateCounts = computed(() => invitationStateOptions.map(option => ({
  label: option.label,
  value: option.value,
  count: inviteScopedRows.value.filter(invitation => invitation.status === option.value).length
})))

const inviteColumns = computed<TableColumn<GovernanceInvitation>[]>(() => [
  { id: 'invitee', header: '受邀人' },
  { id: 'workspace', header: '工作区' },
  { id: 'roleType', header: '角色类型' },
  { id: 'status', header: '状态' },
  { id: 'approval', header: '审批' },
  { id: 'expires', header: '有效期' },
  { id: 'actions', header: '操作' }
])

function roleTypeLabel(invitation: GovernanceInvitation): string {
  return invitation.roleType === 'business' ? '业务角色' : '组织角色'
}

function invitationRoleSummary(invitation: GovernanceInvitation): string {
  const business = invitation.businessRoles.map(role => serviceLabels[role.service] + '·' + businessRoleLevelLabels[role.level])
  if (invitation.roleType === 'business') return business.join(' / ') || '业务角色待配置'
  return invitation.orgRoleLabel
}

function invitationApprovalLabel(invitation: GovernanceInvitation): string {
  if (invitation.approvedBy) return invitation.approvedBy + ' 已批准'
  if (invitation.status === 'pending_approval') return '待 ' + (invitation.requiredApprover ?? '另一位管理员') + ' 独立批准'
  return '无需业务角色审批'
}

const inviteDetailOpen = ref(false)
const selectedInvitationId = ref<string | null>(null)
const selectedInvitation = computed(() => invitations.value.find(invitation => invitation.id === selectedInvitationId.value) ?? null)

function openInviteDetail(invitation: GovernanceInvitation) {
  selectedInvitationId.value = invitation.id
  inviteActionError.value = ''
  inviteDetailOpen.value = true
}

const inviteActionError = ref('')

function canApproveInvitation(invitation: GovernanceInvitation | null): boolean {
  if (!invitation || invitation.status !== 'pending_approval') return false
  return invitation.requiredApprover === activeIdentity.value.name
    && invitation.invitedBy !== activeIdentity.value.name
    && canManageSettings.value
}

function approveInvitation(invitation: GovernanceInvitation | null) {
  if (!invitation) return
  inviteActionError.value = ''
  if (invitation.status !== 'pending_approval') {
    inviteActionError.value = '该邀请当前不处于待批准状态。'
    return
  }
  if (invitation.invitedBy === activeIdentity.value.name) {
    inviteActionError.value = '邀请人不能批准自己发出的业务角色邀请，请切换为另一位管理员。'
    toast.add({ title: '需要独立批准', description: inviteActionError.value, color: 'warning', icon: 'i-carbon-warning-alt' })
    return
  }
  if (invitation.requiredApprover !== activeIdentity.value.name) {
    inviteActionError.value = '该邀请需要 ' + (invitation.requiredApprover ?? '另一位管理员') + ' 独立批准。'
    toast.add({ title: '当前身份不是指定审批人', description: inviteActionError.value, color: 'warning', icon: 'i-carbon-warning-alt' })
    return
  }
  invitation.status = 'valid'
  invitation.approvedBy = activeIdentity.value.name
  invitation.approvedAt = DEMO_TODAY
  invitation.note = '业务角色邀请已由 ' + activeIdentity.value.name + ' 独立批准，等待受邀者接受。'
  inviteActionError.value = ''
  toast.add({ title: '业务角色邀请已批准', description: '邀请现已生效，受邀者可以接受并进入工作区。', color: 'success', icon: 'i-carbon-checkmark' })
}

function switchToRequiredApprover(invitation: GovernanceInvitation | null) {
  if (!invitation?.requiredApprover) {
    toast.add({ title: '暂无指定审批人', description: '请在工作区设置中指定授权审批人。', color: 'warning', icon: 'i-carbon-warning-alt' })
    return
  }
  const approver = identities.value.find(identity => identity.name === invitation.requiredApprover)
  if (!approver) {
    toast.add({ title: '审批人不在演示身份中', description: '指定审批人 ' + invitation.requiredApprover + ' 当前不是可切换的演示身份。', color: 'warning', icon: 'i-carbon-user-x' })
    return
  }
  activeIdentityId.value = approver.id
}

const inviteCreateOpen = ref(false)
const inviteCreateError = ref('')
const inviteCreateDraft = ref<InvitationDraft>({
  inviteeName: '',
  email: '',
  roleType: 'organization',
  orgRole: 'purchaser',
  businessServices: ['purchase'],
  businessLevel: 'operate',
  departmentName: departmentOptions[0]!,
  validityDays: 14
})

function openInviteCreate() {
  inviteCreateError.value = ''
  inviteCreateDraft.value = {
    inviteeName: '',
    email: '',
    roleType: 'organization',
    orgRole: 'purchaser',
    businessServices: ['purchase'],
    businessLevel: 'operate',
    departmentName: departmentOptions[0]!,
    validityDays: 14
  }
  inviteCreateOpen.value = true
}

function toggleInviteService(service: ServiceKey) {
  inviteCreateDraft.value.businessServices = toggleValue(inviteCreateDraft.value.businessServices, service)
}

function submitInvitation() {
  inviteCreateError.value = ''
  const name = inviteCreateDraft.value.inviteeName.trim()
  const email = inviteCreateDraft.value.email.trim()
  if (name.length < 2) {
    inviteCreateError.value = '请填写受邀人姓名（至少 2 个字符）。'
    return
  }
  if (!emailValid(email)) {
    inviteCreateError.value = '邀请邮箱格式不正确。'
    return
  }
  if (invitations.value.some(invitation => invitation.workspaceId === activeWorkspaceId.value && invitation.email === email && ['valid', 'pending_approval'].includes(invitation.status))) {
    inviteCreateError.value = '该邮箱在当前工作区已有有效邀请，请勿重复发送。'
    return
  }
  const needsApproval = inviteCreateDraft.value.roleType === 'business'
  if (needsApproval && inviteCreateDraft.value.businessServices.length === 0) {
    inviteCreateError.value = '业务角色邀请至少需要选择一个服务范围。'
    return
  }
  invitationSequence += 1
  const id = 'gov-inv-new-' + invitationSequence
  const businessRoles = needsApproval
    ? inviteCreateDraft.value.businessServices.map(service => ({
        service,
        level: inviteCreateDraft.value.businessLevel,
        scope: 'department' as BusinessScope,
        departmentName: inviteCreateDraft.value.departmentName
      }))
    : []
  const ownerName = workspaceName(activeWorkspaceId.value).length > 0
    ? workspaces.value.find(workspace => workspace.id === activeWorkspaceId.value)?.ownerName
    : undefined
  const requiredApprover = needsApproval ? (ownerName && ownerName !== activeIdentity.value.name ? ownerName : '另一位管理员') : null
  invitations.value.unshift({
    id,
    workspaceId: activeWorkspaceId.value,
    inviteeName: name,
    email,
    invitedBy: activeIdentity.value.name,
    roleType: inviteCreateDraft.value.roleType,
    orgRoleLabel: orgRoleLabels[inviteCreateDraft.value.orgRole],
    businessRoles,
    departments: [inviteCreateDraft.value.departmentName],
    status: needsApproval ? 'pending_approval' : 'valid',
    sentAt: DEMO_TODAY,
    expiresAt: addDays(DEMO_TODAY, inviteCreateDraft.value.validityDays),
    note: needsApproval ? '业务角色邀请需要另一位管理员独立批准后才能接受。' : '组织角色邀请，接受后加入对应部门。',
    requiredApprover,
    approvedBy: null,
    approvedAt: null,
    revokedReason: null,
    revokedAt: null,
    redeemedBy: null,
    redeemedAt: null,
    mismatchAccount: null,
    link: 'https://app.nexora.example/join#invite=' + id
  })
  inviteCreateOpen.value = false
  toast.add({
    title: needsApproval ? '业务角色邀请已提交审批' : '邀请已发送',
    description: needsApproval ? '邀请处于待批准状态，需要 ' + requiredApprover + ' 独立批准。' : '受邀者可打开接受页预览并加入工作区。',
    color: needsApproval ? 'warning' : 'success',
    icon: 'i-carbon-mail-all'
  })
}

const inviteRevokeOpen = ref(false)
const inviteRevokeTargetId = ref('')
const inviteRevokeReason = ref('')
const inviteRevokeError = ref('')
const inviteRevokeTarget = computed(() => invitations.value.find(invitation => invitation.id === inviteRevokeTargetId.value) ?? null)

function openInviteRevoke(invitation: GovernanceInvitation) {
  inviteRevokeTargetId.value = invitation.id
  inviteRevokeReason.value = ''
  inviteRevokeError.value = ''
  inviteRevokeOpen.value = true
}

function confirmInviteRevoke() {
  const target = inviteRevokeTarget.value
  if (!target) return
  if (inviteRevokeReason.value.trim().length < 4) {
    inviteRevokeError.value = '请填写至少 4 个字符的撤回原因。'
    return
  }
  target.status = 'revoked'
  target.revokedReason = inviteRevokeReason.value.trim()
  target.revokedAt = DEMO_TODAY
  inviteRevokeOpen.value = false
  toast.add({ title: '邀请已撤回', description: '邀请链接已失效，撤回原因已记录到邀请详情。', color: 'success', icon: 'i-carbon-undo' })
}

function resendInvitation(invitation: GovernanceInvitation) {
  invitation.status = 'valid'
  invitation.sentAt = DEMO_TODAY
  invitation.expiresAt = addDays(DEMO_TODAY, 14)
  invitation.revokedReason = null
  invitation.revokedAt = null
  invitation.approvedBy = null
  invitation.approvedAt = null
  invitation.note = '邀请已重新发送，有效期延长 14 天。'
  toast.add({ title: '邀请已重新发送', description: '新链接有效期至 ' + invitation.expiresAt + '，旧链接立即失效。', color: 'success', icon: 'i-carbon-mail-reply' })
}

async function copyInviteLink(invitation: GovernanceInvitation) {
  try {
    await navigator.clipboard.writeText(invitation.link)
    toast.add({ title: '邀请链接已复制', description: '可将链接发送给 ' + invitation.email + '，有效期至 ' + invitation.expiresAt + '。', color: 'success', icon: 'i-carbon-copy' })
  } catch {
    toast.add({ title: '复制失败', description: '当前浏览器不允许写入剪贴板，请手动复制邀请链接。', color: 'error', icon: 'i-carbon-warning-alt' })
  }
}

// ---------- 邀请接受预览 ----------
const acceptancePreviewOpen = ref(false)
const previewInvitationId = ref<string | null>(null)
const previewStatus = ref<InvitationState>('valid')
const previewAccountEmail = ref('')
const previewInvitation = computed(() => invitations.value.find(invitation => invitation.id === previewInvitationId.value) ?? invitations.value[0] ?? null)
const previewAccountOptions = computed(() => {
  const options = [{ label: activeIdentity.value.name + '（当前身份 · ' + activeIdentity.value.email + '）', value: activeIdentity.value.email }]
  const invitation = previewInvitation.value
  if (invitation && !options.some(option => option.value === invitation.email)) {
    options.push({ label: invitation.inviteeName + '（受邀账户 · ' + invitation.email + '）', value: invitation.email })
  }
  if (invitation?.mismatchAccount && !options.some(option => option.value === invitation.mismatchAccount)) {
    options.push({ label: '错误账户 · ' + invitation.mismatchAccount, value: invitation.mismatchAccount })
  }
  return options
})
const previewStatusHint = computed(() => invitationStateOptions.find(option => option.value === previewStatus.value)?.hint ?? '')
const previewEmailMatches = computed(() => Boolean(previewInvitation.value && previewAccountEmail.value === previewInvitation.value.email))
const canAcceptPreview = computed(() => previewStatus.value === 'valid' && previewEmailMatches.value)
const previewApprovalAllowed = computed(() => canApproveInvitation(previewInvitation.value))

function openAcceptancePreview(invitation?: GovernanceInvitation) {
  const target = invitation ?? inviteRows.value[0] ?? invitations.value[0]
  if (!target) {
    toast.add({ title: '暂无可预览的邀请', description: '请先创建一条邀请，再打开接受页预览。', color: 'warning', icon: 'i-carbon-mail-all' })
    return
  }
  previewInvitationId.value = target.id
  previewStatus.value = target.status
  previewAccountEmail.value = target.status === 'mismatch' && target.mismatchAccount ? target.mismatchAccount : activeIdentity.value.email
  acceptancePreviewOpen.value = true
}

function switchPreviewAccount() {
  const invitation = previewInvitation.value
  if (!invitation) return
  previewAccountEmail.value = invitation.email
  toast.add({ title: '已切换为受邀账户', description: '现在可以使用 ' + invitation.email + ' 接受邀请。', color: 'info', icon: 'i-carbon-user-switch' })
}

function acceptPreviewInvitation() {
  const invitation = previewInvitation.value
  if (!invitation || !canAcceptPreview.value) return
  invitation.status = 'redeemed'
  invitation.redeemedBy = invitation.inviteeName
  invitation.redeemedAt = DEMO_TODAY
  previewStatus.value = 'redeemed'
  if (!activeIdentity.value.workspaceIds.includes(invitation.workspaceId)) {
    activeIdentity.value.workspaceIds = [...activeIdentity.value.workspaceIds, invitation.workspaceId]
  }
  activeWorkspaceId.value = invitation.workspaceId
  toast.add({ title: '邀请已接受', description: invitation.inviteeName + ' 已加入 ' + workspaceName(invitation.workspaceId) + '，当前工作区已切换。', color: 'success', icon: 'i-carbon-checkmark' })
}

function switchPreviewApprover() {
  switchToRequiredApprover(previewInvitation.value)
}

function previewResend() {
  const invitation = previewInvitation.value
  if (!invitation) return
  resendInvitation(invitation)
  previewStatus.value = 'valid'
}

function enterInvitationWorkspace() {
  const invitation = previewInvitation.value
  if (!invitation) return
  if (!activeIdentity.value.workspaceIds.includes(invitation.workspaceId)) {
    activeIdentity.value.workspaceIds = [...activeIdentity.value.workspaceIds, invitation.workspaceId]
  }
  activeWorkspaceId.value = invitation.workspaceId
  acceptancePreviewOpen.value = false
  activeTab.value = 'members'
}

// ---------- 成员 ----------
const memberSearch = ref('')
const memberStatusFilter = ref<MemberStatusFilter>('all')
const memberServiceFilter = ref<'all' | ServiceKey>('all')
const memberAllWorkspaces = ref(false)

const memberScopedRows = computed(() => members.value.filter(member => memberAllWorkspaces.value
  ? activeIdentity.value.workspaceIds.includes(member.workspaceId)
  : member.workspaceId === activeWorkspaceId.value))
const memberRows = computed(() => memberScopedRows.value
  .filter(member => memberStatusFilter.value === 'all' || member.status === memberStatusFilter.value)
  .filter(member => memberServiceFilter.value === 'all' || member.businessRoles.some(role => role.service === memberServiceFilter.value))
  .filter((member) => {
    const keyword = memberSearch.value.trim().toLowerCase()
    return keyword.length === 0 || (member.name + ' ' + member.email + ' ' + member.departmentName).toLowerCase().includes(keyword)
  }))

const memberColumns = computed<TableColumn<GovernanceMember>[]>(() => [
  { id: 'name', header: '成员' },
  { id: 'workspace', header: '工作区' },
  { id: 'orgRole', header: '组织角色' },
  { id: 'business', header: '业务角色' },
  { id: 'department', header: '部门' },
  { id: 'status', header: '状态' },
  { id: 'actions', header: '操作' }
])

const activeAdminCounts = computed<Record<string, number>>(() => {
  const counts: Record<string, number> = {}
  members.value.forEach((member) => {
    if (member.status === 'active' && (member.orgRole === 'owner' || member.orgRole === 'admin')) {
      counts[member.workspaceId] = (counts[member.workspaceId] ?? 0) + 1
    }
  })
  return counts
})

function isLastAdmin(member: GovernanceMember): boolean {
  return member.status === 'active'
    && (member.orgRole === 'owner' || member.orgRole === 'admin')
    && (activeAdminCounts.value[member.workspaceId] ?? 0) <= 1
}

function memberBusinessSummary(member: GovernanceMember): string {
  if (member.businessRoles.length === 0) return '未配置'
  return member.businessRoles.map(role => serviceLabels[role.service] + '·' + businessRoleLevelLabels[role.level]).join(' / ')
}

const memberDetailOpen = ref(false)
const selectedMemberId = ref<string | null>(null)
const selectedMember = computed(() => members.value.find(member => member.id === selectedMemberId.value) ?? null)
const memberDraft = ref<MemberDraft>({ orgRole: 'member', departmentName: '', businessRoles: [] })
const memberError = ref('')
const memberBusinessError = ref('')

function defaultBusinessDraft(service: ServiceKey, member: GovernanceMember): MemberBusinessRoleDraft {
  const grant = member.businessRoles.find(role => role.service === service)
  return {
    enabled: Boolean(grant),
    level: grant?.level ?? 'view',
    scope: grant?.scope ?? 'department',
    departmentName: grant?.departmentName ?? member.departmentName
  }
}

function openMemberDetail(member: GovernanceMember) {
  selectedMemberId.value = member.id
  memberDraft.value = {
    orgRole: member.orgRole,
    departmentName: member.departmentName,
    businessRoles: serviceKeys.map(service => defaultBusinessDraft(service, member))
  }
  memberError.value = ''
  memberBusinessError.value = ''
  memberDetailOpen.value = true
}

function saveMemberOrgRole() {
  const member = selectedMember.value
  if (!member) return
  memberError.value = ''
  if (isLastAdmin(member) && memberDraft.value.orgRole !== 'owner' && memberDraft.value.orgRole !== 'admin') {
    memberError.value = '不能把当前最后一位管理员降级：工作区将无人可管理成员与审批授权。请先指定另一位管理员。'
    return
  }
  member.orgRole = memberDraft.value.orgRole
  toast.add({ title: '组织角色已更新', description: member.name + ' 的组织角色已调整为「' + orgRoleLabels[member.orgRole] + '」，业务角色不受影响。', color: 'success', icon: 'i-carbon-user-role' })
}

function saveMemberDepartment() {
  const member = selectedMember.value
  if (!member) return
  if (!memberDraft.value.departmentName) {
    memberError.value = '请选择成员所属部门。'
    return
  }
  memberError.value = ''
  member.departmentName = memberDraft.value.departmentName
  toast.add({ title: '成员部门已更新', description: member.name + ' 已调整到 ' + member.departmentName + '。', color: 'success', icon: 'i-carbon-tree-view-alt' })
}

function saveMemberBusinessRoles() {
  const member = selectedMember.value
  if (!member) return
  memberBusinessError.value = ''
  const grants: GovernanceMember['businessRoles'] = []
  for (let index = 0; index < serviceKeys.length; index += 1) {
    const service = serviceKeys[index]!
    const draft = memberDraft.value.businessRoles[index]
    if (!draft?.enabled) continue
    if (draft.scope === 'department' && !draft.departmentName) {
      memberBusinessError.value = serviceLabels[service] + '业务角色需要选择数据范围部门。'
      return
    }
    grants.push({
      service,
      level: draft.level,
      scope: draft.scope,
      departmentName: draft.scope === 'department' ? draft.departmentName : null
    })
  }
  member.businessRoles = grants
  toast.add({ title: '业务角色已更新', description: member.name + ' 的采购、销售、财务业务角色与数据范围已分别保存。', color: 'success', icon: 'i-carbon-user-certification' })
}

const adminBlockedOpen = ref(false)
const blockedMember = ref<GovernanceMember | null>(null)
const removeDialogOpen = ref(false)
const removeTarget = ref<GovernanceMember | null>(null)
const adminBlockedReason = computed(() => {
  const member = blockedMember.value
  if (!member) return ''
  return member.name + ' 是 ' + workspaceName(member.workspaceId) + ' 当前唯一在用的所有者/管理员（共 ' + (activeAdminCounts.value[member.workspaceId] ?? 0) + ' 人）。停用或移除后工作区将无人可管理成员与审批授权，操作已被阻止。请先把另一位在职成员的组织角色调整为「管理员」，再执行该操作。'
})

function blockLastAdmin(member: GovernanceMember) {
  blockedMember.value = member
  adminBlockedOpen.value = true
}

function requestToggleStatus(member: GovernanceMember) {
  if (member.status === 'invited') {
    toast.add({ title: '邀请尚未接受', description: '该成员还未接受邀请，无法切换账户状态。', color: 'warning', icon: 'i-carbon-mail-all' })
    return
  }
  if (member.status === 'active' && isLastAdmin(member)) {
    blockLastAdmin(member)
    return
  }
  if (member.status === 'active') {
    member.status = 'disabled'
    toast.add({ title: '成员已停用', description: member.name + ' 已停用，业务角色立即停止参与单据校验；历史操作记录保留。', color: 'success', icon: 'i-carbon-user-x' })
  } else {
    member.status = 'active'
    toast.add({ title: '成员已恢复', description: member.name + ' 已恢复在职状态，业务角色按原范围重新生效。', color: 'success', icon: 'i-carbon-user-follow' })
  }
}

function requestRemoveMember(member: GovernanceMember) {
  if (isLastAdmin(member)) {
    blockLastAdmin(member)
    return
  }
  removeTarget.value = member
  removeDialogOpen.value = true
}

function confirmRemoveMember() {
  const target = removeTarget.value
  if (!target) return
  members.value = members.value.filter(member => member.id !== target.id)
  removeDialogOpen.value = false
  memberDetailOpen.value = false
  toast.add({ title: '成员已移除', description: target.name + ' 已从 ' + workspaceName(target.workspaceId) + ' 移除，其授权与邀请关系同步失效。', color: 'success', icon: 'i-carbon-user-x' })
}

// ---------- 自定义角色与授权 ----------
const customRoleSearch = ref('')
const customRoleStatusFilter = ref<'all' | CustomRoleStatus>('all')
const customRoleServiceFilter = ref<'all' | ServiceKey>('all')
const customRoleRows = computed(() => customRoles.value
  .filter(role => role.workspaceId === activeWorkspaceId.value)
  .filter(role => customRoleStatusFilter.value === 'all' || role.status === customRoleStatusFilter.value)
  .filter(role => customRoleServiceFilter.value === 'all' || role.services.some(grant => grant.service === customRoleServiceFilter.value && grant.actions.length > 0))
  .filter((role) => {
    const keyword = customRoleSearch.value.trim().toLowerCase()
    return keyword.length === 0 || (role.name + ' ' + role.description).toLowerCase().includes(keyword)
  }))

function roleServiceGrant(role: CustomRole, service: ServiceKey): CustomRoleServiceGrant {
  return role.services.find(grant => grant.service === service) ?? { service, actions: [], departments: [] }
}

interface ApprovalStep {
  label: string
  name: string
  state: 'done' | 'current' | 'waiting'
}

function roleApprovalSteps(role: CustomRole): ApprovalStep[] {
  const steps: ApprovalStep[] = [{ label: '提交申请', name: role.requestedBy + ' · ' + role.requestedAt, state: 'done' }]
  for (let index = 0; index < role.approvalMode; index += 1) {
    const approval = role.approvals[index]
    if (approval) {
      steps.push({ label: '审批人 ' + (index + 1), name: approval.name + ' · ' + approval.approvedAt, state: 'done' })
    } else if (role.status === 'pending' && role.approvals.length === index) {
      steps.push({ label: '审批人 ' + (index + 1), name: '等待独立审批', state: 'current' })
    } else {
      steps.push({ label: '审批人 ' + (index + 1), name: role.status === 'pending' ? '等待前序审批' : '未完成', state: 'waiting' })
    }
  }
  return steps
}

function roleApprovalPercent(role: CustomRole): number {
  return Math.round((Math.min(role.approvals.length, role.approvalMode) / role.approvalMode) * 100)
}

function roleApprovalHint(role: CustomRole): string {
  if (role.status !== 'pending') return '授权当前状态为「' + customRoleStatusLabels[role.status] + '」，无需继续审批。'
  if (role.requestedBy === activeIdentity.value.name) return '申请人不能批准自己提交的授权，请切换其他管理员。'
  if (role.approvals.some(approval => approval.identityId === activeIdentity.value.id)) return '当前身份已批准过该授权，两人审批需要另一位管理员。'
  if (role.approvalMode === 2 && role.approvals.length === 1) return '还差 1 位管理员独立批准后生效。'
  return '批准后授权立即生效，有效期至 ' + role.validTo + '。'
}

function canApproveRole(role: CustomRole): boolean {
  return role.status === 'pending'
    && role.requestedBy !== activeIdentity.value.name
    && !role.approvals.some(approval => approval.identityId === activeIdentity.value.id)
    && canManageSettings.value
}

const customRoleActionError = ref('')

function approveCustomRole(role: CustomRole) {
  customRoleActionError.value = ''
  if (!canApproveRole(role)) {
    customRoleActionError.value = roleApprovalHint(role)
    toast.add({ title: '无法继续批准', description: customRoleActionError.value, color: 'warning', icon: 'i-carbon-warning-alt' })
    return
  }
  role.approvals.push({ identityId: activeIdentity.value.id, name: activeIdentity.value.name, approvedAt: DEMO_TODAY })
  if (role.approvals.length >= role.approvalMode) {
    role.status = 'active'
    toast.add({ title: '授权审批通过', description: '「' + role.name + '」已完成 ' + role.approvals.length + '/' + role.approvalMode + ' 审批并生效，有效期至 ' + role.validTo + '。', color: 'success', icon: 'i-carbon-certificate' })
  } else {
    toast.add({ title: '已记录审批', description: '当前进度 ' + role.approvals.length + '/' + role.approvalMode + '，还需另一位管理员独立批准。', color: 'info', icon: 'i-carbon-user-certification' })
  }
}

const roleHistoryOpen = ref(false)
const roleHistoryTargetId = ref('')
const roleHistoryTarget = computed(() => customRoles.value.find(role => role.id === roleHistoryTargetId.value) ?? null)

function openRoleHistory(role: CustomRole) {
  roleHistoryTargetId.value = role.id
  roleHistoryOpen.value = true
}

const roleServiceDialogOpen = ref(false)
const roleServiceTargetId = ref('')
const roleServiceKey = ref<ServiceKey>('purchase')
const roleServiceActions = ref<ServiceActionKey[]>([])
const roleServiceDepartments = ref<string[]>([])
const roleServiceError = ref('')
const roleServiceTarget = computed(() => customRoles.value.find(role => role.id === roleServiceTargetId.value) ?? null)

function openRoleServiceDialog(role: CustomRole, service: ServiceKey) {
  const grant = roleServiceGrant(role, service)
  roleServiceTargetId.value = role.id
  roleServiceKey.value = service
  roleServiceActions.value = [...grant.actions]
  roleServiceDepartments.value = [...grant.departments]
  roleServiceError.value = ''
  roleServiceDialogOpen.value = true
}

function toggleRoleServiceAction(action: ServiceActionKey) {
  roleServiceActions.value = toggleValue(roleServiceActions.value, action)
}

function toggleRoleServiceDepartment(department: string) {
  roleServiceDepartments.value = toggleValue(roleServiceDepartments.value, department)
}

function saveRoleService() {
  const role = roleServiceTarget.value
  if (!role) return
  roleServiceError.value = ''
  if (roleServiceActions.value.length > 0 && roleServiceDepartments.value.length === 0) {
    roleServiceError.value = '开放了服务动作后，至少需要选择一个部门范围。'
    return
  }
  const index = role.services.findIndex(grant => grant.service === roleServiceKey.value)
  const next: CustomRoleServiceGrant = {
    service: roleServiceKey.value,
    actions: [...roleServiceActions.value],
    departments: [...roleServiceDepartments.value]
  }
  if (index >= 0) {
    role.services[index] = next
  } else {
    role.services.push(next)
  }
  roleServiceDialogOpen.value = false
  toast.add({ title: '服务范围已更新', description: '「' + role.name + '」的' + serviceLabels[roleServiceKey.value] + '动作与部门范围已保存。', color: 'success', icon: 'i-carbon-settings-adjust' })
}

const roleRejectOpen = ref(false)
const roleRejectTargetId = ref('')
const roleRejectReason = ref('')
const roleRejectError = ref('')
const roleRejectTarget = computed(() => customRoles.value.find(role => role.id === roleRejectTargetId.value) ?? null)

function openRoleReject(role: CustomRole) {
  roleRejectTargetId.value = role.id
  roleRejectReason.value = ''
  roleRejectError.value = ''
  roleRejectOpen.value = true
}

function confirmRoleReject() {
  const role = roleRejectTarget.value
  if (!role) return
  if (roleRejectReason.value.trim().length < 4) {
    roleRejectError.value = '请填写至少 4 个字符的拒绝原因。'
    return
  }
  role.status = 'revoked'
  role.revokedReason = '审批人拒绝：' + roleRejectReason.value.trim()
  roleRejectOpen.value = false
  customRoleActionError.value = ''
  toast.add({ title: '授权申请已拒绝', description: '「' + role.name + '」已标记为已撤销，不能用于任何单据操作。', color: 'success', icon: 'i-carbon-close-outline' })
}

const roleRevokeOpen = ref(false)
const roleRevokeTargetId = ref('')
const roleRevokeReason = ref('')
const roleRevokeError = ref('')
const roleRevokeTarget = computed(() => customRoles.value.find(role => role.id === roleRevokeTargetId.value) ?? null)

function openRoleRevoke(role: CustomRole) {
  roleRevokeTargetId.value = role.id
  roleRevokeReason.value = ''
  roleRevokeError.value = ''
  roleRevokeOpen.value = true
}

function confirmRoleRevoke() {
  const role = roleRevokeTarget.value
  if (!role) return
  if (roleRevokeReason.value.trim().length < 4) {
    roleRevokeError.value = '请填写至少 4 个字符的撤销原因。'
    return
  }
  role.status = 'revoked'
  role.revokedReason = roleRevokeReason.value.trim()
  roleRevokeOpen.value = false
  toast.add({ title: '授权已撤销', description: '「' + role.name + '」立即失效，待审批与已生效授权均不能再操作单据。', color: 'success', icon: 'i-carbon-undo' })
}

const roleCreateOpen = ref(false)
const roleCreateError = ref('')
const roleCreateDraft = ref<RoleCreateDraft>({
  name: '',
  description: '',
  approvalMode: 2,
  validityDays: 90,
  services: ['purchase'],
  departments: ['采购部']
})

function openRoleCreate() {
  roleCreateError.value = ''
  roleCreateDraft.value = {
    name: '',
    description: '',
    approvalMode: 2,
    validityDays: 90,
    services: ['purchase'],
    departments: ['采购部']
  }
  roleCreateOpen.value = true
}

function toggleRoleCreateService(service: ServiceKey) {
  roleCreateDraft.value.services = toggleValue(roleCreateDraft.value.services, service)
}

function toggleRoleCreateDepartment(department: string) {
  roleCreateDraft.value.departments = toggleValue(roleCreateDraft.value.departments, department)
}

function submitCustomRole() {
  roleCreateError.value = ''
  const name = roleCreateDraft.value.name.trim()
  if (name.length < 2) {
    roleCreateError.value = '请填写至少 2 个字符的自定义角色名称。'
    return
  }
  if (roleCreateDraft.value.services.length === 0) {
    roleCreateError.value = '请至少选择一个服务范围。'
    return
  }
  if (roleCreateDraft.value.departments.length === 0) {
    roleCreateError.value = '请至少选择一个部门范围。'
    return
  }
  roleSequence += 1
  customRoles.value.unshift({
    id: 'gov-cr-new-' + roleSequence,
    workspaceId: activeWorkspaceId.value,
    name,
    description: roleCreateDraft.value.description.trim() || '演示自定义角色，等待两人独立审批。',
    status: 'pending',
    currentVersion: 1,
    versions: [{ version: 1, changedAt: DEMO_TODAY, changedBy: activeIdentity.value.name, summary: '初始版本：' + roleCreateDraft.value.services.map(service => serviceLabels[service]).join('、') + '查看、经办、审批，部门范围 ' + roleCreateDraft.value.departments.join('、') + '。' }],
    approvalMode: roleCreateDraft.value.approvalMode,
    approvals: [],
    requestedBy: activeIdentity.value.name,
    requestedAt: DEMO_TODAY,
    validFrom: DEMO_TODAY,
    validTo: addDays(DEMO_TODAY, roleCreateDraft.value.validityDays),
    revokedReason: null,
    services: serviceKeys.map(service => roleCreateDraft.value.services.includes(service)
      ? { service, actions: ['view', 'operate', 'approve'], departments: [...roleCreateDraft.value.departments] }
      : { service, actions: [], departments: [] })
  })
  roleCreateOpen.value = false
  toast.add({ title: '授权申请已提交', description: '「' + name + '」处于待审批状态，审批进度会在卡片中按 0/' + roleCreateDraft.value.approvalMode + ' 展示。', color: 'success', icon: 'i-carbon-certificate' })
}

const permissionRoleId = ref('')
const permissionDocumentId = ref(sampleDocuments[0]?.id ?? '')
const permissionAction = ref<ServiceActionKey>('approve')
const permissionRole = computed(() => customRoles.value.find(role => role.id === permissionRoleId.value) ?? null)
const permissionDocument = computed(() => sampleDocuments.find(document => document.id === permissionDocumentId.value) ?? null)
const permissionRoleOptions = computed(() => customRoleRows.value.map(role => ({ label: role.name + '（' + role.currentVersion + ' 版 · ' + customRoleStatusLabels[role.status] + '）', value: role.id })))
const permissionDocumentOptions = sampleDocuments.map(document => ({ label: document.code + ' · ' + document.typeLabel + ' · ' + document.departmentName, value: document.id }))
const permissionActionOptions = computed(() => {
  const typeId = permissionDocument.value?.typeId
  const type = documentTypeOptions.find(item => item.id === typeId)
  return (type?.actions ?? serviceActionKeys).map(action => ({ label: serviceActionLabels[action], value: action }))
})

watch(customRoleRows, (rows) => {
  if (!rows.some(role => role.id === permissionRoleId.value)) {
    permissionRoleId.value = rows[0]?.id ?? ''
  }
}, { immediate: true })

const permissionCheck = computed<PermissionCheckResult>(() => {
  const role = permissionRole.value
  const document = permissionDocument.value
  if (!role || !document) {
    return { allowed: false, title: '暂无可核对授权', reason: '当前工作区没有自定义角色或未选择单据样例。' }
  }
  if (role.status === 'pending') {
    return { allowed: false, title: '待审批授权不能操作单据', reason: '「' + role.name + '」审批进度 ' + role.approvals.length + '/' + role.approvalMode + '，全部通过前任何动作都会被拒绝。' }
  }
  if (role.status === 'expired' || isPastDate(role.validTo)) {
    return { allowed: false, title: '授权已到期', reason: '「' + role.name + '」有效期至 ' + role.validTo + '，到期后不能再执行单据操作。' }
  }
  if (role.status === 'revoked') {
    return { allowed: false, title: '授权已撤销', reason: role.revokedReason ? '撤销原因：' + role.revokedReason : '「' + role.name + '」已被撤销，不能用于单据操作。' }
  }
  if (role.validFrom > DEMO_TODAY) {
    return { allowed: false, title: '授权尚未生效', reason: '授权将于 ' + role.validFrom + ' 生效，当前日期为 ' + DEMO_TODAY + '。' }
  }
  const grant = role.services.find(item => item.service === document.service)
  if (!grant || !grant.actions.includes(permissionAction.value)) {
    return { allowed: false, title: '服务动作未授权', reason: '角色未开放「' + serviceLabels[document.service] + ' · ' + serviceActionLabels[permissionAction.value] + '」动作。' }
  }
  if (!grant.departments.includes(document.departmentName)) {
    return { allowed: false, title: '部门范围不匹配', reason: '单据部门「' + document.departmentName + '」不在授权部门范围（' + (grant.departments.join('、') || '无') + '）内。' }
  }
  return { allowed: true, title: '允许执行单据操作', reason: '「' + role.name + '」当前有效至 ' + role.validTo + '，已开放' + serviceLabels[document.service] + '·' + serviceActionLabels[permissionAction.value] + '并覆盖「' + document.departmentName + '」。' }
})

function reviseCustomRole(role: CustomRole) {
  customRoleActionError.value = ''
  if (!canManageSettings.value) {
    customRoleActionError.value = '当前身份没有管理设置权限，不能提交角色修订。'
    return
  }
  if (role.status === 'revoked' || role.status === 'expired') {
    customRoleActionError.value = '已撤销或已到期的授权不能直接修订，请重新创建授权申请。'
    toast.add({ title: '无法修订', description: customRoleActionError.value, color: 'warning', icon: 'i-carbon-warning-alt' })
    return
  }
  role.currentVersion += 1
  role.versions = [...role.versions, {
    version: role.currentVersion,
    changedAt: DEMO_TODAY,
    changedBy: activeIdentity.value.name,
    summary: '演示修订：重新确认服务动作与部门范围，审批人数保持 ' + role.approvalMode + ' 人。'
  }]
  role.status = 'pending'
  role.approvals = []
  role.requestedBy = activeIdentity.value.name
  role.requestedAt = DEMO_TODAY
  role.validFrom = DEMO_TODAY
  toast.add({ title: '已提交修订版本', description: '「' + role.name + '」已生成第 ' + role.currentVersion + ' 版，需重新完成 ' + role.approvalMode + ' 人审批后生效。', color: 'success', icon: 'i-carbon-version' })
}

// ---------- 公告 ----------
const announcementWorkspaceFilter = ref<string>('current')
const announcementPermissionFilter = ref<string>('all')
const announcementValidityFilter = ref<AnnouncementValidityFilter>('active')
const announcementSearch = ref('')
const readAnnouncementIds = ref<string[]>([])

const announcementWorkspaceOptions = computed(() => [
  { label: '当前工作区', value: 'current' },
  ...accessibleWorkspaces.value.map(workspace => ({ label: workspace.name, value: workspace.id })),
  { label: '全部可见工作区', value: 'all' }
])
const announcementPermissionOptions = computed(() => {
  const permissions = [...new Set(announcements.value.map(announcement => announcement.permission))]
  return [
    { label: '全部权限', value: 'all' },
    ...permissions.map(permission => ({ label: permissionLabels[permission], value: permission }))
  ]
})
const announcementScopeWorkspaceIds = computed<string[]>(() => {
  const filter = announcementWorkspaceFilter.value
  if (filter === 'all') return activeIdentity.value.workspaceIds
  if (filter === 'current') return [activeWorkspaceId.value]
  return activeIdentity.value.workspaceIds.includes(filter) ? [filter] : [activeWorkspaceId.value]
})
const announcementScoped = computed(() => announcements.value.filter(announcement => announcementScopeWorkspaceIds.value.includes(announcement.workspaceId)))
const announcementVisible = computed(() => announcementScoped.value.filter(announcement => activePermissions.value.includes(announcement.permission)))
const announcementHiddenByPermission = computed(() => announcementScoped.value.length - announcementVisible.value.length)
const announcementRows = computed(() => announcementVisible.value
  .filter(announcement => announcementPermissionFilter.value === 'all' || announcement.permission === announcementPermissionFilter.value)
  .filter((announcement) => {
    if (announcementValidityFilter.value === 'all') return true
    if (announcementValidityFilter.value === 'expired') return isPastDate(announcement.expiresAt)
    if (announcementValidityFilter.value === 'expiring') return !isPastDate(announcement.expiresAt) && daysFromToday(announcement.expiresAt) <= 7
    return !isPastDate(announcement.expiresAt)
  })
  .filter((announcement) => {
    const keyword = announcementSearch.value.trim().toLowerCase()
    return keyword.length === 0 || (announcement.title + ' ' + announcement.body).toLowerCase().includes(keyword)
  })
  .sort((left, right) => right.publishedAt.localeCompare(left.publishedAt)))
const announcementReadCount = computed(() => announcementRows.value.filter(announcement => readAnnouncementIds.value.includes(announcement.id)).length)
const announcementHiddenNote = computed(() => {
  const parts: string[] = []
  if (announcementHiddenByPermission.value > 0) parts.push(announcementHiddenByPermission.value + ' 条因当前身份权限不足不可见')
  const validityHidden = announcementVisible.value.length - announcementRows.value.length
  if (validityHidden > 0) parts.push(validityHidden + ' 条被权限或有效期筛选隐藏')
  return parts.length > 0 ? parts.join('；') + '。' : '当前筛选下公告均可见。'
})

function isAnnouncementRead(id: string): boolean {
  return readAnnouncementIds.value.includes(id)
}

function markAnnouncementRead(announcement: GovernanceAnnouncement) {
  if (!readAnnouncementIds.value.includes(announcement.id)) {
    readAnnouncementIds.value = [...readAnnouncementIds.value, announcement.id]
  }
}

function markAllAnnouncementsRead() {
  const ids = announcementRows.value.map(announcement => announcement.id)
  if (ids.length === 0) {
    toast.add({ title: '没有可标记的公告', description: '请调整工作区、权限或有效期筛选。', color: 'warning', icon: 'i-carbon-notification' })
    return
  }
  readAnnouncementIds.value = [...new Set([...readAnnouncementIds.value, ...ids])]
  toast.add({ title: '当前筛选公告已全部标记已读', description: '共标记 ' + ids.length + ' 条；本地已读状态在切换身份/工作区后仍保留。', color: 'success', icon: 'i-carbon-checkmark-outline' })
}

function resetAnnouncementRead() {
  readAnnouncementIds.value = []
  toast.add({ title: '已清除本地已读记录', description: '公告重新显示为未读；仅影响当前浏览器的本地演示状态。', color: 'info', icon: 'i-carbon-reset' })
}

const announcementDetailOpen = ref(false)
const selectedAnnouncementId = ref<string | null>(null)
const selectedAnnouncement = computed(() => announcements.value.find(announcement => announcement.id === selectedAnnouncementId.value) ?? null)

function openAnnouncement(announcement: GovernanceAnnouncement) {
  selectedAnnouncementId.value = announcement.id
  markAnnouncementRead(announcement)
  announcementDetailOpen.value = true
}

function announcementRemainingLabel(announcement: GovernanceAnnouncement): string {
  if (isPastDate(announcement.expiresAt)) return '已于 ' + announcement.expiresAt + ' 到期'
  const days = daysFromToday(announcement.expiresAt)
  if (days === 0) return '今天到期'
  return '剩余 ' + days + ' 天（' + announcement.expiresAt + ' 到期）'
}

watch(readAnnouncementIds, (ids) => {
  if (!import.meta.client) return
  try {
    localStorage.setItem(ANNOUNCEMENT_READ_KEY, JSON.stringify(ids))
  } catch {
    // 本地存储不可用时，已读状态仅保留在当前会话内。
  }
}, { deep: true })

onMounted(() => {
  if (import.meta.client) {
    try {
      const raw = localStorage.getItem(ANNOUNCEMENT_READ_KEY)
      if (raw) readAnnouncementIds.value = JSON.parse(raw) as string[]
    } catch {
      readAnnouncementIds.value = []
    }
  }
})

// ---------- 演示重置与入口意图 ----------
function resetGovernance() {
  const fresh = createGovernanceSeed()
  workspaces.value = fresh.workspaces
  identities.value = fresh.identities
  companySettings.value = fresh.companySettings
  invitations.value = fresh.invitations
  members.value = fresh.members
  customRoles.value = fresh.customRoles
  announcements.value = fresh.announcements
  activeIdentityId.value = DEFAULT_IDENTITY_ID
  activeWorkspaceId.value = 'ws-hq'
  activeTab.value = 'workspace'
  inviteStateFilter.value = 'all'
  inviteTypeFilter.value = 'all'
  inviteSearch.value = ''
  memberSearch.value = ''
  memberStatusFilter.value = 'all'
  memberServiceFilter.value = 'all'
  customRoleSearch.value = ''
  customRoleStatusFilter.value = 'all'
  customRoleServiceFilter.value = 'all'
  announcementWorkspaceFilter.value = 'current'
  announcementPermissionFilter.value = 'all'
  announcementValidityFilter.value = 'active'
  announcementSearch.value = ''
  workspaceStore.setWorkspace('ws-hq')
  toast.add({ title: '治理演示数据已重置', description: '工作区、邀请、成员、授权与公告已恢复种子值；本地公告已读记录保留。', color: 'success', icon: 'i-carbon-reset' })
}

function applyIntent(intent: string) {
  if (intent === 'create-company') {
    activeTab.value = 'workspace'
    openCompanyWizard()
  } else if (intent === 'create-personal') {
    activeTab.value = 'workspace'
    openPersonalDialog()
  } else if (intent === 'link-ledger') {
    activeTab.value = 'workspace'
    openLedgerLink()
  }
}

watch(() => props.initialIntent, (intent) => {
  if (intent && intent !== 'overview') applyIntent(intent)
}, { immediate: true })
</script>

<template>
  <div class="space-y-4" data-testid="governance-center">
    <UCard :ui="{ body: 'p-4 sm:p-5' }">
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div class="space-y-1">
          <div class="flex items-center gap-2">
            <UIcon name="i-carbon-flow" class="size-5 text-primary" />
            <h2 class="text-lg font-semibold text-highlighted">
              工作区、邀请与权限治理
            </h2>
          </div>
          <p class="max-w-2xl text-sm text-muted">
            演示企业/个人工作区、邀请与接受、组织与业务角色、自定义授权审批与公告可见范围。切换身份或工作区后，数据与权限按工作区隔离，公告已读记录仅保存在本地浏览器。
          </p>
        </div>
        <div class="flex flex-wrap items-end gap-2">
          <UFormField label="演示身份" class="w-64">
            <USelect v-model="activeIdentityId" :items="identityOptions" data-testid="governance-identity-select" />
          </UFormField>
          <UFormField label="当前工作区" class="w-64">
            <USelect v-model="activeWorkspaceId" :items="workspaceOptions" data-testid="governance-workspace-select" />
          </UFormField>
          <UButton
            color="neutral"
            variant="outline"
            icon="i-carbon-reset"
            label="重置演示数据"
            data-testid="governance-reset"
            @click="resetGovernance"
          />
        </div>
      </div>
      <div class="mt-4 flex flex-wrap items-center gap-2">
        <UBadge
          color="neutral"
          variant="subtle"
          size="sm"
          :label="activeIdentity.name + ' · ' + activeIdentity.title"
          data-testid="governance-active-identity"
        />
        <UBadge
          color="primary"
          variant="subtle"
          size="sm"
          :label="activeWorkspace.name + '（' + (activeWorkspace.kind === 'personal' ? '个人工作区' : '企业工作区') + '）'"
          data-testid="governance-active-workspace"
        />
        <UBadge
          color="neutral"
          variant="outline"
          size="sm"
          :label="'权限 ' + activePermissions.length + '/14 · ' + (canManageSettings ? '可管理设置' : '仅查看')"
          data-testid="governance-permission-summary"
        />
        <UBadge
          color="neutral"
          variant="outline"
          size="sm"
          :label="'可访问工作区 ' + accessibleWorkspaces.length"
          data-testid="governance-workspace-count"
        />
      </div>
      <UAlert
        class="mt-4"
        color="info"
        variant="subtle"
        icon="i-carbon-data-base"
        title="演示数据说明"
        description="所有数据来自本地种子，刷新页面恢复初始状态；切换身份或工作区会立即重算可见范围，公告已读状态使用 localStorage 保留。撤销、拒绝等治理操作只在内存中生效。"
        data-testid="governance-isolation-note"
      />
    </UCard>

    <UTabs
      v-model="activeTab"
      :items="tabItems"
      :content="false"
      data-testid="governance-tabs"
    />

    <div v-if="activeTab === 'workspace'" class="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
      <UCard :ui="{ body: 'p-4 sm:p-5' }">
        <template #header>
          <div class="flex flex-wrap items-center justify-between gap-2">
            <h3 class="text-sm font-semibold text-highlighted">
              工作区（{{ accessibleWorkspaces.length }}）
            </h3>
            <div class="flex gap-2">
              <UButton
                size="xs"
                icon="i-carbon-add-alt"
                label="新建企业"
                data-testid="workspace-create-company-entry"
                @click="openCompanyWizard()"
              />
              <UButton
                size="xs"
                color="neutral"
                variant="outline"
                icon="i-carbon-user-multiple"
                label="新建个人"
                data-testid="workspace-create-personal-entry"
                @click="openPersonalDialog"
              />
            </div>
          </div>
        </template>
        <div class="space-y-3">
          <div
            v-for="workspace in accessibleWorkspaces"
            :key="workspace.id"
            class="rounded-lg border border-default p-3"
            :class="workspace.id === activeWorkspaceId ? 'border-primary bg-primary/5' : ''"
            :data-testid="'workspace-card-' + workspace.id"
          >
            <div class="flex flex-wrap items-start justify-between gap-2">
              <div class="min-w-0">
                <div class="flex items-center gap-2">
                  <span class="flex size-7 shrink-0 items-center justify-center rounded-md text-[11px] font-semibold text-inverted" :style="{ backgroundColor: workspace.brandColor }">{{ workspace.kind === 'personal' ? '个' : '企' }}</span>
                  <p class="truncate text-sm font-semibold text-highlighted">
                    {{ workspace.name }}
                  </p>
                </div>
                <p class="mt-1 text-xs text-muted">
                  {{ workspace.kind === 'personal' ? '个人账本' : '企业工作区' }} · {{ workspace.planLabel }} · 所有者 {{ workspace.ownerName }}
                </p>
              </div>
              <UBadge
                v-if="workspace.id === activeWorkspaceId"
                color="primary"
                variant="subtle"
                size="sm"
                label="当前"
              />
              <UBadge
                v-else-if="!workspace.initialized"
                color="warning"
                variant="subtle"
                size="sm"
                label="待初始化"
              />
            </div>
            <div class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
              <span>创建于 {{ workspace.createdAt }}</span>
              <span>成员 {{ memberCountOf(workspace.id) }} 人</span>
              <span v-if="workspace.kind === 'company'">企业标识 {{ workspace.initialized ? '已初始化' : '未完成 C4 初始化' }}</span>
              <span v-else>链接公司：{{ workspace.linkedCompanyId ? workspaceName(workspace.linkedCompanyId) : '未链接' }}</span>
            </div>
            <div class="mt-3 flex flex-wrap gap-2">
              <UButton
                size="xs"
                :variant="workspace.id === activeWorkspaceId ? 'soft' : 'outline'"
                :color="workspace.id === activeWorkspaceId ? 'primary' : 'neutral'"
                :label="workspace.id === activeWorkspaceId ? '正在使用' : '切换'"
                :disabled="workspace.id === activeWorkspaceId"
                :data-testid="'workspace-switch-' + workspace.id"
                @click="activeWorkspaceId = workspace.id"
              />
              <template v-if="workspace.kind === 'company'">
                <UButton
                  v-if="!workspace.initialized"
                  size="xs"
                  color="warning"
                  variant="soft"
                  icon="i-carbon-play"
                  label="继续初始化"
                  :data-testid="'workspace-resume-' + workspace.id"
                  @click="openCompanyWizard(workspace)"
                />
                <UButton
                  v-else
                  size="xs"
                  color="neutral"
                  variant="outline"
                  icon="i-carbon-settings-adjust"
                  label="公司设置"
                  :data-testid="'workspace-company-settings-' + workspace.id"
                  @click="activeWorkspaceId = workspace.id"
                />
              </template>
              <template v-else>
                <UButton
                  size="xs"
                  color="neutral"
                  variant="outline"
                  icon="i-carbon-link"
                  :label="workspace.linkedCompanyId ? '重新链接' : '链接公司'"
                  :data-testid="'workspace-ledger-link-' + workspace.id"
                  @click="openLedgerLink(workspace)"
                />
                <UButton
                  v-if="workspace.linkedCompanyId"
                  size="xs"
                  color="error"
                  variant="ghost"
                  icon="i-carbon-unlink"
                  label="解除链接"
                  :data-testid="'workspace-ledger-unlink-' + workspace.id"
                  @click="openLedgerUnlink(workspace)"
                />
              </template>
            </div>
          </div>
          <div v-if="accessibleWorkspaces.length === 0" class="py-6">
            <UEmpty icon="i-carbon-enterprise" title="当前身份没有可访问工作区" description="请切换演示身份，或新建企业/个人工作区。" />
          </div>
          <UAlert
            color="neutral"
            variant="subtle"
            icon="i-carbon-information"
            title="个人账本说明"
            description="个人账本仅当前账户可见；链接公司后只继承品牌与授权审批规则，不共享公司单据和成员。工作区切换后所有页签数据按工作区隔离。"
            data-testid="workspace-ledger-note"
          />
        </div>
      </UCard>

      <UCard :ui="{ body: 'p-4 sm:p-5' }">
        <template #header>
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 class="text-sm font-semibold text-highlighted">
                公司设置
              </h3>
              <p class="text-xs text-muted">
                {{ activeWorkspace.name }} · {{ isPersonalWorkspace ? '个人工作区' : '企业工作区' }}
              </p>
            </div>
            <div class="flex gap-2">
              <UButton
                size="xs"
                color="neutral"
                variant="outline"
                icon="i-carbon-reset"
                label="重置表单"
                data-testid="company-settings-reset"
                :disabled="!companyDirty"
                @click="resetCompanyForm"
              />
              <UButton
                size="xs"
                icon="i-carbon-save"
                label="保存设置"
                data-testid="company-settings-save"
                :disabled="!canSaveCompany"
                @click="saveCompanySettings"
              />
            </div>
          </div>
        </template>
        <div v-if="isPersonalWorkspace" class="space-y-3">
          <UAlert
            color="neutral"
            variant="subtle"
            icon="i-carbon-user-data"
            title="个人工作区设置"
            description="个人账本沿用链接公司的品牌和授权规则；公司标识、品牌、日期格式、时区、会话空闲期限与授权审批人数请切换到企业工作区维护。"
            data-testid="company-settings-personal-note"
          />
          <div class="flex flex-wrap items-center gap-2 text-sm">
            <span class="text-muted">当前链接公司：</span>
            <span class="font-medium">{{ activeWorkspace.linkedCompanyId ? workspaceName(activeWorkspace.linkedCompanyId) : '未链接' }}</span>
            <UButton
              size="xs"
              variant="outline"
              label="链接公司"
              data-testid="company-settings-link-company"
              @click="openLedgerLink(activeWorkspace)"
            />
          </div>
        </div>
        <div v-else class="space-y-4">
          <UAlert
            v-if="!canManageSettings"
            color="warning"
            variant="subtle"
            icon="i-carbon-locked"
            title="当前身份无管理设置权限"
            description="公司设置只读；请切换为所有者或管理员身份后再保存。"
            data-testid="company-settings-permission-note"
          />
          <UAlert
            v-if="companyDirty && !companyFormValid"
            color="error"
            variant="subtle"
            icon="i-carbon-warning-alt"
            :description="companyFormError"
            data-testid="company-settings-error"
          />
          <div class="grid gap-3 sm:grid-cols-2">
            <UFormField label="公司标识（简称）" required>
              <UInput v-model="companyForm.companyName" placeholder="例如：华东总部" data-testid="company-settings-company-name" />
            </UFormField>
            <UFormField label="品牌名称" required>
              <UInput v-model="companyForm.brandName" placeholder="例如：华东总部贸易" data-testid="company-settings-brand-name" />
            </UFormField>
            <UFormField label="统一社会信用代码" required>
              <UInput
                v-model="companyForm.registrationNo"
                placeholder="18 位大写字母或数字"
                maxlength="18"
                data-testid="company-settings-registration"
              />
            </UFormField>
            <UFormField label="发票抬头">
              <UInput v-model="companyForm.invoiceTitle" placeholder="发票抬头全称" data-testid="company-settings-invoice-title" />
            </UFormField>
            <UFormField label="品牌主色">
              <USelect v-model="companyForm.brandColor" :items="brandColorOptions" data-testid="company-settings-brand-color" />
            </UFormField>
            <UFormField label="日期格式">
              <USelect v-model="companyForm.dateFormat" :items="dateFormatOptions" data-testid="company-settings-date-format" />
            </UFormField>
            <UFormField label="时区">
              <USelect v-model="companyForm.timezone" :items="timezoneOptions" data-testid="company-settings-timezone" />
            </UFormField>
            <UFormField label="会话空闲期限">
              <USelect v-model="companyForm.idleTimeoutMinutes" :items="idleTimeoutOptions" data-testid="company-settings-idle-timeout" />
            </UFormField>
          </div>
          <UFormField label="授权审批人数" help="企业授权申请必须完成的独立审批人数；一人=单人审批，两人=两人独立审批。">
            <div class="flex flex-wrap items-center gap-2">
              <UButton
                size="sm"
                :variant="companyForm.approverCount === 1 ? 'soft' : 'outline'"
                :color="companyForm.approverCount === 1 ? 'primary' : 'neutral'"
                label="1 人审批"
                data-testid="company-settings-approver-1"
                @click="setApproverCount(1)"
              />
              <UButton
                size="sm"
                :variant="companyForm.approverCount === 2 ? 'soft' : 'outline'"
                :color="companyForm.approverCount === 2 ? 'primary' : 'neutral'"
                label="2 人审批"
                data-testid="company-settings-approver-2"
                @click="setApproverCount(2)"
              />
              <span class="text-xs text-muted">当前：{{ companyForm.approverCount }} 人独立审批，审批人不能是申请人本人。</span>
            </div>
          </UFormField>
          <div class="rounded-lg border border-default p-3" data-testid="company-settings-brand-preview">
            <div class="flex items-center gap-3">
              <span class="flex size-9 items-center justify-center rounded-md text-xs font-semibold text-inverted" :style="{ backgroundColor: companyForm.brandColor }">NX</span>
              <div>
                <p class="text-sm font-semibold text-highlighted">
                  {{ companyForm.brandName || '品牌名称' }}
                </p>
                <p class="text-xs text-muted">
                  {{ companyForm.invoiceTitle || '发票抬头将在此预览' }}
                </p>
              </div>
            </div>
            <div class="mt-3 grid grid-cols-2 gap-1 text-xs text-muted">
              <span>日期格式：{{ companyForm.dateFormat }}</span>
              <span>时区：{{ companyForm.timezone }}</span>
              <span>会话空闲：{{ companyForm.idleTimeoutMinutes }} 分钟</span>
              <span>授权审批：{{ companyForm.approverCount }} 人</span>
            </div>
          </div>
          <p v-if="companyDirty" class="text-xs text-warning">
            有未保存的更改，保存后立即作用于当前工作区。
          </p>
          <p v-else class="text-xs text-muted">
            当前表单与已保存的公司设置一致。
          </p>
        </div>
      </UCard>
    </div>

    <UModal
      v-model:open="companyWizardOpen"
      :ui="{ content: 'sm:max-w-3xl' }"
      :title="companyEditId ? '继续企业工作区初始化' : '新建企业工作区'"
      description="按企业信息、会计期间、邀请成员三步完成初始化；创建后自动成为所有者并切换到新工作区。"
    >
      <template #body>
        <div class="space-y-4" data-testid="workspace-create-dialog">
          <div class="flex items-center gap-2">
            <div v-for="step in companySteps" :key="step.value" class="flex flex-1 items-center gap-2">
              <span class="flex size-6 items-center justify-center rounded-full text-xs font-semibold" :class="companyStep >= step.value ? 'bg-primary text-inverted' : 'bg-elevated text-muted'">{{ step.value }}</span>
              <span class="text-xs" :class="companyStep >= step.value ? 'text-highlighted' : 'text-muted'">{{ step.label }}</span>
              <span v-if="step.value < 3" class="h-px flex-1 bg-default" />
            </div>
          </div>
          <UAlert
            v-if="companyWizardError"
            color="error"
            variant="subtle"
            icon="i-carbon-warning-alt"
            :description="companyWizardError"
            data-testid="workspace-create-error"
          />

          <div v-if="companyStep === 1" class="grid gap-3 sm:grid-cols-2" data-testid="workspace-create-step-1">
            <UFormField label="企业名称" required class="sm:col-span-2">
              <UInput v-model="companyDraft.name" placeholder="例如：华北供应链有限公司" data-testid="workspace-create-name" />
            </UFormField>
            <UFormField label="统一社会信用代码" required>
              <UInput
                v-model="companyDraft.registrationNo"
                placeholder="18 位大写字母或数字"
                maxlength="18"
                data-testid="workspace-create-registration"
              />
            </UFormField>
            <UFormField label="所属行业">
              <USelect v-model="companyDraft.industry" :items="industryOptions" data-testid="workspace-create-industry" />
            </UFormField>
            <UFormField label="企业规模">
              <USelect v-model="companyDraft.scale" :items="scaleOptions" data-testid="workspace-create-scale" />
            </UFormField>
            <UAlert
              class="sm:col-span-2"
              color="neutral"
              variant="subtle"
              icon="i-carbon-information"
              description="企业工作区默认当前身份为所有者；会计期间与启用日期会用于初始化账套（复用 C4 初始化流程的三步演示）。"
            />
          </div>

          <div v-if="companyStep === 2" class="grid gap-3 sm:grid-cols-2" data-testid="workspace-create-step-2">
            <UFormField label="会计期间开始" required>
              <UInput v-model="companyDraft.fiscalStart" type="date" data-testid="workspace-create-fiscal-start" />
            </UFormField>
            <UFormField label="会计期间结束" required>
              <UInput v-model="companyDraft.fiscalEnd" type="date" data-testid="workspace-create-fiscal-end" />
            </UFormField>
            <UFormField label="启用日期" required>
              <UInput v-model="companyDraft.openingDate" type="date" data-testid="workspace-create-opening-date" />
            </UFormField>
            <UFormField label="科目表模板">
              <USelect v-model="companyDraft.chartTemplate" :items="chartTemplateOptions" data-testid="workspace-create-chart-template" />
            </UFormField>
            <UFormField class="sm:col-span-2">
              <UCheckbox v-model="companyDraft.fiscalConfirmed" label="已确认会计期间与启用日期，与 C4 初始化口径一致" data-testid="workspace-create-fiscal-confirm" />
            </UFormField>
          </div>

          <div v-if="companyStep === 3" class="space-y-3" data-testid="workspace-create-step-3">
            <div class="rounded-lg border border-default p-3 text-sm">
              <p class="font-semibold text-highlighted">
                {{ companyDraft.name }}
              </p>
              <p class="mt-1 text-xs text-muted">
                统一社会信用代码 {{ companyDraft.registrationNo }} · {{ companyDraft.industry }} · {{ companyDraft.scale }}
              </p>
              <p class="mt-1 text-xs text-muted">
                会计期间 {{ companyDraft.fiscalStart }} 至 {{ companyDraft.fiscalEnd }}，启用日期 {{ companyDraft.openingDate }}
              </p>
            </div>
            <UFormField label="邀请成员邮箱" help="支持逗号、分号或换行分隔；发送组织角色邀请，接受后进入对应工作区。">
              <UTextarea
                v-model="companyDraft.inviteEmails"
                :rows="3"
                placeholder="finance@example.com, purchase@example.com"
                data-testid="workspace-create-invites"
              />
            </UFormField>
            <UFormField label="默认组织角色">
              <USelect v-model="companyDraft.inviteRole" :items="orgRoleOptions" data-testid="workspace-create-invite-role" />
            </UFormField>
            <UAlert
              color="info"
              variant="subtle"
              icon="i-carbon-mail-all"
              description="业务角色邀请需要另一位管理员独立批准，不能在本步骤直接发送；创建完成后可在「邀请与接受」页签发起。"
            />
          </div>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full items-center justify-between gap-2">
          <UButton
            color="neutral"
            variant="ghost"
            label="取消"
            data-testid="workspace-create-cancel"
            @click="companyWizardOpen = false"
          />
          <div class="flex gap-2">
            <UButton
              v-if="companyStep > 1"
              color="neutral"
              variant="outline"
              label="上一步"
              data-testid="workspace-create-back"
              @click="companyStep -= 1"
            />
            <UButton
              v-if="companyStep < 3"
              label="下一步"
              trailing-icon="i-carbon-arrow-right"
              data-testid="workspace-create-next"
              @click="nextCompanyStep"
            />
            <UButton
              v-else
              :loading="false"
              label="创建并切换"
              icon="i-carbon-enterprise"
              data-testid="workspace-create-submit"
              @click="submitCompanyWizard"
            />
          </div>
        </div>
      </template>
    </UModal>

    <UModal
      v-model:open="personalDialogOpen"
      :ui="{ content: 'sm:max-w-lg' }"
      title="新建个人工作区"
      description="个人账本只属于当前账户，可链接一家公司继承品牌与授权审批规则，不共享公司单据。"
    >
      <template #body>
        <div class="space-y-3" data-testid="workspace-personal-dialog">
          <UFormField label="个人账本名称" required>
            <UInput v-model="personalDraft.name" placeholder="例如：张明远的个人账本" data-testid="workspace-personal-name" />
          </UFormField>
          <UFormField label="链接公司工作区（可选）">
            <USelect
              v-model="personalDraft.linkedCompanyId"
              :items="ledgerCompanyOptions"
              placeholder="暂不链接"
              data-testid="workspace-personal-link-company"
            />
          </UFormField>
          <UCheckbox
            v-model="personalDraft.privateLedger"
            disabled
            label="个人账本仅本人可见（固定开启）"
            data-testid="workspace-personal-private"
          />
          <UAlert
            v-if="personalError"
            color="error"
            variant="subtle"
            icon="i-carbon-warning-alt"
            :description="personalError"
            data-testid="workspace-personal-error"
          />
          <UAlert
            color="neutral"
            variant="subtle"
            icon="i-carbon-information"
            description="链接公司后，联系人与公告可见范围仍按公司工作区隔离；解除链接不影响历史数据。"
          />
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            color="neutral"
            variant="outline"
            label="取消"
            data-testid="workspace-personal-cancel"
            @click="personalDialogOpen = false"
          />
          <UButton
            label="创建个人账本"
            icon="i-carbon-user-data"
            data-testid="workspace-personal-confirm"
            @click="submitPersonalWorkspace"
          />
        </div>
      </template>
    </UModal>

    <UModal
      v-model:open="ledgerLinkOpen"
      :ui="{ content: 'sm:max-w-lg' }"
      title="个人账本链接公司"
      description="链接后个人账本继承公司的品牌与授权审批规则，但公司单据、成员与公告不会进入个人账本。"
    >
      <template #body>
        <div class="space-y-3" data-testid="workspace-ledger-link-dialog">
          <UAlert
            v-if="!ledgerLinkTarget"
            color="warning"
            variant="subtle"
            icon="i-carbon-warning-alt"
            title="当前身份没有个人账本"
            description="个人账本只对本人可见。请先新建个人工作区，再回到这里链接公司。"
            data-testid="workspace-ledger-link-empty"
          />
          <template v-else>
            <p class="text-sm text-muted">
              目标个人账本：<span class="font-medium text-highlighted">{{ ledgerLinkTarget.name }}</span><span v-if="ledgerLinkTarget.linkedCompanyId">（当前链接 {{ workspaceName(ledgerLinkTarget.linkedCompanyId) }}）</span>
            </p>
            <UFormField label="选择公司工作区" required>
              <USelect
                v-model="ledgerLinkDraft.companyId"
                :items="ledgerCompanyOptions"
                placeholder="请选择公司"
                data-testid="workspace-ledger-link-company"
              />
            </UFormField>
            <UCheckbox v-model="ledgerLinkDraft.confirmed" label="我了解个人账本与公司账套的数据隔离规则" data-testid="workspace-ledger-link-confirm" />
            <UAlert
              v-if="ledgerLinkError"
              color="error"
              variant="subtle"
              icon="i-carbon-warning-alt"
              :description="ledgerLinkError"
              data-testid="workspace-ledger-link-error"
            />
          </template>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            color="neutral"
            variant="outline"
            label="取消"
            data-testid="workspace-ledger-link-cancel"
            @click="ledgerLinkOpen = false"
          />
          <UButton
            v-if="!ledgerLinkTarget"
            label="新建个人账本"
            icon="i-carbon-add-alt"
            data-testid="workspace-ledger-link-create"
            @click="ledgerLinkOpen = false; openPersonalDialog()"
          />
          <UButton
            v-else
            label="确认链接"
            icon="i-carbon-link"
            data-testid="workspace-ledger-link-submit"
            @click="submitLedgerLink"
          />
        </div>
      </template>
    </UModal>

    <UModal
      v-model:open="ledgerUnlinkOpen"
      :ui="{ content: 'sm:max-w-lg' }"
      title="解除个人账本链接"
      description="解除后个人账本恢复为独立演示账本，公司品牌与授权审批规则不再同步。"
    >
      <template #body>
        <div class="space-y-3" data-testid="workspace-ledger-unlink-dialog">
          <UAlert
            v-if="!ledgerUnlinkTarget"
            color="warning"
            variant="subtle"
            icon="i-carbon-warning-alt"
            title="没有可解除链接的个人账本"
            description="请先切换到个人工作区并链接公司，再执行解除。"
          />
          <template v-else>
            <p class="text-sm text-muted">
              将解除 <span class="font-medium text-highlighted">{{ ledgerUnlinkTarget.name }}</span> 与 <span class="font-medium text-highlighted">{{ workspaceName(ledgerUnlinkTarget.linkedCompanyId) }}</span> 的链接。
            </p>
            <UAlert
              color="warning"
              variant="subtle"
              icon="i-carbon-warning-alt"
              title="解除影响"
              description="个人账本不再继承公司品牌与授权审批规则；已产生的个人单据保留，公司账套数据不受影响。此操作演示可再次链接。"
            />
            <UCheckbox v-model="ledgerUnlinkCheck" label="我已确认解除链接后的影响" data-testid="workspace-ledger-unlink-check" />
            <UAlert
              v-if="ledgerUnlinkError"
              color="error"
              variant="subtle"
              icon="i-carbon-warning-alt"
              :description="ledgerUnlinkError"
              data-testid="workspace-ledger-unlink-error"
            />
          </template>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            color="neutral"
            variant="outline"
            label="取消"
            data-testid="workspace-ledger-unlink-cancel"
            @click="ledgerUnlinkOpen = false"
          />
          <UButton
            color="error"
            label="确认解除"
            icon="i-carbon-unlink"
            :disabled="!ledgerUnlinkTarget"
            data-testid="workspace-ledger-unlink-submit"
            @click="confirmLedgerUnlink"
          />
        </div>
      </template>
    </UModal>

    <div v-if="activeTab === 'invitations'" class="space-y-4">
      <UCard :ui="{ body: 'p-4 sm:p-5' }">
        <template #header>
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 class="text-sm font-semibold text-highlighted">
                邀请与接受
              </h3>
              <p class="text-xs text-muted">
                按工作区演示 6 种邀请状态；业务角色邀请必须由另一位管理员独立批准，接受页可预览全部状态。
              </p>
            </div>
            <div class="flex flex-wrap gap-2">
              <UButton
                size="xs"
                color="neutral"
                variant="outline"
                icon="i-carbon-assignment-account"
                label="接受页预览"
                data-testid="invite-acceptance-preview-open"
                @click="openAcceptancePreview()"
              />
              <UButton
                size="xs"
                icon="i-carbon-add-alt"
                label="新建邀请"
                data-testid="invite-create"
                @click="openInviteCreate"
              />
            </div>
          </div>
        </template>
        <div class="space-y-3">
          <div class="flex flex-wrap gap-2">
            <UButton
              v-for="chip in inviteStateCounts"
              :key="chip.value"
              size="xs"
              :variant="inviteStateFilter === chip.value ? 'soft' : 'outline'"
              :color="inviteStateFilter === chip.value ? 'primary' : 'neutral'"
              :label="chip.label + ' ' + chip.count"
              :data-testid="'invite-status-chip-' + chip.value"
              @click="inviteStateFilter = inviteStateFilter === chip.value ? 'all' : chip.value"
            />
          </div>
          <div class="flex flex-wrap items-end gap-2">
            <UFormField label="邀请状态" class="w-40">
              <USelect v-model="inviteStateFilter" :items="inviteStateFilterOptions" data-testid="invite-status-filter" />
            </UFormField>
            <UFormField label="邀请类型" class="w-40">
              <USelect v-model="inviteTypeFilter" :items="inviteTypeOptions" data-testid="invite-type-filter" />
            </UFormField>
            <UFormField label="搜索受邀人" class="w-56">
              <UInput
                v-model="inviteSearch"
                icon="i-carbon-search"
                placeholder="姓名或邮箱"
                data-testid="invite-search"
              />
            </UFormField>
            <UCheckbox v-model="inviteAllWorkspaces" label="含所有可访问工作区" data-testid="invite-all-workspaces" />
          </div>
          <UAlert
            v-if="inviteActionError"
            color="warning"
            variant="subtle"
            icon="i-carbon-warning-alt"
            :description="inviteActionError"
            data-testid="invite-action-error"
          />
          <ResizableTable
            :data="inviteRows"
            :columns="inviteColumns"
            class="nx-table"
            :ui="{ th: 'py-2.5', td: 'py-3' }"
            data-testid="invite-table"
          >
            <template #invitee-cell="{ row }">
              <div>
                <p class="text-sm font-medium text-highlighted">
                  {{ row.original.inviteeName }}
                </p>
                <p class="text-xs text-muted">
                  {{ row.original.email }}
                </p>
              </div>
            </template>
            <template #workspace-cell="{ row }">
              <span class="text-xs">{{ workspaceName(row.original.workspaceId) }}</span>
            </template>
            <template #roleType-cell="{ row }">
              <div class="space-y-1">
                <UBadge
                  :color="row.original.roleType === 'business' ? 'warning' : 'neutral'"
                  variant="subtle"
                  size="sm"
                  :label="roleTypeLabel(row.original)"
                />
                <p class="text-xs text-muted">
                  {{ invitationRoleSummary(row.original) }}
                </p>
              </div>
            </template>
            <template #status-cell="{ row }">
              <UBadge
                :color="invitationStateColors[row.original.status]"
                variant="subtle"
                size="sm"
                :label="invitationStateLabels[row.original.status]"
                :data-testid="'invite-status-' + row.original.id"
              />
            </template>
            <template #approval-cell="{ row }">
              <p class="max-w-40 text-xs text-muted">
                {{ invitationApprovalLabel(row.original) }}
              </p>
            </template>
            <template #expires-cell="{ row }">
              <span class="text-xs">{{ expiryLabel(row.original.expiresAt) }}</span>
            </template>
            <template #actions-cell="{ row }">
              <div class="flex flex-wrap gap-1">
                <UButton
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  label="详情"
                  :data-testid="'invite-detail-' + row.original.id"
                  @click="openInviteDetail(row.original)"
                />
                <UButton
                  v-if="row.original.status === 'pending_approval'"
                  size="xs"
                  color="warning"
                  variant="soft"
                  label="批准"
                  :disabled="!canApproveInvitation(row.original)"
                  :data-testid="'invite-approve-' + row.original.id"
                  @click="approveInvitation(row.original)"
                />
                <UButton
                  v-if="['valid', 'pending_approval'].includes(row.original.status)"
                  size="xs"
                  color="error"
                  variant="ghost"
                  label="撤回"
                  :data-testid="'invite-revoke-' + row.original.id"
                  @click="openInviteRevoke(row.original)"
                />
                <UButton
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  icon="i-carbon-copy"
                  :data-testid="'invite-copy-' + row.original.id"
                  @click="copyInviteLink(row.original)"
                />
              </div>
            </template>
            <template #empty>
              <div class="py-6" data-testid="invite-empty">
                <UEmpty
                  icon="i-carbon-mail-all"
                  title="没有匹配的邀请"
                  description="当前工作区在该状态/类型/搜索条件下没有邀请。可调整筛选或新建邀请。"
                  :actions="[{ label: '新建邀请', onClick: openInviteCreate }]"
                />
              </div>
            </template>
          </ResizableTable>
          <p class="text-xs text-muted">
            共 {{ inviteScopedRows.length }} 条邀请，当前筛选显示 {{ inviteRows.length }} 条；状态芯片同时作用于统计与列表。
          </p>
        </div>
      </UCard>

      <USlideover v-model:open="inviteDetailOpen" :ui="{ content: 'w-full sm:max-w-xl' }">
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon name="i-carbon-mail-all" class="size-5 text-primary" />
            <div>
              <p class="text-sm font-semibold text-highlighted">
                邀请详情
              </p>
              <p class="text-xs text-muted">
                {{ selectedInvitation ? selectedInvitation.inviteeName + ' · ' + selectedInvitation.email : '未选择邀请' }}
              </p>
            </div>
          </div>
        </template>
        <template #body>
          <div v-if="selectedInvitation" class="space-y-4" data-testid="invite-detail-panel">
            <div class="rounded-lg border border-default p-3">
              <div class="flex items-center justify-between gap-2">
                <div class="flex items-center gap-2">
                  <span class="flex size-8 items-center justify-center rounded-md text-xs font-semibold text-inverted" :style="{ backgroundColor: workspaces.find(workspace => workspace.id === selectedInvitation?.workspaceId)?.brandColor ?? '#334155' }">企</span>
                  <div>
                    <p class="text-sm font-semibold text-highlighted">
                      {{ workspaceName(selectedInvitation.workspaceId) }}
                    </p>
                    <p class="text-xs text-muted">
                      邀请人 {{ selectedInvitation.invitedBy }} · 发送于 {{ selectedInvitation.sentAt }}
                    </p>
                  </div>
                </div>
                <UBadge
                  :color="invitationStateColors[selectedInvitation.status]"
                  variant="subtle"
                  size="sm"
                  :label="invitationStateLabels[selectedInvitation.status]"
                  data-testid="invite-detail-status"
                />
              </div>
              <div class="mt-3 grid gap-2 text-xs sm:grid-cols-2">
                <p><span class="text-muted">角色类型：</span>{{ roleTypeLabel(selectedInvitation) }}</p>
                <p><span class="text-muted">角色范围：</span>{{ invitationRoleSummary(selectedInvitation) }}</p>
                <p><span class="text-muted">部门：</span>{{ selectedInvitation.departments.join('、') }}</p>
                <p><span class="text-muted">有效期：</span>{{ expiryLabel(selectedInvitation.expiresAt) }}</p>
                <p class="sm:col-span-2">
                  <span class="text-muted">审批进度：</span>{{ invitationApprovalLabel(selectedInvitation) }}
                </p>
                <p class="sm:col-span-2 break-all font-mono text-[11px] text-muted">
                  {{ selectedInvitation.link }}
                </p>
              </div>
            </div>
            <UAlert
              v-if="selectedInvitation.status === 'pending_approval'"
              :color="canApproveInvitation(selectedInvitation) ? 'success' : 'warning'"
              variant="subtle"
              icon="i-carbon-user-certification"
              title="业务角色邀请需要独立批准"
              :description="canApproveInvitation(selectedInvitation) ? '当前身份满足独立审批条件，批准后邀请即生效。' : '邀请人不能批准自己发出的邀请，且必须由指定审批人 ' + (selectedInvitation.requiredApprover ?? '另一位管理员') + ' 独立批准。'"
              data-testid="invite-approval-hint"
            />
            <UAlert
              v-if="selectedInvitation.revokedReason"
              color="error"
              variant="subtle"
              icon="i-carbon-undo"
              title="撤回/撤销原因"
              :description="selectedInvitation.revokedReason"
              data-testid="invite-revoked-reason"
            />
            <UAlert
              v-if="selectedInvitation.status === 'mismatch'"
              color="warning"
              variant="subtle"
              icon="i-carbon-user-x"
              title="账户不匹配"
              :description="'邀请发送至 ' + selectedInvitation.email + '，当前尝试接受的是 ' + (selectedInvitation.mismatchAccount ?? '其他账户') + '；需要切换账户或重新发送邀请。'"
              data-testid="invite-mismatch-hint"
            />
            <div class="rounded-lg border border-default p-3 text-xs text-muted" data-testid="invite-detail-note">
              <p class="font-medium text-highlighted">
                演示说明
              </p>
              <p class="mt-1">
                {{ selectedInvitation.note || '无附加说明。' }}
              </p>
            </div>
            <div class="flex flex-wrap gap-2">
              <UButton
                v-if="selectedInvitation.status === 'pending_approval'"
                size="sm"
                color="warning"
                icon="i-carbon-checkmark"
                label="独立批准"
                :disabled="!canApproveInvitation(selectedInvitation)"
                data-testid="invite-detail-approve"
                @click="approveInvitation(selectedInvitation)"
              />
              <UButton
                v-if="selectedInvitation.status === 'pending_approval' && !canApproveInvitation(selectedInvitation)"
                size="sm"
                color="neutral"
                variant="outline"
                icon="i-carbon-user-switch"
                :label="'切换为 ' + (selectedInvitation.requiredApprover ?? '指定审批人')"
                data-testid="invite-detail-switch-approver"
                @click="switchToRequiredApprover(selectedInvitation)"
              />
              <UButton
                v-if="['valid', 'pending_approval'].includes(selectedInvitation.status)"
                size="sm"
                color="error"
                variant="outline"
                label="撤回邀请"
                data-testid="invite-detail-revoke"
                @click="openInviteRevoke(selectedInvitation); inviteDetailOpen = false"
              />
              <UButton
                size="sm"
                color="neutral"
                variant="outline"
                icon="i-carbon-copy"
                label="复制链接"
                data-testid="invite-detail-copy"
                @click="copyInviteLink(selectedInvitation)"
              />
              <UButton
                size="sm"
                color="neutral"
                variant="outline"
                icon="i-carbon-assignment-account"
                label="接受页预览"
                data-testid="invite-detail-preview"
                @click="openAcceptancePreview(selectedInvitation); inviteDetailOpen = false"
              />
              <UButton
                v-if="['expired', 'revoked'].includes(selectedInvitation.status)"
                size="sm"
                color="neutral"
                variant="outline"
                icon="i-carbon-mail-reply"
                label="重新发送"
                data-testid="invite-detail-resend"
                @click="resendInvitation(selectedInvitation)"
              />
              <UButton
                size="sm"
                color="neutral"
                variant="ghost"
                label="关闭"
                data-testid="invite-detail-close"
                @click="inviteDetailOpen = false"
              />
            </div>
          </div>
          <div v-else class="py-10" data-testid="invite-detail-empty">
            <UEmpty icon="i-carbon-mail-all" title="未选择邀请" description="请从邀请列表点击「详情」查看审批进度与接受预览。" />
          </div>
        </template>
      </USlideover>
    </div>

    <UModal
      v-model:open="inviteCreateOpen"
      :ui="{ content: 'sm:max-w-xl' }"
      title="新建邀请"
      description="组织角色邀请发送后即可接受；业务角色邀请需要另一位管理员独立批准后才能接受。"
    >
      <template #body>
        <div class="space-y-3" data-testid="invite-create-dialog">
          <div class="grid gap-3 sm:grid-cols-2">
            <UFormField label="受邀人姓名" required>
              <UInput v-model="inviteCreateDraft.inviteeName" placeholder="例如：钱多多" data-testid="invite-create-name" />
            </UFormField>
            <UFormField label="邀请邮箱" required>
              <UInput
                v-model="inviteCreateDraft.email"
                type="email"
                placeholder="name@example.com"
                data-testid="invite-create-email"
              />
            </UFormField>
            <UFormField label="邀请类型">
              <USelect v-model="inviteCreateDraft.roleType" :items="[{ label: '组织角色', value: 'organization' }, { label: '业务角色（需独立批准）', value: 'business' }]" data-testid="invite-create-role-type" />
            </UFormField>
            <UFormField label="有效期">
              <USelect v-model="inviteCreateDraft.validityDays" :items="validityOptions" data-testid="invite-create-validity" />
            </UFormField>
            <UFormField v-if="inviteCreateDraft.roleType === 'organization'" label="组织角色">
              <USelect v-model="inviteCreateDraft.orgRole" :items="orgRoleOptions" data-testid="invite-create-org-role" />
            </UFormField>
            <UFormField v-if="inviteCreateDraft.roleType === 'organization'" label="所属部门">
              <USelect v-model="inviteCreateDraft.departmentName" :items="departmentOptions" data-testid="invite-create-department" />
            </UFormField>
          </div>
          <div v-if="inviteCreateDraft.roleType === 'business'" class="space-y-3 rounded-lg border border-default p-3" data-testid="invite-create-business">
            <UFormField label="业务角色服务范围" help="业务角色按采购/销售/财务服务分别授权，邀请审批通过后按等级与部门范围生效。">
              <div class="flex flex-wrap gap-2">
                <UCheckbox
                  v-for="service in serviceKeys"
                  :key="service"
                  :model-value="inviteCreateDraft.businessServices.includes(service)"
                  :label="serviceLabels[service]"
                  :data-testid="'invite-create-service-' + service"
                  @update:model-value="toggleInviteService(service)"
                />
              </div>
            </UFormField>
            <div class="grid gap-3 sm:grid-cols-2">
              <UFormField label="业务角色等级">
                <USelect v-model="inviteCreateDraft.businessLevel" :items="businessLevelOptions" data-testid="invite-create-business-level" />
              </UFormField>
              <UFormField label="部门范围">
                <USelect v-model="inviteCreateDraft.departmentName" :items="departmentOptions" data-testid="invite-create-business-department" />
              </UFormField>
            </div>
            <UAlert
              color="warning"
              variant="subtle"
              icon="i-carbon-user-certification"
              title="需要独立批准"
              description="邀请人不能批准自己发出的业务角色邀请；邀请会先进入「待批准」，由工作区所有者或另一位管理员批准后生效。"
            />
          </div>
          <UAlert
            v-if="inviteCreateError"
            color="error"
            variant="subtle"
            icon="i-carbon-warning-alt"
            :description="inviteCreateError"
            data-testid="invite-create-error"
          />
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            color="neutral"
            variant="outline"
            label="取消"
            data-testid="invite-create-cancel"
            @click="inviteCreateOpen = false"
          />
          <UButton
            label="发送邀请"
            icon="i-carbon-mail-all"
            data-testid="invite-create-submit"
            @click="submitInvitation"
          />
        </div>
      </template>
    </UModal>

    <UModal
      v-model:open="inviteRevokeOpen"
      :ui="{ content: 'sm:max-w-lg' }"
      title="撤回邀请"
      description="撤回后邀请链接立即失效，受邀者无法再接受；撤回原因会记录在邀请详情。"
    >
      <template #body>
        <div class="space-y-3" data-testid="invite-revoke-dialog">
          <p v-if="inviteRevokeTarget" class="text-sm text-muted">
            将撤回 <span class="font-medium text-highlighted">{{ inviteRevokeTarget.inviteeName }}（{{ inviteRevokeTarget.email }}）</span> 的邀请。
          </p>
          <UFormField label="撤回原因" required>
            <UTextarea
              v-model="inviteRevokeReason"
              :rows="3"
              placeholder="例如：岗位调整，暂不邀请"
              data-testid="invite-revoke-reason"
            />
          </UFormField>
          <UAlert
            v-if="inviteRevokeError"
            color="error"
            variant="subtle"
            icon="i-carbon-warning-alt"
            :description="inviteRevokeError"
            data-testid="invite-revoke-error"
          />
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            color="neutral"
            variant="outline"
            label="取消"
            data-testid="invite-revoke-cancel"
            @click="inviteRevokeOpen = false"
          />
          <UButton
            color="error"
            label="确认撤回"
            icon="i-carbon-undo"
            data-testid="invite-revoke-confirm"
            @click="confirmInviteRevoke"
          />
        </div>
      </template>
    </UModal>

    <USlideover v-model:open="acceptancePreviewOpen" :ui="{ content: 'w-full sm:max-w-xl' }">
      <template #header>
        <div class="flex items-center gap-2">
          <UIcon name="i-carbon-assignment-account" class="size-5 text-primary" />
          <div>
            <p class="text-sm font-semibold text-highlighted">
              受邀者接受页预览
            </p>
            <p class="text-xs text-muted">
              演示邀请有效、待批准、已撤回、已兑换、已过期与账户不匹配 6 种状态
            </p>
          </div>
        </div>
      </template>
      <template #body>
        <div v-if="previewInvitation" class="space-y-4" data-testid="invite-acceptance-panel">
          <div class="rounded-lg border border-default p-3">
            <div class="flex items-center gap-2">
              <span class="flex size-9 items-center justify-center rounded-md text-xs font-semibold text-inverted" :style="{ backgroundColor: workspaces.find(workspace => workspace.id === previewInvitation?.workspaceId)?.brandColor ?? '#334155' }">企</span>
              <div class="min-w-0">
                <p class="truncate text-sm font-semibold text-highlighted">
                  {{ workspaceName(previewInvitation.workspaceId) }}
                </p>
                <p class="text-xs text-muted">
                  {{ workspaceName(previewInvitation.workspaceId) }} · 邀请人 {{ previewInvitation.invitedBy }}
                </p>
              </div>
            </div>
            <div class="mt-3 grid gap-1 text-xs sm:grid-cols-2">
              <p><span class="text-muted">受邀人：</span>{{ previewInvitation.inviteeName }}（{{ previewInvitation.email }}）</p>
              <p><span class="text-muted">角色：</span>{{ roleTypeLabel(previewInvitation) }} · {{ invitationRoleSummary(previewInvitation) }}</p>
              <p><span class="text-muted">有效期：</span>{{ expiryLabel(previewInvitation.expiresAt) }}</p>
              <p><span class="text-muted">审批：</span>{{ invitationApprovalLabel(previewInvitation) }}</p>
            </div>
          </div>
          <div class="grid gap-3 sm:grid-cols-2">
            <UFormField label="演示邀请状态">
              <USelect v-model="previewStatus" :items="invitationStateOptions" data-testid="invite-preview-status" />
            </UFormField>
            <UFormField label="接受账户">
              <USelect v-model="previewAccountEmail" :items="previewAccountOptions" data-testid="invite-preview-account" />
            </UFormField>
          </div>
          <UAlert
            color="neutral"
            variant="subtle"
            icon="i-carbon-information"
            :description="previewStatusHint"
            data-testid="invite-preview-status-hint"
          />

          <div v-if="previewStatus === 'valid'" class="space-y-3" data-testid="invite-preview-valid">
            <UAlert
              :color="previewEmailMatches ? 'success' : 'warning'"
              variant="subtle"
              :icon="previewEmailMatches ? 'i-carbon-checkmark' : 'i-carbon-user-x'"
              :title="previewEmailMatches ? '邀请有效，可以接受' : '接受账户与邀请邮箱不匹配'"
              :description="previewEmailMatches ? '接受后将以受邀账户身份加入工作区，并自动切换到该工作区。' : '请切换为受邀账户 ' + previewInvitation.email + ' 后再接受邀请。'"
              data-testid="invite-preview-valid-hint"
            />
            <div class="flex flex-wrap gap-2">
              <UButton
                label="接受邀请并加入工作区"
                icon="i-carbon-checkmark"
                :disabled="!canAcceptPreview"
                data-testid="invite-accept"
                @click="acceptPreviewInvitation"
              />
              <UButton
                v-if="!previewEmailMatches"
                color="neutral"
                variant="outline"
                icon="i-carbon-user-switch"
                label="切换为受邀账户"
                data-testid="invite-preview-switch-account"
                @click="switchPreviewAccount"
              />
            </div>
          </div>

          <div v-else-if="previewStatus === 'pending_approval'" class="space-y-3" data-testid="invite-preview-pending">
            <UAlert
              color="warning"
              variant="subtle"
              icon="i-carbon-user-certification"
              title="等待独立批准"
              :description="'业务角色邀请需要 ' + (previewInvitation.requiredApprover ?? '另一位管理员') + ' 独立批准，批准前不能接受。'"
            />
            <div class="flex flex-wrap gap-2">
              <UButton
                color="warning"
                label="以审批人身份批准"
                icon="i-carbon-checkmark"
                :disabled="!previewApprovalAllowed"
                data-testid="invite-preview-approve"
                @click="approveInvitation(previewInvitation)"
              />
              <UButton
                v-if="!previewApprovalAllowed"
                color="neutral"
                variant="outline"
                icon="i-carbon-user-switch"
                :label="'切换为 ' + (previewInvitation.requiredApprover ?? '指定审批人')"
                data-testid="invite-preview-switch-approver"
                @click="switchPreviewApprover"
              />
            </div>
            <p class="text-xs text-muted">
              接受页在待批准状态下禁用「接受邀请」；审批通过后重新选择「有效」状态即可接受。
            </p>
          </div>

          <div v-else-if="previewStatus === 'revoked'" class="space-y-3" data-testid="invite-preview-revoked">
            <UAlert
              color="error"
              variant="subtle"
              icon="i-carbon-undo"
              title="邀请已撤回"
              :description="previewInvitation.revokedReason ?? '邀请已被管理员撤回，链接不再可用。'"
            />
            <UButton
              v-if="canManageSettings"
              color="neutral"
              variant="outline"
              icon="i-carbon-mail-reply"
              label="重新发送邀请"
              data-testid="invite-preview-resend"
              @click="previewResend"
            />
          </div>

          <div v-else-if="previewStatus === 'redeemed'" class="space-y-3" data-testid="invite-preview-redeemed">
            <UAlert
              color="success"
              variant="subtle"
              icon="i-carbon-checkmark"
              title="邀请已接受"
              :description="'由 ' + (previewInvitation.redeemedBy ?? previewInvitation.inviteeName) + ' 于 ' + (previewInvitation.redeemedAt ?? '未知日期') + ' 接受，已加入工作区。'"
            />
            <UButton
              color="neutral"
              variant="outline"
              icon="i-carbon-arrow-right"
              label="进入对应工作区"
              data-testid="invite-preview-enter"
              @click="enterInvitationWorkspace"
            />
          </div>

          <div v-else-if="previewStatus === 'expired'" class="space-y-3" data-testid="invite-preview-expired">
            <UAlert
              color="warning"
              variant="subtle"
              icon="i-carbon-time"
              title="邀请已过期"
              :description="'邀请有效期至 ' + previewInvitation.expiresAt + '，链接已失效；可重新发送并延长 14 天。'"
            />
            <UButton
              v-if="canManageSettings"
              color="neutral"
              variant="outline"
              icon="i-carbon-mail-reply"
              label="重新发送邀请"
              data-testid="invite-preview-resend"
              @click="previewResend"
            />
          </div>

          <div v-else class="space-y-3" data-testid="invite-preview-mismatch">
            <UAlert
              color="warning"
              variant="subtle"
              icon="i-carbon-user-x"
              title="账户不匹配"
              :description="'邀请发送给 ' + previewInvitation.email + '，当前接受账户为 ' + (previewAccountEmail === previewInvitation.email ? previewInvitation.email : (previewInvitation.mismatchAccount ?? previewAccountEmail)) + '，不能接受该邀请。'"
            />
            <div class="flex flex-wrap gap-2">
              <UButton
                color="neutral"
                variant="outline"
                icon="i-carbon-user-switch"
                label="切换为受邀账户"
                data-testid="invite-preview-switch-account"
                @click="switchPreviewAccount"
              />
              <UButton
                v-if="canManageSettings"
                color="neutral"
                variant="outline"
                icon="i-carbon-mail-reply"
                label="重新发送邀请"
                data-testid="invite-preview-resend"
                @click="previewResend"
              />
            </div>
          </div>

          <UButton
            color="neutral"
            variant="ghost"
            label="关闭接受页预览"
            data-testid="invite-preview-close"
            @click="acceptancePreviewOpen = false"
          />
        </div>
        <div v-else class="py-10" data-testid="invite-preview-empty">
          <UEmpty icon="i-carbon-assignment-account" title="暂无可预览的邀请" description="当前工作区没有邀请；请先在邀请列表创建一条邀请。" />
        </div>
      </template>
    </USlideover>

    <div v-if="activeTab === 'members'" class="space-y-4">
      <UCard :ui="{ body: 'p-4 sm:p-5' }">
        <template #header>
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 class="text-sm font-semibold text-highlighted">
                成员与角色
              </h3>
              <p class="text-xs text-muted">
                组织角色与采购/销售/财务业务角色分区维护；最后一个管理员停用或移除会被阻止并给出原因。
              </p>
            </div>
            <p class="text-xs text-muted">
              当前工作区在职管理员 {{ activeAdminCounts[activeWorkspaceId] ?? 0 }} 人
            </p>
          </div>
        </template>
        <div class="space-y-3">
          <div class="flex flex-wrap items-end gap-2">
            <UFormField label="搜索成员" class="w-56">
              <UInput
                v-model="memberSearch"
                icon="i-carbon-search"
                placeholder="姓名、邮箱或部门"
                data-testid="member-search"
              />
            </UFormField>
            <UFormField label="成员状态" class="w-40">
              <USelect v-model="memberStatusFilter" :items="memberStatusOptions" data-testid="member-status-filter" />
            </UFormField>
            <UFormField label="业务角色" class="w-40">
              <USelect v-model="memberServiceFilter" :items="memberServiceOptions" data-testid="member-service-filter" />
            </UFormField>
            <UCheckbox v-model="memberAllWorkspaces" label="含所有可访问工作区" data-testid="member-all-workspaces" />
          </div>
          <ResizableTable
            :data="memberRows"
            :columns="memberColumns"
            class="nx-table"
            :ui="{ th: 'py-2.5', td: 'py-3' }"
            data-testid="member-table"
          >
            <template #name-cell="{ row }">
              <div class="flex items-center gap-2">
                <UAvatar :alt="row.original.name" size="sm" />
                <div>
                  <div class="flex items-center gap-1">
                    <p class="text-sm font-medium text-highlighted">
                      {{ row.original.name }}
                    </p>
                    <UBadge
                      v-if="isLastAdmin(row.original)"
                      color="warning"
                      variant="subtle"
                      size="sm"
                      label="最后管理员"
                      :data-testid="'member-last-admin-badge-' + row.original.id"
                    />
                  </div>
                  <p class="text-xs text-muted">
                    {{ row.original.email }}
                  </p>
                </div>
              </div>
            </template>
            <template #workspace-cell="{ row }">
              <span class="text-xs">{{ workspaceName(row.original.workspaceId) }}</span>
            </template>
            <template #orgRole-cell="{ row }">
              <UBadge
                :color="['owner', 'admin'].includes(row.original.orgRole) ? 'primary' : 'neutral'"
                variant="subtle"
                size="sm"
                :label="orgRoleLabels[row.original.orgRole]"
                :data-testid="'member-org-role-' + row.original.id"
              />
            </template>
            <template #business-cell="{ row }">
              <p class="max-w-48 text-xs text-muted">
                {{ memberBusinessSummary(row.original) }}
              </p>
            </template>
            <template #department-cell="{ row }">
              <span class="text-xs">{{ row.original.departmentName }}</span>
            </template>
            <template #status-cell="{ row }">
              <UBadge
                :color="memberStatusColors[row.original.status]"
                variant="subtle"
                size="sm"
                :label="memberStatusLabels[row.original.status]"
                :data-testid="'member-status-' + row.original.id"
              />
            </template>
            <template #actions-cell="{ row }">
              <div class="flex flex-wrap gap-1">
                <UButton
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  label="详情"
                  :data-testid="'member-detail-' + row.original.id"
                  @click="openMemberDetail(row.original)"
                />
                <UButton
                  size="xs"
                  :color="row.original.status === 'active' ? 'error' : 'success'"
                  variant="ghost"
                  :label="row.original.status === 'active' ? '停用' : '恢复'"
                  :data-testid="'member-toggle-' + row.original.id"
                  @click="requestToggleStatus(row.original)"
                />
              </div>
            </template>
            <template #empty>
              <div class="py-6" data-testid="member-empty">
                <UEmpty icon="i-carbon-user-multiple" title="没有匹配的成员" description="当前工作区在该状态/业务角色/搜索条件下没有成员。可调整筛选或邀请新成员。" />
              </div>
            </template>
          </ResizableTable>
          <p class="text-xs text-muted">
            共 {{ memberScopedRows.length }} 名成员，当前筛选显示 {{ memberRows.length }} 名；组织角色决定管理能力，业务角色分别决定采购/销售/财务单据权限。
          </p>
        </div>
      </UCard>

      <USlideover v-model:open="memberDetailOpen" :ui="{ content: 'w-full sm:max-w-2xl' }">
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon name="i-carbon-user-multiple" class="size-5 text-primary" />
            <div>
              <p class="text-sm font-semibold text-highlighted">
                成员详情
              </p>
              <p class="text-xs text-muted">
                {{ selectedMember ? selectedMember.name + ' · ' + selectedMember.email : '未选择成员' }}
              </p>
            </div>
          </div>
        </template>
        <template #body>
          <div v-if="selectedMember" class="space-y-4" data-testid="member-detail-panel">
            <div class="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-default p-3">
              <div class="flex items-center gap-3">
                <UAvatar :alt="selectedMember.name" size="lg" />
                <div>
                  <div class="flex items-center gap-2">
                    <p class="text-sm font-semibold text-highlighted">
                      {{ selectedMember.name }}
                    </p>
                    <UBadge
                      :color="memberStatusColors[selectedMember.status]"
                      variant="subtle"
                      size="sm"
                      :label="memberStatusLabels[selectedMember.status]"
                      data-testid="member-detail-status"
                    />
                  </div>
                  <p class="text-xs text-muted">
                    {{ selectedMember.email }} · {{ selectedMember.phone }}
                  </p>
                  <p class="text-xs text-muted">
                    {{ workspaceName(selectedMember.workspaceId) }} · {{ selectedMember.departmentName }} · 加入于 {{ selectedMember.joinedAt }}
                  </p>
                </div>
              </div>
              <UBadge
                v-if="isLastAdmin(selectedMember)"
                color="warning"
                variant="subtle"
                size="sm"
                label="工作区最后管理员"
                data-testid="member-detail-last-admin-badge"
              />
            </div>

            <div class="rounded-lg border border-default p-3" data-testid="member-org-section">
              <p class="text-sm font-semibold text-highlighted">
                组织角色
              </p>
              <p class="mt-1 text-xs text-muted">
                决定成员管理、设置维护与授权审批能力；与业务角色的单据权限分开维护。
              </p>
              <div class="mt-3 flex flex-wrap items-end gap-2">
                <UFormField label="组织角色" class="w-52">
                  <USelect v-model="memberDraft.orgRole" :items="orgRoleOptions" data-testid="member-org-role-select" />
                </UFormField>
                <UButton
                  size="sm"
                  label="保存组织角色"
                  data-testid="member-org-role-save"
                  @click="saveMemberOrgRole"
                />
              </div>
              <UAlert
                v-if="memberError"
                class="mt-2"
                color="error"
                variant="subtle"
                icon="i-carbon-warning-alt"
                :description="memberError"
                data-testid="member-org-role-error"
              />
              <UAlert
                v-if="isLastAdmin(selectedMember)"
                class="mt-2"
                color="warning"
                variant="subtle"
                icon="i-carbon-warning-alt"
                title="最后管理员受限"
                description="该成员是当前工作区唯一在职所有者/管理员，不能降级、停用或移除；请先把另一位成员提升为管理员。"
                data-testid="member-last-admin-alert"
              />
            </div>

            <div class="rounded-lg border border-default p-3" data-testid="member-business-section">
              <div class="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p class="text-sm font-semibold text-highlighted">
                    业务角色
                  </p>
                  <p class="mt-1 text-xs text-muted">
                    采购、销售、财务分别授权，等级（只读/经办/审批）与部门范围独立设置；停用后单据操作立即被拒绝。
                  </p>
                </div>
                <UButton
                  size="sm"
                  icon="i-carbon-save"
                  label="保存业务角色"
                  data-testid="member-business-save"
                  @click="saveMemberBusinessRoles"
                />
              </div>
              <div class="mt-3 space-y-3">
                <div
                  v-for="(draft, index) in memberDraft.businessRoles"
                  :key="index"
                  class="rounded-md bg-elevated/40 p-3"
                  :data-testid="'member-business-' + serviceKeys[index] + '-block'"
                >
                  <UCheckbox v-model="draft.enabled" :label="serviceLabels[serviceKeys[index] ?? 'purchase'] + '业务角色'" :data-testid="'member-business-' + serviceKeys[index] + '-enabled'" />
                  <div v-if="draft.enabled" class="mt-2 grid gap-2 sm:grid-cols-3">
                    <UFormField label="等级">
                      <USelect v-model="draft.level" :items="businessLevelOptions" :data-testid="'member-business-' + serviceKeys[index] + '-level'" />
                    </UFormField>
                    <UFormField label="数据范围">
                      <USelect v-model="draft.scope" :items="businessScopeOptions" :data-testid="'member-business-' + serviceKeys[index] + '-scope'" />
                    </UFormField>
                    <UFormField v-if="draft.scope === 'department'" label="范围部门">
                      <USelect v-model="draft.departmentName" :items="departmentOptions" :data-testid="'member-business-' + serviceKeys[index] + '-department'" />
                    </UFormField>
                  </div>
                </div>
              </div>
              <UAlert
                v-if="memberBusinessError"
                class="mt-2"
                color="error"
                variant="subtle"
                icon="i-carbon-warning-alt"
                :description="memberBusinessError"
                data-testid="member-business-error"
              />
            </div>

            <div class="rounded-lg border border-default p-3" data-testid="member-department-section">
              <p class="text-sm font-semibold text-highlighted">
                所属部门
              </p>
              <div class="mt-3 flex flex-wrap items-end gap-2">
                <UFormField label="部门" class="w-52">
                  <USelect v-model="memberDraft.departmentName" :items="departmentOptions" data-testid="member-department-select" />
                </UFormField>
                <UButton
                  size="sm"
                  label="保存部门"
                  data-testid="member-department-save"
                  @click="saveMemberDepartment"
                />
              </div>
            </div>

            <div class="rounded-lg border border-error/30 p-3" data-testid="member-danger-section">
              <p class="text-sm font-semibold text-highlighted">
                账户操作
              </p>
              <p class="mt-1 text-xs text-muted">
                停用后业务角色立即停止参与单据权限校验；移除会同时解除邀请与授权关系。最后管理员操作会被阻断。
              </p>
              <div class="mt-3 flex flex-wrap gap-2">
                <UButton
                  size="sm"
                  :color="selectedMember.status === 'active' ? 'error' : 'success'"
                  variant="outline"
                  :label="selectedMember.status === 'active' ? '停用账户' : '恢复账户'"
                  data-testid="member-toggle-status"
                  @click="requestToggleStatus(selectedMember)"
                />
                <UButton
                  size="sm"
                  color="error"
                  variant="soft"
                  label="移除成员"
                  data-testid="member-remove"
                  @click="requestRemoveMember(selectedMember)"
                />
                <UButton
                  size="sm"
                  color="neutral"
                  variant="ghost"
                  label="关闭详情"
                  data-testid="member-detail-close"
                  @click="memberDetailOpen = false"
                />
              </div>
            </div>
          </div>
          <div v-else class="py-10" data-testid="member-detail-empty">
            <UEmpty icon="i-carbon-user-multiple" title="未选择成员" description="请从成员列表点击「详情」查看组织角色与业务角色。" />
          </div>
        </template>
      </USlideover>
    </div>

    <UModal
      v-model:open="adminBlockedOpen"
      :ui="{ content: 'sm:max-w-lg' }"
      title="最后管理员操作受阻"
      description="为保障工作区始终有人可管理，系统阻止了对最后一位在职管理员的停用/移除/降级操作。"
    >
      <template #body>
        <div class="space-y-3" data-testid="member-admin-blocked-dialog">
          <UAlert
            color="error"
            variant="subtle"
            icon="i-carbon-warning-alt"
            title="操作被阻止"
            :description="adminBlockedReason"
            data-testid="member-admin-blocked-reason"
          />
          <p class="text-xs text-muted">
            演示建议：先把另一位在职成员的组织角色改为「管理员」，再重新执行停用或移除。
          </p>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            color="neutral"
            variant="outline"
            label="知道了"
            data-testid="member-admin-blocked-cancel"
            @click="adminBlockedOpen = false"
          />
          <UButton
            label="去成员列表指定管理员"
            icon="i-carbon-user-role"
            data-testid="member-admin-blocked-assign"
            @click="adminBlockedOpen = false; activeTab = 'members'"
          />
        </div>
      </template>
    </UModal>

    <UModal
      v-model:open="removeDialogOpen"
      :ui="{ content: 'sm:max-w-md' }"
      title="移除成员"
      description="移除后该成员立即失去工作区访问权限，业务角色与邀请关系同步失效。"
    >
      <template #body>
        <div class="space-y-3" data-testid="member-remove-dialog">
          <p v-if="removeTarget" class="text-sm text-muted">
            确认移除 <span class="font-medium text-highlighted">{{ removeTarget.name }}（{{ removeTarget.email }}）</span>？
          </p>
          <UAlert
            color="error"
            variant="subtle"
            icon="i-carbon-warning-alt"
            description="该操作只影响当前浏览器内的演示数据，刷新页面后种子成员会恢复。"
          />
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            color="neutral"
            variant="outline"
            label="取消"
            data-testid="member-remove-cancel"
            @click="removeDialogOpen = false"
          />
          <UButton
            color="error"
            label="确认移除"
            data-testid="member-remove-confirm"
            @click="confirmRemoveMember"
          />
        </div>
      </template>
    </UModal>

    <div v-if="activeTab === 'authorizations'" class="space-y-4">
      <UCard :ui="{ body: 'p-4 sm:p-5' }">
        <template #header>
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 class="text-sm font-semibold text-highlighted">
                授权审批
              </h3>
              <p class="text-xs text-muted">
                自定义角色按版本修订，授权有效期、一人/两人审批进度与撤销状态独立维护；待审批、已到期、已撤销授权不能操作单据。
              </p>
            </div>
            <UButton
              icon="i-carbon-add-alt"
              label="新建自定义角色"
              data-testid="custom-role-create"
              :disabled="!canManageSettings"
              @click="openRoleCreate"
            />
          </div>
        </template>
        <div class="space-y-3">
          <div class="flex flex-wrap items-end gap-2">
            <UFormField label="搜索角色" class="w-56">
              <UInput
                v-model="customRoleSearch"
                icon="i-carbon-search"
                placeholder="角色名称或描述"
                data-testid="custom-role-search"
              />
            </UFormField>
            <UFormField label="授权状态" class="w-40">
              <USelect v-model="customRoleStatusFilter" :items="customRoleStatusOptions" data-testid="custom-role-status-filter" />
            </UFormField>
            <UFormField label="服务范围" class="w-40">
              <USelect v-model="customRoleServiceFilter" :items="customRoleServiceOptions" data-testid="custom-role-service-filter" />
            </UFormField>
          </div>
          <UAlert
            v-if="customRoleActionError"
            color="error"
            variant="subtle"
            icon="i-carbon-warning-alt"
            :description="customRoleActionError"
            data-testid="custom-role-action-error"
          />
          <div v-if="customRoleRows.length > 0" class="grid gap-3 xl:grid-cols-2">
            <div
              v-for="role in customRoleRows"
              :key="role.id"
              class="rounded-lg border border-default p-3"
              :data-testid="'custom-role-card-' + role.id"
            >
              <div class="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div class="flex flex-wrap items-center gap-2">
                    <p class="text-sm font-semibold text-highlighted">
                      {{ role.name }}
                    </p>
                    <UBadge
                      :color="customRoleStatusColors[role.status]"
                      variant="subtle"
                      size="sm"
                      :label="customRoleStatusLabels[role.status]"
                      :data-testid="'custom-role-status-' + role.id"
                    />
                    <UBadge
                      color="neutral"
                      variant="outline"
                      size="sm"
                      :label="'第 ' + role.currentVersion + ' 版'"
                      :data-testid="'custom-role-version-' + role.id"
                    />
                  </div>
                  <p class="mt-1 text-xs text-muted">
                    {{ role.description }}
                  </p>
                </div>
                <div class="flex flex-wrap gap-1">
                  <UButton
                    size="xs"
                    color="neutral"
                    variant="ghost"
                    label="版本历史"
                    :data-testid="'custom-role-history-' + role.id"
                    @click="openRoleHistory(role)"
                  />
                  <UButton
                    size="xs"
                    color="neutral"
                    variant="ghost"
                    label="核对单据"
                    :data-testid="'custom-role-check-' + role.id"
                    @click="permissionRoleId = role.id"
                  />
                  <UButton
                    v-if="role.status === 'pending'"
                    size="xs"
                    color="success"
                    variant="soft"
                    label="批准"
                    :disabled="!canApproveRole(role)"
                    :data-testid="'custom-role-approve-' + role.id"
                    @click="approveCustomRole(role)"
                  />
                  <UButton
                    v-if="role.status === 'pending'"
                    size="xs"
                    color="error"
                    variant="ghost"
                    label="拒绝"
                    :data-testid="'custom-role-reject-' + role.id"
                    @click="openRoleReject(role)"
                  />
                  <UButton
                    v-if="role.status === 'active'"
                    size="xs"
                    color="error"
                    variant="ghost"
                    label="撤销"
                    :data-testid="'custom-role-revoke-' + role.id"
                    @click="openRoleRevoke(role)"
                  />
                  <UButton
                    size="xs"
                    color="neutral"
                    variant="outline"
                    label="提交修订"
                    :disabled="!canManageSettings || role.status === 'revoked' || role.status === 'expired'"
                    :data-testid="'custom-role-revise-' + role.id"
                    @click="reviseCustomRole(role)"
                  />
                </div>
              </div>

              <div class="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                <span :data-testid="'custom-role-validity-' + role.id">有效期 {{ role.validFrom }} 至 {{ role.validTo }}</span>
                <span :data-testid="'custom-role-approval-mode-' + role.id">审批人数 {{ role.approvalMode }} 人</span>
                <span>申请人 {{ role.requestedBy }} · {{ role.requestedAt }}</span>
              </div>

              <div class="mt-3 rounded-md bg-elevated/40 p-2">
                <div class="flex items-center justify-between gap-2">
                  <p class="text-xs font-medium text-highlighted">
                    审批进度 {{ role.approvals.length }}/{{ role.approvalMode }}
                  </p>
                  <span class="text-xs text-muted">{{ roleApprovalPercent(role) }}%</span>
                </div>
                <UProgress
                  class="mt-1"
                  :model-value="roleApprovalPercent(role)"
                  size="xs"
                  :data-testid="'custom-role-approval-progress-' + role.id"
                />
                <div class="mt-2 flex flex-wrap gap-2">
                  <div
                    v-for="(step, index) in roleApprovalSteps(role)"
                    :key="index"
                    class="flex items-center gap-1 text-xs"
                    :data-testid="'custom-role-approval-step-' + role.id + '-' + index"
                  >
                    <UIcon :name="step.state === 'done' ? 'i-carbon-checkmark-filled' : step.state === 'current' ? 'i-carbon-time' : 'i-carbon-circle-dash'" :class="step.state === 'done' ? 'text-success' : step.state === 'current' ? 'text-warning' : 'text-muted'" />
                    <span class="text-muted">{{ step.label }}：{{ step.name }}</span>
                  </div>
                </div>
                <p v-if="role.status === 'pending'" class="mt-2 text-xs text-warning" :data-testid="'custom-role-approval-hint-' + role.id">
                  {{ roleApprovalHint(role) }}
                </p>
              </div>

              <UAlert
                v-if="role.revokedReason"
                class="mt-2"
                color="error"
                variant="subtle"
                icon="i-carbon-undo"
                :description="role.revokedReason"
                :data-testid="'custom-role-revoked-reason-' + role.id"
              />

              <div class="mt-3 grid gap-2 sm:grid-cols-3">
                <div
                  v-for="service in serviceKeys"
                  :key="service"
                  class="rounded-md border border-default p-2"
                  :data-testid="'custom-role-service-' + service + '-' + role.id"
                >
                  <div class="flex items-center justify-between gap-1">
                    <p class="text-xs font-semibold text-highlighted">
                      {{ serviceLabels[service] }}
                    </p>
                    <UButton
                      size="xs"
                      color="neutral"
                      variant="ghost"
                      icon="i-carbon-settings-adjust"
                      label="维护"
                      :disabled="!canManageSettings || role.status === 'revoked' || role.status === 'expired'"
                      :data-testid="'custom-role-service-edit-' + service + '-' + role.id"
                      @click="openRoleServiceDialog(role, service)"
                    />
                  </div>
                  <p class="mt-1 text-xs text-muted">
                    动作：{{ roleServiceGrant(role, service).actions.map(action => serviceActionLabels[action]).join('、') || '未授权' }}
                  </p>
                  <p class="text-xs text-muted">
                    部门：{{ roleServiceGrant(role, service).departments.join('、') || '未设置' }}
                  </p>
                </div>
              </div>
            </div>
          </div>
          <div v-else class="py-6" data-testid="custom-role-empty">
            <UEmpty icon="i-carbon-certificate" title="当前工作区没有匹配的授权" description="可调整搜索或筛选条件，或新建一个需要审批的自定义角色。">
              <template #actions>
                <UButton
                  label="新建自定义角色"
                  data-testid="custom-role-empty-create"
                  :disabled="!canManageSettings"
                  @click="openRoleCreate"
                />
              </template>
            </UEmpty>
          </div>
        </div>
      </UCard>

      <UCard :ui="{ body: 'p-4 sm:p-5' }">
        <template #header>
          <div>
            <h3 class="text-sm font-semibold text-highlighted">
              单据操作权限核对
            </h3>
            <p class="text-xs text-muted">
              选择角色、单据样例与动作，按授权状态、有效期、服务动作和部门范围判定是否允许。
            </p>
          </div>
        </template>
        <div class="space-y-3">
          <div class="grid gap-2 sm:grid-cols-3">
            <UFormField label="自定义角色">
              <USelect v-model="permissionRoleId" :items="permissionRoleOptions" data-testid="permission-role-select" />
            </UFormField>
            <UFormField label="单据样例">
              <USelect v-model="permissionDocumentId" :items="permissionDocumentOptions" data-testid="permission-document-select" />
            </UFormField>
            <UFormField label="动作">
              <USelect v-model="permissionAction" :items="permissionActionOptions" data-testid="permission-action-select" />
            </UFormField>
          </div>
          <div v-if="permissionDocument" class="flex flex-wrap items-center gap-3 rounded-md bg-elevated/40 p-2 text-xs text-muted">
            <span :data-testid="'permission-document-' + permissionDocument.id">{{ permissionDocument.code }} · {{ permissionDocument.typeLabel }} · {{ permissionDocument.departmentName }}</span>
            <span class="font-mono text-highlighted" data-testid="permission-document-amount">单据金额 {{ formatMoney(permissionDocument.amount) }}</span>
          </div>
          <UAlert
            :color="permissionCheck.allowed ? 'success' : 'error'"
            variant="subtle"
            :icon="permissionCheck.allowed ? 'i-carbon-checkmark-filled' : 'i-carbon-locked'"
            :title="permissionCheck.title"
            :description="permissionCheck.reason"
            data-testid="permission-check-result"
          />
          <div class="flex items-center gap-2">
            <UBadge
              :color="permissionCheck.allowed ? 'success' : 'error'"
              variant="subtle"
              size="sm"
              :label="permissionCheck.allowed ? '允许执行' : '拒绝执行'"
              data-testid="permission-check-allowed"
            />
            <p class="text-xs text-muted">
              待审批、已到期、已撤销授权均会被拒绝；已生效授权仍需同时满足服务动作与部门范围。
            </p>
          </div>
        </div>
      </UCard>
    </div>

    <div v-if="activeTab === 'announcements'" class="space-y-4">
      <UCard :ui="{ body: 'p-4 sm:p-5' }">
        <template #header>
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 class="text-sm font-semibold text-highlighted">
                公告
              </h3>
              <p class="text-xs text-muted">
                按模拟工作区、当前身份可见权限与有效期过滤公告；已读状态保存在本浏览器，刷新后保留。
              </p>
            </div>
            <div class="flex flex-wrap gap-2">
              <UBadge
                color="neutral"
                variant="outline"
                size="sm"
                :label="'已读 ' + announcementReadCount + '/' + announcementRows.length"
                data-testid="announcement-read-count"
              />
              <UButton
                size="xs"
                color="neutral"
                variant="outline"
                label="全部标为已读"
                data-testid="announcement-mark-all"
                @click="markAllAnnouncementsRead"
              />
              <UButton
                size="xs"
                color="neutral"
                variant="ghost"
                label="清除本地已读"
                data-testid="announcement-reset-read"
                @click="resetAnnouncementRead"
              />
            </div>
          </div>
        </template>
        <div class="space-y-3">
          <div class="flex flex-wrap items-end gap-2">
            <UFormField label="工作区范围" class="w-48">
              <USelect v-model="announcementWorkspaceFilter" :items="announcementWorkspaceOptions" data-testid="announcement-workspace-filter" />
            </UFormField>
            <UFormField label="可见权限" class="w-48">
              <USelect v-model="announcementPermissionFilter" :items="announcementPermissionOptions" data-testid="announcement-permission-filter" />
            </UFormField>
            <UFormField label="有效期" class="w-40">
              <USelect v-model="announcementValidityFilter" :items="announcementValidityOptions" data-testid="announcement-validity-filter" />
            </UFormField>
            <UFormField label="搜索公告" class="w-56">
              <UInput
                v-model="announcementSearch"
                icon="i-carbon-search"
                placeholder="标题或正文"
                data-testid="announcement-search"
              />
            </UFormField>
          </div>
          <UAlert
            v-if="announcementHiddenNote"
            color="warning"
            variant="subtle"
            icon="i-carbon-view-off"
            :description="announcementHiddenNote"
            data-testid="announcement-hidden-note"
          />
          <div v-if="announcementRows.length > 0" class="grid gap-3 lg:grid-cols-2">
            <div
              v-for="announcement in announcementRows"
              :key="announcement.id"
              class="rounded-lg border border-default p-3"
              :data-testid="'announcement-card-' + announcement.id"
            >
              <div class="flex flex-wrap items-start justify-between gap-2">
                <div class="flex flex-wrap items-center gap-2">
                  <p class="text-sm font-semibold text-highlighted">
                    {{ announcement.title }}
                  </p>
                  <UBadge
                    :color="announcementLevelColors[announcement.level]"
                    variant="subtle"
                    size="sm"
                    :label="announcementLevelLabels[announcement.level]"
                    :data-testid="'announcement-level-' + announcement.id"
                  />
                  <UBadge
                    :color="isAnnouncementRead(announcement.id) ? 'neutral' : 'primary'"
                    :variant="isAnnouncementRead(announcement.id) ? 'outline' : 'subtle'"
                    size="sm"
                    :label="isAnnouncementRead(announcement.id) ? '已读' : '未读'"
                    :data-testid="'announcement-read-' + announcement.id"
                  />
                </div>
                <UButton
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  label="查看"
                  :data-testid="'announcement-open-' + announcement.id"
                  @click="openAnnouncement(announcement)"
                />
              </div>
              <p class="mt-1 line-clamp-2 text-xs text-muted">
                {{ announcement.body }}
              </p>
              <div class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                <span :data-testid="'announcement-expires-' + announcement.id">到期 {{ announcement.expiresAt }}</span>
                <span :data-testid="'announcement-remaining-' + announcement.id">{{ announcementRemainingLabel(announcement) }}</span>
                <span>{{ workspaceName(announcement.workspaceId) }} · {{ permissionLabels[announcement.permission] }}可见</span>
              </div>
              <div class="mt-2 flex flex-wrap gap-2">
                <UButton
                  size="xs"
                  color="neutral"
                  variant="outline"
                  label="标为已读"
                  :disabled="isAnnouncementRead(announcement.id)"
                  :data-testid="'announcement-mark-read-' + announcement.id"
                  @click="markAnnouncementRead(announcement)"
                />
              </div>
            </div>
          </div>
          <div v-else class="py-6" data-testid="announcement-empty">
            <UEmpty icon="i-carbon-notification" title="没有可见公告" description="当前身份权限、工作区范围或有效期筛选下没有公告。可切换身份/工作区，或放宽有效期筛选。" />
          </div>
          <p class="text-xs text-muted">
            当前筛选显示 {{ announcementRows.length }} 条，当前身份可见 {{ announcementVisible.length }} 条，工作区范围共 {{ announcementScoped.length }} 条。
          </p>
        </div>
      </UCard>

      <UModal v-model:open="announcementDetailOpen" :ui="{ content: 'sm:max-w-2xl' }">
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon name="i-carbon-notification" class="size-5 text-primary" />
            <p class="text-sm font-semibold text-highlighted">
              公告详情
            </p>
          </div>
        </template>
        <template #body>
          <div v-if="selectedAnnouncement" class="space-y-3" data-testid="announcement-detail-dialog">
            <div class="flex flex-wrap items-center gap-2">
              <p class="text-base font-semibold text-highlighted" data-testid="announcement-detail-title">
                {{ selectedAnnouncement.title }}
              </p>
              <UBadge
                :color="announcementLevelColors[selectedAnnouncement.level]"
                variant="subtle"
                size="sm"
                :label="announcementLevelLabels[selectedAnnouncement.level]"
              />
            </div>
            <p class="whitespace-pre-line text-sm text-muted" data-testid="announcement-detail-body">
              {{ selectedAnnouncement.body }}
            </p>
            <div class="grid gap-1 text-xs text-muted">
              <span>发布人：{{ selectedAnnouncement.authorName }} · 发布于 {{ selectedAnnouncement.publishedAt }}</span>
              <span>所属工作区：{{ workspaceName(selectedAnnouncement.workspaceId) }}</span>
              <span>可见权限：{{ permissionLabels[selectedAnnouncement.permission] }}</span>
              <span data-testid="announcement-detail-expires">到期时间：{{ selectedAnnouncement.expiresAt }}（{{ announcementRemainingLabel(selectedAnnouncement) }}）</span>
            </div>
            <UAlert
              color="neutral"
              variant="subtle"
              icon="i-carbon-information"
              description="已读状态按公告编号写入本地存储，与其他模拟工作区共享；切换身份/工作区只会重新计算可见范围，不会清除已读。"
            />
          </div>
          <div v-else class="py-8" data-testid="announcement-detail-empty">
            <UEmpty icon="i-carbon-notification" title="未选择公告" description="请从公告列表点击「查看」。" />
          </div>
        </template>
        <template #footer>
          <div class="flex w-full justify-end">
            <UButton
              color="neutral"
              variant="outline"
              label="关闭"
              data-testid="announcement-detail-close"
              @click="announcementDetailOpen = false"
            />
          </div>
        </template>
      </UModal>
    </div>

    <UModal
      v-model:open="roleCreateOpen"
      :ui="{ content: 'sm:max-w-2xl' }"
      title="新建自定义角色"
      description="提交后进入待审批状态，按选择的一人/两人模式由其他管理员独立批准；有效期结束后自动失效。"
    >
      <template #body>
        <div class="space-y-3" data-testid="custom-role-create-dialog">
          <UFormField label="角色名称" required>
            <UInput v-model="roleCreateDraft.name" placeholder="例如 采购复核专员" data-testid="custom-role-create-name" />
          </UFormField>
          <UFormField label="角色说明">
            <UTextarea
              v-model="roleCreateDraft.description"
              :rows="2"
              placeholder="说明授权用途与职责边界"
              data-testid="custom-role-create-description"
            />
          </UFormField>
          <div>
            <p class="text-xs font-medium text-highlighted">
              审批人数
            </p>
            <div class="mt-1 flex gap-2">
              <UButton
                size="sm"
                :color="roleCreateDraft.approvalMode === 1 ? 'primary' : 'neutral'"
                :variant="roleCreateDraft.approvalMode === 1 ? 'solid' : 'outline'"
                label="一人审批"
                data-testid="custom-role-create-approval-1"
                @click="roleCreateDraft.approvalMode = 1"
              />
              <UButton
                size="sm"
                :color="roleCreateDraft.approvalMode === 2 ? 'primary' : 'neutral'"
                :variant="roleCreateDraft.approvalMode === 2 ? 'solid' : 'outline'"
                label="两人独立审批"
                data-testid="custom-role-create-approval-2"
                @click="roleCreateDraft.approvalMode = 2"
              />
            </div>
          </div>
          <UFormField label="授权有效期">
            <USelect v-model="roleCreateDraft.validityDays" :items="roleValidityOptions" data-testid="custom-role-create-validity" />
          </UFormField>
          <div>
            <p class="text-xs font-medium text-highlighted">
              服务范围
            </p>
            <div class="mt-1 flex flex-wrap gap-3">
              <UCheckbox
                v-for="service in serviceKeys"
                :key="service"
                :model-value="roleCreateDraft.services.includes(service)"
                :label="serviceLabels[service]"
                :data-testid="'custom-role-create-service-' + service"
                @update:model-value="toggleRoleCreateService(service)"
              />
            </div>
          </div>
          <div>
            <p class="text-xs font-medium text-highlighted">
              部门范围
            </p>
            <div class="mt-1 flex flex-wrap gap-3">
              <UCheckbox
                v-for="department in departmentOptions"
                :key="department"
                :model-value="roleCreateDraft.departments.includes(department)"
                :label="department"
                :data-testid="'custom-role-create-department-' + department"
                @update:model-value="toggleRoleCreateDepartment(department)"
              />
            </div>
          </div>
          <UAlert
            v-if="roleCreateError"
            color="error"
            variant="subtle"
            icon="i-carbon-warning-alt"
            :description="roleCreateError"
            data-testid="custom-role-create-error"
          />
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            color="neutral"
            variant="outline"
            label="取消"
            data-testid="custom-role-create-cancel"
            @click="roleCreateOpen = false"
          />
          <UButton
            label="提交审批"
            data-testid="custom-role-create-submit"
            :disabled="!canManageSettings"
            @click="submitCustomRole"
          />
        </div>
      </template>
    </UModal>

    <UModal
      v-model:open="roleHistoryOpen"
      :ui="{ content: 'sm:max-w-xl' }"
      title="自定义角色版本历史"
      description="每次修订都会生成新版本并重新进入审批；历史版本仅作审计展示。"
    >
      <template #body>
        <div class="space-y-3" data-testid="custom-role-history-dialog">
          <template v-if="roleHistoryTarget">
            <div class="flex flex-wrap items-center gap-2">
              <p class="text-sm font-semibold text-highlighted">
                {{ roleHistoryTarget.name }}
              </p>
              <UBadge
                :color="customRoleStatusColors[roleHistoryTarget.status]"
                variant="subtle"
                size="sm"
                :label="customRoleStatusLabels[roleHistoryTarget.status]"
              />
              <UBadge
                color="neutral"
                variant="outline"
                size="sm"
                :label="'当前第 ' + roleHistoryTarget.currentVersion + ' 版'"
              />
            </div>
            <div
              v-for="version in roleHistoryTarget.versions"
              :key="version.version"
              class="rounded-md border border-default p-2"
              :data-testid="'custom-role-history-version-' + version.version"
            >
              <div class="flex items-center justify-between gap-2">
                <p class="text-xs font-semibold text-highlighted">
                  第 {{ version.version }} 版
                </p>
                <p class="text-xs text-muted">
                  {{ version.changedAt }} · {{ version.changedBy }}
                </p>
              </div>
              <p class="mt-1 text-xs text-muted">
                {{ version.summary }}
              </p>
            </div>
          </template>
          <p v-else class="text-sm text-muted">
            未选择角色。
          </p>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end">
          <UButton
            color="neutral"
            variant="outline"
            label="关闭"
            data-testid="custom-role-history-close"
            @click="roleHistoryOpen = false"
          />
        </div>
      </template>
    </UModal>

    <UModal
      v-model:open="roleServiceDialogOpen"
      :ui="{ content: 'sm:max-w-lg' }"
      title="维护服务动作与部门范围"
      description="只勾选该角色在对应服务中允许的动作；开放动作后必须至少选择一个部门范围。"
    >
      <template #body>
        <div class="space-y-3" data-testid="custom-role-service-dialog">
          <template v-if="roleServiceTarget">
            <div class="flex flex-wrap items-center gap-2">
              <p class="text-sm font-semibold text-highlighted">
                {{ roleServiceTarget.name }}
              </p>
              <UBadge
                color="primary"
                variant="subtle"
                size="sm"
                :label="serviceLabels[roleServiceKey] + '服务'"
                data-testid="custom-role-service-dialog-service"
              />
            </div>
            <div>
              <p class="text-xs font-medium text-highlighted">
                允许动作
              </p>
              <div class="mt-1 flex flex-wrap gap-3">
                <UCheckbox
                  v-for="action in serviceActionKeys"
                  :key="action"
                  :model-value="roleServiceActions.includes(action)"
                  :label="serviceActionLabels[action]"
                  :data-testid="'custom-role-service-action-' + action"
                  @update:model-value="toggleRoleServiceAction(action)"
                />
              </div>
            </div>
            <div>
              <p class="text-xs font-medium text-highlighted">
                部门范围
              </p>
              <div class="mt-1 flex flex-wrap gap-3">
                <UCheckbox
                  v-for="department in departmentOptions"
                  :key="department"
                  :model-value="roleServiceDepartments.includes(department)"
                  :label="department"
                  :data-testid="'custom-role-service-department-' + department"
                  @update:model-value="toggleRoleServiceDepartment(department)"
                />
              </div>
            </div>
            <UAlert
              v-if="roleServiceError"
              color="error"
              variant="subtle"
              icon="i-carbon-warning-alt"
              :description="roleServiceError"
              data-testid="custom-role-service-error"
            />
          </template>
          <p v-else class="text-sm text-muted">
            未选择角色。
          </p>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            color="neutral"
            variant="outline"
            label="取消"
            data-testid="custom-role-service-cancel"
            @click="roleServiceDialogOpen = false"
          />
          <UButton label="保存范围" data-testid="custom-role-service-save" @click="saveRoleService" />
        </div>
      </template>
    </UModal>

    <UModal
      v-model:open="roleRejectOpen"
      :ui="{ content: 'sm:max-w-md' }"
      title="拒绝授权申请"
      description="拒绝后该授权直接进入已撤销状态，不能用于任何单据操作。"
    >
      <template #body>
        <div class="space-y-3" data-testid="custom-role-reject-dialog">
          <p v-if="roleRejectTarget" class="text-sm text-muted">
            确认拒绝「{{ roleRejectTarget.name }}」？
          </p>
          <UFormField label="拒绝原因" required>
            <UTextarea
              v-model="roleRejectReason"
              :rows="3"
              placeholder="至少 4 个字符，说明职责冲突或范围问题"
              data-testid="custom-role-reject-reason"
            />
          </UFormField>
          <UAlert
            v-if="roleRejectError"
            color="error"
            variant="subtle"
            icon="i-carbon-warning-alt"
            :description="roleRejectError"
            data-testid="custom-role-reject-error"
          />
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            color="neutral"
            variant="outline"
            label="取消"
            data-testid="custom-role-reject-cancel"
            @click="roleRejectOpen = false"
          />
          <UButton
            color="error"
            label="确认拒绝"
            data-testid="custom-role-reject-confirm"
            @click="confirmRoleReject"
          />
        </div>
      </template>
    </UModal>

    <UModal
      v-model:open="roleRevokeOpen"
      :ui="{ content: 'sm:max-w-md' }"
      title="撤销授权"
      description="撤销后授权立即失效；待审批、已到期、已撤销授权都不能再操作单据。"
    >
      <template #body>
        <div class="space-y-3" data-testid="custom-role-revoke-dialog">
          <p v-if="roleRevokeTarget" class="text-sm text-muted">
            确认撤销「{{ roleRevokeTarget.name }}」？有效期至 {{ roleRevokeTarget.validTo }}。
          </p>
          <UFormField label="撤销原因" required>
            <UTextarea
              v-model="roleRevokeReason"
              :rows="3"
              placeholder="至少 4 个字符，例如岗位调整或职责冲突"
              data-testid="custom-role-revoke-reason"
            />
          </UFormField>
          <UAlert
            v-if="roleRevokeError"
            color="error"
            variant="subtle"
            icon="i-carbon-warning-alt"
            :description="roleRevokeError"
            data-testid="custom-role-revoke-error"
          />
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            color="neutral"
            variant="outline"
            label="取消"
            data-testid="custom-role-revoke-cancel"
            @click="roleRevokeOpen = false"
          />
          <UButton
            color="error"
            label="确认撤销"
            data-testid="custom-role-revoke-confirm"
            @click="confirmRoleRevoke"
          />
        </div>
      </template>
    </UModal>
  </div>
</template>
