import { describe, expect, it } from 'vitest'
import { resumeStepIndex, setupComplete, setupSteps } from '../app/utils/workspace/workspaceSetup'

describe('setupSteps', () => {
  it('derives company, book and tax progress from server state', () => {
    const fresh = setupSteps({ settingsVersion: 0, bookInitialized: false, taxConfigured: false })
    expect(fresh.map(step => [step.id, step.done])).toEqual([
      ['company', false],
      ['book', false],
      ['chart', false],
      ['tax', false],
    ])
    const saved = setupSteps({ settingsVersion: 3, bookInitialized: true, taxConfigured: true })
    expect(saved.every(step => step.done)).toBe(true)
    expect(saved.filter(step => step.optional).map(step => step.id)).toEqual(['tax'])
  })
})

describe('setupComplete', () => {
  it('treats tax as optional but requires settings and book', () => {
    expect(setupComplete({ settingsVersion: 1, bookInitialized: false, taxConfigured: false })).toBe(false)
    expect(setupComplete({ settingsVersion: 1, bookInitialized: true, taxConfigured: false })).toBe(true)
  })
})

describe('resumeStepIndex', () => {
  it('resumes at the first unfinished required step and ends on the optional tax step', () => {
    expect(resumeStepIndex({ settingsVersion: 0, bookInitialized: false, taxConfigured: false })).toBe(0)
    expect(resumeStepIndex({ settingsVersion: 2, bookInitialized: false, taxConfigured: false })).toBe(1)
    expect(resumeStepIndex({ settingsVersion: 2, bookInitialized: true, taxConfigured: false })).toBe(3)
    expect(resumeStepIndex({ settingsVersion: 2, bookInitialized: true, taxConfigured: true })).toBe(3)
  })
})
