import type { DefinitionStatus, ProductCategory, TaxCode, UnitDefinition } from './types'

/** 定义维护页共用的状态映射（B3）。 */
export const definitionStatusLabels: Record<DefinitionStatus, string> = {
  active: '启用',
  inactive: '停用'
}

export const definitionStatusColors: Record<DefinitionStatus, 'success' | 'neutral'> = {
  active: 'success',
  inactive: 'neutral'
}

/**
 * 商品分类定义。productCount 是样例快照；定义维护页会按当前商品列表实时统计引用数。
 */
export const productCategories: ProductCategory[] = [
  { id: 'cat-01', code: 'CAT-01', name: '办公设备', description: '电脑、打印机、办公桌椅等固定资产类商品。', productCount: 7, status: 'active', updatedAt: '2026-11-14 16:40' },
  { id: 'cat-02', code: 'CAT-02', name: '办公耗材', description: '纸张、笔具、装订耗材等日常消耗品。', productCount: 5, status: 'active', updatedAt: '2026-11-13 10:05' },
  { id: 'cat-03', code: 'CAT-03', name: '包装材料', description: '纸箱、包装袋与缓冲材料。', productCount: 4, status: 'active', updatedAt: '2026-11-14 16:40' },
  { id: 'cat-04', code: 'CAT-04', name: '电子元件', description: '线材、充电器、网络设备等电子配件。', productCount: 5, status: 'active', updatedAt: '2026-11-11 15:22' },
  { id: 'cat-05', code: 'CAT-05', name: '劳保用品', description: '手套、口罩等劳动保护用品。', productCount: 3, status: 'active', updatedAt: '2026-11-10 09:18' },
  { id: 'cat-06', code: 'CAT-06', name: '会务用品', description: '会议、培训与活动临时采购用品（演示 0 引用分类）。', productCount: 0, status: 'inactive', updatedAt: '2026-10-28 09:15' }
]

/** 计量单位定义；页面按商品列表中的单位名称统计引用。 */
export const unitDefinitions: UnitDefinition[] = [
  { id: 'unit-01', code: 'UNIT-01', name: '台', precision: 0, status: 'active', updatedAt: '2026-11-12 10:15' },
  { id: 'unit-02', code: 'UNIT-02', name: '盒', precision: 0, status: 'active', updatedAt: '2026-11-12 10:15' },
  { id: 'unit-03', code: 'UNIT-03', name: '个', precision: 0, status: 'active', updatedAt: '2026-11-09 14:30' },
  { id: 'unit-04', code: 'UNIT-04', name: '包', precision: 0, status: 'active', updatedAt: '2026-11-08 11:02' },
  { id: 'unit-05', code: 'UNIT-05', name: '套', precision: 0, status: 'active', updatedAt: '2026-11-06 17:40' },
  { id: 'unit-06', code: 'UNIT-06', name: '根', precision: 0, status: 'active', updatedAt: '2026-11-05 09:25' },
  { id: 'unit-07', code: 'UNIT-07', name: '把', precision: 0, status: 'active', updatedAt: '2026-11-03 16:12' },
  { id: 'unit-08', code: 'UNIT-08', name: '千克', precision: 3, status: 'inactive', updatedAt: '2026-10-30 10:48' }
]

/** 税码定义；页面按报价明细中的税率统计引用。 */
export const taxCodes: TaxCode[] = [
  { id: 'tax-13', code: 'TAX-13', name: '销项税 13%', rate: '13%', kind: 'output', status: 'active', updatedAt: '2026-11-09 14:02' },
  { id: 'tax-09', code: 'TAX-09', name: '销项税 9%', rate: '9%', kind: 'output', status: 'active', updatedAt: '2026-11-07 10:36' },
  { id: 'tax-06', code: 'TAX-06', name: '销项税 6%', rate: '6%', kind: 'output', status: 'active', updatedAt: '2026-11-05 15:20' },
  { id: 'tax-in13', code: 'TAX-IN-13', name: '进项税 13%', rate: '13%', kind: 'input', status: 'active', updatedAt: '2026-11-04 09:44' },
  { id: 'tax-in09', code: 'TAX-IN-09', name: '进项税 9%', rate: '9%', kind: 'input', status: 'active', updatedAt: '2026-11-02 13:12' },
  { id: 'tax-zero', code: 'TAX-00', name: '免税', rate: '0%', kind: 'output', status: 'inactive', updatedAt: '2026-10-29 11:05' }
]

export const taxCodeKindLabels: Record<TaxCode['kind'], string> = {
  output: '销项',
  input: '进项'
}
