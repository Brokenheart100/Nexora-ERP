export type SetupStepId = 'company' | 'book' | 'chart' | 'tax'

export interface SetupSnapshot {
  settingsVersion: number
  bookInitialized: boolean
  taxConfigured: boolean
}

export interface SetupStep {
  id: SetupStepId
  label: string
  done: boolean
  optional: boolean
}

/** Progress is derived from server state so a skipped wizard resumes where it stopped. */
export function setupSteps(snapshot: SetupSnapshot): SetupStep[] {
  return [
    { id: 'company', label: '公司资料', done: snapshot.settingsVersion > 0, optional: false },
    { id: 'book', label: '会计年度与开账', done: snapshot.bookInitialized, optional: false },
    { id: 'chart', label: '科目模板', done: snapshot.bookInitialized, optional: false },
    { id: 'tax', label: '税制', done: snapshot.taxConfigured, optional: true },
  ]
}

export function setupComplete(snapshot: SetupSnapshot): boolean {
  return setupSteps(snapshot).every(step => step.optional || step.done)
}

/** First unfinished required step; when everything is done the last step is returned for review. */
export function resumeStepIndex(snapshot: SetupSnapshot): number {
  const steps = setupSteps(snapshot)
  const pending = steps.findIndex(step => !step.optional && !step.done)
  return pending === -1 ? steps.length - 1 : pending
}
