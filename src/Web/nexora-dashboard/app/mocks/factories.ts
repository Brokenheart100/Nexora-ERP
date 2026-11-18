import { Faker, zh_CN } from '@faker-js/faker'
import type {
  AuditEntry,
  InventoryMovement,
  InventoryPosition,
  JournalEntry,
  Member,
  Partner,
  Product,
  PurchaseOrder,
  SalesOrder
} from './types'

/** 全局固定 seed：SSR 与客户端生成同一份批量数据，避免 hydration mismatch。 */
export const MOCK_SEED = 20261117

function seeded(seed: number) {
  const faker = new Faker({ locale: [zh_CN] })
  faker.seed(seed)
  return faker
}

function dateOnly(value: Date) {
  return value.toISOString().slice(0, 10)
}

const PRODUCT_TEMPLATES = [
  { name: '工业级标签打印机（300dpi）', category: '办公设备', unit: '台', price: 1680 },
  { name: 'A5 无线胶装笔记本 80 页', category: '办公耗材', unit: '本', price: 12.8 },
  { name: '可降解快递袋 32×45cm 100 只/包', category: '包装材料', unit: '包', price: 36 },
  { name: '防切割手套 5 级 10 双/包', category: '劳保用品', unit: '包', price: 78 },
  { name: 'USB 3.0 集线器 7 口带电源', category: '电子元件', unit: '个', price: 119 },
  { name: '静音手推车 150kg 承重', category: '办公设备', unit: '辆', price: 420 },
  { name: '热敏收银纸 80mm×80m 20 卷/箱', category: '办公耗材', unit: '箱', price: 96 },
  { name: '防潮缠绕膜 50cm×300m', category: '包装材料', unit: '卷', price: 32 }
]

const PARTNER_TEMPLATES = [
  '苏州精工电子有限公司', '宁波华翔包装材料有限公司', '上海联诚办公用品有限公司',
  '杭州安泰劳保用品有限公司', '深圳市恒通办公设备有限公司', '东莞市锐驰五金制品有限公司',
  '南京云启电子科技有限公司', '无锡新禾包装有限公司'
]

const PO_LINE_TEMPLATES = [
  { sku: 'SKU-1001', name: 'ThinkPad E14 商务笔记本电脑（i7/16G/512G）', spec: 'i7/16G/512G', unitPrice: 6299 },
  { sku: 'SKU-1002', name: 'A4 复印纸 70g 500 张/包', spec: '70g/500 张', unitPrice: 22.5 },
  { sku: 'SKU-1004', name: '双面高密度聚乙烯（HDPE）包装袋 40×50cm 加厚', spec: '40×50cm', unitPrice: 0.42 },
  { sku: 'SKU-1009', name: '可回收牛皮纸气泡信封袋 25×35cm', spec: '25×35cm', unitPrice: 0.68 },
  { sku: 'SKU-1011', name: '一次性丁腈手套 100 只/盒 M 码', spec: 'M 码', unitPrice: 45 },
  { sku: 'SKU-1016', name: 'Type-C 转 HDMI 4K 扩展坞（含 PD 100W）', spec: '4K/100W', unitPrice: 259 }
]

const SALES_LINE_TEMPLATES = [
  { sku: 'SKU-1002', name: 'A4 复印纸 70g 500 张/包', unitPrice: '22.50' },
  { sku: 'SKU-1003', name: '兄弟 DCP-B7530DN 黑白激光一体机', unitPrice: '1899.00' },
  { sku: 'SKU-1010', name: '人体工学网椅（带腰托/可躺 135°）', unitPrice: '1288.00' },
  { sku: 'SKU-1012', name: '24 口千兆非网管交换机', unitPrice: '699.00' },
  { sku: 'SKU-1014', name: '白板笔（可擦写）黑色 10 支/盒', unitPrice: '18.90' },
  { sku: 'SKU-1016', name: 'Type-C 转 HDMI 4K 扩展坞（含 PD 100W）', unitPrice: '259.00' }
]

export function makeProduct(overrides: Partial<Product> = {}, seed = MOCK_SEED): Product {
  const faker = seeded(seed)
  const template = faker.helpers.arrayElement(PRODUCT_TEMPLATES)
  return {
    id: 'p-' + seed,
    sku: 'SKU-' + seed,
    name: template.name,
    category: template.category,
    unit: template.unit,
    price: template.price,
    stock: faker.number.int({ min: 0, max: 240 }),
    status: faker.helpers.arrayElement(['active', 'active', 'active', 'draft', 'archived']),
    updatedAt: '2026-11-15 10:00',
    ...overrides
  }
}

export function makePartner(overrides: Partial<Partner> = {}, seed = MOCK_SEED): Partner {
  const faker = seeded(seed)
  return {
    id: 'pt-' + seed,
    code: 'PT-' + seed,
    name: faker.helpers.arrayElement(PARTNER_TEMPLATES),
    type: 'supplier',
    contact: faker.person.fullName(),
    phone: faker.phone.number(),
    email: 'partner' + seed + '@nexora.example',
    taxNo: '9132' + faker.string.numeric(14),
    currency: 'CNY',
    status: 'active',
    updatedAt: '2026-11-15',
    ...overrides
  }
}

export function makePurchaseOrder(overrides: Partial<PurchaseOrder> = {}, seed = MOCK_SEED): PurchaseOrder {
  const faker = seeded(seed)
  const lineCount = faker.number.int({ min: 2, max: 4 })
  const lines = Array.from({ length: lineCount }, (_, index) => {
    const template = faker.helpers.arrayElement(PO_LINE_TEMPLATES)
    const quantity = faker.number.int({ min: 10, max: 200 })
    return {
      lineNo: index + 1,
      sku: template.sku,
      name: template.name,
      spec: template.spec,
      quantity,
      received: 0,
      unitPrice: template.unitPrice
    }
  })
  return {
    id: 'PO-2026-' + seed,
    workspaceId: 'ws-hq',
    supplier: faker.helpers.arrayElement(PARTNER_TEMPLATES),
    contact: faker.person.fullName() + ' · ' + faker.phone.number(),
    status: 'pending',
    orderedAt: dateOnly(faker.date.between({ from: '2026-10-01', to: '2026-11-15' })),
    expectedAt: dateOnly(faker.date.between({ from: '2026-11-16', to: '2026-12-10' })),
    note: '由 Faker 工厂生成的演示采购单。',
    lines,
    ...overrides
  }
}

export function makeSalesOrder(overrides: Partial<SalesOrder> = {}, seed = MOCK_SEED): SalesOrder {
  const faker = seeded(seed)
  const lines = Array.from({ length: faker.number.int({ min: 2, max: 4 }) }, (_, index) => {
    const template = faker.helpers.arrayElement(SALES_LINE_TEMPLATES)
    const quantity = faker.number.int({ min: 2, max: 60 })
    return {
      lineNo: index + 1,
      sku: template.sku,
      name: template.name,
      quantity,
      shipped: 0,
      unitPrice: template.unitPrice,
      amount: (quantity * Number(template.unitPrice)).toFixed(2)
    }
  })
  const total = lines.reduce((sum, line) => sum + Number(line.amount), 0)
  return {
    id: 'SO-2026-' + seed,
    workspaceId: 'ws-hq',
    customerName: faker.helpers.arrayElement(['杭州云杉科技有限公司', '南京远航贸易有限公司', '上海启明零售有限公司']),
    status: 'pending',
    orderedAt: dateOnly(faker.date.between({ from: '2026-10-15', to: '2026-11-15' })),
    promisedAt: dateOnly(faker.date.between({ from: '2026-11-18', to: '2026-12-15' })),
    owner: faker.person.fullName(),
    totalAmount: total.toFixed(2),
    note: '由 Faker 工厂生成的演示销售单。',
    lines,
    updatedAt: '2026-11-15',
    ...overrides
  }
}

export function makeInventoryPosition(overrides: Partial<InventoryPosition> = {}, seed = MOCK_SEED): InventoryPosition {
  const faker = seeded(seed)
  const template = faker.helpers.arrayElement(PRODUCT_TEMPLATES)
  const quantity = faker.number.int({ min: 0, max: 900 })
  const reserved = faker.number.int({ min: 0, max: Math.min(80, quantity) })
  return {
    id: 'ip-' + seed,
    warehouseId: 'wh-east',
    sku: 'SKU-' + seed,
    name: template.name,
    lotNo: 'LOT-2026-' + seed,
    quantity,
    reserved,
    available: quantity - reserved,
    unit: template.unit,
    updatedAt: '2026-11-15 10:00',
    ...overrides
  }
}

export function makeInventoryMovement(overrides: Partial<InventoryMovement> = {}, seed = MOCK_SEED): InventoryMovement {
  const faker = seeded(seed)
  const template = faker.helpers.arrayElement(PRODUCT_TEMPLATES)
  return {
    id: 'mv-' + seed,
    type: faker.helpers.arrayElement(['inbound', 'outbound', 'transfer', 'adjust']),
    warehouseId: 'wh-east',
    sku: 'SKU-' + seed,
    name: template.name,
    quantity: faker.number.int({ min: 1, max: 200 }),
    reference: 'REF-2026-' + seed,
    at: '2026-11-15 10:00',
    ...overrides
  }
}

export function makeJournalEntry(overrides: Partial<JournalEntry> = {}, seed = MOCK_SEED): JournalEntry {
  const faker = seeded(seed)
  const amount = faker.number.float({ min: 1000, max: 90000, fractionDigits: 2 }).toFixed(2)
  return {
    id: 'JE-2026-' + seed,
    date: dateOnly(faker.date.between({ from: '2026-11-01', to: '2026-11-15' })),
    period: '2026-11',
    description: 'Faker 生成的演示凭证',
    status: 'posted',
    debitTotal: amount,
    creditTotal: amount,
    lines: [
      { accountCode: '1002', accountName: '银行存款', debit: amount, credit: '0.00' },
      { accountCode: '1122', accountName: '应收账款', debit: '0.00', credit: amount }
    ],
    ...overrides
  }
}

export function makeMember(overrides: Partial<Member> = {}, seed = MOCK_SEED): Member {
  const faker = seeded(seed)
  return {
    id: 'u-' + seed,
    name: faker.person.fullName(),
    email: 'user' + seed + '@nexora.example',
    phone: faker.phone.number(),
    departmentId: 'dept-purchase',
    roleId: 'role-buyer',
    status: 'active',
    joinedAt: '2026-08-01',
    ...overrides
  }
}

export function makeAuditEntry(overrides: Partial<AuditEntry> = {}, seed = MOCK_SEED): AuditEntry {
  const faker = seeded(seed)
  return {
    id: 'audit-' + seed,
    workspaceId: 'ws-hq',
    actor: faker.person.fullName(),
    action: faker.helpers.arrayElement(['创建采购单', '审批采购单', '修改商品', '导出报表']),
    target: 'PO-2026-' + seed,
    at: '2026-11-15 10:00',
    ...overrides
  }
}
