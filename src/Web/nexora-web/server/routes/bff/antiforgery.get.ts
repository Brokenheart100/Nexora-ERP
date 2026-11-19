import { defineEventHandler } from 'h3'
import { issueCsrf } from '../../utils/auth/bff-csrf'

export default defineEventHandler(event => ({ requestToken: issueCsrf(event) }))
