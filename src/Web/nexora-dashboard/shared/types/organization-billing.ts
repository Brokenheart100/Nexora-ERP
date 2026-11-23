import { z } from 'zod'
import { revision } from './wire'

const text = z.string()
const count = z.number().int()
const time = text.nullable()
const plan = z.object({
  code: text, name: text, monthlyPriceCents: count, currency: text,
  limits: z.object({ workspaces: count, members: count, documentsPerMonth: count }), modules: z.array(text)
})
const usage = z.object({
  workspaces: count, workspacesLimit: count, members: count, membersLimit: count,
  documentsThisMonth: count, documentsLimit: count, period: text
})
const invoice = z.object({
  id: z.uuid(), planCode: text, status: text, amountCents: count, currency: text,
  paymentReference: text.nullish(), issuedAtUtc: text, paidAtUtc: time
})
export const organizationBillingSchema = z.object({
  workspaceId: z.uuid(), canManage: z.boolean(), invoices: z.array(invoice), plans: z.array(plan),
  subscription: z.object({
    workspaceId: z.uuid(), planCode: text, status: text, effectivePlanCode: text, version: revision,
    periodStartUtc: time, periodEndUtc: time, usage
  })
})
export const billingQuoteSchema = z.object({
  planCode: text, planName: text, monthlyPriceCents: count, currency: text,
  currentPlanCode: text, currentPlanName: text, subscriptionStatus: text, prorated: z.boolean(),
  chargeCents: count, creditCents: count, amountDueCents: count, remainingDays: count,
  effectiveAtUtc: text, periodEndUtc: text
})
export const billingCheckoutIntentSchema = z.object({
  invoiceId: z.uuid(), planCode: text, amountCents: count, currency: text, usesSavedCard: z.boolean(), ticket: text
})
export const billingCheckoutSchema = z.object({ hasSavedCard: z.boolean(), pending: billingCheckoutIntentSchema.nullish() })
export type OrganizationBilling = z.infer<typeof organizationBillingSchema>
export type BillingQuote = z.infer<typeof billingQuoteSchema>
export type BillingCheckoutIntent = z.infer<typeof billingCheckoutIntentSchema>
export type OrganizationBillingInvoice = z.infer<typeof invoice>
