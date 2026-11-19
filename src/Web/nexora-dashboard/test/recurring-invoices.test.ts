import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useRecurringInvoicesStore, RECURRING_DEMO_TODAY } from '../app/stores/recurringInvoices'
import { useReceivablesStore } from '../app/stores/receivables'

describe('recurring invoices store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('seeds plans, exposes the next dates and the pause/resume version trail', () => {
    const store = useRecurringInvoicesStore()
    expect(store.plans).toHaveLength(5)
    expect(store.activeCount).toBe(4)
    expect(store.pausedCount).toBe(1)

    const plan = store.planOf('RCP-2026-001')!
    expect(plan.nextRunAt).toBe(RECURRING_DEMO_TODAY)
    expect(store.previewDates(plan, 3)).toEqual(['2026-11-19', '2026-12-19', '2027-01-19'])

    const paused = store.togglePlan(plan.id)
    expect(paused.ok).toBe(true)
    expect(paused.plan?.status).toBe('paused')
    expect(paused.plan?.version).toBe(5)

    const resumed = store.togglePlan(plan.id)
    expect(resumed.ok).toBe(true)
    expect(resumed.plan?.status).toBe('active')
    expect(resumed.plan?.version).toBe(6)
    expect(resumed.plan?.nextRunAt).toBe(RECURRING_DEMO_TODAY)
  })

  it('generates one draft invoice per day and reports a duplicate on repeat', () => {
    const store = useRecurringInvoicesStore()
    const receivables = useReceivablesStore()
    const before = receivables.invoices.length

    const first = store.runPlan('RCP-2026-001', RECURRING_DEMO_TODAY)
    expect(first.ok).toBe(true)
    expect(first.duplicate).toBeUndefined()
    expect(first.invoiceId).toMatch(/^INV-2026-\d{4}$/)
    expect(receivables.invoices).toHaveLength(before + 1)

    const invoice = receivables.invoiceById(first.invoiceId!)!
    expect(invoice.status).toBe('draft')
    expect(invoice.sourceScheduleId).toBe('RCP-2026-001')
    expect(Number(invoice.amount)).toBe(14464)
    expect(invoice.dueAt).toBe('2026-12-19')

    const plan = store.planOf('RCP-2026-001')!
    expect(plan.lastRunAt).toBe(RECURRING_DEMO_TODAY)
    expect(plan.nextRunAt).toBe('2026-12-19')
    expect(plan.version).toBe(5)

    const duplicate = store.runPlan('RCP-2026-001', RECURRING_DEMO_TODAY)
    expect(duplicate.ok).toBe(true)
    expect(duplicate.duplicate).toBe(true)
    expect(duplicate.invoiceId).toBe(first.invoiceId)
    expect(receivables.invoices).toHaveLength(before + 1)
    expect(store.historyFor('RCP-2026-001').filter(item => item.scheduledOn === RECURRING_DEMO_TODAY)).toHaveLength(1)
  })

  it('blocks a period that is not open and keeps the pending reason and next date', () => {
    const store = useRecurringInvoicesStore()
    const plan = store.planOf('RCP-2026-005')!
    expect(plan.nextRunAt).toBe('2026-12-01')

    const blocked = store.runPlan(plan.id, '2026-12-01')
    expect(blocked.ok).toBe(false)
    expect(blocked.blocked).toBe(true)
    expect(blocked.message).toContain('期间尚未开启')
    expect(store.planOf(plan.id)?.nextRunAt).toBe('2026-12-01')
    expect(store.planOf(plan.id)?.pendingReason).toContain('2026-12')
    expect(store.historyFor(plan.id)[0]?.status).toBe('blocked')
  })

  it('creates and edits a plan, recalculating the next run date and version', () => {
    const store = useRecurringInvoicesStore()
    const created = store.createPlan({
      workspaceId: 'ws-south',
      customerName: '杭州云杉科技有限公司',
      serviceId: 'svc-backup',
      serviceName: '数据备份服务',
      quantity: 2,
      unitPrice: 9000,
      intervalMonths: 3,
      dueDays: 30,
      firstOn: '2027-01-05',
      owner: '李婉'
    })
    expect(created.ok).toBe(true)
    expect(created.plan?.id).toBe('RCP-2026-006')
    expect(created.plan?.workspaceId).toBe('ws-south')
    expect(created.plan?.nextRunAt).toBe('2027-01-05')
    expect(created.plan?.version).toBe(1)

    const updated = store.updatePlan('RCP-2026-006', {
      customerName: '杭州云杉科技有限公司',
      serviceId: 'svc-backup',
      serviceName: '数据备份服务',
      quantity: 2,
      unitPrice: 9000,
      intervalMonths: 6,
      dueDays: 45,
      firstOn: '2026-12-01',
      owner: '李婉'
    })
    expect(updated.ok).toBe(true)
    expect(updated.plan?.nextRunAt).toBe('2026-12-01')
    expect(updated.plan?.version).toBe(2)

    const invalid = store.createPlan({
      customerName: '杭州云杉科技有限公司',
      serviceId: 'svc-backup',
      serviceName: '数据备份服务',
      quantity: 0,
      unitPrice: 9000,
      intervalMonths: 1,
      dueDays: 30,
      firstOn: '2026-12-01',
      owner: '李婉'
    })
    expect(invalid.ok).toBe(false)
    expect(invalid.message).toContain('数量必须大于 0')
  })

  it('skips a due date and moves the next run date forward', () => {
    const store = useRecurringInvoicesStore()
    const plan = store.planOf('RCP-2026-004')!
    expect(plan.nextRunAt).toBe('2026-12-08')

    const skipped = store.skipPlan(plan.id, '2026-12-08')
    expect(skipped.ok).toBe(true)
    expect(store.historyFor(plan.id)[0]?.status).toBe('skipped')
    expect(store.planOf(plan.id)?.nextRunAt).toBe('2027-01-08')
    expect(store.planOf(plan.id)?.version).toBe(3)

    const repeat = store.skipPlan(plan.id, '2026-12-08')
    expect(repeat.ok).toBe(false)
    expect(repeat.message).toContain('不能重复操作')
  })
})
