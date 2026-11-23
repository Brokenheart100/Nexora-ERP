import { assistantEventSchemas, type AssistantEvent } from '#shared/types/assistant'

function decodeFrame(frame: string): AssistantEvent | null {
  let event = 'message'
  const data: string[] = []
  for (const line of frame.split(/\r\n|\n|\r/)) {
    const separator = line.indexOf(':')
    if (separator < 0) continue
    const field = line.slice(0, separator)
    const value = line.slice(separator + 1).replace(/^ /, '')
    if (field === 'event') event = value
    if (field === 'data') data.push(value)
  }
  if (!data.length || !Object.hasOwn(assistantEventSchemas, event)) return null
  const schema = assistantEventSchemas[event as keyof typeof assistantEventSchemas]
  return { event, data: schema.parse(JSON.parse(data.join('\n'))) } as AssistantEvent
}

export async function consumeAssistantStream(stream: ReadableStream<Uint8Array>, receive: (event: AssistantEvent) => void) {
  const reader = stream.getReader()
  const decoder = new TextDecoder('utf-8', { fatal: true })
  let buffer = ''
  let terminal = false
  try {
    while (!terminal) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let boundary: RegExpExecArray | null
      while ((boundary = /\r?\n\r?\n|\r\r/.exec(buffer))) {
        const frame = decodeFrame(buffer.slice(0, boundary.index))
        buffer = buffer.slice(boundary.index + boundary[0].length)
        if (frame) {
          receive(frame)
          terminal = frame.event === 'done' || frame.event === 'canceled'
        }
        if (terminal) break
      }
      if (buffer.length > 256_000) throw new Error('助手响应帧过大。')
    }
    if (!terminal) throw new Error('连接已中断。请刷新会话查看服务器保存的记录。')
  } finally {
    await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}
