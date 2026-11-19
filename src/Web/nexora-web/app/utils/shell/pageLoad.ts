function createPageLoadId(): string {
  const source = globalThis.crypto
  if (source && typeof source.randomUUID === 'function') return source.randomUUID()
  return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10)
}

/** Identity of this document load; a draft saved under another load survives a reload. */
export const pageLoadId = createPageLoadId()
