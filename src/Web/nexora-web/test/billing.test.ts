import { describe, expect, it } from 'vitest'
import {
  billingStatusLabel, billingWarningLabel, canSelectPlan, formatBillingAmount, invoiceStatusLabel,
  isCurrentPlan, moduleAllowed, planLabel, publicPlans, quoteIsZeroDue, signupPlanCode, usageRatio,
} from '../app/utils/billing'
import type { BillingEntitlements, BillingPlanQuote, BillingSubscription } from '../app/utils/billing'

const subscription: BillingSubscription = {
  workspaceId: 'w1', planCode: 'free', status: 'active', effectivePlanCode: 'free',
  periodStartUtc: null, periodEndUtc: null, version: 1,
  usage: { workspaces: 1, workspacesLimit: 1, members: 1, membersLimit: 3, documentsThisMonth: 0, documentsLimit: 500, period: '2026-11' },
}

function entitlements(modules: string[]): BillingEntitlements {
  return {
    workspaceId: 'w1', planCode: 'standard', planName: '标准版', status: 'active', effectivePlanCode: 'standard',
    modules, warnings: [], usage: subscription.usage, periodEndUtc: null,
  }
}

describe('billing labels', () => {
  it('translates known subscription, invoice and warning codes and keeps unknown codes', () => {
    expect(billingStatusLabel('past_due')).toBe('已逾期')
    expect(billingStatusLabel('unknown')).toBe('unknown')
    expect(invoiceStatusLabel('paid')).toBe('已支付')
    expect(invoiceStatusLabel('draft')).toBe('draft')
    expect(billingWarningLabel('members.limit_reached')).toContain('成员席位')
    expect(billingWarningLabel('custom.warning')).toBe('custom.warning')
    expect(planLabel('standard')).toBe('标准版')
    expect(planLabel('enterprise')).toBe('enterprise')
  })
})

describe('formatBillingAmount', () => {
  it('formats cents with two decimals and the currency symbol', () => {
    expect(formatBillingAmount(9900)).toBe('¥99.00')
    expect(formatBillingAmount(29900, 'CNY')).toBe('¥299.00')
    expect(formatBillingAmount(1050, 'USD')).toBe('USD 10.50')
    expect(formatBillingAmount(-100)).toBe('¥0.00')
  })
})

describe('usageRatio', () => {
  it('clamps usage between zero and one and treats a zero limit as full', () => {
    expect(usageRatio(1, 3)).toBeCloseTo(0.3333, 3)
    expect(usageRatio(9, 3)).toBe(1)
    expect(usageRatio(0, 3)).toBe(0)
    expect(usageRatio(0, 0)).toBe(0)
    expect(usageRatio(2, 0)).toBe(1)
    expect(usageRatio(-1, 3)).toBe(0)
  })
})

describe('moduleAllowed', () => {
  it('allows everything without entitlements and only listed modules with entitlements', () => {
    expect(moduleAllowed(null, 'sales')).toBe(true)
    expect(moduleAllowed(entitlements(['book', 'reports']), 'book')).toBe(true)
    expect(moduleAllowed(entitlements(['book', 'reports']), 'sales')).toBe(false)
  })
})

describe('plan selection helpers', () => {
  it('treats the active plan as current and disables reselecting it', () => {
    expect(isCurrentPlan('free', subscription)).toBe(true)
    expect(isCurrentPlan('pro', subscription)).toBe(false)
    expect(canSelectPlan('free', subscription)).toBe(false)
    expect(canSelectPlan('standard', subscription)).toBe(true)
    expect(canSelectPlan('free', { ...subscription, status: 'canceled' })).toBe(true)
  })
})

describe('public plans', () => {
  it('keeps the three published tiers ordered with the standard tier recommended', () => {
    expect(publicPlans.map(plan => plan.code)).toEqual(['free', 'standard', 'pro'])
    expect(publicPlans.map(plan => plan.monthlyPriceCents)).toEqual([0, 9900, 29900])
    expect(publicPlans.filter(plan => plan.recommended).map(plan => plan.code)).toEqual(['standard'])
    expect(publicPlans[0]!.modules).toContain('book')
    expect(publicPlans[2]!.modules).toContain('audit')
  })

  it('accepts only registered plan codes from cookies or query values', () => {
    expect(signupPlanCode('pro')).toBe('pro')
    expect(signupPlanCode('enterprise')).toBeNull()
    expect(signupPlanCode(undefined)).toBeNull()
    expect(signupPlanCode(20)).toBeNull()
  })
})

describe('plan quotes', () => {
  const quote: BillingPlanQuote = {
    planCode: 'pro', planName: '专业版', monthlyPriceCents: 29900, currency: 'CNY',
    currentPlanCode: 'standard', currentPlanName: '标准版', subscriptionStatus: 'active',
    prorated: true, chargeCents: 19933, creditCents: 6600, amountDueCents: 13333,
    remainingDays: 20, effectiveAtUtc: '2026-11-14T00:00:00Z', periodEndUtc: '2026-12-04T00:00:00Z',
  }

  it('requires no payment only when the amount due is zero', () => {
    expect(quoteIsZeroDue(quote)).toBe(false)
    expect(quoteIsZeroDue({ ...quote, amountDueCents: 0 })).toBe(true)
    expect(quoteIsZeroDue({ ...quote, amountDueCents: -1 })).toBe(true)
  })
})
