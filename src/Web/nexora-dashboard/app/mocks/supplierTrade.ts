import type {
  SupplierBill,
  SupplierBillStatus,
  SupplierCredit,
  SupplierPayment,
  SupplierRefund
} from './types'

export const supplierBillStatusLabels: Record<SupplierBillStatus, string> = {
  pending: '待复核',
  posted: '已过账',
  cancelled: '已退回'
}

export const supplierPaymentMethodLabels: Record<SupplierPayment['method'], string> = {
  transfer: '银行转账',
  cheque: '支票',
  cash: '现金'
}

export const supplierCreditStatusLabels: Record<SupplierCredit['status'], string> = {
  confirmed: '已确认',
  refunded: '已退款'
}

/**
 * C1 供应商账单样例。
 * 固定算例 BILL-2026-1101：价税合计 1,130.00，已付 600.00，未结 530.00。
 * BILL-2026-1102 为待复核的价差样例；BILL-2026-1103/1104 为已结清的历史样例。
 */
export const supplierBills: SupplierBill[] = [
  {
    id: 'BILL-2026-1101',
    workspaceId: 'ws-hq',
    supplier: '苏州精工电子有限公司',
    orderId: 'PO-2026-0520',
    receiptIds: ['RC-2026-0520-01'],
    date: '2026-11-10',
    dueAt: '2026-11-10',
    status: 'posted',
    net: 1000,
    tax: 130,
    total: 1130,
    note: 'C1 固定算例：100 条 SATA 数据线，已付 600.00。',
    journalId: 'JE-AP-2026-1101',
    reviewer: '陈昊',
    reviewedAt: '2026-11-11 09:30',
    lines: [
      {
        id: 'BL-1101-01',
        receiptId: 'RC-2026-0520-01',
        receiptLineNo: 1,
        orderLineNo: 1,
        sku: 'SKU-1006',
        name: 'SATA 6Gb/s 数据线 0.5m 蓝色',
        quantity: 100,
        unitPrice: 10,
        accrualUnitPrice: 10,
        net: 1000,
        tax: 130,
        total: 1130,
        variance: 0
      }
    ]
  },
  {
    id: 'BILL-2026-1102',
    workspaceId: 'ws-hq',
    supplier: '苏州精工电子有限公司',
    orderId: 'PO-2026-0511',
    receiptIds: ['RC-2026-0511-01'],
    date: '2026-11-16',
    dueAt: '2026-12-16',
    status: 'pending',
    net: 920,
    tax: 119.6,
    total: 1039.6,
    note: '供应商调价：数据线单价 9.20，较采购价高 0.40，价差待复核。',
    lines: [
      {
        id: 'BL-1102-01',
        receiptId: 'RC-2026-0511-01',
        receiptLineNo: 1,
        orderLineNo: 1,
        sku: 'SKU-1006',
        name: 'SATA 6Gb/s 数据线 0.5m 蓝色',
        quantity: 100,
        unitPrice: 9.2,
        accrualUnitPrice: 8.8,
        net: 920,
        tax: 119.6,
        total: 1039.6,
        variance: 40
      }
    ]
  },
  {
    id: 'BILL-2026-1103',
    workspaceId: 'ws-hq',
    supplier: '苏州精工电子有限公司',
    orderId: 'PO-2026-0511',
    receiptIds: ['RC-2026-0511-01'],
    date: '2026-11-08',
    dueAt: '2026-11-12',
    status: 'posted',
    net: 7740,
    tax: 1006.2,
    total: 8746.2,
    note: '60 个 60W USB-C 快充充电器，已全额付款。',
    journalId: 'JE-AP-2026-1102',
    reviewer: '陈昊',
    reviewedAt: '2026-11-09 10:10',
    lines: [
      {
        id: 'BL-1103-01',
        receiptId: 'RC-2026-0511-01',
        receiptLineNo: 2,
        orderLineNo: 2,
        sku: 'SKU-1007',
        name: '60W USB-C 快充充电器（国标插头）',
        quantity: 60,
        unitPrice: 129,
        accrualUnitPrice: 129,
        net: 7740,
        tax: 1006.2,
        total: 8746.2,
        variance: 0
      }
    ]
  },
  {
    id: 'BILL-2026-1104',
    workspaceId: 'ws-hq',
    supplier: '苏州精工电子有限公司',
    orderId: 'PO-2026-0511',
    receiptIds: ['RC-2026-0511-01', 'RC-2026-0511-02'],
    date: '2026-11-08',
    dueAt: '2026-11-15',
    status: 'posted',
    net: 10360,
    tax: 1346.8,
    total: 11706.8,
    note: '40 个扩展坞；其中 5 个已确认退货并取得供应商贷项。',
    journalId: 'JE-AP-2026-1103',
    reviewer: '陈昊',
    reviewedAt: '2026-11-09 10:20',
    lines: [
      {
        id: 'BL-1104-01',
        receiptId: 'RC-2026-0511-01',
        receiptLineNo: 3,
        orderLineNo: 3,
        sku: 'SKU-1016',
        name: 'Type-C 转 HDMI 4K 扩展坞（含 PD 100W）',
        quantity: 20,
        unitPrice: 259,
        accrualUnitPrice: 259,
        net: 5180,
        tax: 673.4,
        total: 5853.4,
        variance: 0
      },
      {
        id: 'BL-1104-02',
        receiptId: 'RC-2026-0511-02',
        receiptLineNo: 3,
        orderLineNo: 3,
        sku: 'SKU-1016',
        name: 'Type-C 转 HDMI 4K 扩展坞（含 PD 100W）',
        quantity: 20,
        unitPrice: 259,
        accrualUnitPrice: 259,
        net: 5180,
        tax: 673.4,
        total: 5853.4,
        variance: 0
      }
    ]
  }
]

export const supplierPayments: SupplierPayment[] = [
  {
    id: 'PAY-2026-1101',
    workspaceId: 'ws-hq',
    billId: 'BILL-2026-1101',
    date: '2026-11-12',
    amount: 600,
    bankAccountId: 'ba-2026-01',
    bankName: '招商银行',
    method: 'transfer',
    reference: 'BANK-20261112-001',
    note: 'C1 固定算例首笔付款。'
  },
  {
    id: 'PAY-2026-1102',
    workspaceId: 'ws-hq',
    billId: 'BILL-2026-1103',
    date: '2026-11-13',
    amount: 8746.2,
    bankAccountId: 'ba-2026-01',
    bankName: '招商银行',
    method: 'transfer',
    reference: 'BANK-20261113-004'
  },
  {
    id: 'PAY-2026-1103',
    workspaceId: 'ws-hq',
    billId: 'BILL-2026-1104',
    date: '2026-11-17',
    amount: 10243.45,
    bankAccountId: 'ba-2026-01',
    bankName: '招商银行',
    method: 'transfer',
    reference: 'BANK-20261117-009',
    note: '扣除退货贷项后的净付款。'
  }
]

export const supplierCredits: SupplierCredit[] = [
  {
    id: 'CR-2026-1101',
    workspaceId: 'ws-hq',
    billId: 'BILL-2026-1104',
    orderId: 'PO-2026-0511',
    receiptId: 'RC-2026-0511-02',
    receiptLineNo: 3,
    sku: 'SKU-1016',
    name: 'Type-C 转 HDMI 4K 扩展坞（含 PD 100W）',
    quantity: 5,
    unitPrice: 259,
    net: 1295,
    tax: 168.35,
    total: 1463.35,
    reason: '到货外观破损，已确认退货，供应商开具贷项并退款。',
    confirmedAt: '2026-11-16 10:20',
    status: 'refunded'
  },
  {
    id: 'CR-2026-1102',
    workspaceId: 'ws-hq',
    billId: 'BILL-2026-1103',
    orderId: 'PO-2026-0511',
    receiptId: 'RC-2026-0511-01',
    receiptLineNo: 2,
    sku: 'SKU-1007',
    name: '60W USB-C 快充充电器（国标插头）',
    quantity: 2,
    unitPrice: 129,
    net: 258,
    tax: 33.54,
    total: 291.54,
    reason: '客户取消订单后退回 2 个充电器，退货已确认，等待供应商退款。',
    confirmedAt: '2026-11-18 09:40',
    status: 'confirmed'
  }
]

export const supplierRefunds: SupplierRefund[] = [
  {
    id: 'RF-2026-1101',
    workspaceId: 'ws-hq',
    creditId: 'CR-2026-1101',
    date: '2026-11-17',
    amount: 1463.35,
    bankAccountId: 'ba-2026-01',
    bankName: '招商银行',
    reference: 'REF-20261117-001'
  }
]
