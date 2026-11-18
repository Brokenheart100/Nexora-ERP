import type { CommandPaletteGroup } from '@nuxt/ui'
import {
  changeEntityLabels,
  changeLogEntries,
  definitionStatusLabels,
  invoiceStatusLabels,
  invoices,
  partnerTypeLabels,
  partners,
  productCategories,
  products,
  purchaseOrders,
  quoteStatusLabels,
  quotes,
  recentDocuments,
  salesOrders,
  salesStatusLabels,
  statusLabels,
  taxCodeKindLabels,
  taxCodes,
  unitDefinitions
} from '~/mocks'

/**
 * 全局命令面板（⌘K）的数据源：页面、商品、伙伴、采购/销售订单、发票、
 * 最近单据与错误页演示。全部取自本地模拟数据，切换工作区后订单与单据同步变化。
 */
export function useDashboardSearch() {
  const { workspace } = useMockWorkspace()
  const { visits } = useRecentVisits()

  const recentItems = computed(() => visits.value.slice(0, 5).map(visit => ({
    label: visit.label,
    description: '最近访问',
    icon: visit.icon,
    to: visit.to
  })))

  const groups = computed<CommandPaletteGroup[]>(() => {
    const orders = purchaseOrders.filter(order => order.workspaceId === workspace.value.id)
    const sales = salesOrders.filter(order => order.workspaceId === workspace.value.id)
    const workspaceInvoices = invoices.filter(invoice => invoice.workspaceId === workspace.value.id)
    const workspaceQuotes = quotes.filter(quote => quote.workspaceId === workspace.value.id)
    const documents = recentDocuments.filter(document => document.workspaceId === workspace.value.id)

    return [
      ...(recentItems.value.length
        ? [{
            id: 'recent',
            label: '最近访问',
            items: recentItems.value
          }]
        : []),
      {
        id: 'pages',
        label: '页面',
        items: [{
          label: '工作台',
          description: '工作区总览、采购趋势与待办',
          icon: 'i-carbon-dashboard',
          to: '/'
        }, {
          label: '商品目录',
          description: '商品搜索、筛选与编辑',
          icon: 'i-carbon-catalog',
          to: '/catalog'
        }, {
          label: '伙伴档案',
          description: '供应商、客户与捐赠人档案',
          icon: 'i-carbon-partnership',
          to: '/partners'
        }, {
          label: '主数据定义',
          description: '商品分类、计量单位与税码',
          icon: 'i-carbon-list',
          to: '/definitions'
        }, {
          label: '采购订单',
          description: '订单列表、明细与审批状态',
          icon: 'i-carbon-purchase',
          to: '/purchase-orders'
        }, {
          label: '采购审计',
          description: '采购审批、收货与变更审计',
          icon: 'i-carbon-document-view',
          to: '/purchase-audit'
        }, {
          label: '销售与应收',
          description: '报价、销售订单、应收与发票',
          icon: 'i-carbon-shopping-cart',
          to: '/sales'
        }, {
          label: '库存管理',
          description: '仓库、库存位置与出入库流水',
          icon: 'i-carbon-inventory-management',
          to: '/inventory'
        }, {
          label: '财务',
          description: '总账、应收应付与报表',
          icon: 'i-carbon-finance',
          to: '/finance'
        }, {
          label: '变更记录',
          description: '商品、伙伴、单据与定义变更',
          icon: 'i-carbon-time',
          to: '/change-log'
        }, {
          label: '设置',
          description: '工作区、成员、角色与偏好',
          icon: 'i-carbon-settings',
          to: '/settings'
        }]
      },
      {
        id: 'products',
        label: '商品',
        items: products.slice(0, 12).map(product => ({
          label: product.name,
          description: product.category,
          suffix: product.sku,
          icon: 'i-carbon-catalog',
          to: '/catalog'
        }))
      },
      {
        id: 'partners',
        label: '往来单位',
        items: partners.map(partner => ({
          label: partner.name,
          description: partnerTypeLabels[partner.type] + ' · ' + partner.contact,
          suffix: partner.code,
          icon: partner.type === 'customer' ? 'i-carbon-shopping-cart' : partner.type === 'supplier' ? 'i-carbon-purchase' : 'i-carbon-enterprise',
          to: partner.type === 'supplier' ? '/purchase-orders' : partner.type === 'customer' ? '/sales' : '/partners'
        }))
      },
      {
        id: 'definitions',
        label: '主数据定义',
        items: [
          ...productCategories.map(category => ({
            label: category.name,
            description: '商品分类 · ' + definitionStatusLabels[category.status],
            suffix: category.code,
            icon: 'i-carbon-catalog',
            to: '/definitions'
          })),
          ...unitDefinitions.map(unit => ({
            label: unit.name,
            description: '计量单位 · 精度 ' + unit.precision,
            suffix: unit.code,
            icon: 'i-carbon-list',
            to: '/definitions'
          })),
          ...taxCodes.map(tax => ({
            label: tax.name,
            description: taxCodeKindLabels[tax.kind] + '税码 · ' + tax.rate,
            suffix: tax.code,
            icon: 'i-carbon-receipt',
            to: '/definitions'
          }))
        ]
      },
      {
        id: 'orders',
        label: '采购订单',
        items: orders.map(order => ({
          label: order.id,
          description: order.supplier,
          suffix: statusLabels[order.status],
          icon: 'i-carbon-purchase',
          to: '/purchase-orders'
        }))
      },
      {
        id: 'sales',
        label: '销售订单',
        items: sales.map(order => ({
          label: order.id,
          description: order.customerName,
          suffix: salesStatusLabels[order.status],
          icon: 'i-carbon-shopping-cart',
          to: '/sales'
        }))
      },
      {
        id: 'quotes',
        label: '报价单',
        items: workspaceQuotes.map(quote => ({
          label: quote.id,
          description: quote.customerName + ' · 有效期至 ' + quote.validUntil,
          suffix: quoteStatusLabels[quote.status],
          icon: 'i-carbon-document',
          to: '/sales'
        }))
      },
      {
        id: 'invoices',
        label: '发票',
        items: workspaceInvoices.map(invoice => ({
          label: invoice.id,
          description: invoice.customerName + ' · ' + invoice.issuedAt,
          suffix: invoiceStatusLabels[invoice.status],
          icon: 'i-carbon-receipt',
          to: '/sales'
        }))
      },
      {
        id: 'documents',
        label: '最近单据',
        items: documents.map(document => ({
          label: document.title,
          description: document.status,
          suffix: document.type,
          icon: 'i-carbon-document',
          to: '/'
        }))
      },
      {
        id: 'change-log',
        label: '变更记录',
        items: changeLogEntries.filter(entry => entry.workspaceId === workspace.value.id).slice(0, 10).map(entry => ({
          label: entry.entityName + ' · ' + entry.action,
          description: changeEntityLabels[entry.entityType] + ' · ' + entry.actor + ' · ' + entry.at,
          suffix: entry.entityId,
          icon: 'i-carbon-time',
          to: '/change-log'
        }))
      },
      {
        id: 'demo-errors',
        label: '错误页演示',
        items: [{
          label: '403 · 无访问权限',
          description: '演示错误页与切换工作区动作',
          icon: 'i-carbon-locked',
          to: '/demo/error/403'
        }, {
          label: '404 · 页面不存在',
          description: '演示错误页的返回工作台动作',
          icon: 'i-carbon-help',
          to: '/demo/error/404'
        }, {
          label: '500 · 页面出错',
          description: '演示服务异常错误页',
          icon: 'i-carbon-warning-alt',
          to: '/demo/error/500'
        }]
      }
    ]
  })

  return { groups }
}
