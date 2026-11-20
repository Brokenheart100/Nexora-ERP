import { defineEventHandler, getQuery, setCookie } from 'h3'
import { beginLogin } from '../../utils/auth/bff-oidc'

const plans = new Set(['free', 'standard', 'pro'])

export default defineEventHandler((event) => {
  const plan = String(getQuery(event).plan ?? '').toLowerCase()
  if (plans.has(plan)) {
    setCookie(event, 'nexora-dashboard-signup-plan', plan, {
      path: '/', maxAge: 60 * 60 * 24 * 7, sameSite: 'lax', secure: true, httpOnly: false
    })
  }
  return beginLogin(event, 'nexora-email-register')
})
