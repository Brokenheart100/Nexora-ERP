import { compareDecimal, multiplyDecimals, roundDecimal, sumDecimals } from './decimal'

interface Assessment {
  id: string
  on: string
  currency: string
  unitPrice: string
  quantity: string
  group: { code: string }
  references: { kind: string, resourceId: string }[]
  amounts: { net: string, tax: string, total: string }
}
export interface BillLineInput { receiptId: string, quantity: string, unitPrice: string, assessment: Assessment | null }
const defaults = { bankId: null, otherBankId: null, counterAccountId: null, sourceId: null, quantity: '0', taxAssessmentId: null, statementLineId: null, method: null }
export function billTerms(input: { on: string, number: string, memo: string, partnerId: string, dueOn: string, currency: string, minorUnits: number, groupCode: string, approveVariance?: boolean }, lines: BillLineInput[]) {
  if (!lines.length || new Set(lines.map(line => line.receiptId)).size !== lines.length) throw new Error('请选择不同的实收行。')
  const receipts = lines.map((line) => {
    const assessment = line.assessment
    let net: string
    if (input.groupCode === 'none') net = roundDecimal(multiplyDecimals(line.quantity, line.unitPrice), input.minorUnits)
    else {
      if (!assessment || assessment.on !== input.on || assessment.currency !== input.currency || assessment.group.code !== input.groupCode
        || compareDecimal(assessment.quantity, line.quantity) !== 0 || compareDecimal(assessment.unitPrice, line.unitPrice) !== 0
        || !assessment.references.some(reference => reference.kind === 'partner' && reference.resourceId === input.partnerId)) throw new Error('税额评估已不匹配，请重新评估当前行。')
      net = assessment.amounts.net
    }
    if (compareDecimal(net, '0') <= 0 || compareDecimal(line.quantity, '0') <= 0) throw new Error('账单行数量和未税金额须大于零。')
    return { receiptId: line.receiptId, quantity: line.quantity, net, taxAssessmentId: input.groupCode === 'none' ? null : assessment!.id }
  })
  return { ...defaults, kind: 1, on: input.on, number: input.number, memo: input.memo, partnerId: input.partnerId,
    amount: sumDecimals(receipts.map(line => line.net)), quantity: sumDecimals(receipts.map(line => line.quantity)), billReceipts: receipts,
    dueOn: input.dueOn || null, method: input.approveVariance ? 'approve-cost-variance' : null }
}
export function paymentTerms(input: { on: string, number: string, memo: string, bankId: string, amount: string }, bill: { id: string, state: string, outstanding: string, terms: { kind: number, partnerId?: string | null } }) {
  if (bill.state !== 'posted' || bill.terms.kind !== 1 || compareDecimal(input.amount, '0') <= 0 || compareDecimal(input.amount, bill.outstanding) > 0) throw new Error('请选择已入账且余额足够的未结账单。')
  return { ...defaults, ...input, kind: 2, sourceId: bill.id, partnerId: bill.terms.partnerId ?? null }
}
