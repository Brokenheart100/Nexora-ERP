import type { CommandPaletteGroup } from '@nuxt/ui'
import { useWorkspaceQuery } from './api/useWorkspaceQuery'
import { useMasterDataApi } from './api/useMasterDataApi'
import { usePartnersApi } from './api/usePartnersApi'
import { usePurchasingApi } from './api/usePurchasingApi'
import { useSalesApi } from './api/useSalesApi'
import { useReceivablesApi } from './api/useReceivablesApi'
import {
  changeLogEntries,
  invoices,
  partners,
  productCategories,
  products,
  purchaseOrders,
  quotes,
  recentDocuments,
  salesOrders,
  taxCodes,
  unitDefinitions
} from '~/mocks'

const navKeyByPath: Record<string, string> = {
  '/': 'dashboard',
  '/catalog': 'catalog',
  '/partners': 'partners',
  '/definitions': 'definitions',
  '/purchase-orders': 'purchaseOrders',
  '/purchase-audit': 'purchaseAudit',
  '/sales': 'sales',
  '/inventory': 'inventory',
  '/finance': 'finance',
  '/assistant': 'assistant',
  '/change-log': 'changeLog',
  '/settings': 'settings'
}

const productCategoryPath = '/catalog'
const partnerPath = '/partners'
const definitionPath = '/definitions'
const purchaseOrderPath = '/purchase-orders'
const salesPath = '/sales'
const changeLogPath = '/change-log'
const dashboardPath = '/'

/**
 * 工作区切换后，命令面板仅显示当前范围的查询结果。
 */
export function useDashboardSearch(open: Ref<boolean>) {
  const auth = useAuthSessionStore()
  const session = useLiveSessionStore()
  const { t } = useI18n()
  const { workspace } = useMockWorkspace()
  const { visits } = useRecentVisits()
  const catalog = useMasterDataApi()
  const partnerApi = usePartnersApi()
  const purchasing = usePurchasingApi()
  const selling = useSalesApi()
  const receivables = useReceivablesApi()
  const records = useWorkspaceQuery('workbench-search', '/', async (id, signal) => {
    if (!open.value) return { groups: [], partial: false }
    const scopedLink = (path: string, query: Record<string, string>) => ({ path, query: { workspace: id, ...query } })
    const limit = 20
    const results = await Promise.allSettled([
      session.canVisit('/catalog') ? catalog.catalog(id, 1, signal, limit).then(result => ({
        id: 'catalog', label: '商品',
        items: result.data.page.items.map(row => ({ label: row.code + ' · ' + row.name, to: scopedLink('/catalog', { item: row.id }) }))
      })) : null,
      session.canVisit('/partners') ? partnerApi.list(id, 1, undefined, signal, limit).then(result => ({
        id: 'partners', label: '往来单位',
        items: result.items.map(row => ({ label: row.code + ' · ' + row.name, to: scopedLink('/partners', { partner: row.id }) }))
      })) : null,
      session.canVisit('/purchase-orders') ? purchasing.list(id, 1, signal, limit).then(result => ({
        id: 'purchase', label: '采购单',
        items: result.orders.map(row => ({ label: row.number + ' · ' + row.supplierName, to: scopedLink('/purchase-orders', { order: row.id }) }))
      })) : null,
      session.canVisit('/sales') ? selling.list(id, false, 1, limit, signal).then(result => ({
        id: 'sales', label: '销售单',
        items: result.orders.map(row => ({ label: row.number + ' · ' + row.customerName, to: scopedLink('/sales', { order: row.id, tab: 'orders' }) }))
      })) : null,
      session.canVisit('/sales') && session.entitlements?.modules.includes('receivables') ? receivables.documents(id, 1, signal).then(result => ({
        id: 'receivables', label: '应收单据',
        items: result.slice(0, limit).map(row => ({ label: row.terms.number + ' · ' + row.terms.customerName, to: scopedLink('/sales', { document: row.id, tab: 'receivables' }) }))
      })) : null
    ])
    const groups = results.flatMap(result => result.status === 'fulfilled' && result.value?.items.length ? [result.value] : [])
    return { groups, partial: results.some(result => result.status === 'rejected') }
  }, () => open.value)
  const {
    purchaseStatusLabel,
    salesStatusLabel,
    quoteStatusLabel,
    invoiceStatusLabel,
    changeEntityLabel,
    partnerTypeLabel,
    definitionStatusLabel,
    taxKindLabel,
    documentTypeLabel,
    rawDocumentStatusLabel
  } = useMockLabels()

  function pageDescription(key: string) {
    return t('search.pages.' + key)
  }

  const recentItems = computed(() => visits.value.slice(0, 5).map((visit) => {
    const navKey = navKeyByPath[visit.to]
    return {
      label: navKey ? t('nav.' + navKey) : visit.label,
      description: t('search.groups.recent'),
      icon: visit.icon,
      to: visit.to
    }
  }))

  const groups = computed<CommandPaletteGroup[]>(() => {
    if (auth.connected) return [{ id: 'pages', label: t('search.groups.pages'),
      items: Object.entries(navKeyByPath).filter(([path]) => session.canVisit(path)).map(([path, key]) => ({
        to: { path, query: { workspace: session.activeWorkspaceId } }, label: t('nav.' + key), icon: 'i-carbon-application'
      })) }, ...(records.data?.groups ?? [])]
    const orders = purchaseOrders.filter(order => order.workspaceId === workspace.value.id)
    const sales = salesOrders.filter(order => order.workspaceId === workspace.value.id)
    const workspaceInvoices = invoices.filter(invoice => invoice.workspaceId === workspace.value.id)
    const workspaceQuotes = quotes.filter(quote => quote.workspaceId === workspace.value.id)
    const documents = recentDocuments.filter(document => document.workspaceId === workspace.value.id)

    return [
      ...(recentItems.value.length
        ? [{
            id: 'recent',
            label: t('search.groups.recent'),
            items: recentItems.value
          }]
        : []),
      {
        id: 'pages',
        label: t('search.groups.pages'),
        items: [{
          label: t('nav.dashboard'),
          description: pageDescription('dashboard'),
          icon: 'i-carbon-dashboard',
          to: dashboardPath
        }, {
          label: t('nav.catalog'),
          description: pageDescription('catalog'),
          icon: 'i-carbon-catalog',
          to: productCategoryPath
        }, {
          label: t('nav.partners'),
          description: pageDescription('partners'),
          icon: 'i-carbon-partnership',
          to: partnerPath
        }, {
          label: t('nav.definitions'),
          description: pageDescription('definitions'),
          icon: 'i-carbon-list',
          to: definitionPath
        }, {
          label: t('nav.purchaseOrders'),
          description: pageDescription('purchaseOrders'),
          icon: 'i-carbon-purchase',
          to: purchaseOrderPath
        }, {
          label: t('nav.purchaseAudit'),
          description: pageDescription('purchaseAudit'),
          icon: 'i-carbon-document-view',
          to: '/purchase-audit'
        }, {
          label: t('nav.sales'),
          description: pageDescription('sales'),
          icon: 'i-carbon-shopping-cart',
          to: salesPath
        }, {
          label: t('nav.inventory'),
          description: pageDescription('inventory'),
          icon: 'i-carbon-inventory-management',
          to: '/inventory'
        }, {
          label: t('nav.finance'),
          description: pageDescription('finance'),
          icon: 'i-carbon-finance',
          to: '/finance'
        }, {
          label: t('nav.assistant'),
          description: pageDescription('assistant'),
          icon: 'i-carbon-bot',
          to: '/assistant'
        }, {
          label: t('nav.changeLog'),
          description: pageDescription('changeLog'),
          icon: 'i-carbon-time',
          to: changeLogPath
        }, {
          label: t('nav.settings'),
          description: pageDescription('settings'),
          icon: 'i-carbon-settings',
          to: '/settings'
        }]
      },
      {
        id: 'products',
        label: t('search.groups.products'),
        items: products.slice(0, 12).map(product => ({
          label: product.name,
          description: product.category,
          suffix: product.sku,
          icon: 'i-carbon-catalog',
          to: productCategoryPath
        }))
      },
      {
        id: 'partners',
        label: t('search.groups.partners'),
        items: partners.map(partner => ({
          label: partner.name,
          description: partnerTypeLabel(partner.type) + ' · ' + partner.contact,
          suffix: partner.code,
          icon: partner.type === 'customer' ? 'i-carbon-shopping-cart' : partner.type === 'supplier' ? 'i-carbon-purchase' : 'i-carbon-enterprise',
          to: partner.type === 'supplier' ? purchaseOrderPath : partner.type === 'customer' ? salesPath : partnerPath
        }))
      },
      {
        id: 'definitions',
        label: t('search.groups.definitions'),
        items: [
          ...productCategories.map(category => ({
            label: category.name,
            description: t('search.productCategory', { status: definitionStatusLabel(category.status) }),
            suffix: category.code,
            icon: 'i-carbon-catalog',
            to: definitionPath
          })),
          ...unitDefinitions.map(unit => ({
            label: unit.name,
            description: t('search.unit', { precision: unit.precision }),
            suffix: unit.code,
            icon: 'i-carbon-list',
            to: definitionPath
          })),
          ...taxCodes.map(tax => ({
            label: tax.name,
            description: t('search.taxCode', { kind: taxKindLabel(tax.kind), rate: tax.rate }),
            suffix: tax.code,
            icon: 'i-carbon-receipt',
            to: definitionPath
          }))
        ]
      },
      {
        id: 'orders',
        label: t('search.groups.purchaseOrders'),
        items: orders.map(order => ({
          label: order.id,
          description: order.supplier,
          suffix: purchaseStatusLabel(order.status),
          icon: 'i-carbon-purchase',
          to: purchaseOrderPath
        }))
      },
      {
        id: 'sales',
        label: t('search.groups.salesOrders'),
        items: sales.map(order => ({
          label: order.id,
          description: order.customerName,
          suffix: salesStatusLabel(order.status),
          icon: 'i-carbon-shopping-cart',
          to: salesPath
        }))
      },
      {
        id: 'quotes',
        label: t('search.groups.quotes'),
        items: workspaceQuotes.map(quote => ({
          label: quote.id,
          description: quote.customerName + ' · ' + t('search.validUntil', { date: quote.validUntil }),
          suffix: quoteStatusLabel(quote.status),
          icon: 'i-carbon-document',
          to: salesPath
        }))
      },
      {
        id: 'invoices',
        label: t('search.groups.invoices'),
        items: workspaceInvoices.map(invoice => ({
          label: invoice.id,
          description: invoice.customerName + ' · ' + invoice.issuedAt,
          suffix: invoiceStatusLabel(invoice.status),
          icon: 'i-carbon-receipt',
          to: salesPath
        }))
      },
      {
        id: 'documents',
        label: t('search.groups.documents'),
        items: documents.map(document => ({
          label: document.title,
          description: rawDocumentStatusLabel(document.status),
          suffix: documentTypeLabel(document.type),
          icon: 'i-carbon-document',
          to: dashboardPath
        }))
      },
      {
        id: 'change-log',
        label: t('search.groups.changeLog'),
        items: changeLogEntries.filter(entry => entry.workspaceId === workspace.value.id).slice(0, 10).map(entry => ({
          label: entry.entityName + ' · ' + entry.action,
          description: changeEntityLabel(entry.entityType) + ' · ' + entry.actor + ' · ' + entry.at,
          suffix: entry.entityId,
          icon: 'i-carbon-time',
          to: changeLogPath
        }))
      },
      {
        id: 'demo-errors',
        label: t('search.groups.demoErrors'),
        items: [{
          label: '403 · ' + t('search.errors.forbidden.label'),
          description: t('search.errors.forbidden.description'),
          icon: 'i-carbon-locked',
          to: '/demo/error/403'
        }, {
          label: '404 · ' + t('search.errors.notFound.label'),
          description: t('search.errors.notFound.description'),
          icon: 'i-carbon-help',
          to: '/demo/error/404'
        }, {
          label: '500 · ' + t('search.errors.serverError.label'),
          description: t('search.errors.serverError.description'),
          icon: 'i-carbon-warning-alt',
          to: '/demo/error/500'
        }]
      }
    ]
  })

  return { groups, records }
}
