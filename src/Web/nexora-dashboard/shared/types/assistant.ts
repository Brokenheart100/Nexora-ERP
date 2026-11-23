import { z } from 'zod'

export const assistantPromptMaxLength = 4000
const id = z.uuid()
const status = z.string()
const text = z.string()
export const assistantToolSchema = z.object({ id: text, name: text, arguments: text, status, requiresApproval: z.boolean(), result: text.nullish() })
export const assistantMessageSchema = z.object({ id, role: z.enum(['user', 'assistant', 'tool']), content: text, status, atUtc: text, tool: assistantToolSchema.nullish() })
const session = z.object({ id, title: text, createdAtUtc: text, updatedAtUtc: text })
export const assistantHistorySchema = z.object({ sessions: z.array(session.extend({ messageCount: z.number().int().nonnegative(), lastMessage: text })) })
export const assistantDetailSchema = z.object({ session: session.extend({ messages: z.array(assistantMessageSchema) }) })
export const assistantCapabilitiesSchema = z.object({ provider: text, model: text, configured: z.boolean(),
  tools: z.array(z.object({ name: text, description: text, requiresApproval: z.boolean() })) })
export const assistantDecisionSchema = z.object({ executionId: id, status, tool: assistantToolSchema.optional() })
export const assistantEventSchemas = {
  session: z.object({ sessionId: id, executionId: id, provider: text, model: text, resumed: z.boolean().optional() }),
  delta: z.object({ executionId: id, text }),
  tool_call: z.object({ executionId: id, tool: assistantToolSchema }),
  approval_required: z.object({ executionId: id, tool: assistantToolSchema }),
  tool_result: z.object({ executionId: id, tool: assistantToolSchema, summary: text.nullish() }),
  done: z.object({ status, content: text.optional() }),
  canceled: z.object({ executionId: id, content: text.optional() })
}
type AssistantEventSchemas = typeof assistantEventSchemas
export type AssistantEvent = { [Name in keyof AssistantEventSchemas]: { event: Name, data: z.infer<AssistantEventSchemas[Name]> } }[keyof AssistantEventSchemas]
export type AssistantMessage = z.infer<typeof assistantMessageSchema>
export type AssistantTool = z.infer<typeof assistantToolSchema>
