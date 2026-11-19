import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type {
  Invoice,
  RecurringIntervalMonths,
  RecurringInvoiceOccurrence,
  RecurringInvoicePlan
} from '~/mocks'
import {
  recurringInvoiceOccurrences,
  recurringInvoicePlans
} from '~/mocks'
import { useReceivablesStore } from './receivables'

/** 演示环境的固定今天，保证下次执行日与验收结果稳定。 */
export const RECURRING_DEMO_TODAY = '2026-11-19'

export interface RecurringPlanInput {
  workspaceId?: string
  customerName: string
  serviceId: string
  serviceName: string
  quantity: number
  unitPrice: number
  intervalMonths: RecurringIntervalMonths
  dueDays: number
  firstOn: string
  endsOn?: string
  owner: string
}

export interface RecurringActionResult {
  ok: boolean
  message: string
  duplicate?: boolean
  blocked?: boolean
  plan?: RecurringInvoicePlan
  occurrence?: RecurringInvoiceOccurrence
  invoiceId?: string
}

function pad(value: number) {
  return String(value).padStart(2, '0')
}

function nowText() {
  const date = new Date()
  return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) + ' ' + pad(date.getHours()) + ':' + pad(date.getMinutes())
}

function parseDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  if (date.getFullYear() !== Number(match[1]) || date.getMonth() !== Number(match[2]) - 1 || date.getDate() !== Number(match[3])) return null
  return date
}

function formatDate(date: Date) {
  return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate())
}

export function addMonths(value: string, months: number) {
  const date = parseDate(value)
  if (!date) return value
  const day = date.getDate()
  const next = new Date(date.getFullYear(), date.getMonth() + months, 1)
  const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate()
  next.setDate(Math.min(day, lastDay))
  return formatDate(next)
}

export function addDays(value: string, days: number) {
  const date = parseDate(value)
  if (!date) return value
  date.setDate(date.getDate() + days)
  return formatDate(date)
}

function nextScheduledAfter(firstOn: string, intervalMonths: number, on: string, endsOn?: string) {
  let cursor = firstOn
  let guard = 0
  while (cursor <= on && guard < 600) {
    cursor = addMonths(cursor, intervalMonths)
    guard += 1
  }
  if (endsOn && cursor > endsOn) return null
  return cursor
}

function nextScheduledOnOrAfter(firstOn: string, intervalMonths: number, on: string, endsOn?: string) {
  let cursor = firstOn
  let guard = 0
  while (cursor < on && guard < 600) {
    cursor = addMonths(cursor, intervalMonths)
    guard += 1
  }
  if (endsOn && cursor > endsOn) return null
  return cursor
}

function planAmount(plan: RecurringInvoicePlan) {
  return plan.quantity * plan.unitPrice
}

export const useRecurringInvoicesStore = defineStore('recurring-invoices', () => {
  const rows = ref<RecurringInvoicePlan[]>(structuredClone(recurringInvoicePlans))
  const history = ref<RecurringInvoiceOccurrence[]>(structuredClone(recurringInvoiceOccurrences))

  const plans = computed(() => rows.value)
  const occurrences = computed(() => history.value)
  const activeCount = computed(() => rows.value.filter(plan => plan.status === 'active').length)
  const pausedCount = computed(() => rows.value.filter(plan => plan.status === 'paused').length)

  function planOf(planId: string) {
    return rows.value.find(plan => plan.id === planId)
  }

  function historyFor(planId: string) {
    return history.value
      .filter(item => item.planId === planId)
      .slice()
      .sort((left, right) => right.scheduledOn.localeCompare(left.scheduledOn))
  }

  function nextId(prefix: string, ids: string[], digits = 4) {
    const max = ids.reduce((value, id) => {
      const parsed = Number(id.slice(prefix.length))
      return Number.isFinite(parsed) ? Math.max(value, parsed) : value
    }, 0)
    return prefix + String(max + 1).padStart(digits, '0')
  }

  function previewDates(plan: RecurringInvoicePlan, count = 6) {
    const dates: string[] = []
    let cursor = plan.nextRunAt ?? nextScheduledOnOrAfter(plan.firstOn, plan.intervalMonths, RECURRING_DEMO_TODAY, plan.endsOn)
    let guard = 0
    while (cursor && dates.length < count && guard < 60) {
      if (plan.endsOn && cursor > plan.endsOn) break
      dates.push(cursor)
      cursor = nextScheduledAfter(cursor, plan.intervalMonths, cursor, plan.endsOn)
      guard += 1
    }
    return dates
  }

  function validateInput(input: RecurringPlanInput) {
    if (!input.customerName.trim()) return '请选择客户。'
    if (!input.serviceId) return '请选择服务项目。'
    if (!Number.isFinite(input.quantity) || input.quantity <= 0) return '数量必须大于 0。'
    if (!Number.isFinite(input.unitPrice) || input.unitPrice < 0) return '单价不能为负数。'
    if (!parseDate(input.firstOn)) return '请填写有效的首期日期。'
    if (input.endsOn && !parseDate(input.endsOn)) return '请填写有效的结束日期。'
    if (input.endsOn && input.endsOn < input.firstOn) return '结束日期不能早于首期日期。'
    if (!Number.isFinite(input.dueDays) || input.dueDays < 0) return '付款账期不能为负数。'
    return ''
  }

  function createPlan(input: RecurringPlanInput): RecurringActionResult {
    const error = validateInput(input)
    if (error) return { ok: false, message: error }
    const id = nextId('RCP-2026-', rows.value.map(plan => plan.id), 3)
    const nextRunAt = nextScheduledOnOrAfter(input.firstOn, input.intervalMonths, RECURRING_DEMO_TODAY, input.endsOn)
    const plan: RecurringInvoicePlan = {
      id,
      workspaceId: input.workspaceId ?? 'ws-hq',
      customerName: input.customerName.trim(),
      serviceId: input.serviceId,
      serviceName: input.serviceName,
      quantity: input.quantity,
      unitPrice: input.unitPrice,
      intervalMonths: input.intervalMonths,
      dueDays: input.dueDays,
      firstOn: input.firstOn,
      ...(input.endsOn ? { endsOn: input.endsOn } : {}),
      nextRunAt,
      lastRunAt: null,
      status: 'active',
      version: 1,
      owner: input.owner,
      createdAt: RECURRING_DEMO_TODAY,
      updatedAt: RECURRING_DEMO_TODAY
    }
    rows.value.unshift(plan)
    return { ok: true, message: '定期开票计划 ' + plan.id + ' 已创建，下次执行日 ' + (plan.nextRunAt ?? '无') + '。', plan }
  }

  function updatePlan(planId: string, input: RecurringPlanInput): RecurringActionResult {
    const plan = planOf(planId)
    if (!plan) return { ok: false, message: '计划不存在或已被移除。' }
    const error = validateInput(input)
    if (error) return { ok: false, message: error }
    plan.customerName = input.customerName.trim()
    plan.serviceId = input.serviceId
    plan.serviceName = input.serviceName
    plan.quantity = input.quantity
    plan.unitPrice = input.unitPrice
    plan.intervalMonths = input.intervalMonths
    plan.dueDays = input.dueDays
    plan.firstOn = input.firstOn
    if (input.endsOn) plan.endsOn = input.endsOn
    else delete plan.endsOn
    plan.nextRunAt = nextScheduledOnOrAfter(input.firstOn, input.intervalMonths, RECURRING_DEMO_TODAY, input.endsOn)
    plan.pendingReason = undefined
    plan.version += 1
    plan.updatedAt = RECURRING_DEMO_TODAY
    return { ok: true, message: '计划已更新至版本 v' + plan.version + '，下次执行日 ' + (plan.nextRunAt ?? '无') + '。', plan }
  }

  function togglePlan(planId: string): RecurringActionResult {
    const plan = planOf(planId)
    if (!plan) return { ok: false, message: '计划不存在或已被移除。' }
    if (plan.status === 'active') {
      plan.status = 'paused'
      plan.version += 1
      plan.updatedAt = RECURRING_DEMO_TODAY
      return { ok: true, message: '计划已暂停，恢复后会重新计算下次执行日。', plan }
    }
    plan.status = 'active'
    plan.nextRunAt = nextScheduledOnOrAfter(plan.firstOn, plan.intervalMonths, RECURRING_DEMO_TODAY, plan.endsOn)
    plan.version += 1
    plan.updatedAt = RECURRING_DEMO_TODAY
    return { ok: true, message: '计划已恢复，下次执行日 ' + (plan.nextRunAt ?? '无') + '。', plan }
  }

  function findOccurrence(planId: string, scheduledOn: string) {
    return history.value.find(item => item.planId === planId && item.scheduledOn === scheduledOn)
  }

  function runPlan(planId: string, on: string): RecurringActionResult {
    const plan = planOf(planId)
    if (!plan) return { ok: false, message: '计划不存在或已被移除。' }
    if (plan.status === 'paused') return { ok: false, message: '计划已暂停，请恢复后再执行。' }
    if (!parseDate(on)) return { ok: false, message: '请填写有效的执行日期。' }
    if (plan.endsOn && on > plan.endsOn) return { ok: false, message: '执行日期已超过计划结束日期。' }
    const existing = findOccurrence(planId, on)
    if (existing?.status === 'executed') {
      return {
        ok: true,
        duplicate: true,
        message: '该到期日已生成发票 ' + (existing.invoiceId ?? '') + '，未重复生成。',
        plan,
        occurrence: existing,
        invoiceId: existing.invoiceId
      }
    }
    if (existing?.status === 'skipped') return { ok: false, message: '该到期日已跳过，不能再次执行。', plan, occurrence: existing }
    if (plan.blockedPeriods?.includes(on.slice(0, 7))) {
      const note = on.slice(0, 7) + ' 会计期间尚未开启，已保留待处理原因与下次执行日。'
      let occurrence = existing
      if (!occurrence) {
        occurrence = {
          id: nextId('OCC-2026-', history.value.map(item => item.id)),
          planId: plan.id,
          workspaceId: plan.workspaceId,
          scheduledOn: on,
          status: 'blocked',
          version: plan.version,
          actedAt: nowText(),
          note
        }
        history.value.unshift(occurrence)
      } else {
        occurrence.status = 'blocked'
        occurrence.note = note
        occurrence.actedAt = nowText()
      }
      plan.pendingReason = note
      plan.updatedAt = RECURRING_DEMO_TODAY
      return { ok: false, blocked: true, message: note, plan, occurrence }
    }

    const receivables = useReceivablesStore()
    const invoiceId = nextId('INV-2026-', receivables.invoices.map(invoice => invoice.id))
    const net = planAmount(plan)
    const invoice: Invoice = {
      id: invoiceId,
      workspaceId: plan.workspaceId,
      customerName: plan.customerName,
      status: 'draft',
      issuedAt: on,
      dueAt: addDays(on, plan.dueDays),
      amount: (net * 1.13).toFixed(2),
      taxAmount: (net * 0.13).toFixed(2),
      sourceOrderId: '',
      sourceScheduleId: plan.id,
      lines: [
        {
          lineNo: 1,
          sku: plan.serviceId,
          name: plan.serviceName,
          quantity: plan.quantity,
          unitPrice: plan.unitPrice.toFixed(2),
          taxRate: '13%',
          amount: net.toFixed(2)
        }
      ],
      deliveries: [],
      shareToken: 'demo-' + invoiceId.toLowerCase(),
      updatedAt: on
    }
    receivables.addInvoice(invoice)
    const occurrence: RecurringInvoiceOccurrence = {
      id: nextId('OCC-2026-', history.value.map(item => item.id)),
      planId: plan.id,
      workspaceId: plan.workspaceId,
      scheduledOn: on,
      status: 'executed',
      version: plan.version,
      invoiceId,
      actedAt: nowText()
    }
    history.value.unshift(occurrence)
    plan.lastRunAt = on
    plan.nextRunAt = nextScheduledAfter(plan.firstOn, plan.intervalMonths, on, plan.endsOn)
    plan.pendingReason = undefined
    plan.version += 1
    plan.updatedAt = RECURRING_DEMO_TODAY
    return {
      ok: true,
      message: '已按计划生成待复核发票 ' + invoiceId + '，下次执行日 ' + (plan.nextRunAt ?? '无') + '。',
      plan,
      occurrence,
      invoiceId
    }
  }

  function skipPlan(planId: string, on: string): RecurringActionResult {
    const plan = planOf(planId)
    if (!plan) return { ok: false, message: '计划不存在或已被移除。' }
    if (plan.status === 'paused') return { ok: false, message: '计划已暂停，请恢复后再操作。' }
    if (!parseDate(on)) return { ok: false, message: '请填写有效的到期日。' }
    const existing = findOccurrence(planId, on)
    if (existing) return { ok: false, message: '该到期日已有' + (existing.status === 'executed' ? '开票' : existing.status === 'skipped' ? '跳过' : '阻断') + '记录，不能重复操作。', plan, occurrence: existing }
    const occurrence: RecurringInvoiceOccurrence = {
      id: nextId('OCC-2026-', history.value.map(item => item.id)),
      planId: plan.id,
      workspaceId: plan.workspaceId,
      scheduledOn: on,
      status: 'skipped',
      version: plan.version,
      actedAt: nowText(),
      note: '手动跳过该到期日。'
    }
    history.value.unshift(occurrence)
    plan.nextRunAt = nextScheduledAfter(plan.firstOn, plan.intervalMonths, on, plan.endsOn)
    plan.pendingReason = undefined
    plan.version += 1
    plan.updatedAt = RECURRING_DEMO_TODAY
    return { ok: true, message: '已跳过 ' + on + '，下次执行日 ' + (plan.nextRunAt ?? '无') + '。', plan, occurrence }
  }

  function reset() {
    rows.value = structuredClone(recurringInvoicePlans)
    history.value = structuredClone(recurringInvoiceOccurrences)
  }

  return {
    plans,
    occurrences,
    activeCount,
    pausedCount,
    historyFor,
    planOf,
    previewDates,
    createPlan,
    updatePlan,
    togglePlan,
    runPlan,
    skipPlan,
    reset
  }
})
