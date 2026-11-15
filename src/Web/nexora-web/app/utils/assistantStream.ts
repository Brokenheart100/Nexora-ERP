export interface AssistantStreamEvent {
  event: string
  data: Record<string, unknown>
}

export interface AssistantStreamParse {
  events: AssistantStreamEvent[]
  rest: string
}

export function parseSseChunk(buffer: string): AssistantStreamParse {
  const normalized = buffer.replace(/\r\n/g, '\n')
  const frames = normalized.split('\n\n')
  const rest = frames.pop() ?? ''
  const events: AssistantStreamEvent[] = []
  for (const frame of frames) {
    let event = 'message'
    const dataLines: string[] = []
    for (const line of frame.split('\n')) {
      if (line.startsWith('event:')) event = line.slice(6).trim()
      else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim())
    }
    if (!dataLines.length) continue
    try {
      const parsed = JSON.parse(dataLines.join('\n')) as unknown
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
        events.push({ event, data: parsed as Record<string, unknown> })
    }
    catch {
      // A partial or malformed frame is skipped; the caller keeps reading the stream.
    }
  }
  return { events, rest }
}

export function appendDelta(previous: string, delta: unknown): string {
  return typeof delta === 'string' ? previous + delta : previous
}

export function assistantStatusLabel(status: string): string {
  switch (status) {
    case 'complete': return '已完成'
    case 'canceled': return '已取消'
    case 'pending_approval': return '等待审批'
    case 'failed': return '执行失败'
    case 'rejected': return '已拒绝'
    default: return status
  }
}
