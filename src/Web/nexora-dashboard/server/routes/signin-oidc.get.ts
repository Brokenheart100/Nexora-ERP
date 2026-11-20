import { defineEventHandler } from 'h3'
import { completeLogin } from '../utils/auth/bff-oidc'

export default defineEventHandler(completeLogin)
