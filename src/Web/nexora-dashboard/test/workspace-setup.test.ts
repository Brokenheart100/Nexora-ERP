import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useWorkspaceSetupStore } from '../app/stores/workspaceSetup'

describe('workspace setup store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('tracks step progress and the next step', () => {
    const setup = useWorkspaceSetupStore()
    expect(setup.progress).toBe(0)
    expect(setup.nextStep).toBe('company')
    expect(setup.isComplete).toBe(false)
    setup.markStep('company')
    setup.markStep('company')
    expect(setup.completedSteps).toEqual(['company'])
    expect(setup.progress).toBe(25)
    expect(setup.nextStep).toBe('fiscal')
  })

  it('stores fiscal settings and clears the deferred marker', () => {
    const setup = useWorkspaceSetupStore()
    setup.defer()
    expect(setup.deferredAt).toContain('2026-')
    setup.setFiscal({
      fiscalYearStart: '2026-01-01',
      fiscalYearEnd: '2026-12-31',
      openingDate: '2026-01-01',
      openingConfirmed: true
    })
    expect(setup.completedSteps).toEqual(['fiscal'])
    expect(setup.openingConfirmed).toBe(true)
    expect(setup.deferredAt).toBe('')
  })

  it('completes all four steps and reports 100 percent', () => {
    const setup = useWorkspaceSetupStore()
    setup.setAccounts('retail')
    setup.setTax('small')
    setup.complete()
    expect(setup.completedSteps).toEqual(['accounts', 'tax', 'company', 'fiscal'])
    expect(setup.progress).toBe(100)
    expect(setup.isComplete).toBe(true)
    expect(setup.completedAt).not.toBe('')
    expect(setup.chartTemplate).toBe('retail')
    expect(setup.taxRegime).toBe('small')
  })

  it('resets to defaults', () => {
    const setup = useWorkspaceSetupStore()
    setup.markStep('company')
    setup.defer()
    setup.reset()
    expect(setup.completedSteps).toEqual([])
    expect(setup.deferredAt).toBe('')
    expect(setup.completedAt).toBe('')
    expect(setup.progress).toBe(0)
    expect(setup.chartTemplate).toBe('standard')
    expect(setup.taxRegime).toBe('general')
    expect(setup.openingConfirmed).toBe(false)
  })
})
