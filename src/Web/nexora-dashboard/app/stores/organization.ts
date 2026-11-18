import { defineStore } from 'pinia'
import {
  auditEntries,
  companyProfiles,
  departments,
  invitations,
  members,
  roleAccessRequests,
  roleScopes,
  roles,
  workspaceSubscriptions
} from '~/mocks'
import type {
  AuditEntry,
  CompanyProfile,
  Department,
  Invitation,
  Member,
  MemberStatus,
  Role,
  RoleAccessRequest,
  RoleScope,
  WorkspaceSubscription
} from '~/mocks'

export interface AccessRequestResult {
  ok: boolean
  message: string
  request?: RoleAccessRequest
}

function cloneScope(scope: RoleScope): RoleScope {
  return {
    departmentIds: [...scope.departmentIds],
    warehouseIds: [...scope.warehouseIds],
    periodIds: [...scope.periodIds]
  }
}

function cloneScopeMap(source: Record<string, RoleScope>) {
  return Object.fromEntries(Object.entries(source).map(([id, scope]) => [id, cloneScope(scope)]))
}

function cloneAccessRequest(item: RoleAccessRequest): RoleAccessRequest {
  return {
    ...item,
    scope: cloneScope(item.scope),
    decisions: item.decisions.map(decision => ({ ...decision }))
  }
}

function scopeKey(scope: RoleScope) {
  return [
    [...scope.departmentIds].sort().join(','),
    [...scope.warehouseIds].sort().join(','),
    [...scope.periodIds].sort().join(',')
  ].join('|')
}

/**
 * B8 组织治理的会话内状态：成员、邀请、角色、部门、审计与订阅。
 * 纯 UI 演示，刷新后回到 app/mocks 的初始样例。
 */
export const useOrganizationStore = defineStore('organization', () => {
  const memberRows = ref<Member[]>(members.map(item => ({ ...item })))
  const invitationRows = ref<Invitation[]>(invitations.map(item => ({ ...item })))
  const roleRows = ref<Role[]>(roles.map(item => ({ ...item, permissions: [...item.permissions] })))
  const departmentRows = ref<Department[]>(departments.map(item => ({ ...item })))
  const profileMap = ref<Record<string, CompanyProfile>>(
    Object.fromEntries(Object.entries(companyProfiles).map(([id, profile]) => [id, { ...profile }]))
  )
  const auditRows = ref<AuditEntry[]>(auditEntries.map(item => ({ ...item })))
  const subscriptionMap = ref<Record<string, WorkspaceSubscription>>(
    Object.fromEntries(Object.entries(workspaceSubscriptions).map(([id, item]) => [id, { ...item }]))
  )
  const roleScopeMap = ref<Record<string, RoleScope>>(cloneScopeMap(roleScopes))
  const accessRequestRows = ref<RoleAccessRequest[]>(roleAccessRequests.map(cloneAccessRequest))

  function memberById(id: string) {
    return memberRows.value.find(item => item.id === id)
  }

  function updateMemberRole(id: string, roleId: string) {
    const member = memberById(id)
    if (member) member.roleId = roleId
  }

  function updateMemberDepartment(id: string, departmentId: string) {
    const member = memberById(id)
    if (member) member.departmentId = departmentId
  }

  function toggleMemberStatus(id: string) {
    const member = memberById(id)
    if (!member) return
    const next: MemberStatus = member.status === 'active' ? 'disabled' : 'active'
    member.status = next
    return next
  }

  function nextNumericId(prefix: string, start: number) {
    const used = new Set([
      ...memberRows.value.map(item => item.id),
      ...invitationRows.value.map(item => item.id)
    ])
    let value = start
    while (used.has(prefix + value)) value += 1
    return prefix + value
  }

  function inviteMembers(emails: string[], roleId: string, departmentId: string) {
    const today = '2026-11-18'
    const expiresAt = '2026-12-02'
    const accepted: string[] = []
    for (const email of emails) {
      const normalized = email.trim().toLowerCase()
      if (!normalized) continue
      if (memberRows.value.some(item => item.email.toLowerCase() === normalized)) continue
      if (invitationRows.value.some(item => item.email.toLowerCase() === normalized && item.status === 'pending')) continue
      const memberId = nextNumericId('u-', 3001)
      memberRows.value.push({
        id: memberId,
        name: normalized.split('@')[0] ?? normalized,
        email: normalized,
        phone: '待补充',
        departmentId,
        roleId,
        status: 'invited',
        joinedAt: today
      })
      invitationRows.value.unshift({
        id: nextNumericId('inv-', 2001),
        email: normalized,
        roleId,
        status: 'pending',
        sentAt: today,
        expiresAt
      })
      accepted.push(normalized)
    }
    return accepted
  }

  function sendInvitation(email: string, roleId: string) {
    const normalized = email.trim().toLowerCase()
    if (!normalized) return false
    invitationRows.value.unshift({
      id: nextNumericId('inv-', 2001),
      email: normalized,
      roleId,
      status: 'pending',
      sentAt: '2026-11-18',
      expiresAt: '2026-12-02'
    })
    return true
  }

  function resendInvitation(id: string) {
    const invitation = invitationRows.value.find(item => item.id === id)
    if (!invitation) return
    invitation.status = 'pending'
    invitation.sentAt = '2026-11-18'
    invitation.expiresAt = '2026-12-02'
  }

  function revokeInvitation(id: string) {
    invitationRows.value = invitationRows.value.filter(item => item.id !== id)
  }

  function updateRolePermissions(id: string, permissions: string[]) {
    const role = roleRows.value.find(item => item.id === id)
    if (role && role.id !== 'role-owner') role.permissions = [...permissions]
  }

  function memberCountOf(departmentId: string) {
    return memberRows.value.filter(item => item.departmentId === departmentId && item.status !== 'disabled').length
  }

  function addDepartment(name: string, parentId: string | null) {
    const id = 'dept-' + (departmentRows.value.length + 1) + '-' + Date.now().toString().slice(-4)
    departmentRows.value.push({ id, name, parentId, memberCount: 0 })
    return id
  }

  function renameDepartment(id: string, name: string) {
    const department = departmentRows.value.find(item => item.id === id)
    if (department) department.name = name
  }

  function removeDepartment(id: string) {
    departmentRows.value = departmentRows.value.filter(item => item.id !== id && item.parentId !== id)
  }

  function saveCompanyProfile(profile: CompanyProfile) {
    profileMap.value[profile.id] = { ...profile }
  }

  function changePlan(workspaceId: string, planId: string) {
    const subscription = subscriptionMap.value[workspaceId]
    if (!subscription) return
    subscription.planId = planId
    subscription.status = 'active'
  }

  function cancelSubscription(workspaceId: string) {
    const subscription = subscriptionMap.value[workspaceId]
    if (subscription) subscription.status = 'cancelled'
  }

  function scopeOf(roleId: string): RoleScope {
    const scope = roleScopeMap.value[roleId]
    return scope ? cloneScope(scope) : { departmentIds: [], warehouseIds: [], periodIds: [] }
  }

  function nowStamp() {
    const now = new Date()
    const pad = (value: number) => String(value).padStart(2, '0')
    return now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate())
      + ' ' + pad(now.getHours()) + ':' + pad(now.getMinutes())
  }

  function nextAccessRequestId() {
    const max = accessRequestRows.value.reduce((value, item) => {
      const matched = /^REQ-2026-(\d{4})$/.exec(item.id)
      return matched ? Math.max(value, Number(matched[1])) : value
    }, 1200)
    return 'REQ-2026-' + String(max + 1).padStart(4, '0')
  }

  function submitAccessRequest(input: {
    workspaceId: string
    roleId: string
    requesterId: string
    requesterName: string
    scope: RoleScope
    reason: string
  }): AccessRequestResult {
    const role = roleRows.value.find(item => item.id === input.roleId)
    if (!role) return { ok: false, message: '请选择需要授权的角色。' }
    const scope = cloneScope(input.scope)
    if (scope.departmentIds.length + scope.warehouseIds.length + scope.periodIds.length === 0) {
      return { ok: false, message: '请至少选择一个部门、仓库或财务期间。' }
    }
    if (!input.reason.trim()) return { ok: false, message: '请填写申请原因。' }
    if (scopeKey(scope) === scopeKey(scopeOf(input.roleId))) {
      return { ok: false, message: '申请范围与当前授权一致，无需提交。' }
    }
    const duplicated = accessRequestRows.value.some(item =>
      item.status === 'pending'
      && item.roleId === input.roleId
      && item.requesterId === input.requesterId
      && scopeKey(item.scope) === scopeKey(scope)
    )
    if (duplicated) return { ok: false, message: '相同的授权申请正在等待审批。' }

    const request: RoleAccessRequest = {
      id: nextAccessRequestId(),
      workspaceId: input.workspaceId,
      roleId: input.roleId,
      requesterId: input.requesterId,
      requesterName: input.requesterName,
      scope,
      reason: input.reason.trim(),
      status: 'pending',
      requestedAt: nowStamp(),
      decisions: []
    }
    accessRequestRows.value.unshift(request)
    recordAudit(input.workspaceId, input.requesterName, '提交授权申请', request.id + ' · ' + role.name)
    return { ok: true, message: '授权申请已提交，等待独立审批。', request }
  }

  function approveAccessRequest(requestId: string, actorId: string, actorName: string): AccessRequestResult {
    const request = accessRequestRows.value.find(item => item.id === requestId)
    if (!request) return { ok: false, message: '授权申请不存在。' }
    if (request.status !== 'pending') return { ok: false, message: '该申请已处理，不能重复审批。' }
    if (request.requesterId === actorId) return { ok: false, message: '申请人不能审批自己的授权申请。' }
    const actor = memberById(actorId)
    if (!actor || actor.roleId !== 'role-owner') {
      return { ok: false, message: '只有工作区所有者可以审批授权申请。' }
    }
    const current = scopeOf(request.roleId)
    const merged: RoleScope = {
      departmentIds: [...new Set([...current.departmentIds, ...request.scope.departmentIds])],
      warehouseIds: [...new Set([...current.warehouseIds, ...request.scope.warehouseIds])],
      periodIds: [...new Set([...current.periodIds, ...request.scope.periodIds])]
    }
    roleScopeMap.value = { ...roleScopeMap.value, [request.roleId]: merged }
    request.status = 'approved'
    request.decidedAt = nowStamp()
    request.decisions.push({
      actorId,
      actorName,
      decision: 'approved',
      at: request.decidedAt,
      note: '审批通过，范围已并入角色。'
    })
    const roleName = roleRows.value.find(item => item.id === request.roleId)?.name ?? request.roleId
    recordAudit(request.workspaceId, actorName, '批准授权申请', request.id + ' · ' + roleName)
    return { ok: true, message: '已批准，角色范围已更新。', request }
  }

  function rejectAccessRequest(requestId: string, actorId: string, actorName: string, note: string): AccessRequestResult {
    const request = accessRequestRows.value.find(item => item.id === requestId)
    if (!request) return { ok: false, message: '授权申请不存在。' }
    if (request.status !== 'pending') return { ok: false, message: '该申请已处理，不能重复审批。' }
    if (request.requesterId === actorId) return { ok: false, message: '申请人不能审批自己的授权申请。' }
    const actor = memberById(actorId)
    if (!actor || actor.roleId !== 'role-owner') {
      return { ok: false, message: '只有工作区所有者可以审批授权申请。' }
    }
    if (!note.trim()) return { ok: false, message: '请填写拒绝原因。' }
    request.status = 'rejected'
    request.decidedAt = nowStamp()
    request.decisions.push({
      actorId,
      actorName,
      decision: 'rejected',
      at: request.decidedAt,
      note: note.trim()
    })
    const roleName = roleRows.value.find(item => item.id === request.roleId)?.name ?? request.roleId
    recordAudit(request.workspaceId, actorName, '拒绝授权申请', request.id + ' · ' + roleName)
    return { ok: true, message: '已拒绝该授权申请。', request }
  }

  function recordAudit(workspaceId: string, actor: string, action: string, target: string) {
    const now = new Date()
    const pad = (value: number) => String(value).padStart(2, '0')
    const at = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`
    auditRows.value.unshift({
      id: 'audit-' + (auditRows.value.length + 2000),
      workspaceId,
      actor,
      action,
      target,
      at
    })
  }

  function reset() {
    memberRows.value = members.map(item => ({ ...item }))
    invitationRows.value = invitations.map(item => ({ ...item }))
    roleRows.value = roles.map(item => ({ ...item, permissions: [...item.permissions] }))
    departmentRows.value = departments.map(item => ({ ...item }))
    profileMap.value = Object.fromEntries(Object.entries(companyProfiles).map(([id, profile]) => [id, { ...profile }]))
    auditRows.value = auditEntries.map(item => ({ ...item }))
    subscriptionMap.value = Object.fromEntries(Object.entries(workspaceSubscriptions).map(([id, item]) => [id, { ...item }]))
    roleScopeMap.value = cloneScopeMap(roleScopes)
    accessRequestRows.value = roleAccessRequests.map(cloneAccessRequest)
  }

  return {
    memberRows,
    invitationRows,
    roleRows,
    departmentRows,
    profileMap,
    auditRows,
    subscriptionMap,
    roleScopeMap,
    accessRequestRows,
    updateMemberRole,
    updateMemberDepartment,
    toggleMemberStatus,
    inviteMembers,
    sendInvitation,
    resendInvitation,
    revokeInvitation,
    updateRolePermissions,
    scopeOf,
    submitAccessRequest,
    approveAccessRequest,
    rejectAccessRequest,
    memberCountOf,
    addDepartment,
    renameDepartment,
    removeDepartment,
    saveCompanyProfile,
    changePlan,
    cancelSubscription,
    recordAudit,
    reset
  }
})
