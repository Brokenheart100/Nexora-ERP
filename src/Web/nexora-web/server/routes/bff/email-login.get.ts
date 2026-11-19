import { defineEventHandler } from 'h3'
import { beginLogin } from '../../utils/auth/bff-oidc'

export default defineEventHandler(event => beginLogin(event, 'nexora-email-login'))
