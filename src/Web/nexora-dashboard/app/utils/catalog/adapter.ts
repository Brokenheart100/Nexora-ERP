import { z } from 'zod'
import type { WireCatalog, WireItem } from '#shared/types/wire'
import type { Product } from '~/mocks'

export const connectedItemEditSchema = z.object({ name: z.string().trim().min(1, '请输入商品名称。').max(160),
  category: z.uuid('请选择分类。'), status: z.enum(['active', 'archived']) })

/** Keep the original table model; legacy price/stock placeholders are never displayed or exported in connected mode. */
export function catalogProduct(item: WireItem, definitions: WireCatalog['definitions']): Product {
  return { id: item.id, name: item.name, sku: item.code, kind: item.kind === 'product' ? 'goods' : 'service',
    category: definitions.find(value => value.id === item.categoryId)?.name ?? '分类暂不可用',
    unit: definitions.find(value => value.id === item.unitId)?.name ?? '单位暂不可用',
    status: item.isActive ? 'active' : 'archived', updatedAt: String(item.version), price: 0, stock: 0 }
}
