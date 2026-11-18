import { z } from 'zod'

/** 列表页 ?state= 演示开关：只影响页面呈现，不发起请求。 */
export const mockStateSchema = z.enum(['loading', 'empty', 'error', 'forbidden'])

export const productStatusSchema = z.enum(['active', 'draft', 'archived'])

export const productEditSchema = z.object({
  name: z.string().trim().min(1, '请填写商品名称').max(80, '商品名称不能超过 80 个字符'),
  sku: z.string().trim().regex(/^SKU-\d{4}$/, 'SKU 格式为 SKU-1001'),
  category: z.string().trim().min(1, '请填写分类'),
  unit: z.string().trim().min(1, '请填写单位'),
  price: z.number().min(0, '单价不能为负数'),
  stock: z.number().int('库存必须是整数').min(0, '库存不能为负数'),
  status: productStatusSchema,
  brand: z.string().trim().max(40, '品牌不能超过 40 个字符').default(''),
  barcode: z.string().trim().max(40, '条码不能超过 40 个字符').default(''),
  spec: z.string().trim().max(80, '规格不能超过 80 个字符').default(''),
  tracking: z.enum(['none', 'batch', 'serial']).default('none'),
  taxRate: z.string().trim().min(1, '请选择税率').default('13%')
})

export const catalogFilterSchema = z.object({
  search: z.string().trim().max(80).default(''),
  status: z.union([z.literal('all'), productStatusSchema]).default('all'),
  category: z.string().default('all'),
  page: z.coerce.number().int().min(1).default(1)
})

export const orderFilterSchema = z.object({
  search: z.string().trim().max(80).default(''),
  status: z.enum(['all', 'draft', 'pending', 'approved', 'partial', 'received', 'closed', 'cancelled']).default('all'),
  page: z.coerce.number().int().min(1).default(1)
})
