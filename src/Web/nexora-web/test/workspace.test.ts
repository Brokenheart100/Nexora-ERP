import { describe, expect, it } from 'vitest'
import {
  invitationCodeSchema,
  workspaceLabel,
  workspaceNameSchema,
  type Workspace,
} from '../app/utils/workspace/workspace'

const workspace: Workspace = {
  id: 'ws-1',
  tenantId: 'tenant-1',
  name: null,
  countryCode: 'CN',
  baseCurrency: 'CNY',
  version: 1,
  isPersonal: false,
}

describe('workspaceLabel', () => {
  it('falls back when the wire name is missing or blank', () => {
    expect(workspaceLabel(undefined)).toBe('未命名工作区')
    expect(workspaceLabel(workspace)).toBe('未命名工作区')
    expect(workspaceLabel({ ...workspace, name: '   ' })).toBe('未命名工作区')
  })

  it('trims a present name and accepts a custom fallback', () => {
    expect(workspaceLabel({ ...workspace, name: '  华新商贸  ' })).toBe('华新商贸')
    expect(workspaceLabel(undefined, 'Untitled')).toBe('Untitled')
  })
})

describe('workspace input schemas', () => {
  it('rejects blank and overlong workspace names', () => {
    expect(workspaceNameSchema.safeParse('   ').success).toBe(false)
    expect(workspaceNameSchema.safeParse('a'.repeat(161)).success).toBe(false)
    expect(workspaceNameSchema.parse(' 华新商贸 ')).toBe('华新商贸')
  })

  it('requires a complete invitation code', () => {
    expect(invitationCodeSchema.safeParse('abc').success).toBe(false)
    expect(invitationCodeSchema.safeParse('abc.').success).toBe(false)
    expect(invitationCodeSchema.safeParse('abc.def').success).toBe(true)
  })
})
