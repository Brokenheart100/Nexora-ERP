import { defineEventHandler } from 'h3'
import { requireFreshBffSession } from '../../utils/auth/bff-oidc'

export default defineEventHandler(async (event) => {
  const { subject, name } = await requireFreshBffSession(event)
  return { subject, name }
})
