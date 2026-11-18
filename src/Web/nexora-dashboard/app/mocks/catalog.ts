import type { Product, ProductStatus } from './types'
import { makeProduct } from './factories'

export const productStatusLabels: Record<ProductStatus, string> = {
  active: '在售',
  draft: '草稿',
  archived: '已归档'
}

export const productStatusColors: Record<ProductStatus, 'success' | 'neutral' | 'warning'> = {
  active: 'success',
  draft: 'warning',
  archived: 'neutral'
}

export const products: Product[] = [
  { id: 'p-1001', sku: 'SKU-1001', name: 'ThinkPad E14 商务笔记本电脑（i7/16G/512G）', category: '办公设备', unit: '台', price: 6299, stock: 12, status: 'active', updatedAt: '2026-11-14 09:20' },
  { id: 'p-1002', sku: 'SKU-1002', name: 'A4 复印纸 70g 500 张/包', category: '办公耗材', unit: '包', price: 22.5, stock: 860, status: 'active', updatedAt: '2026-11-14 09:20' },
  { id: 'p-1003', sku: 'SKU-1003', name: '兄弟 DCP-B7530DN 黑白激光一体机', category: '办公设备', unit: '台', price: 1899, stock: 6, status: 'active', updatedAt: '2026-11-13 16:40' },
  { id: 'p-1004', sku: 'SKU-1004', name: '双面高密度聚乙烯（HDPE）包装袋 40×50cm 加厚', category: '包装材料', unit: '个', price: 0.42, stock: 24000, status: 'active', updatedAt: '2026-11-13 14:05' },
  { id: 'p-1005', sku: 'SKU-1005', name: '工业级防静电手腕带（接地线 1.8m）', category: '劳保用品', unit: '套', price: 36, stock: 0, status: 'active', updatedAt: '2026-11-12 11:30' },
  { id: 'p-1006', sku: 'SKU-1006', name: 'SATA 6Gb/s 数据线 0.5m 蓝色', category: '电子元件', unit: '根', price: 8.8, stock: 320, status: 'active', updatedAt: '2026-11-12 10:10' },
  { id: 'p-1007', sku: 'SKU-1007', name: '60W USB-C 快充充电器（国标插头）', category: '电子元件', unit: '个', price: 129, stock: 18, status: 'active', updatedAt: '2026-11-11 17:25' },
  { id: 'p-1008', sku: 'SKU-1008', name: '食品级压缩空气式干手机 1800W', category: '办公设备', unit: '台', price: 268, stock: 9, status: 'draft', updatedAt: '2026-11-11 15:00' },
  { id: 'p-1009', sku: 'SKU-1009', name: '可回收牛皮纸气泡信封袋 25×35cm', category: '包装材料', unit: '个', price: 0.68, stock: 12000, status: 'active', updatedAt: '2026-11-10 09:45' },
  { id: 'p-1010', sku: 'SKU-1010', name: '人体工学网椅（带腰托/可躺 135°）', category: '办公设备', unit: '把', price: 1288, stock: 24, status: 'active', updatedAt: '2026-11-09 16:20' },
  { id: 'p-1011', sku: 'SKU-1011', name: '一次性丁腈手套 100 只/盒 M 码', category: '劳保用品', unit: '盒', price: 45, stock: 130, status: 'active', updatedAt: '2026-11-09 10:15' },
  { id: 'p-1012', sku: 'SKU-1012', name: '24 口千兆非网管交换机', category: '电子元件', unit: '台', price: 699, stock: 7, status: 'active', updatedAt: '2026-11-08 14:50' },
  { id: 'p-1013', sku: 'SKU-1013', name: '多层瓦楞纸箱 5 层 60×40×40cm', category: '包装材料', unit: '个', price: 6.5, stock: 2400, status: 'active', updatedAt: '2026-11-08 09:30' },
  { id: 'p-1014', sku: 'SKU-1014', name: '白板笔（可擦写）黑色 10 支/盒', category: '办公耗材', unit: '盒', price: 18.9, stock: 96, status: 'active', updatedAt: '2026-11-07 15:10' },
  { id: 'p-1015', sku: 'SKU-1015', name: '无纺布防尘口罩 50 只/盒', category: '劳保用品', unit: '盒', price: 24.5, stock: 0, status: 'archived', updatedAt: '2026-11-06 11:40' },
  { id: 'p-1016', sku: 'SKU-1016', name: 'Type-C 转 HDMI 4K 扩展坞（含 PD 100W）', category: '电子元件', unit: '个', price: 259, stock: 42, status: 'active', updatedAt: '2026-11-05 17:05' },
  { id: 'p-1017', sku: 'SKU-1017', name: '财务装订凭证热熔管 50 支/包', category: '办公耗材', unit: '包', price: 12, stock: 14, status: 'active', updatedAt: '2026-11-04 13:35' },
  { id: 'p-1018', sku: 'SKU-1018', name: '高精度电子台秤 30kg/1g（带 RS232）', category: '办公设备', unit: '台', price: 458, stock: 3, status: 'draft', updatedAt: '2026-11-03 09:00' },
  ...Array.from({ length: 6 }, (_, i) => makeProduct({
    id: 'p-' + (2001 + i),
    sku: 'SKU-' + (2001 + i),
    category: ['办公设备', '办公耗材', '包装材料', '电子元件'][i % 4],
    status: i === 5 ? 'draft' : 'active'
  }, 4100 + i))
]
