import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function readLocale(name: string) {
  return JSON.parse(readFileSync(resolve(process.cwd(), 'i18n/locales', name), 'utf8')) as Record<string, unknown>
}

function flatten(value: Record<string, unknown>, prefix = '', result: Record<string, string> = {}) {
  for (const [key, entry] of Object.entries(value)) {
    const path = prefix ? prefix + '.' + key : key
    if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
      flatten(entry as Record<string, unknown>, path, result)
    } else {
      result[path] = String(entry)
    }
  }
  return result
}

function placeholders(value: string) {
  return [...value.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort()
}

const zh = flatten(readLocale('zh-CN.json'))
const en = flatten(readLocale('en.json'))

describe('locale resources', () => {
  it('keeps the same key set in Chinese and English', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(zh).sort())
  })

  it('has no empty translations', () => {
    for (const [locale, messages] of Object.entries({ zh, en })) {
      for (const [key, value] of Object.entries(messages)) {
        expect(value.trim(), locale + '.' + key).not.toBe('')
      }
    }
  })

  it('uses the same interpolation placeholders in both languages', () => {
    for (const key of Object.keys(zh)) {
      expect(placeholders(en[key]!), key).toEqual(placeholders(zh[key]!))
    }
  })
})
