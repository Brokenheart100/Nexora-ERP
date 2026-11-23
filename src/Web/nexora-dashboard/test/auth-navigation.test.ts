// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { loginDestination } from '../shared/utils/auth-navigation'

describe('login return destinations', () => {
  it('removes invitation credentials from authentication return URLs', () => {
    const fragment = '11111111-1111-4111-8111-111111111111.' + 'a'.repeat(64)
    expect(loginDestination('/join#' + fragment)).toBe('/join')
  })

  it.each(['/', '/catalog', '/settings?tab=invitations', '/join?invite=local-example#accept'])('preserves an existing UI destination: %s', (path) => {
    expect(loginDestination(path)).toBe(path)
  })

  it.each(['https://evil.invalid/', '//evil.invalid/', '/\\evil.invalid/', '/unknown', '/bff/login', '/%2f%2fevil.invalid', '/catalog\n', ['/', '/catalog'], undefined])('rejects external, unknown or malformed destinations: %s', (path) => {
    expect(loginDestination(path)).toBe('/')
  })
})
