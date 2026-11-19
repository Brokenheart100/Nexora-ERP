import { describe, expect, it, vi } from 'vitest'
import {
  captureDraft,
  clearDraft,
  draftMaxAgeMs,
  draftStorageKey,
  isDraftRestorable,
  readDraft,
  restoreDraft,
  saveDraft,
  type FormDraft,
} from '../app/utils/shell/formDrafts'

const now = 1_800_000_000_000

function form(html: string): HTMLElement {
  document.body.innerHTML = html
  return document.body
}

describe('captureDraft', () => {
  it('captures named text, checkbox and select controls', () => {
    const root = form(`
      <input name="customer" value="华东客户">
      <input type="checkbox" name="urgent" value="yes" checked>
      <select name="warehouse"><option value="a">A</option><option value="b" selected>B</option></select>
      <textarea name="note">先发货</textarea>
    `)
    const draft = captureDraft(root, '/companies/ws/orders', 'load-1', now)
    expect(draft.path).toBe('/companies/ws/orders')
    expect(draft.savedAt).toBe(now)
    expect(draft.fields).toContainEqual({ key: 'customer', kind: 'value', value: '华东客户', checked: false, selected: [] })
    expect(draft.fields).toContainEqual({ key: 'urgent', kind: 'checked', value: 'yes', checked: true, selected: [] })
    expect(draft.fields).toContainEqual({ key: 'warehouse', kind: 'value', value: 'b', checked: false, selected: ['b'] })
    expect(draft.fields).toContainEqual({ key: 'note', kind: 'value', value: '先发货', checked: false, selected: [] })
  })

  it('skips disabled controls, secrets and controls without a name', () => {
    const root = form(`
      <input name="password" type="password" value="secret">
      <input name="token" type="hidden" value="abc">
      <input name="locked" value="x" disabled>
      <input value="unnamed">
      <input id="identifier" value="by-id">
    `)
    const draft = captureDraft(root, '/join', 'load-1', now)
    expect(draft.fields.map(field => field.key)).toEqual(['identifier'])
  })
})

describe('restoreDraft', () => {
  it('writes values back into a fresh document and emits input events', () => {
    const root = form(`
      <input name="customer">
      <input type="checkbox" name="urgent" value="yes">
      <select name="warehouse"><option value="a">A</option><option value="b">B</option></select>
    `)
    const events = vi.fn()
    root.addEventListener('input', events)
    const draft: FormDraft = {
      path: '/companies/ws/orders',
      pageLoadId: 'previous-load',
      savedAt: now - 5_000,
      fields: [
        { key: 'customer', kind: 'value', value: '华东客户', checked: false, selected: [] },
        { key: 'urgent', kind: 'checked', value: 'yes', checked: true, selected: [] },
        { key: 'warehouse', kind: 'value', value: 'b', checked: false, selected: ['b'] },
      ],
    }
    const restored = restoreDraft(root, draft, 'current-load', now)
    expect(restored).toBe(3)
    expect((root.querySelector('[name="customer"]') as HTMLInputElement).value).toBe('华东客户')
    expect((root.querySelector('[name="urgent"]') as HTMLInputElement).checked).toBe(true)
    expect((root.querySelector('[name="warehouse"]') as HTMLSelectElement).value).toBe('b')
    expect(events).toHaveBeenCalledTimes(3)
  })

  it('does nothing when the draft belongs to this load or has expired', () => {
    const root = form('<input name="customer" value="local">')
    const draft: FormDraft = {
      path: '/companies/ws/orders',
      pageLoadId: 'current-load',
      savedAt: now,
      fields: [{ key: 'customer', kind: 'value', value: 'stale', checked: false, selected: [] }],
    }
    expect(restoreDraft(root, draft, 'current-load', now)).toBe(0)
    expect(restoreDraft(root, { ...draft, pageLoadId: 'previous' }, 'current-load', now + draftMaxAgeMs + 1)).toBe(0)
    expect((root.querySelector('[name="customer"]') as HTMLInputElement).value).toBe('local')
  })
})

describe('isDraftRestorable', () => {
  const field = { key: 'customer', kind: 'value' as const, value: 'x', checked: false, selected: [] }
  const draft: FormDraft = { path: '/x', pageLoadId: 'old', savedAt: now, fields: [field] }

  it('requires a previous document load, content and a bounded age', () => {
    expect(isDraftRestorable(draft, 'new', now)).toBe(true)
    expect(isDraftRestorable(draft, 'old', now)).toBe(false)
    expect(isDraftRestorable({ ...draft, fields: [] }, 'new', now)).toBe(false)
    expect(isDraftRestorable({ ...draft, savedAt: now - draftMaxAgeMs - 1 }, 'new', now)).toBe(false)
    expect(isDraftRestorable({ ...draft, savedAt: now + 120_000 }, 'new', now)).toBe(false)
  })
})

describe('draft storage', () => {
  it('round-trips through session storage per path', () => {
    sessionStorage.clear()
    const draft = captureDraft(form('<input name="a" value="1">'), '/join', 'load-1', now)
    saveDraft(sessionStorage, draft)
    expect(sessionStorage.getItem(draftStorageKey('/join'))).toBeTruthy()
    expect(readDraft(sessionStorage, '/join')).toEqual(draft)
    clearDraft(sessionStorage, '/join')
    expect(readDraft(sessionStorage, '/join')).toBeNull()
  })

  it('skips empty drafts and ignores malformed payloads', () => {
    sessionStorage.clear()
    saveDraft(sessionStorage, { path: '/empty', pageLoadId: 'l', savedAt: now, fields: [] })
    expect(sessionStorage.getItem(draftStorageKey('/empty'))).toBeNull()
    sessionStorage.setItem(draftStorageKey('/broken'), '{not json')
    expect(readDraft(sessionStorage, '/broken')).toBeNull()
    sessionStorage.setItem(draftStorageKey('/shape'), JSON.stringify({ path: '/shape' }))
    expect(readDraft(sessionStorage, '/shape')).toBeNull()
  })
})
