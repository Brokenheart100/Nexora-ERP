import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import {
  treasuryAccounts,
  treasuryFlows,
  treasuryMatchKindLabels,
  treasuryReconciliations,
  treasuryStatements,
  treasuryFlowTypeDirections,
  type TreasuryAccount,
  type TreasuryAccountKind,
  type TreasuryFlow,
  type TreasuryFlowDirection,
  type TreasuryFlowType,
  type TreasuryImportBatch,
  type TreasuryImportValidRow,
  type TreasuryLedgerCode,
  type TreasuryMatchKind,
  type TreasuryReconciliationRecord,
  type TreasuryStatementMatch,
  type TreasuryStatementRow
} from '~/mocks/treasury'

export interface TreasuryActionResult {
  ok: boolean
  message: string
  id?: string
  ids?: string[]
}

export interface TreasuryAccountInput {
  kind: TreasuryAccountKind
  name: string
  accountNo: string
  ledgerCode: TreasuryLedgerCode
  isDefault: boolean
}

export interface TreasuryFlowInput {
  type: TreasuryFlowType
  date: string
  amount: number
  counterparty: string
  summary: string
  sourceAccountId?: string
  targetAccountId?: string
}

export interface TreasuryImportInput {
  accountId: string
  fileName: string
  rows: TreasuryImportValidRow[]
  problemCount: number
}

export interface TreasuryMatchInput {
  kind: TreasuryMatchKind
  flowId?: string
  amount: number
}

export interface TreasuryReconciliationInput {
  accountId: string
  cutoff: string
  bankBalance: number
}

function round2(value: number) {
  return Math.round(value * 100) / 100
}

function pad(value: number) {
  return String(value).padStart(2, '0')
}

function nowStamp() {
  const date = new Date()
  return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) + ' ' + pad(date.getHours()) + ':' + pad(date.getMinutes())
}

function todayStamp() {
  return nowStamp().slice(0, 10)
}

function fail(message: string): TreasuryActionResult {
  return { ok: false, message }
}

export const useTreasuryStore = defineStore('treasury', () => {
  const accounts = ref<TreasuryAccount[]>(structuredClone(treasuryAccounts))
  const flows = ref<TreasuryFlow[]>(structuredClone(treasuryFlows))
  const statements = ref<TreasuryStatementRow[]>(structuredClone(treasuryStatements))
  const importBatches = ref<TreasuryImportBatch[]>([])
  const importedFileNames = ref<string[]>([])
  const reconciliations = ref<TreasuryReconciliationRecord[]>(structuredClone(treasuryReconciliations))

  const nextAccountSeq = ref(1)
  const nextFlowSeq = ref(1)
  const nextTransferSeq = ref(1)
  const nextStatementSeq = ref(1)
  const nextMatchSeq = ref(1)
  const nextBatchSeq = ref(1)
  const nextRecordSeq = ref(1)
  const nextVoucherSeq = ref(1)

  const accountMap = computed(() => new Map(accounts.value.map(account => [account.id, account])))
  const flowMap = computed(() => new Map(flows.value.map(flow => [flow.id, flow])))
  const statementMap = computed(() => new Map(statements.value.map(row => [row.id, row])))

  function accountName(accountId: string) {
    return accountMap.value.get(accountId)?.name ?? accountId
  }

  function nextVoucherNo() {
    const no = '记-2026-' + (1120 + nextVoucherSeq.value)
    nextVoucherSeq.value += 1
    return no
  }

  function applyFlowToBalance(flow: TreasuryFlow, sign: 1 | -1) {
    const account = accountMap.value.get(flow.accountId)
    if (!account) return
    const delta = flow.direction === 'in' ? flow.amount : -flow.amount
    account.balance = round2(account.balance + delta * sign)
  }

  function setDefaultAccount(id: string): TreasuryActionResult {
    const target = accountMap.value.get(id)
    if (!target) return fail('资金账户不存在。')
    if (target.isDefault) return { ok: true, message: '该账户已是默认资金账户。' }
    accounts.value.forEach((account) => {
      account.isDefault = account.id === id
    })
    return { ok: true, message: '已设为默认资金账户。' }
  }

  function createAccount(input: TreasuryAccountInput): TreasuryActionResult {
    const name = input.name.trim()
    const accountNo = input.accountNo.trim()
    if (!name) return fail('请填写账户名称。')
    if (!accountNo) return fail('请填写账号。')
    const normalized = accountNo.replace(/\s/g, '')
    if (accounts.value.some(account => account.accountNo.replace(/\s/g, '') === normalized)) {
      return fail('该账号已存在，请检查后重试。')
    }
    const id = 'ACC-' + (100 + nextAccountSeq.value)
    nextAccountSeq.value += 1
    const isFirst = accounts.value.length === 0
    if (input.isDefault || isFirst) {
      accounts.value.forEach((account) => {
        account.isDefault = false
      })
    }
    accounts.value.push({
      id,
      kind: input.kind,
      name,
      accountNo,
      balance: 0,
      ledgerCode: input.ledgerCode,
      isDefault: input.isDefault || isFirst
    })
    return { ok: true, message: '资金账户已创建。', id }
  }

  function checkFlowInput(input: TreasuryFlowInput): string {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return '请选择有效的业务日期。'
    if (!Number.isFinite(input.amount) || input.amount <= 0) return '金额需为大于 0 的数字。'
    if (input.type === 'transfer') {
      if (!input.sourceAccountId || !input.targetAccountId) return '资金划转需同时选择源账户和目标账户。'
      if (input.sourceAccountId === input.targetAccountId) return '资金划转的源账户和目标账户不能相同。'
      if (!accountMap.value.has(input.sourceAccountId) || !accountMap.value.has(input.targetAccountId)) {
        return '资金划转的账户不存在。'
      }
      return ''
    }
    if (!input.counterparty.trim()) return '请填写对方名称。'
    const direction = treasuryFlowTypeDirections[input.type]
    const accountId = direction === 'in' ? input.targetAccountId : input.sourceAccountId
    if (!accountId) return direction === 'in' ? '请选择目标账户。' : '请选择源账户。'
    if (!accountMap.value.has(accountId)) return '资金账户不存在。'
    return ''
  }

  function resolveFlowAccountId(input: TreasuryFlowInput) {
    const direction = treasuryFlowTypeDirections[input.type]
    return {
      direction,
      accountId: direction === 'in'
        ? (input.targetAccountId ?? '')
        : (input.sourceAccountId ?? '')
    } as { direction: TreasuryFlowDirection, accountId: string }
  }

  function createFlow(input: TreasuryFlowInput, maker: string): TreasuryActionResult {
    const error = checkFlowInput(input)
    if (error) return fail(error)
    const amount = round2(input.amount)
    const createdAt = nowStamp()
    const summary = input.summary.trim()
    if (input.type === 'transfer') {
      const groupId = 'TG-' + (2700 + nextTransferSeq.value)
      nextTransferSeq.value += 1
      const source = accountMap.value.get(input.sourceAccountId ?? '')
      const target = accountMap.value.get(input.targetAccountId ?? '')
      if (!source || !target) return fail('资金划转的账户不存在。')
      const outId = 'F-' + (2700 + nextFlowSeq.value)
      nextFlowSeq.value += 1
      const inId = 'F-' + (2700 + nextFlowSeq.value)
      nextFlowSeq.value += 1
      flows.value.unshift({
        id: outId,
        type: 'transfer',
        date: input.date,
        amount,
        direction: 'out',
        accountId: source.id,
        counterparty: input.counterparty.trim() || target.name,
        summary: summary || '资金划转至' + target.name,
        status: 'draft',
        maker,
        createdAt,
        transferGroupId: groupId
      })
      flows.value.unshift({
        id: inId,
        type: 'transfer',
        date: input.date,
        amount,
        direction: 'in',
        accountId: target.id,
        counterparty: input.counterparty.trim() || source.name,
        summary: summary || '收到' + source.name + '资金划转',
        status: 'draft',
        maker,
        createdAt,
        transferGroupId: groupId
      })
      return { ok: true, message: '资金划转已生成两条方向相反的草稿流水。', id: outId, ids: [outId, inId] }
    }
    const resolved = resolveFlowAccountId(input)
    const id = 'F-' + (2700 + nextFlowSeq.value)
    nextFlowSeq.value += 1
    flows.value.unshift({
      id,
      type: input.type,
      date: input.date,
      amount,
      direction: resolved.direction,
      accountId: resolved.accountId,
      counterparty: input.counterparty.trim(),
      summary,
      status: 'draft',
      maker,
      createdAt
    })
    return { ok: true, message: '资金流水草稿已保存。', id }
  }

  function updateFlow(id: string, input: TreasuryFlowInput): TreasuryActionResult {
    const flow = flowMap.value.get(id)
    if (!flow) return fail('资金流水不存在。')
    if (flow.status !== 'draft') return fail('仅草稿状态的流水可以编辑。')
    const error = checkFlowInput(input)
    if (error) return fail(error)
    const amount = round2(input.amount)
    const summary = input.summary.trim()
    if (flow.type === 'transfer' || input.type === 'transfer') {
      if (flow.type !== 'transfer' || input.type !== 'transfer') {
        return fail('资金划转流水不支持修改类型。')
      }
      const legs = flows.value.filter(item => item.transferGroupId === flow.transferGroupId)
      const source = accountMap.value.get(input.sourceAccountId ?? '')
      const target = accountMap.value.get(input.targetAccountId ?? '')
      if (!source || !target) return fail('资金划转的账户不存在。')
      legs.forEach((leg) => {
        leg.amount = amount
        leg.date = input.date
        leg.summary = summary || leg.summary
        leg.accountId = leg.direction === 'out' ? source.id : target.id
        leg.counterparty = leg.direction === 'out' ? target.name : source.name
      })
      return { ok: true, message: '资金划转草稿已更新。', id, ids: legs.map(leg => leg.id) }
    }
    const resolved = resolveFlowAccountId(input)
    flow.type = input.type
    flow.date = input.date
    flow.amount = amount
    flow.direction = resolved.direction
    flow.accountId = resolved.accountId
    flow.counterparty = input.counterparty.trim()
    flow.summary = summary
    return { ok: true, message: '资金流水草稿已更新。', id }
  }

  function removeFlow(id: string): TreasuryActionResult {
    const flow = flowMap.value.get(id)
    if (!flow) return fail('资金流水不存在。')
    if (flow.status !== 'draft') return fail('仅草稿状态的流水可以取消。')
    if (flow.transferGroupId) {
      flows.value = flows.value.filter(item => item.transferGroupId !== flow.transferGroupId)
      return { ok: true, message: '资金划转草稿已取消（两条方向流水一并移除）。' }
    }
    flows.value = flows.value.filter(item => item.id !== id)
    return { ok: true, message: '资金流水草稿已取消。' }
  }

  function submitFlow(id: string, actor: string): TreasuryActionResult {
    const flow = flowMap.value.get(id)
    if (!flow) return fail('资金流水不存在。')
    if (flow.status !== 'draft') return fail('仅草稿状态的流水可以提交。')
    flow.status = 'submitted'
    flow.submittedAt = nowStamp()
    flow.maker = actor || flow.maker
    flow.rejectReason = undefined
    return { ok: true, message: '资金流水已提交，等待复核。', id }
  }

  function approveFlow(id: string, actor: string): TreasuryActionResult {
    const flow = flowMap.value.get(id)
    if (!flow) return fail('资金流水不存在。')
    if (flow.status !== 'submitted') return fail('仅已提交的流水可以复核通过。')
    if (actor === flow.maker) return fail('复核人不能是制单人，请切换演示身份。')
    flow.status = 'posted'
    flow.postedAt = nowStamp()
    flow.voucherNo = nextVoucherNo()
    applyFlowToBalance(flow, 1)
    return { ok: true, message: '复核通过，流水已过账并生成凭证 ' + flow.voucherNo + '。', id }
  }

  function rejectFlow(id: string, actor: string, reason: string): TreasuryActionResult {
    const flow = flowMap.value.get(id)
    if (!flow) return fail('资金流水不存在。')
    if (flow.status !== 'submitted') return fail('仅已提交的流水可以拒绝。')
    if (actor === flow.maker) return fail('复核人不能是制单人，请切换演示身份。')
    const note = reason.trim()
    if (!note) return fail('请填写拒绝原因。')
    flow.status = 'draft'
    flow.rejectReason = note
    flow.submittedAt = undefined
    return { ok: true, message: '已拒绝并退回草稿，拒绝原因已记录。', id }
  }

  function voidFlow(id: string, actor: string, reason: string): TreasuryActionResult {
    const flow = flowMap.value.get(id)
    if (!flow) return fail('资金流水不存在。')
    if (flow.status !== 'posted') return fail('仅已过账的流水可以作废。')
    const note = reason.trim()
    if (!note) return fail('请填写作废原因。')
    const reversalId = 'F-' + (2700 + nextFlowSeq.value)
    nextFlowSeq.value += 1
    const stamp = nowStamp()
    const reversal: TreasuryFlow = {
      id: reversalId,
      type: flow.type,
      date: todayStamp(),
      amount: flow.amount,
      direction: flow.direction === 'in' ? 'out' : 'in',
      accountId: flow.accountId,
      counterparty: flow.counterparty,
      summary: '作废冲销：' + flow.summary,
      status: 'posted',
      maker: actor,
      createdAt: stamp,
      postedAt: stamp,
      voucherNo: nextVoucherNo(),
      originalFlowId: flow.id
    }
    flow.status = 'voided'
    flow.voidReason = note
    flow.voidedAt = stamp
    flow.reversalFlowId = reversal.id
    flows.value.unshift(reversal)
    applyFlowToBalance(reversal, 1)
    return { ok: true, message: '流水已作废，已生成反向流水与冲销凭证 ' + reversal.voucherNo + '。', id: reversal.id }
  }

  function importStatements(input: TreasuryImportInput): TreasuryActionResult {
    if (!accountMap.value.has(input.accountId)) return fail('请选择有效的资金账户。')
    if (!input.rows.length) return fail('没有可导入的有效行。')
    if (importedFileNames.value.includes(input.fileName)) return fail('该文件已导入，请勿重复提交。')
    const batchId = 'IMP-' + (3000 + nextBatchSeq.value)
    nextBatchSeq.value += 1
    const statementIds: string[] = []
    input.rows.forEach((row) => {
      const id = 'STM-' + (2700 + nextStatementSeq.value)
      nextStatementSeq.value += 1
      statementIds.push(id)
      statements.value.unshift({
        id,
        accountId: input.accountId,
        date: row.date,
        summary: row.summary,
        amount: round2(row.amount),
        direction: row.direction,
        status: 'unmatched',
        matchedAmount: 0,
        matches: [],
        importBatchId: batchId
      })
    })
    importBatches.value.unshift({
      id: batchId,
      accountId: input.accountId,
      fileName: input.fileName,
      importedAt: nowStamp(),
      validCount: input.rows.length,
      problemCount: input.problemCount,
      statementIds
    })
    importedFileNames.value.push(input.fileName)
    return {
      ok: true,
      message: '已导入 ' + input.rows.length + ' 条对账单流水，问题行 ' + input.problemCount + ' 行未入账。',
      id: batchId,
      ids: statementIds
    }
  }

  function statementRemaining(row: TreasuryStatementRow) {
    return round2(Math.max(0, row.amount - row.matchedAmount))
  }

  function flowRemaining(flowId: string) {
    const flow = flowMap.value.get(flowId)
    if (!flow) return 0
    const matched = statements.value.reduce((total, row) => {
      return total + row.matches
        .filter(match => match.flowId === flowId)
        .reduce((sum, match) => sum + match.amount, 0)
    }, 0)
    return round2(Math.max(0, flow.amount - matched))
  }

  function statementsForAccount(accountId: string) {
    return statements.value.filter(row => row.accountId === accountId)
  }

  function flowsForAccount(accountId: string) {
    return flows.value.filter(flow => flow.accountId === accountId)
  }

  function matchableFlows(row: TreasuryStatementRow) {
    return flows.value.filter((flow) => {
      return flow.status === 'posted'
        && flow.accountId === row.accountId
        && flow.direction === row.direction
        && flowRemaining(flow.id) > 0.004
    })
  }

  function outstandingFor(accountId: string, cutoff?: string) {
    return round2(statementsForAccount(accountId)
      .filter(row => row.status !== 'excluded' && row.status !== 'matched')
      .filter(row => !cutoff || row.date <= cutoff)
      .reduce((total, row) => {
        const remaining = statementRemaining(row)
        const signed = row.direction === 'in' ? remaining : -remaining
        return total + signed
      }, 0))
  }

  function matchStatement(statementId: string, input: TreasuryMatchInput, actor: string): TreasuryActionResult {
    const statement = statementMap.value.get(statementId)
    if (!statement) return fail('对账单行不存在。')
    if (statement.status === 'excluded') return fail('该行已排除，请先恢复后再匹配。')
    if (statement.status === 'matched') return fail('该行已匹配完成，无需继续匹配。')
    const amount = round2(input.amount)
    if (!Number.isFinite(amount) || amount <= 0) return fail('匹配金额需为大于 0 的数字。')
    const remaining = statementRemaining(statement)
    if (amount - remaining > 0.005) {
      return fail('匹配金额超过该行剩余金额（剩余 ' + remaining.toFixed(2) + '）。')
    }
    let flowId = input.flowId
    if (input.kind === 'flow') {
      if (!flowId) return fail('请选择要匹配的已过账流水。')
      const flow = flowMap.value.get(flowId)
      if (!flow) return fail('所选流水不存在。')
      if (flow.status !== 'posted') return fail('仅已过账流水可参与匹配。')
      if (flow.accountId !== statement.accountId) return fail('流水资金账户与对账单账户不一致。')
      if (flow.direction !== statement.direction) return fail('流水方向与对账单行方向不一致。')
      const left = flowRemaining(flow.id)
      if (amount - left > 0.005) {
        return fail('所选流水剩余可匹配金额不足（剩余 ' + left.toFixed(2) + '）。')
      }
    } else {
      const createdId = 'F-' + (2700 + nextFlowSeq.value)
      nextFlowSeq.value += 1
      const created: TreasuryFlow = {
        id: createdId,
        type: input.kind === 'other-income' ? 'other-income' : 'expense',
        date: statement.date,
        amount,
        direction: statement.direction,
        accountId: statement.accountId,
        counterparty: statement.summary,
        summary: '对账单带入：' + statement.summary,
        status: 'posted',
        maker: actor,
        createdAt: nowStamp(),
        postedAt: nowStamp(),
        voucherNo: nextVoucherNo()
      }
      flows.value.unshift(created)
      applyFlowToBalance(created, 1)
      flowId = created.id
    }
    const matchId = 'M-' + (9000 + nextMatchSeq.value)
    nextMatchSeq.value += 1
    const label = input.kind === 'flow'
      ? ((flowMap.value.get(flowId ?? '')?.id ?? flowId) + ' ' + (flowMap.value.get(flowId ?? '')?.summary ?? ''))
      : treasuryMatchKindLabels[input.kind]
    const match: TreasuryStatementMatch = {
      id: matchId,
      kind: input.kind,
      flowId,
      amount,
      label,
      createdAt: nowStamp()
    }
    statement.matches.push(match)
    statement.matchedAmount = round2(statement.matchedAmount + amount)
    statement.status = statement.matchedAmount >= statement.amount - 0.005 ? 'matched' : 'partial'
    return { ok: true, message: '匹配成功，已匹配 ' + amount.toFixed(2) + ' 元。', id: matchId }
  }

  function excludeStatement(id: string, reason: string): TreasuryActionResult {
    const statement = statementMap.value.get(id)
    if (!statement) return fail('对账单行不存在。')
    if (statement.status === 'excluded') return fail('该行已排除。')
    if (statement.matchedAmount > 0) return fail('该行已有关联匹配金额，请先完成匹配处理后再排除。')
    const note = reason.trim()
    if (!note) return fail('请填写排除原因。')
    statement.status = 'excluded'
    statement.excludeReason = note
    return { ok: true, message: '该行已排除，不计入未达账项。', id }
  }

  function includeStatement(id: string): TreasuryActionResult {
    const statement = statementMap.value.get(id)
    if (!statement) return fail('对账单行不存在。')
    if (statement.status !== 'excluded') return fail('该行当前不在排除状态。')
    statement.excludeReason = undefined
    statement.status = statement.matchedAmount >= statement.amount - 0.005
      ? 'matched'
      : statement.matchedAmount > 0 ? 'partial' : 'unmatched'
    return { ok: true, message: '该行已恢复参与匹配。', id }
  }

  function reconciliationDraft(accountId: string) {
    return reconciliations.value.find(record => record.accountId === accountId && record.status === 'draft') ?? null
  }

  function nextRecordId() {
    const id = 'REC-2026-' + (2700 + nextRecordSeq.value)
    nextRecordSeq.value += 1
    return id
  }

  function saveReconciliation(input: TreasuryReconciliationInput, actor: string): TreasuryActionResult {
    const account = accountMap.value.get(input.accountId)
    if (!account) return fail('请选择有效的资金账户。')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.cutoff)) return fail('请选择对账截止日期。')
    if (!Number.isFinite(input.bankBalance)) return fail('请填写有效的银行期末余额。')
    const bookBalance = round2(account.balance)
    const outstanding = outstandingFor(account.id, input.cutoff)
    const difference = round2(input.bankBalance - round2(bookBalance + outstanding))
    const accountStatements = statementsForAccount(account.id)
    const statementCount = accountStatements.length
    const matchedStatementCount = accountStatements.filter(row => row.status === 'matched').length
    const stamp = nowStamp()
    const draft = reconciliations.value.find(record => record.accountId === account.id && record.status === 'draft')
    if (draft) {
      draft.cutoff = input.cutoff
      draft.bankBalance = round2(input.bankBalance)
      draft.bookBalance = bookBalance
      draft.outstanding = outstanding
      draft.difference = difference
      draft.maker = actor || draft.maker
      draft.savedAt = stamp
      draft.statementCount = statementCount
      draft.matchedStatementCount = matchedStatementCount
      return { ok: true, message: '待完成对账记录已更新。', id: draft.id }
    }
    const id = nextRecordId()
    reconciliations.value.unshift({
      id,
      accountId: account.id,
      cutoff: input.cutoff,
      bankBalance: round2(input.bankBalance),
      bookBalance,
      outstanding,
      difference,
      status: 'draft',
      maker: actor,
      createdAt: stamp,
      savedAt: stamp,
      statementCount,
      matchedStatementCount
    })
    return { ok: true, message: '待完成对账记录已保存，差异归零后可由复核人确认。', id }
  }

  function cancelReconciliation(accountId: string): TreasuryActionResult {
    const index = reconciliations.value.findIndex(record => record.accountId === accountId && record.status === 'draft')
    if (index < 0) return fail('该账户没有待完成的对账记录。')
    reconciliations.value.splice(index, 1)
    return { ok: true, message: '待完成对账记录已取消。' }
  }

  function confirmReconciliation(recordId: string, actor: string): TreasuryActionResult {
    const record = reconciliations.value.find(item => item.id === recordId)
    if (!record) return fail('对账记录不存在。')
    if (record.status !== 'draft') return fail('仅待完成对账记录可以确认。')
    const account = accountMap.value.get(record.accountId)
    if (!account) return fail('对账账户不存在。')
    const bookBalance = round2(account.balance)
    const cutoff = /^\d{4}-\d{2}-\d{2}$/.test(record.cutoff) ? record.cutoff : undefined
    const outstanding = outstandingFor(account.id, cutoff)
    const difference = round2(record.bankBalance - round2(bookBalance + outstanding))
    if (Math.abs(difference) >= 0.005) {
      return fail('账面与银行余额仍有差异（' + difference.toFixed(2) + '），差异归零后才能确认。')
    }
    if (actor === record.maker) return fail('复核人不能是制单人，请切换演示身份。')
    record.bookBalance = bookBalance
    record.outstanding = outstanding
    record.difference = difference
    record.status = 'completed'
    record.reviewer = actor
    record.completedAt = nowStamp()
    const accountStatements = statementsForAccount(account.id)
    record.statementCount = accountStatements.length
    record.matchedStatementCount = accountStatements.filter(row => row.status === 'matched').length
    return { ok: true, message: '对账已独立复核确认。', id: record.id }
  }

  function undoReconciliation(recordId: string, actor: string, reason: string): TreasuryActionResult {
    const record = reconciliations.value.find(item => item.id === recordId)
    if (!record) return fail('对账记录不存在。')
    if (record.status !== 'completed') return fail('仅已完成的对账可以撤销。')
    const latest = latestCompleted.value
    if (!latest || latest.id !== record.id) return fail('仅可撤销最近一次已完成的对账。')
    const note = reason.trim()
    if (!note) return fail('请填写撤销原因。')
    record.status = 'undone'
    record.undoReason = note
    record.undoneAt = nowStamp()
    record.undoneBy = actor
    return { ok: true, message: '最近一次对账已撤销，原因已保留。', id: record.id }
  }

  const latestCompleted = computed(() => reconciliations.value
    .filter(record => record.status === 'completed')
    .sort((left, right) => (right.completedAt ?? '').localeCompare(left.completedAt ?? ''))[0] ?? null)

  return {
    accounts,
    flows,
    statements,
    importBatches,
    importedFileNames,
    reconciliations,
    accountMap,
    flowMap,
    statementMap,
    latestCompleted,
    accountName,
    setDefaultAccount,
    createAccount,
    createFlow,
    updateFlow,
    removeFlow,
    submitFlow,
    approveFlow,
    rejectFlow,
    voidFlow,
    importStatements,
    statementRemaining,
    flowRemaining,
    statementsForAccount,
    flowsForAccount,
    matchableFlows,
    outstandingFor,
    matchStatement,
    excludeStatement,
    includeStatement,
    reconciliationDraft,
    saveReconciliation,
    cancelReconciliation,
    confirmReconciliation,
    undoReconciliation
  }
})
