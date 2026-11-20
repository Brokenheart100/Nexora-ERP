import { defineEventHandler } from 'h3'
import { requireCsrf } from '../../utils/auth/bff-csrf'
import { beginLogout } from '../../utils/auth/bff-oidc'

export default defineEventHandler(async (event) => {
  await requireCsrf(event, true)
  return beginLogout(event)
})
