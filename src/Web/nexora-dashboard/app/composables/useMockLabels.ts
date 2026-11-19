import type {
  ChangeEntityType,
  DefinitionStatus,
  InvoiceStatus,
  OrderStatus,
  PartnerType,
  QuoteStatus,
  SalesOrderStatus
} from '~/mocks'

type TaxKind = 'output' | 'input'
type TodoPriority = 'high' | 'medium' | 'low'

const changeEntityKeys: Record<ChangeEntityType, string> = {
  'product': 'product',
  'partner': 'partner',
  'purchase-order': 'purchaseOrder',
  'sales-order': 'salesOrder',
  'invoice': 'invoice',
  'definition': 'definition'
}

const documentTypeKeys: Record<string, string> = {
  采购订单: 'purchaseOrder',
  采购入库: 'goodsReceipt',
  采购发票: 'purchaseInvoice',
  付款单: 'payment',
  销售订单: 'salesOrder'
}

const rawDocumentStatusKeys: Record<string, string> = {
  部分入库: 'partiallyReceived',
  已入库: 'received',
  已确认: 'confirmed',
  已付款: 'paid',
  已收款: 'receiptReceived',
  待审批: 'pending',
  草稿: 'draft',
  已取消: 'cancelled',
  部分履约: 'partiallyFulfilled',
  已逾期: 'overdue',
  已开具: 'issued',
  已作废: 'voided'
}

const notificationSourceKeys: Record<string, string> = {
  公告: 'announcement',
  采购审批: 'purchaseApproval',
  销售审批: 'salesApproval',
  库存预警: 'stockAlert',
  最近单据: 'recentDocument'
}

/**
 * 模拟数据中的状态、类型等展示文案。业务数据本身保持源语言，只本地化枚举含义。
 */
export function useMockLabels() {
  const { t } = useI18n()

  function purchaseStatusLabel(status: OrderStatus) {
    return t('labels.purchaseStatus.' + status)
  }

  function salesStatusLabel(status: SalesOrderStatus) {
    return t('labels.salesStatus.' + status)
  }

  function quoteStatusLabel(status: QuoteStatus) {
    return t('labels.quoteStatus.' + status)
  }

  function invoiceStatusLabel(status: InvoiceStatus) {
    return t('labels.invoiceStatus.' + status)
  }

  function changeEntityLabel(type: ChangeEntityType) {
    return t('labels.changeEntity.' + changeEntityKeys[type])
  }

  function partnerTypeLabel(type: PartnerType) {
    return t('labels.partnerType.' + type)
  }

  function definitionStatusLabel(status: DefinitionStatus) {
    return t('labels.definitionStatus.' + status)
  }

  function taxKindLabel(kind: TaxKind) {
    return t('labels.taxKind.' + kind)
  }

  function todoPriorityLabel(priority: TodoPriority) {
    return t('labels.todoPriority.' + priority)
  }

  function documentTypeLabel(type: string) {
    const key = documentTypeKeys[type]
    return key ? t('labels.documentType.' + key) : type
  }

  function rawDocumentStatusLabel(status: string) {
    const key = rawDocumentStatusKeys[status]
    return key ? t('labels.rawDocumentStatus.' + key) : status
  }

  function notificationSourceLabel(source: string) {
    const key = notificationSourceKeys[source]
    return key ? t('notifications.sources.' + key) : source
  }

  return {
    purchaseStatusLabel,
    salesStatusLabel,
    quoteStatusLabel,
    invoiceStatusLabel,
    changeEntityLabel,
    partnerTypeLabel,
    definitionStatusLabel,
    taxKindLabel,
    todoPriorityLabel,
    documentTypeLabel,
    rawDocumentStatusLabel,
    notificationSourceLabel
  }
}
