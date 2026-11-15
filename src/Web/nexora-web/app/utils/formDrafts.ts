export type FormControl = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement

export interface DraftField {
  key: string
  kind: 'value' | 'checked'
  value: string
  checked: boolean
  selected: string[]
}

export interface FormDraft {
  path: string
  pageLoadId: string
  savedAt: number
  fields: DraftField[]
}

export const draftMaxAgeMs = 24 * 60 * 60 * 1000

const skippedInputTypes = new Set([
  'password', 'file', 'hidden', 'submit', 'button', 'reset', 'image',
])

function isFormControl(element: Element): element is FormControl {
  return element instanceof HTMLInputElement
    || element instanceof HTMLTextAreaElement
    || element instanceof HTMLSelectElement
}

function isCheckedControl(element: FormControl): element is HTMLInputElement {
  return element instanceof HTMLInputElement && (element.type === 'checkbox' || element.type === 'radio')
}

function controlKey(element: FormControl): string {
  return element.name || element.id
}

/** Captures the editable values of a page so an overlay or reload does not lose them. */
export function captureDraft(
  root: ParentNode,
  path: string,
  pageLoadId: string,
  now = Date.now(),
): FormDraft {
  const fields: DraftField[] = []
  for (const element of Array.from(root.querySelectorAll('input, textarea, select'))) {
    if (!isFormControl(element) || element.disabled) continue
    const key = controlKey(element)
    if (!key) continue
    if (element instanceof HTMLInputElement && skippedInputTypes.has(element.type)) continue
    if (isCheckedControl(element)) {
      fields.push({ key, kind: 'checked', value: element.value, checked: element.checked, selected: [] })
      continue
    }
    if (element instanceof HTMLSelectElement) {
      fields.push({
        key,
        kind: 'value',
        value: element.value,
        checked: false,
        selected: Array.from(element.selectedOptions).map(option => option.value),
      })
      continue
    }
    fields.push({ key, kind: 'value', value: element.value, checked: false, selected: [] })
  }
  return { path, pageLoadId, savedAt: now, fields }
}

function setNativeValue(element: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), 'value')
  if (descriptor?.set) descriptor.set.call(element, value)
  else element.value = value
  element.dispatchEvent(new Event('input', { bubbles: true }))
  element.dispatchEvent(new Event('change', { bubbles: true }))
}

/**
 * Restores fields captured during a previous document load. Returns the number of
 * controls written back so callers can retry until the page content has rendered.
 */
export function restoreDraft(
  root: ParentNode,
  draft: FormDraft,
  pageLoadId: string,
  now = Date.now(),
  maxAge = draftMaxAgeMs,
): number {
  if (!isDraftRestorable(draft, pageLoadId, now, maxAge)) return 0
  const controls = Array.from(root.querySelectorAll('input, textarea, select')).filter(isFormControl)
  let restored = 0
  for (const field of draft.fields) {
    if (field.kind === 'checked') {
      const target = controls.find(element => controlKey(element) === field.key
        && isCheckedControl(element) && element.value === field.value)
      if (!target || !isCheckedControl(target) || target.checked === field.checked) continue
      target.checked = field.checked
      target.dispatchEvent(new Event('input', { bubbles: true }))
      target.dispatchEvent(new Event('change', { bubbles: true }))
      restored += 1
      continue
    }
    const target = controls.find(element => controlKey(element) === field.key && !isCheckedControl(element))
    if (!target) continue
    if (target instanceof HTMLSelectElement) {
      const wanted = field.selected.length > 0 ? field.selected : [field.value]
      let changed = false
      for (const option of Array.from(target.options)) {
        const next = wanted.includes(option.value)
        if (option.selected !== next) {
          option.selected = next
          changed = true
        }
      }
      if (!changed) continue
      target.dispatchEvent(new Event('input', { bubbles: true }))
      target.dispatchEvent(new Event('change', { bubbles: true }))
      restored += 1
      continue
    }
    if (target.value === field.value) continue
    setNativeValue(target, field.value)
    restored += 1
  }
  return restored
}

export function isDraftRestorable(
  draft: FormDraft,
  pageLoadId: string,
  now = Date.now(),
  maxAge = draftMaxAgeMs,
): boolean {
  if (draft.pageLoadId === pageLoadId || draft.fields.length === 0) return false
  const age = now - draft.savedAt
  return age >= -60_000 && age <= maxAge
}

export function draftStorageKey(path: string): string {
  return 'nexora:form-draft:' + path
}

export function saveDraft(storage: Storage, draft: FormDraft): void {
  if (draft.fields.length === 0) return
  try {
    storage.setItem(draftStorageKey(draft.path), JSON.stringify(draft))
  } catch {
    // Private mode or quota exhaustion: keep serving the page without a draft.
  }
}

export function readDraft(storage: Storage, path: string): FormDraft | null {
  try {
    const raw = storage.getItem(draftStorageKey(path))
    return raw ? parseDraft(JSON.parse(raw)) : null
  } catch {
    return null
  }
}

export function clearDraft(storage: Storage, path: string): void {
  try {
    storage.removeItem(draftStorageKey(path))
  } catch {
    // Nothing to clear when storage is unavailable.
  }
}

function parseDraft(value: unknown): FormDraft | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  if (typeof record.path !== 'string' || typeof record.pageLoadId !== 'string'
    || typeof record.savedAt !== 'number' || !Array.isArray(record.fields)) return null
  const fields: DraftField[] = []
  for (const item of record.fields) {
    if (!item || typeof item !== 'object') continue
    const field = item as Record<string, unknown>
    if (typeof field.key !== 'string' || (field.kind !== 'value' && field.kind !== 'checked')) continue
    fields.push({
      key: field.key,
      kind: field.kind,
      value: typeof field.value === 'string' ? field.value : '',
      checked: field.checked === true,
      selected: Array.isArray(field.selected)
        ? field.selected.filter((entry): entry is string => typeof entry === 'string')
        : [],
    })
  }
  return { path: record.path, pageLoadId: record.pageLoadId, savedAt: record.savedAt, fields }
}
