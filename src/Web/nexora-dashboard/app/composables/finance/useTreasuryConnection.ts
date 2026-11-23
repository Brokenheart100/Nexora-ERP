import { useLedgerApi } from '~/composables/api/useLedgerApi'
import { useTradeApi } from '~/composables/api/useTradeApi'
import { useTreasuryApi } from '~/composables/api/useTreasuryApi'
import { useWorkspaceQuery } from '~/composables/api/useWorkspaceQuery'
import { useTreasuryWrite } from './useTreasuryWrite'
import type { TradeDocument } from '#shared/types/trade'

export function useTreasuryConnection() {
  const trade = useTradeApi()
  const api = useTreasuryApi()
  const ledger = useLedgerApi()
  const route = useRoute()
  const bank = ref(typeof route.query.bank === 'string' ? route.query.bank : '')
  const documentId = ref(typeof route.query.document === 'string' ? route.query.document : '')
  const documentPage = ref(1)
  const movementPage = ref(1)
  const home = useWorkspaceQuery('treasury-home', '/finance', trade.home)
  const chart = useWorkspaceQuery('treasury-chart', '/finance', ledger.chart)
  const banks = useWorkspaceQuery('treasury-banks', '/finance', async (workspace, signal) => {
    const accounts = []
    for (let page = 1; ; page++) {
      const rows = await api.banks(workspace, page, signal)
      accounts.push(...rows)
      if (rows.length < 50) return accounts
    }
  })
  const accounts = computed(() => banks.data ?? home.data?.banks ?? [])
  const bankId = computed(() => accounts.value.some(value => value.id === bank.value) ? bank.value
    : accounts.value.find(value => value.isDefault)?.id ?? accounts.value[0]?.id ?? '')
  const bankDetail = useWorkspaceQuery('treasury-bank', '/finance', (workspace, signal) =>
    bankId.value ? api.bank(workspace, bankId.value, signal) : Promise.resolve(null), () => bankId.value)
  const movements = useWorkspaceQuery('treasury-movements', '/finance', (workspace, signal) =>
    bankId.value ? api.movements(workspace, bankId.value, movementPage.value, signal) : Promise.resolve([]),
  () => [bankId.value, movementPage.value])
  const documents = useWorkspaceQuery('treasury-documents', '/finance', (workspace, signal) =>
    trade.documents(workspace, documentPage.value, signal), () => documentPage.value)
  const selectedDocument = useWorkspaceQuery('treasury-document', '/finance', (workspace, signal) =>
    /^[\da-f-]{36}$/i.test(documentId.value) ? trade.document(workspace, documentId.value, signal) : Promise.resolve(null), () => documentId.value)
  const workspace = () => home.session.activeWorkspaceId
  const write = useTreasuryWrite('accounts', () => home.enabled, workspace)
  const problem = ref('')
  const billPage = ref(1)
  const bills = useWorkspaceQuery('treasury-payable-bills', '/finance', (id, signal) => trade.bills(id, billPage.value, signal), () => billPage.value)
  const canApprove = computed(() => home.data?.canApprove === true)
  const canSubmit = computed(() => home.data?.canSubmit === true)
  const canConfigure = computed(() => home.data?.canConfigure === true)
  const minorUnits = computed(() => home.data?.minorUnits ?? 2)
  const bankOptions = computed(() => accounts.value.map(row => ({ label: row.code + ' · ' + row.name, value: row.id })))
  watch(bankId, () => { movementPage.value = 1 }, { flush: 'sync' })
  watch(() => home.owner, () => {
    bank.value = ''
    documentId.value = ''
    documentPage.value = movementPage.value = billPage.value = 1
    problem.value = ''
  }, { flush: 'sync' })
  async function refresh() {
    await Promise.all([home.refresh(), chart.refresh(), banks.refresh(), bankDetail.refresh(), movements.refresh(),
      documents.refresh(), selectedDocument.refresh(), bills.refresh()])
  }
  async function send(action: string, path: string, payload: Record<string, unknown>, resourceId?: string) {
    problem.value = ''
    const ok = await write.send(action, path, payload, { resourceId })
    if (ok) await refresh()
    else if ([409, 412].includes(write.submission.failure?.status ?? 0)) await refresh()
    return ok
  }
  async function check() {
    problem.value = ''
    if (!write.submission.mutation.unknown && write.submission.record?.state === 'unknown') write.submission.resume()
    if (!write.submission.record) return refresh()
    await write.submission.check(async (saved) => {
      await refresh()
      if (saved.resourceId && saved.action === 'bank.default') await api.bank(workspace(), saved.resourceId)
      if (saved.resourceId && saved.action.startsWith('trade.')) await trade.document(workspace(), saved.resourceId)
      return null
    })
  }
  async function retry() {
    if (await write.submission.retry()) await refresh()
  }
  function decide(document: TradeDocument, decision: 'approve' | 'cancel') {
    return send('trade.' + decision, '/documents/' + document.id + '/decision', { decision, expectedVersion: document.version }, document.id)
  }
  return reactive({ home, chart, banks, accounts, bank, bankId, bankDetail, bankOptions, documents, documentPage, documentId, selectedDocument,
    movements, movementPage, bills, billPage, write, problem, canApprove, canSubmit, canConfigure, minorUnits, refresh, check, retry, send, decide })
}

export type TreasuryConnection = ReturnType<typeof useTreasuryConnection>
