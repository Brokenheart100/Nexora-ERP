import { http, HttpResponse } from 'msw/http'
import { z } from 'zod'
import {
  taxAssessmentInputSchema, taxBasisSchema, taxCycleSchema, taxGroupInputSchema, taxRateInputSchema,
  type TaxCalendar, type TaxFiling, type TaxSetup, type TaxSnapshot, type TaxTotals
} from '../../../shared/types/tax'
import { divideDecimal, multiplyDecimals, roundDecimal, subtractDecimal, sumDecimals } from '../../../shared/utils/decimal'
import { createBusinessFixture } from './business-fixture'
import { type CatalogFixture, problem } from './catalog'

const root = '*/bff/api/finance/workspaces/:workspaceId/tax'
const version = z.number().int().nonnegative()
const calInput = z.object({ cycle: taxCycleSchema, basis: taxBasisSchema })
const bindingInput = z.object({ kind: z.enum(['item', 'partner']), resourceId: z.uuid(), groupCode: z.string(), expectedVersion: version })
const filingInput = z.object({ reference: z.string().trim().min(1).max(100), reason: z.string().trim().max(300).nullable(),
  expectedFingerprint: z.string().min(1), lockBooks: z.boolean() })

export function createTaxHandlers(catalog: CatalogFixture, storage?: Pick<Storage, 'getItem' | 'setItem'>) {
  const defaults: Omit<TaxSetup, 'canManage'> = { rates: [], groups: [], classifications: [] }
  const mock = createBusinessFixture(catalog, 'd10', {
    ...defaults, cycle: 'monthly' as TaxCalendar['cycle'], basis: 'accrual' as TaxCalendar['basis'], version: 0,
    lockedThrough: null as string | null, filings: [] as TaxFiling[], assessments: [] as TaxSnapshot[], lostFilingResponse: false
  }, storage)
  const { state } = mock
  const manage = () => catalog.scenario() !== 'd10-reader'
  const lock = () => manage() && catalog.scenario() !== 'd10-no-lock'
  const calendar = () => ({ cycle: state.cycle, basis: state.basis, version: state.version, lockedThrough: state.lockedThrough,
    canManage: manage(), canLock: lock(), canChangeCalendar: manage() && !state.filings.length })
  const invalid = () => problem(400, 'tax.invalid', '税务输入无效。')
  const put = (workspace: unknown, request: Request, apply: Parameters<typeof mock.write>[2], status = 200) =>
    mock.write(workspace, request, input => manage() ? apply(input) : mock.forbidden(), status)
  const matched = (request: Request, input: Record<string, unknown>, expected: number | string) => {
    const tag = request.headers.get('if-match')
    return tag
      ? tag === '"' + expected + '"' && (input.expectedVersion === undefined || input.expectedVersion === expected)
      : input.expectedVersion === expected
  }
  function totals(on: string): TaxTotals {
    const year = Number(on.slice(0, 4)), month = Number(on.slice(5, 7))
    const step = state.cycle === 'monthly' ? 1 : 3
    const start = month - (month - 1) % step
    const from = year + '-' + String(start).padStart(2, '0') + '-01'
    const through = new Date(Date.UTC(year, start + step - 1, 0)).toISOString().slice(0, 10)
    return { period: { from, through }, currency: 'CNY', watermark: 0,
      fingerprint: ['msw-tax', from, through, state.basis].join(':'), input: '0', output: '0', netPayable: '0',
      codes: [], sources: [], basis: state.basis }
  }
  const history = (from: string) => state.filings.filter(row => row.filing.from === from).map(row => row.filing)

  return [
    http.get(root, ({ params }) => mock.read(params.workspaceId, () =>
      ({ canManage: manage(), rates: state.rates, groups: state.groups, classifications: state.classifications }))),
    http.post(root + '/rates', ({ params, request }) => put(params.workspaceId, request, (body) => {
      const input = taxRateInputSchema.safeParse(body)
      if (!input.success) return invalid()
      if (state.rates.some(row => row.code === input.data.code && row.effectiveOn === input.data.effectiveOn))
        return mock.conflict('该日期已有税率版本。')
      const id = crypto.randomUUID()
      state.rates.push({ ...input.data, id })
      return { id, version: 1 }
    })),
    http.post(root + '/groups', ({ params, request }) => put(params.workspaceId, request, (body) => {
      const input = taxGroupInputSchema.extend({ expectedVersion: version }).safeParse(body)
      if (!input.success) return invalid()
      const { expectedVersion, ...group } = input.data
      if (group.rateCodes.some(code => !state.rates.some(row => row.code === code))) return invalid()
      const existing = state.groups.findIndex(row => row.code === group.code)
      if ((state.groups[existing]?.version ?? 0) !== expectedVersion) return mock.conflict('税组版本已变化。')
      if (existing >= 0) state.groups.splice(existing, 1)
      state.groups.push({ ...group, version: expectedVersion + 1 })
      return { id: crypto.randomUUID(), version: expectedVersion + 1 }
    })),
    http.post(root + '/classifications', ({ params, request }) => put(params.workspaceId, request, (body) => {
      const input = bindingInput.safeParse(body)
      if (!input.success) return invalid()
      const { expectedVersion, ...binding } = input.data
      const reference = binding.kind === 'item'
        ? catalog.find(params.workspaceId, binding.resourceId)
        : catalog.db.partners.find(row => row.workspaceId === params.workspaceId && row.id === binding.resourceId)
      if (!reference?.isActive || !state.groups.some(row => row.code === binding.groupCode)) return mock.missing()
      const existing = state.classifications.findIndex(row => row.kind === binding.kind && row.resourceId === binding.resourceId)
      if ((state.classifications[existing]?.version ?? 0) !== expectedVersion) return mock.conflict('税组绑定已变化。')
      if (existing >= 0) state.classifications.splice(existing, 1)
      state.classifications.push({ ...binding, version: expectedVersion + 1, referenceVersion: reference.version })
      return { id: crypto.randomUUID(), version: expectedVersion + 1 }
    })),
    http.post(root + '/assessments', ({ params, request }) => put(params.workspaceId, request, (body) => {
      const input = taxAssessmentInputSchema.safeParse(body)
      if (!input.success) return invalid()
      const { on, groupCode, itemId, partnerId, unitPrice, quantity, discount, includesTax } = input.data
      const references = []
      let binding: TaxSetup['classifications'][number] | undefined
      for (const [kind, id] of [['item', itemId], ['partner', partnerId]] as const) {
        if (!id) continue
        const resource = kind === 'item'
          ? catalog.find(params.workspaceId, id)
          : catalog.db.partners.find(row => row.workspaceId === params.workspaceId && row.id === id)
        if (!resource?.isActive) return mock.missing()
        const classification = state.classifications.find(row => row.kind === kind && row.resourceId === id)
        if (classification) binding = classification
        references.push({ kind, resourceId: id, version: resource.version, classificationVersion: classification?.version ?? null })
      }
      const group = state.groups.find(row => row.code === (groupCode ?? binding?.groupCode))
      if (!group) return mock.conflict('找不到适用的税组。')
      const rates = group.rateCodes.map(code => state.rates.filter(row => row.code === code && row.effectiveOn <= on)
        .sort((a, b) => b.effectiveOn.localeCompare(a.effectiveOn))[0])
      if (rates.some(rate => !rate)) return mock.conflict('该日期没有生效税率。')
      const basis = multiplyDecimals(multiplyDecimals(unitPrice, quantity), subtractDecimal('1', discount))
      const taxRates = rates.filter(rate => rate !== undefined)
      const rawNet = includesTax ? divideDecimal(basis, sumDecimals(['1', ...taxRates.map(row => row.rate)]), 16) : basis
      const net = roundDecimal(rawNet, 2)
      const components = taxRates.map(row => ({ rateId: row.id, code: row.code, effectiveOn: row.effectiveOn, rate: row.rate,
        amount: roundDecimal(multiplyDecimals(rawNet, row.rate), 2) }))
      let tax = sumDecimals(components.map(row => row.amount))
      if (includesTax && components[0]) {
        const residual = subtractDecimal(roundDecimal(basis, 2), sumDecimals([net, tax]))
        const largest = components.reduce((best, row) => Number(row.amount) > Number(best.amount) ? row : best, components[0])
        largest.amount = sumDecimals([largest.amount, residual])
        tax = sumDecimals([tax, residual])
      }
      const snapshot: TaxSnapshot = { id: crypto.randomUUID(), on, currency: 'CNY', minorUnits: 2, policy: 'msw-tax',
        group, groupSource: groupCode ? 'explicit' : binding?.kind ?? null, references, unitPrice, quantity, discount,
        includesTax, amounts: { net, tax, total: sumDecimals([net, tax]), components } }
      state.assessments.push(snapshot)
      return snapshot
    })),
    http.get(root + '/assessments/:id', ({ params }) => mock.read(params.workspaceId, () =>
      state.assessments.find(row => row.id === params.id) ?? mock.missing())),
    http.get(root + '/calendar', ({ params }) => mock.read(params.workspaceId, calendar)),
    http.put(root + '/calendar', ({ params, request }) => put(params.workspaceId, request, (body) => {
      const input = calInput.safeParse(body)
      if (!input.success) return invalid()
      if (!matched(request, body, state.version)) return mock.stale()
      if (state.filings.length) return mock.conflict('首笔申报后周期和确认口径固定。')
      Object.assign(state, input.data, { version: state.version + 1 })
      return calendar()
    })),
    http.get(root + '/periods/:on', ({ params }) => mock.read(params.workspaceId, () => {
      const date = z.iso.date().safeParse(params.on)
      if (!date.success) return invalid()
      const current = totals(date.data)
      const filings = history(current.period.from)
      return { current, filings, changedSinceFiling: !!filings[0] && filings[0].fingerprint !== current.fingerprint,
        lockedThrough: state.lockedThrough }
    })),
    http.post(root + '/periods/:on/filings', async ({ params, request }) => {
      const result = await put(params.workspaceId, request, (body) => {
        const input = filingInput.safeParse(body)
        const date = z.iso.date().safeParse(params.on)
        if (!input.success || !date.success) return invalid()
        const snapshot = totals(date.data)
        const previous = history(snapshot.period.from)[0]
        const { reference, reason, lockBooks, expectedFingerprint } = input.data
        if (!matched(request, body, previous?.version ?? 0)) return mock.stale()
        if (snapshot.fingerprint !== expectedFingerprint) return mock.conflict('汇总已更新，请重新读取。')
        if (lockBooks && !lock()) return mock.forbidden()
        if (previous && !reason) return invalid()
        const { from, through } = snapshot.period
        const filing: TaxFiling['filing'] = { reference, reason, lockBooks, id: crypto.randomUUID(), from, through,
          version: Number(previous?.version ?? 0) + 1, correctsId: previous?.id ?? null,
          fingerprint: snapshot.fingerprint, recordedAtUtc: new Date().toISOString() }
        const value = { filing, snapshot }
        state.filings.unshift(value)
        if (filing.lockBooks && (!state.lockedThrough || through > state.lockedThrough)) state.lockedThrough = through
        return value
      }, 201)
      if (result?.status === 201 && catalog.scenario() === 'd10-unknown' && !state.lostFilingResponse) {
        state.lostFilingResponse = true
        mock.save()
        return HttpResponse.error()
      }
      if (result?.status === 201) {
        const created = await result.clone().json() as TaxFiling
        result.headers.set('location', '/api/finance/workspaces/' + params.workspaceId + '/tax/filings/' + created.filing.id)
      }
      return result
    }),
    http.get(root + '/filings/:id', ({ params }) => mock.read(params.workspaceId, () =>
      state.filings.find(row => row.filing.id === params.id) ?? mock.missing()))
  ]
}
