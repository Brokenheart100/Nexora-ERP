import { z } from 'zod'

export interface Identity {
  name?: string | null
  subject?: string | null
}

export interface Workspace {
  id: string
  tenantId: string
  name?: string | null
  countryCode: string
  baseCurrency: string
  version: number
  isPersonal: boolean
}

export interface Projection {
  workspaceId: string
  name: string
  projectedAtUtc: string
}

export interface PersonalWorkspace {
  id: string
  name: string
}

/** A workspace name is optional on the wire; never assume it is present. */
export function workspaceLabel(workspace: Workspace | null | undefined, fallback = '未命名工作区') {
  return typeof workspace?.name === 'string' && workspace.name.trim()
    ? workspace.name.trim()
    : fallback
}

export const workspaceNameSchema = z
  .string()
  .trim()
  .min(1, '请输入工作区名称。')
  .max(160, '工作区名称不能超过 160 个字符。')

export const invitationCodeSchema = z
  .string()
  .trim()
  .min(3, '请粘贴完整的邀请码。')
  .refine(value => value.split('.').filter(Boolean).length >= 2, '请粘贴完整的邀请码。')
