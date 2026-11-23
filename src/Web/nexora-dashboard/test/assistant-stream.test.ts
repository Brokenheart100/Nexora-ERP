import { describe, expect, it } from 'vitest'
import type { AssistantEvent } from '../shared/types/assistant'
import { consumeAssistantStream } from '../app/utils/assistant/stream'

function streamOf(...strings: string[]) {
  const encoder = new TextEncoder()
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const part of strings) {
        for (const byte of encoder.encode(part)) controller.enqueue(Uint8Array.of(byte))
      }
      controller.close()
    }
  })
}

describe('Assistant stream framing', () => {
  const executionId = '11111111-1111-4111-8111-111111111111'

  it('handles split UTF-8 characters and CRLF, multiline JSON, and unknown events', async () => {
    const received: AssistantEvent[] = []
    await consumeAssistantStream(streamOf(
      ': keepalive\r\n\r\n',
      'event: extension\ndata: optional\n\n',
      `event: delta\r\ndata: {"executionId":"${executionId}",\r\ndata: "text":"已收到"}\r\n\r\n`,
      'event: done\ndata: {"status":"complete"}\n\n'
    ), event => received.push(event))
    expect(received).toEqual([
      { event: 'delta', data: { executionId, text: '已收到' } },
      { event: 'done', data: { status: 'complete' } }
    ])
  })

  it('requires a terminal event to confirm that the request completed', async () => {
    const received: AssistantEvent[] = []
    await expect(consumeAssistantStream(streamOf(`event: delta\ndata: {"executionId":"${executionId}","text":"部分结果"}\n\n`), event => received.push(event))).rejects.toThrow('连接已中断')
    expect(received).toHaveLength(1)
  })
})
