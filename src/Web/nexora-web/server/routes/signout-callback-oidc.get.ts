import { defineEventHandler } from 'h3'
import { completeLogout } from '../utils/bff-oidc'

export default defineEventHandler(completeLogout)
