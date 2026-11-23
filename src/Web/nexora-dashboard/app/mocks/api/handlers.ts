import { http, HttpResponse } from 'msw/http'
import { createPurchaseHandlers } from './purchasing'
import { createFinanceHandlers } from './finance'
import { createSessionHandlers } from './session'
import { createMasterDataHandlers } from './masterdata'
import { createPrerequisiteHandlers } from './prerequisites'
import { createProcurementHandlers } from './procurement'
import { createPayableHandlers } from './payables'
import { createSalesHandlers } from './sales'
import { createReceivablesHandlers } from './receivables'
import { createWarehouseOperationHandlers } from './warehouse-operations'
import { createAccountingHandlers } from './accounting'
import { createTreasuryHandlers } from './treasury'
import { createInvoicingHandlers } from './invoicing'
import { createTaxHandlers } from './tax'
import { createReportingHandlers } from './reporting'
import { createAdministrationHandlers } from './administration'
import { createCatalogHandlers, mockWorkspaceId, mockItemId, mockSecondWorkspaceId } from './catalog'

export { mockWorkspaceId, mockItemId, mockSecondWorkspaceId }
export function mockProblem(status: number, code: string, detail: string) {
  return HttpResponse.json({ type: 'about:blank', title: detail, status, code, detail, traceId: 'msw-demo' }, { status, headers: { 'Content-Type': 'application/problem+json' } })
}

export function createDashboardHandlers(options: { scenario?: () => string, storage?: Pick<Storage, 'getItem' | 'setItem'> } = {}) {
  const scenario = options.scenario ?? (() => 'normal')
  const catalog = createCatalogHandlers({ scenario, storage: options.storage })
  const procurement = createProcurementHandlers(catalog, options.storage)
  const sales = createSalesHandlers(catalog, options.storage)
  return [
    ...createSessionHandlers(scenario, mockWorkspaceId),
    ...createWarehouseOperationHandlers(catalog, options.storage),
    ...createAccountingHandlers(catalog, options.storage),
    ...createTreasuryHandlers(catalog, options.storage),
    ...createInvoicingHandlers(catalog, options.storage),
    ...createTaxHandlers(catalog, options.storage),
    ...createReportingHandlers(catalog, options.storage),
    ...createAdministrationHandlers(catalog, options.storage),
    ...sales.handlers,
    ...createReceivablesHandlers(catalog, sales.fulfillment.facts, options.storage),
    ...procurement.handlers,
    ...createPayableHandlers(procurement, options.storage),
    ...createPrerequisiteHandlers(catalog, options.storage),
    ...catalog.handlers,
    ...createMasterDataHandlers(catalog),
    ...createFinanceHandlers({ workspaceId: mockWorkspaceId, itemId: mockItemId, scenario }),
    ...createPurchaseHandlers({ workspaceId: mockWorkspaceId, scenario, item: catalog.item }),
    http.all('*/bff/*', () => mockProblem(501, 'mock.not_implemented', '此模拟场景尚未配置此接口。'))
  ]
}
