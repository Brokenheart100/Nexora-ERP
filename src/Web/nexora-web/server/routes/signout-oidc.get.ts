import { defineEventHandler, setResponseStatus } from 'h3'
import { frontChannelLogout } from '../utils/auth/bff-oidc'

export default defineEventHandler(async (event) => {
  await frontChannelLogout(event)
  setResponseStatus(event, 204)
})
