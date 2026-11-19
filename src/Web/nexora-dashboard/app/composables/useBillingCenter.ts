import { computed, ref, watch } from 'vue'
import type {
  BillingCenterInvoice,
  BillingCenterSeed,
  BillingCycle,
  BillingEntitlementRow,
  BillingInvoiceStatus,
  BillingQuote
} from '~/mocks/billingCenter'
import {
  BILLING_DEMO_TODAY,
  billingAddDays,
  billingCycleDays,
  billingCycleLabels,
  billingDaysBetween,
  billingEntitlementStateLabels,
  billingPlanById,
  billingPlanPrice,
  billingRoundMoney,
  billingTestCards,
  buildBillingEntitlementRows,
  createBillingCenterSeedState,
  nextBillingInvoiceNumber
} from '~/mocks/billingCenter'

export interface BillingUsageRow {
  key: string
  label: string
  used: number
  limit: number
  suffix: string
  percent: number
}

export interface BillingUsageWarning {
  key: string
  title: string
  description: string
  color: 'warning' | 'error'
}

export interface BillingWorkspaceSummary {
  id: string
  name: string
  planName: string
  cycleLabel: string
  seatsUsed: number
  seatLimit: number
}

export interface BillingActionResult {
  ok: boolean
  message: string
  invoice?: BillingCenterInvoice
}

export interface BillingPaymentResult {
  ok: boolean
  status?: BillingInvoiceStatus
  message: string
}

/**
 * C21 计费中心：套餐报价、账单、测试结账、模块权益与工作区切换。
 * 状态存放在 useState，刷新页面后恢复 app/mocks/billingCenter.ts 的种子。
 * 只操作本地演示数据，不发起真实支付。
 */
export function useBillingCenter() {
  const org = useOrganizationStore()
  const session = useSessionStore()
  const { workspaces, activeWorkspaceId } = useMockWorkspace()

  const stateMap = useState<Record<string, BillingCenterSeed>>('billing-center-state', createBillingCenterSeedState)

  const subscription = computed<BillingCenterSeed>(() => stateMap.value[activeWorkspaceId.value] ?? stateMap.value['ws-hq']!)
  const currentPlan = computed(() => billingPlanById(subscription.value.planId))
  const scheduledPlan = computed(() => {
    const scheduled = subscription.value.scheduled
    return scheduled ? billingPlanById(scheduled.planId) : null
  })
  const remainingDays = computed(() => billingDaysBetween(BILLING_DEMO_TODAY, subscription.value.periodEnd))
  const entitlements = computed<BillingEntitlementRow[]>(() => buildBillingEntitlementRows(subscription.value.planId, subscription.value.usage))
  const entitlementWarnings = computed(() => entitlements.value.filter(row => row.state === 'exceeded' || row.state === 'warning'))

  const usageRows = computed<BillingUsageRow[]>(() => {
    const plan = currentPlan.value
    const seed = subscription.value
    const rows = [
      { key: 'seats', label: '成员席位', used: seed.seatsUsed, limit: plan.seatLimit, suffix: '席' },
      { key: 'storage', label: '存储空间', used: seed.storageUsedGb, limit: plan.storageLimitGb, suffix: 'GB' },
      { key: 'invoices', label: '本月发票', used: seed.invoicesUsed, limit: plan.invoiceLimit, suffix: '张' }
    ]
    return rows.map(row => ({
      ...row,
      percent: Math.min(100, Math.round((row.used / row.limit) * 100))
    }))
  })

  const usageWarnings = computed<BillingUsageWarning[]>(() => {
    const warnings: BillingUsageWarning[] = []
    for (const row of usageRows.value) {
      if (row.percent < 80) continue
      warnings.push({
        key: 'usage-' + row.key,
        title: row.label + '已使用 ' + row.percent + '%',
        description: '当前 ' + row.used + ' / ' + row.limit + ' ' + row.suffix + '，建议升级套餐或清理数据。',
        color: row.percent >= 95 ? 'error' : 'warning'
      })
    }
    for (const row of entitlementWarnings.value) {
      warnings.push({
        key: 'entitlement-' + row.key,
        title: row.module + ' · ' + billingEntitlementStateLabels[row.state],
        description: row.usageText + '；套餐限制：' + row.planLimit,
        color: row.state === 'exceeded' ? 'error' : 'warning'
      })
    }
    return warnings
  })

  const workspaceSummaries = computed<BillingWorkspaceSummary[]>(() => workspaces.map((item) => {
    const seed = stateMap.value[item.id]
    const plan = billingPlanById(seed?.planId ?? 'plan-standard')
    return {
      id: item.id,
      name: item.name,
      planName: plan.name,
      cycleLabel: billingCycleLabels[seed?.cycle ?? 'annual'],
      seatsUsed: seed?.seatsUsed ?? 0,
      seatLimit: plan.seatLimit
    }
  }))

  function suggestedTargetPlanId(planId: string) {
    if (planId === 'plan-standard') return 'plan-pro'
    if (planId === 'plan-pro') return 'plan-enterprise'
    return 'plan-standard'
  }

  const targetPlanId = ref(suggestedTargetPlanId(subscription.value.planId))
  const targetCycle = ref<BillingCycle>(subscription.value.cycle)
  const quote = ref<BillingQuote | null>(null)
  const selectedInvoiceId = ref<string | null>(null)

  const canGenerateQuote = computed(() => targetPlanId.value !== subscription.value.planId || targetCycle.value !== subscription.value.cycle)
  const quoteStale = computed(() => {
    const current = quote.value
    if (!current) return false
    const seed = subscription.value
    return current.workspaceId !== activeWorkspaceId.value
      || current.targetPlanId !== targetPlanId.value
      || current.targetCycle !== targetCycle.value
      || current.periodEnd !== seed.periodEnd
      || current.currentPlanId !== seed.planId
      || current.currentCycle !== seed.cycle
  })

  watch(activeWorkspaceId, () => {
    quote.value = null
    selectedInvoiceId.value = null
    targetPlanId.value = suggestedTargetPlanId(subscription.value.planId)
    targetCycle.value = subscription.value.cycle
  })

  function generateQuote(): BillingQuote | null {
    const seed = subscription.value
    if (targetPlanId.value === seed.planId && targetCycle.value === seed.cycle) {
      quote.value = null
      return null
    }
    const current = billingPlanById(seed.planId)
    const target = billingPlanById(targetPlanId.value)
    const days = billingDaysBetween(BILLING_DEMO_TODAY, seed.periodEnd)
    const charge = billingRoundMoney(billingPlanPrice(target, targetCycle.value) * days / billingCycleDays(targetCycle.value))
    const credit = billingRoundMoney(billingPlanPrice(current, seed.cycle) * days / billingCycleDays(seed.cycle))
    const amountDue = billingRoundMoney(Math.max(0, charge - credit))
    const creditRemainder = billingRoundMoney(Math.max(0, credit - charge))
    quote.value = {
      workspaceId: activeWorkspaceId.value,
      currentPlanId: seed.planId,
      currentCycle: seed.cycle,
      targetPlanId: target.id,
      targetCycle: targetCycle.value,
      remainingDays: days,
      periodEnd: seed.periodEnd,
      charge,
      credit,
      amountDue,
      creditRemainder,
      effectiveAt: BILLING_DEMO_TODAY,
      newPeriodStart: BILLING_DEMO_TODAY,
      newPeriodEnd: billingAddDays(BILLING_DEMO_TODAY, billingCycleDays(targetCycle.value)),
      generatedAt: BILLING_DEMO_TODAY,
      revision: [activeWorkspaceId.value, target.id, targetCycle.value, seed.periodEnd].join('|')
    }
    return quote.value
  }

  function discardQuote() {
    quote.value = null
  }

  function applySubscription(invoice: BillingCenterInvoice) {
    const seed = subscription.value
    const planChanged = seed.planId !== invoice.planId || seed.cycle !== invoice.cycle
    seed.planId = invoice.planId
    seed.cycle = invoice.cycle
    seed.status = 'active'
    if (planChanged) {
      seed.effectiveAt = BILLING_DEMO_TODAY
      seed.periodStart = BILLING_DEMO_TODAY
      seed.periodEnd = billingAddDays(BILLING_DEMO_TODAY, billingCycleDays(invoice.cycle))
    } else if (invoice.note?.includes('续费')) {
      seed.periodEnd = billingAddDays(seed.periodEnd, billingCycleDays(invoice.cycle))
    }
    if (seed.scheduled) {
      seed.scheduled = seed.scheduled.planId === seed.planId
        ? null
        : { planId: seed.scheduled.planId, effectiveAt: seed.periodEnd }
    }
    org.changePlan(activeWorkspaceId.value, invoice.planId)
  }

  function confirmQuote(): BillingActionResult {
    const current = quote.value
    if (!current) return { ok: false, message: '请先生成套餐变更报价。' }
    if (quoteStale.value) return { ok: false, message: '套餐或周期已变动，请重新生成报价后再确认。' }
    const seed = subscription.value
    const target = billingPlanById(current.targetPlanId)
    const invoice: BillingCenterInvoice = {
      id: 'binv-' + activeWorkspaceId.value + '-' + Date.now().toString(36),
      workspaceId: activeWorkspaceId.value,
      number: nextBillingInvoiceNumber(),
      planId: target.id,
      cycle: current.targetCycle,
      status: current.amountDue > 0 ? 'pending' : 'paid',
      amount: current.amountDue,
      credit: current.credit,
      createdAt: BILLING_DEMO_TODAY,
      dueAt: billingAddDays(BILLING_DEMO_TODAY, 7),
      note: '套餐变更：' + billingPlanById(current.currentPlanId).name + ' → ' + target.name + '（' + billingCycleLabels[current.targetCycle] + '，按比例）'
    }
    if (current.amountDue === 0) {
      invoice.paidAt = BILLING_DEMO_TODAY
      invoice.paymentMethod = 'credit'
      invoice.reference = 'CREDIT-' + invoice.number.slice(-4)
      applySubscription(invoice)
    }
    seed.invoices.unshift(invoice)
    org.recordAudit(activeWorkspaceId.value, session.user.name, '生成套餐变更账单', invoice.number + ' · ' + target.name)
    quote.value = null
    return {
      ok: true,
      message: current.amountDue > 0
        ? '已生成待支付账单 ' + invoice.number + '，请完成结账。'
        : '抵扣已覆盖全部费用，账单 ' + invoice.number + ' 已结清并立即生效。',
      invoice
    }
  }

  function targetScheduledPlan(): BillingQuote | null {
    const scheduled = subscription.value.scheduled
    if (!scheduled) return null
    targetPlanId.value = scheduled.planId
    targetCycle.value = subscription.value.cycle
    return generateQuote()
  }

  function cancelScheduled(): BillingActionResult {
    const seed = subscription.value
    if (!seed.scheduled) return { ok: false, message: '当前没有待生效的套餐变更。' }
    const name = billingPlanById(seed.scheduled.planId).name
    seed.scheduled = null
    org.recordAudit(activeWorkspaceId.value, session.user.name, '取消待生效套餐', name)
    return { ok: true, message: '已取消待生效的' + name + '，当前周期结束前保持' + currentPlan.value.name + '。' }
  }

  function cancelSubscription(): BillingActionResult {
    const seed = subscription.value
    if (seed.status === 'cancelled') return { ok: false, message: '订阅已处于取消自动续费状态。' }
    seed.status = 'cancelled'
    org.cancelSubscription(activeWorkspaceId.value)
    org.recordAudit(activeWorkspaceId.value, session.user.name, '取消订阅自动续费', currentPlan.value.name)
    return { ok: true, message: '已取消自动续费，当前权益保留至 ' + seed.periodEnd + '。' }
  }

  function restoreSubscription(): BillingActionResult {
    const seed = subscription.value
    if (seed.status === 'active') return { ok: false, message: '订阅已处于生效状态。' }
    seed.status = 'active'
    org.changePlan(activeWorkspaceId.value, seed.planId)
    org.recordAudit(activeWorkspaceId.value, session.user.name, '恢复订阅自动续费', currentPlan.value.name)
    return { ok: true, message: '已恢复自动续费，下次到期日 ' + seed.periodEnd + '。' }
  }

  function findInvoice(invoiceId: string) {
    return subscription.value.invoices.find(item => item.id === invoiceId)
  }

  function referenceTaken(reference: string, invoiceId: string) {
    const normalized = reference.toLowerCase()
    return Object.values(stateMap.value)
      .flatMap(seed => seed.invoices)
      .find(item => item.id !== invoiceId && item.reference?.toLowerCase() === normalized)
  }

  function validateReference(invoiceId: string, reference: string) {
    const trimmed = reference.trim()
    if (!trimmed) return '请填写付款参考号。'
    if (!/^[A-Za-z0-9][A-Za-z0-9-]{5,31}$/.test(trimmed)) return '参考号需为 6–32 位字母、数字或连字符，且以字母或数字开头。'
    const taken = referenceTaken(trimmed, invoiceId)
    if (taken) return '该参考号已用于账单 ' + taken.number + '，请核对银行流水号后重新输入。'
    return ''
  }

  function markInvoicePaid(invoice: BillingCenterInvoice, reference: string, method: 'test-card' | 'manual') {
    invoice.status = 'paid'
    invoice.paidAt = BILLING_DEMO_TODAY
    invoice.paymentMethod = method
    invoice.reference = reference
    delete invoice.failureReason
    applySubscription(invoice)
    org.recordAudit(activeWorkspaceId.value, session.user.name, '支付订阅账单', invoice.number + ' · ' + reference)
  }

  function payWithTestCard(invoiceId: string, cardId: string): BillingPaymentResult {
    const invoice = findInvoice(invoiceId)
    if (!invoice) return { ok: false, message: '账单不存在或已删除，请刷新后重试。' }
    if (invoice.status === 'paid') return { ok: false, message: '该账单已支付，无需重复付款。' }
    const card = billingTestCards.find(item => item.id === cardId) ?? billingTestCards[0]!
    const cardLabel = card.brand + ' 尾号 ' + card.number.slice(-4)
    if (card.behavior === 'processing') {
      invoice.status = 'processing'
      invoice.cardLabel = cardLabel
      delete invoice.failureReason
      org.recordAudit(activeWorkspaceId.value, session.user.name, '发起订阅账单支付', invoice.number + ' · 处理中')
      return { ok: true, status: 'processing', message: '支付处理中（演示未完成），账单保持未完成状态，可稍后继续支付。' }
    }
    if (card.behavior === 'failed') {
      invoice.status = 'failed'
      invoice.cardLabel = cardLabel
      invoice.failureReason = '发卡行拒绝（测试卡 ' + card.number + '）'
      org.recordAudit(activeWorkspaceId.value, session.user.name, '发起订阅账单支付', invoice.number + ' · 支付失败')
      return { ok: true, status: 'failed', message: '支付失败，账单未结清，可更换卡片或登记手工付款。' }
    }
    invoice.cardLabel = cardLabel
    markInvoicePaid(invoice, 'TESTCARD-' + card.number.slice(-4) + '-' + invoice.number.slice(-4), 'test-card')
    return { ok: true, status: 'paid', message: '支付成功，账单已结清，订阅状态与生效时间已同步。' }
  }

  function registerManualPayment(invoiceId: string, reference: string): BillingPaymentResult {
    const invoice = findInvoice(invoiceId)
    if (!invoice) return { ok: false, message: '账单不存在或已删除，请刷新后重试。' }
    if (invoice.status === 'paid') return { ok: false, message: '该账单已支付，无需重复登记。' }
    const error = validateReference(invoiceId, reference)
    if (error) return { ok: false, message: error }
    markInvoicePaid(invoice, reference.trim(), 'manual')
    return { ok: true, status: 'paid', message: '付款已登记，账单结清，订阅状态与生效时间已同步。' }
  }

  function resetDemoData(): BillingActionResult {
    stateMap.value = createBillingCenterSeedState()
    quote.value = null
    selectedInvoiceId.value = null
    targetPlanId.value = suggestedTargetPlanId(subscription.value.planId)
    targetCycle.value = subscription.value.cycle
    org.recordAudit(activeWorkspaceId.value, session.user.name, '恢复计费演示种子', 'billing-center')
    return { ok: true, message: '已恢复计费演示种子数据。' }
  }

  return {
    subscription,
    currentPlan,
    scheduledPlan,
    remainingDays,
    entitlements,
    entitlementWarnings,
    usageRows,
    usageWarnings,
    workspaceSummaries,
    targetPlanId,
    targetCycle,
    quote,
    quoteStale,
    canGenerateQuote,
    selectedInvoiceId,
    generateQuote,
    discardQuote,
    confirmQuote,
    targetScheduledPlan,
    cancelScheduled,
    cancelSubscription,
    restoreSubscription,
    payWithTestCard,
    registerManualPayment,
    validateReference,
    resetDemoData
  }
}
