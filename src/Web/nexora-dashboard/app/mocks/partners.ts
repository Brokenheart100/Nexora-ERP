import type { Partner, PartnerStatus, PartnerType } from './types'
import { makePartner } from './factories'

export const partnerStatusLabels: Record<PartnerStatus, string> = {
  active: '合作中',
  inactive: '已停用'
}
export const partnerStatusColors: Record<PartnerStatus, 'success' | 'neutral'> = {
  active: 'success',
  inactive: 'neutral'
}
export const partnerTypeLabels: Record<PartnerType, string> = {
  supplier: '供应商',
  customer: '客户',
  donor: '捐赠人',
  both: '供应商 / 客户'
}

const fixedPartners: Partner[] = [
  { id: 'pt-1001', code: 'SUP-001', name: '苏州精工电子有限公司', type: 'supplier', contact: '周明', phone: '138-0512-7788', email: 'zhouming@jinggong.example', taxNo: '91320500MA1XXXX001', currency: 'CNY', status: 'active', updatedAt: '2026-11-12' },
  { id: 'pt-1002', code: 'SUP-002', name: '宁波华翔包装材料有限公司', type: 'supplier', contact: '李颖', phone: '139-0574-2210', email: 'liying@huaxiang.example', taxNo: '91330200MA1XXXX002', currency: 'CNY', status: 'active', updatedAt: '2026-11-10' },
  { id: 'pt-1003', code: 'SUP-003', name: '上海联诚办公用品有限公司', type: 'both', contact: '王倩', phone: '137-0216-9034', email: 'wangqian@liancheng.example', taxNo: '91310000MA1XXXX003', currency: 'CNY', status: 'active', updatedAt: '2026-11-08' },
  { id: 'pt-1004', code: 'SUP-004', name: '杭州安泰劳保用品有限公司', type: 'supplier', contact: '陈刚', phone: '135-0571-6677', email: 'chengang@antai.example', taxNo: '91330100MA1XXXX004', currency: 'CNY', status: 'active', updatedAt: '2026-11-05' },
  { id: 'pt-1005', code: 'CUS-001', name: '杭州云杉科技有限公司', type: 'customer', contact: '林晓', phone: '138-0571-1122', email: 'linxiao@yunshan.example', taxNo: '91330100MA1XXXX005', currency: 'CNY', status: 'active', updatedAt: '2026-11-03' },
  { id: 'pt-1006', code: 'SUP-006', name: '上海启明办公设备有限公司', type: 'supplier', contact: '赵磊', phone: '136-021-5588', email: 'zhaolei@qiming.example', taxNo: '91310000MA1XXXX006', currency: 'CNY', status: 'inactive', updatedAt: '2026-11-09' },
  { id: 'pt-1007', code: 'DON-001', name: '杭州市社会福利基金会', type: 'donor', contact: '孙敏', phone: '137-0571-3366', email: 'sunmin@hz-welfare.example', taxNo: '51330100MJXXXXX007', currency: 'CNY', status: 'active', updatedAt: '2026-11-07' },
  { id: 'pt-1009', code: 'DON-002', name: '杭州邻里社区服务中心', type: 'donor', contact: '钱芳', phone: '135-0571-9911', email: 'qianfang@linli.example', taxNo: '52330100MJXXXXX009', currency: 'CNY', status: 'active', updatedAt: '2026-11-04' }
]

export const partners: Partner[] = [
  ...fixedPartners,
  ...Array.from({ length: 5 }, (_, i) => makePartner({
    id: 'pt-' + (2001 + i),
    code: 'PT-' + (2001 + i),
    type: i < 3 ? 'supplier' : i < 4 ? 'customer' : 'donor',
    status: i === 4 ? 'inactive' : 'active'
  }, 5100 + i))
]
