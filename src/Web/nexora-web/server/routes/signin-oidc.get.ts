import { defineEventHandler } from 'h3'
import { completeLogin } from '../utils/bff-oidc'

export default defineEventHandler(completeLogin)
