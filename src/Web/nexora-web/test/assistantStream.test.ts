import { describe, expect, it } from 'vitest'
import { appendDelta, assistantStatusLabel, parseSseChunk } from '../app/utils/assistant/assistantStream'

describe('parseSseChunk', () => {
  it('parses complete frames and keeps the unfinished tail', () => {
    const buffer = 'event: session\ndata: {"sessionId":"s1"}\n\nevent: delta\ndata: {"text":"你"}\n\nevent: delta\ndata: {"te'
    const parsed = parseSseChunk(buffer)
    expect(parsed.events).toHaveLength(2)
    expect(parsed.events[0]).toEqual({ event: 'session', data: { sessionId: 's1' } })
    expect(parsed.events[1].data.text).toBe('你')
    expect(parsed.rest).toBe('event: delta\ndata: {"te')
  })

  it('normalizes CRLF frames and ignores malformed data', () => {
    const parsed = parseSseChunk('event: delta\r\ndata: {"text":"ok"}\r\n\r\nevent: delta\r\ndata: {broken}\r\n\r\n')
    expect(parsed.events).toHaveLength(1)
    expect(parsed.events[0].data.text).toBe('ok')
    expect(parsed.rest).toBe('')
  })

  it('returns an empty rest when nothing is buffered', () => {
    expect(parseSseChunk('')).toEqual({ events: [], rest: '' })
  })
})

describe('appendDelta', () => {
  it('appends only string deltas', () => {
    expect(appendDelta('ab', 'c')).toBe('abc')
    expect(appendDelta('ab', 3)).toBe('ab')
    expect(appendDelta('ab', undefined)).toBe('ab')
  })
})

describe('assistantStatusLabel', () => {
  it('maps known statuses and passes through unknown ones', () => {
    expect(assistantStatusLabel('complete')).toBe('已完成')
    expect(assistantStatusLabel('canceled')).toBe('已取消')
    expect(assistantStatusLabel('pending_approval')).toBe('等待审批')
    expect(assistantStatusLabel('streaming')).toBe('streaming')
  })
})
