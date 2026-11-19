import { describe, expect, it } from 'vitest'
import { partners, partnerRoleLabel, partnerRolesOf } from '~/mocks'

describe('partner roles', () => {
  it('同一主体可以有多个业务角色', () => {
    const partner = partners.find(item => item.id === 'pt-1003')!
    expect(partnerRolesOf(partner)).toEqual(['supplier', 'customer'])
    expect(partnerRoleLabel(partner)).toBe('供应商 / 客户')
  })

  it('旧数据补齐地址与至少一个联系人', () => {
    const partner = partners.find(item => item.id === 'pt-1001')!
    expect(partner.roles).toEqual(['supplier'])
    expect(partner.address?.city).toBeTruthy()
    expect(partner.contacts?.length).toBeGreaterThanOrEqual(1)
  })

  it('停用伙伴保留档案与历史角色', () => {
    const partner = partners.find(item => item.id === 'pt-1006')!
    expect(partner.status).toBe('inactive')
    expect(partnerRolesOf(partner)).toContain('supplier')
  })
})
