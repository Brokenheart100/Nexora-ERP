import { useWorkspaceQuery } from '~/composables/api/useWorkspaceQuery'
import { useLedgerApi } from '~/composables/api/useLedgerApi'

export const accountingTabs = ['workbench', 'accounts', 'journals', 'imported', 'opening', 'closing']

export function useAccountingBook(tab: Ref<string>) {
  const api = useLedgerApi()
  const query = useWorkspaceQuery('accounting-book', '/finance', async (id, signal) => {
    if (!accountingTabs.includes(tab.value)) return null
    const book = await api.book(id, signal)
    if (!book.settings) return { book, chart: null, ledger: null }
    const [chart, ledger] = await Promise.all([api.chart(id, signal), api.ledger(id, signal)])
    return { book, chart, ledger }
  }, () => accountingTabs.includes(tab.value))
  const accounts = computed(() => query.data?.chart?.accounts ?? [])
  const workspace = () => query.session.activeWorkspaceId
  const journalLink = (id: string) => ({ path: '/finance', query: { workspace: workspace(), tab: 'journals', journal: id } })
  return reactive({ query, accounts, workspace, journalLink })
}

export type AccountingBookConnection = ReturnType<typeof useAccountingBook>
