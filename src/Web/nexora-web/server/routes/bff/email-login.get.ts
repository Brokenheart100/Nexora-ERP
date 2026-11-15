import { defineEventHandler } from 'h3'
import { beginLogin } from '../../utils/bff-oidc'

export default defineEventHandler(event => beginLogin(event, 'nexora-email-login'))
