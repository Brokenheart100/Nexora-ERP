import type { WirePartner } from '#shared/types/masterdata'
import type { Partner } from '~/mocks'

export function partnerModel(value: Pick<WirePartner, 'id' | 'code' | 'name' | 'roles' | 'isActive' | 'version'> & Partial<WirePartner>): Partner {
  const contacts = value.contacts?.map(contact => ({ id: contact.id ?? '', name: contact.name, email: contact.email ?? '', phone: contact.phone ?? '', title: '' })) ?? []
  const primary = contacts[0]
  return { id: value.id, code: value.code, name: value.name, roles: [...value.roles],
    type: value.roles.includes('customer') && value.roles.includes('supplier') ? 'both' : value.roles[0] ?? 'customer',
    status: value.isActive ? 'active' : 'inactive', updatedAt: String(value.version), taxNo: value.taxNumber ?? '',
    contact: primary?.name ?? '', phone: primary?.phone ?? '', email: primary?.email ?? '', contacts,
    address: { province: '', city: '', line: value.address ?? '', postalCode: '' },
    currency: 'CNY' /* Legacy model placeholder; connected views and exports do not display it. */ }
}
