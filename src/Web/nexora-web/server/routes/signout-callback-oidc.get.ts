import { defineEventHandler } from 'h3'
import { completeLogout } from '../utils/auth/bff-oidc'

export default defineEventHandler(completeLogout)
