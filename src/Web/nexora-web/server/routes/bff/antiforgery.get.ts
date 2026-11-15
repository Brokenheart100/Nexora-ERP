import { defineEventHandler } from 'h3'
import { issueCsrf } from '../../utils/bff-csrf'

export default defineEventHandler(event => ({ requestToken: issueCsrf(event) }))
