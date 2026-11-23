import { z } from 'zod'
import { bankSchema, bookSchema, chartSchema, ledgerSchema, receivableSchema, tradeSchema, type Probe, type TradeAccounts, type ReceivableAccounts } from '#shared/types/prerequisites'
import { taxSchema } from '#shared/types/tax'
import { useDashboardApi } from './useDashboardApi'
import { ApiFailure } from '~/utils/api/client'
import { ScopeChangedError } from '~/utils/api/scope'
import type { ChangeReceipt } from '#shared/types/wire'

export function useFinanceSetupApi() {
  const api = useDashboardApi()
  async function read<T>(workspaceId: string, tail: string, schema: z.ZodType<T>, signal?: AbortSignal) {
    return schema.parse((await api.get(`/bff/api/finance/workspaces/${workspaceId}/${tail}`, { signal })).data)
  }
  async function probe<T>(request: () => Promise<T>): Promise<Probe<T>> {
    try {
      return { state: 'ready', data: await request() }
    } catch (failure) {
      if (failure instanceof ScopeChangedError || (failure instanceof ApiFailure && failure.status === 401)) throw failure
      if (failure instanceof ApiFailure && failure.status === 403) return { state: 'denied', message: '当前身份无权查看此项配置。' }
      if (failure instanceof ApiFailure && failure.status === 404) return { state: 'missing', message: '尚未建立此项配置。' }
      return { state: 'unavailable', message: '暂时无法核对此项配置，请刷新后重试。' }
    }
  }
  const book = (id: string, signal?: AbortSignal) => read(id, 'book', bookSchema, signal)
  const chart = (id: string, signal?: AbortSignal) => read(id, 'chart', chartSchema, signal)
  const ledger = (id: string, signal?: AbortSignal) => read(id, 'ledger', ledgerSchema, signal)
  const trade = (id: string, signal?: AbortSignal) => read(id, 'trade', tradeSchema, signal)
  const receivables = (id: string, signal?: AbortSignal) => read(id, 'receivables', receivableSchema, signal)
  const banks = (id: string, signal?: AbortSignal) => read(id, 'trade/banks', z.array(bankSchema), signal)
  const taxes = (id: string, signal?: AbortSignal) => read(id, 'tax', taxSchema, signal)
  return { book, chart, ledger, trade, receivables, banks, taxes, probe,
    configureTrade: (id: string, accounts: TradeAccounts) => api.createWrite<ChangeReceipt>(`/bff/api/finance/workspaces/${id}/trade/setup`, { accounts }, { idempotent: true }),
    configureReceivables: (id: string, accounts: ReceivableAccounts) => api.createWrite<ChangeReceipt>(`/bff/api/finance/workspaces/${id}/receivables/setup`, { accounts }, { idempotent: true }),
    snapshot: async (id: string, signal?: AbortSignal) => {
      const [bookState, chartState, ledgerState, tradeState, receivableState, bankState, taxState] = await Promise.all([
        probe(() => book(id, signal)), probe(() => chart(id, signal)), probe(() => ledger(id, signal)),
        probe(() => trade(id, signal)), probe(() => receivables(id, signal)), probe(() => banks(id, signal)), probe(() => taxes(id, signal))
      ])
      return { book: bookState, chart: chartState, ledger: ledgerState, trade: tradeState, receivables: receivableState, banks: bankState, tax: taxState }
    }
  }
}
