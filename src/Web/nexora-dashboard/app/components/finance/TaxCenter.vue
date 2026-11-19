<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type {
  TaxBasis,
  TaxCalcLine,
  TaxCalcMode,
  TaxCalendarFrequency,
  TaxGroupDefinition,
  TaxGroupStatus,
  TaxPartnerBinding,
  TaxPeriodLineState,
  TaxPeriodState,
  TaxProductBinding,
  TaxRateStatus,
  TaxRateVersion,
  TaxRounding
} from '~/mocks/taxCenter'
import {
  TAX_CENTER_TODAY,
  buildTaxCalendarPeriods,
  calculateTaxPreview,
  taxBasisLabels,
  taxCalcModeLabels,
  taxCalendarFrequencyLabels,
  taxCenterPartnerBindings,
  taxCenterProductBindings,
  taxCenterRateVersions,
  taxCenterTaxGroups,
  taxDocumentSnapshots,
  taxFormatRate,
  taxGroupRateSummary,
  taxGroupStatusColors,
  taxGroupStatusLabels,
  taxGroupTotalRate,
  taxPartnerKindLabels,
  taxPeriodDeclaredAmount,
  taxPeriodStatusColors,
  taxPeriodStatusLabels,
  taxPreviousDay,
  taxRateStatusColors,
  taxRateStatusLabels,
  taxRateVersionStatus,
  taxRecordKindLabels,
  taxRound,
  taxRoundingLabels
} from '~/mocks/taxCenter'

const toast = useToast()

const today = TAX_CENTER_TODAY
const demoStamp = '2026-11-19 10:00'

/* -------------------------------------------------------------------------- */
/* 本地状态（ref 深拷贝种子，刷新页面恢复）                                     */
/* -------------------------------------------------------------------------- */

const rateVersions = ref<TaxRateVersion[]>(structuredClone(taxCenterRateVersions))
const groups = ref<TaxGroupDefinition[]>(structuredClone(taxCenterTaxGroups))
const productBindings = ref<TaxProductBinding[]>(structuredClone(taxCenterProductBindings))
const partnerBindings = ref<TaxPartnerBinding[]>(structuredClone(taxCenterPartnerBindings))

const monthlyCalendar = ref<TaxPeriodState[]>(buildTaxCalendarPeriods('monthly', rateVersions.value))
const quarterlyCalendar = ref<TaxPeriodState[]>(buildTaxCalendarPeriods('quarterly', rateVersions.value))
const calendarFrequency = ref<TaxCalendarFrequency>('monthly')
const calendarBasis = ref<TaxBasis>('accrual')

const frequencyOptions = [
  { label: taxCalendarFrequencyLabels.monthly, value: 'monthly' },
  { label: taxCalendarFrequencyLabels.quarterly, value: 'quarterly' }
]
const basisOptions = [
  { label: taxBasisLabels.accrual, value: 'accrual' },
  { label: taxBasisLabels.cash, value: 'cash' }
]

function onFrequency(value: unknown) {
  calendarFrequency.value = value === 'quarterly' ? 'quarterly' : 'monthly'
}

function onBasis(value: unknown) {
  calendarBasis.value = value === 'cash' ? 'cash' : 'accrual'
}

const calendarPeriods = computed(() => (
  calendarFrequency.value === 'monthly' ? monthlyCalendar.value : quarterlyCalendar.value
))

/* -------------------------------------------------------------------------- */
/* 税率版本                                                                    */
/* -------------------------------------------------------------------------- */

const rateTypeOptions = [
  { label: '增值税（VAT13）', value: 'VAT13' },
  { label: '增值税 · 服务（VAT6）', value: 'VAT6' },
  { label: '企业所得税（CIT25）', value: 'CIT25' },
  { label: '附加税（SURTAX）', value: 'SURTAX' },
  { label: '出口免税（EXPORT）', value: 'EXPORT' }
]

const rateTypeNameMap: Record<string, string> = {
  VAT13: '增值税',
  VAT6: '增值税（服务）',
  CIT25: '企业所得税',
  SURTAX: '附加税',
  EXPORT: '出口关税'
}

const rateRows = computed(() => [...rateVersions.value].sort((left, right) => {
  if (left.code === right.code) return left.effectiveFrom < right.effectiveFrom ? 1 : -1
  return left.code < right.code ? -1 : 1
}))

const rateColumns: TableColumn<TaxRateVersion>[] = [
  { accessorKey: 'code', header: '税种 / 版本' },
  { accessorKey: 'rate', header: '税率', meta: { class: { th: 'text-right', td: 'text-right tabular-nums whitespace-nowrap' } } },
  { accessorKey: 'effectiveFrom', header: '生效日期', meta: { class: { td: 'tabular-nums whitespace-nowrap' } } },
  { id: 'effectiveTo', header: '停用日期', meta: { class: { td: 'tabular-nums whitespace-nowrap' } } },
  { id: 'status', header: '状态' }
]

const rateDetailOpen = ref(false)
const selectedRateId = ref<string | null>(null)
const selectedRate = computed(() => rateVersions.value.find(version => version.id === selectedRateId.value) ?? null)
const selectedRateStatus = computed<TaxRateStatus>(() => (
  selectedRate.value ? taxRateVersionStatus(selectedRate.value, today) : 'active'
))

function openRateDetail(version: TaxRateVersion) {
  selectedRateId.value = version.id
  rateDetailOpen.value = true
}

function snapshotsFor(version: TaxRateVersion) {
  return taxDocumentSnapshots.filter((snapshot) => {
    if (snapshot.taxType !== version.taxType) return false
    if (snapshot.date < version.effectiveFrom) return false
    if (version.effectiveTo && snapshot.date > version.effectiveTo) return false
    return true
  })
}

function retireRate(version: TaxRateVersion) {
  const endDate = taxPreviousDay(today)
  rateVersions.value = rateVersions.value.map(item => (
    item.id === version.id ? { ...item, effectiveTo: endDate } : item
  ))
  toast.add({
    title: '税率版本已停用',
    description: version.name + ' 的停用日期设为 ' + endDate + '，之后的计算需使用新版本。',
    color: 'warning',
    icon: 'i-lucide-circle-slash'
  })
}

const rateCreateOpen = ref(false)
const rateFormCode = ref('VAT13')
const rateFormRate = ref('13')
const rateFormFrom = ref('')
const rateFormTo = ref('')
const rateFormError = ref('')
let localRateSeq = 0

function openRateCreate() {
  rateFormCode.value = 'VAT13'
  rateFormRate.value = '13'
  rateFormFrom.value = today
  rateFormTo.value = ''
  rateFormError.value = ''
  rateCreateOpen.value = true
}

function saveRateVersion() {
  const amount = Number(rateFormRate.value)
  const from = rateFormFrom.value
  const to = rateFormTo.value
  if (!rateFormCode.value) {
    rateFormError.value = '请选择税种。'
    return
  }
  if (!Number.isFinite(amount) || amount < 0 || amount > 100) {
    rateFormError.value = '税率必须为 0–100 之间的数字。'
    return
  }
  if (!from) {
    rateFormError.value = '请选择生效日期。'
    return
  }
  if (to && to <= from) {
    rateFormError.value = '停用日期必须晚于生效日期。'
    return
  }
  const code = rateFormCode.value
  const sameCode = rateVersions.value.filter(version => version.code === code)
  const overlapping = sameCode.find(version => (
    version.effectiveFrom === from
    || (version.effectiveFrom <= from && (!version.effectiveTo || version.effectiveTo >= from))
  ))
  if (overlapping) {
    rateFormError.value = '同一税种在 ' + from + ' 已有生效版本，请先停用旧版本或另选日期。'
    return
  }
  rateFormError.value = ''
  const nextVersion = sameCode.find(version => version.effectiveFrom > from)
  const effectiveTo = to || (nextVersion ? taxPreviousDay(nextVersion.effectiveFrom) : '')
  localRateSeq += 1
  const created: TaxRateVersion = {
    id: 'rate-local-' + localRateSeq,
    code,
    taxType: rateTypeNameMap[code] ?? code,
    name: (rateTypeNameMap[code] ?? code) + ' ' + taxFormatRate(taxRound(amount, 4)) + '（本地新增）',
    rate: taxRound(amount, 4),
    effectiveFrom: from,
    effectiveTo,
    version: sameCode.length + 1
  }
  const adjusted = rateVersions.value.map((item) => {
    if (item.code === code && item.effectiveFrom < from && (!item.effectiveTo || item.effectiveTo >= from)) {
      return { ...item, effectiveTo: taxPreviousDay(from) }
    }
    return item
  })
  rateVersions.value = [...adjusted, created].sort((left, right) => {
    if (left.code === right.code) return left.effectiveFrom < right.effectiveFrom ? 1 : -1
    return left.code < right.code ? -1 : 1
  })
  rateCreateOpen.value = false
  toast.add({
    title: '税率版本已创建',
    description: created.name + ' 自 ' + created.effectiveFrom + ' 起生效，只影响该日期之后的计算。',
    color: 'success',
    icon: 'i-lucide-check'
  })
}

/* -------------------------------------------------------------------------- */
/* 税组与绑定                                                                  */
/* -------------------------------------------------------------------------- */

const groupColumns: TableColumn<TaxGroupDefinition>[] = [
  { accessorKey: 'name', header: '税组名称' },
  { id: 'lines', header: '税率组合' },
  { id: 'status', header: '状态' },
  { id: 'actions', header: '操作', meta: { class: { th: 'text-right', td: 'text-right' } } }
]

function groupRateText(group: TaxGroupDefinition) {
  return taxGroupRateSummary(group, rateVersions.value)
}

function groupTotalRateText(group: TaxGroupDefinition) {
  return taxFormatRate(taxGroupTotalRate(group, rateVersions.value))
}

function groupNameFor(groupId: string | undefined) {
  if (!groupId) return '未绑定'
  return groups.value.find(group => group.id === groupId)?.name ?? groupId
}

function toggleGroupStatus(group: TaxGroupDefinition) {
  const next: TaxGroupStatus = group.status === 'active' ? 'inactive' : 'active'
  groups.value = groups.value.map(item => (
    item.id === group.id ? { ...item, status: next, updatedAt: demoStamp } : item
  ))
  toast.add({
    title: next === 'active' ? '税组已启用' : '税组已停用',
    description: group.name + ' 状态已更新，仅本次预览生效。',
    color: 'neutral',
    icon: 'i-lucide-toggle-left'
  })
}

const rateCodeOptions = [
  { code: 'VAT13', label: '增值税 VAT13（2026-05 起 14%）' },
  { code: 'VAT6', label: '增值税（服务）VAT6 6%' },
  { code: 'CIT25', label: '企业所得税 CIT25 25%' },
  { code: 'SURTAX', label: '附加税 SURTAX' },
  { code: 'EXPORT', label: '出口免税 EXPORT 0%' }
]

const groupCreateOpen = ref(false)
const groupFormName = ref('')
const groupFormDescription = ref('')
const groupFormRates = ref<string[]>(['VAT13'])
const groupFormError = ref('')

const groupFormPreview = computed<TaxGroupDefinition>(() => ({
  id: 'group-preview',
  name: groupFormName.value || '未命名税组',
  description: groupFormDescription.value,
  lines: groupFormRates.value.map(code => ({ rateCode: code, basePortion: 100 })),
  status: 'active',
  updatedAt: demoStamp
}))

function openGroupCreate() {
  groupFormName.value = ''
  groupFormDescription.value = ''
  groupFormRates.value = ['VAT13']
  groupFormError.value = ''
  groupCreateOpen.value = true
}

function toggleGroupFormRate(code: string, checked: boolean) {
  if (checked) {
    if (!groupFormRates.value.includes(code)) groupFormRates.value = [...groupFormRates.value, code]
    return
  }
  groupFormRates.value = groupFormRates.value.filter(item => item !== code)
}

function saveGroup() {
  const name = groupFormName.value.trim()
  if (!name) {
    groupFormError.value = '请填写税组名称。'
    return
  }
  if (groupFormRates.value.length === 0) {
    groupFormError.value = '请至少选择一个税种组成税率组合。'
    return
  }
  groupFormError.value = ''
  const created: TaxGroupDefinition = {
    id: 'tg-local-' + Date.now().toString(36),
    name,
    description: groupFormDescription.value.trim() || '本地新增税组',
    lines: groupFormRates.value.map(code => ({ rateCode: code, basePortion: 100 })),
    status: 'active',
    updatedAt: demoStamp
  }
  groups.value = [created, ...groups.value]
  groupCreateOpen.value = false
  toast.add({
    title: '税组已创建',
    description: created.name + ' 已启用，可绑定到商品与往来单位。',
    color: 'success',
    icon: 'i-lucide-check'
  })
}

const bindingProductSku = ref('SKU-1001')
const bindingPartnerId = ref('partner-001')
const bindingTargetGroupId = ref('tg-standard')

const productOptions = computed(() => productBindings.value.map(item => ({
  label: item.sku + ' · ' + item.name,
  value: item.sku
})))

const partnerOptions = computed(() => partnerBindings.value.map(item => ({
  label: item.name + '（' + taxPartnerKindLabels[item.kind] + '）',
  value: item.id
})))

const groupOptions = computed(() => groups.value.map(item => ({
  label: item.name + (item.status === 'active' ? '' : '（已停用）'),
  value: item.id
})))

const selectedProductBinding = computed(() => (
  productBindings.value.find(item => item.sku === bindingProductSku.value) ?? null
))
const selectedPartnerBinding = computed(() => (
  partnerBindings.value.find(item => item.id === bindingPartnerId.value) ?? null
))
const boundProductGroupName = computed(() => groupNameFor(selectedProductBinding.value?.groupId))
const boundPartnerGroupName = computed(() => groupNameFor(selectedPartnerBinding.value?.groupId))

function saveBinding() {
  const product = selectedProductBinding.value
  const partner = selectedPartnerBinding.value
  if (!product || !partner) return
  const target = bindingTargetGroupId.value
  productBindings.value = productBindings.value.map(item => (
    item.sku === product.sku ? { ...item, groupId: target } : item
  ))
  partnerBindings.value = partnerBindings.value.map(item => (
    item.id === partner.id ? { ...item, groupId: target } : item
  ))
  toast.add({
    title: '税组绑定已保存',
    description: product.sku + ' 与 ' + partner.name + ' 绑定至 ' + groupNameFor(target) + '，仅本次预览生效。',
    color: 'success',
    icon: 'i-lucide-link'
  })
}

/* -------------------------------------------------------------------------- */
/* 税额计算预览                                                                */
/* -------------------------------------------------------------------------- */

const calcMode = ref<TaxCalcMode>('inclusive')
const calcAmount = ref('1130')
const calcDiscount = ref('0')
const calcGroupId = ref('tg-standard')
const calcRounding = ref<TaxRounding>('2')
const calcDate = ref('2026-01-15')

const modeOptions = [
  { label: taxCalcModeLabels.inclusive, value: 'inclusive' },
  { label: taxCalcModeLabels.exclusive, value: 'exclusive' }
]
const roundingOptions = [
  { label: taxRoundingLabels['2'], value: '2' },
  { label: taxRoundingLabels['1'], value: '1' },
  { label: taxRoundingLabels['0'], value: '0' }
]

function onCalcMode(value: unknown) {
  calcMode.value = value === 'exclusive' ? 'exclusive' : 'inclusive'
}

function onCalcRounding(value: unknown) {
  calcRounding.value = value === '1' ? '1' : value === '0' ? '0' : '2'
}

const calcGroup = computed(() => (
  groups.value.find(group => group.id === calcGroupId.value) ?? groups.value[0] ?? null
))

const calcResult = computed(() => {
  const group = calcGroup.value
  if (!group) return null
  const amount = Number(calcAmount.value)
  if (!Number.isFinite(amount) || amount <= 0) return null
  const discount = Number(calcDiscount.value)
  return calculateTaxPreview({
    mode: calcMode.value,
    amount,
    discount: Number.isFinite(discount) ? discount : 0,
    rounding: calcRounding.value,
    date: calcDate.value,
    group,
    rateVersions: rateVersions.value
  })
})

const calcRateSummary = computed(() => (
  calcGroup.value ? taxGroupRateSummary(calcGroup.value, rateVersions.value, calcDate.value) : '—'
))

const calcColumns: TableColumn<TaxCalcLine>[] = [
  { accessorKey: 'taxType', header: '分税项' },
  { accessorKey: 'rate', header: '税率', meta: { class: { th: 'text-right', td: 'text-right tabular-nums whitespace-nowrap' } } },
  { accessorKey: 'base', header: '计税基础', meta: { class: { th: 'text-right', td: 'text-right tabular-nums whitespace-nowrap' } } },
  { accessorKey: 'tax', header: '税额', meta: { class: { th: 'text-right', td: 'text-right tabular-nums whitespace-nowrap' } } },
  { accessorKey: 'versionLabel', header: '生效税率版本' }
]

function applyNewRateDate() {
  calcDate.value = calcDate.value < '2026-05-01' ? '2026-05-01' : '2026-01-15'
  toast.add({
    title: '计算日期已切换',
    description: '当前计算日期 ' + calcDate.value + '，税率版本按该日期解析。',
    color: 'info',
    icon: 'i-lucide-calendar-clock'
  })
}

/* -------------------------------------------------------------------------- */
/* 税历、申报与更正                                                            */
/* -------------------------------------------------------------------------- */

interface RepreviewLine {
  id: string
  taxCode: string
  taxType: string
  rate: number
  declaredBase: number
  declaredTax: number
  recomputedBase: number
  recomputedTax: number
  diff: number
}

interface RepreviewTotals {
  declaredTax: number
  recomputedTax: number
  diff: number
}

interface RepreviewState {
  basis: TaxBasis
  lines: RepreviewLine[]
  total: RepreviewTotals
}

const periodDetailOpen = ref(false)
const selectedPeriodId = ref<string | null>(null)
const repreview = ref<RepreviewState | null>(null)
const correctionReason = ref('')
const periodError = ref('')

const selectedPeriod = computed<TaxPeriodState | null>(() => (
  calendarPeriods.value.find(period => period.id === selectedPeriodId.value) ?? null
))

const periodLineColumns: TableColumn<TaxPeriodLineState>[] = [
  { accessorKey: 'taxType', header: '分税项' },
  { accessorKey: 'rate', header: '税率', meta: { class: { th: 'text-right', td: 'text-right tabular-nums whitespace-nowrap' } } },
  { accessorKey: 'declaredBase', header: '申报计税基础', meta: { class: { th: 'text-right', td: 'text-right tabular-nums whitespace-nowrap' } } },
  { accessorKey: 'declaredTax', header: '申报税额', meta: { class: { th: 'text-right', td: 'text-right tabular-nums whitespace-nowrap' } } },
  { id: 'recomputedBase', header: '重算计税基础', meta: { class: { th: 'text-right', td: 'text-right tabular-nums whitespace-nowrap' } } },
  { id: 'recomputedTax', header: '当前税额', meta: { class: { th: 'text-right', td: 'text-right tabular-nums whitespace-nowrap' } } },
  { id: 'diff', header: '差异', meta: { class: { th: 'text-right', td: 'text-right tabular-nums whitespace-nowrap' } } }
]

const declaredBaseTotal = computed(() => {
  const period = selectedPeriod.value
  if (!period) return 0
  return taxRound(period.lines.reduce((sum, line) => sum + line.declaredBase, 0))
})

const declaredTaxTotal = computed(() => {
  const period = selectedPeriod.value
  if (!period) return 0
  return taxPeriodDeclaredAmount(period)
})

const latestRecord = computed(() => selectedPeriod.value?.records[0] ?? null)
const latestTrace = computed(() => {
  const period = selectedPeriod.value
  if (!period) return null
  return period.records.find(record => Boolean(record.traceOf)) ?? null
})

const repreviewHasDiff = computed(() => Boolean(repreview.value && repreview.value.total.diff !== 0))

function signedMoney(value: number) {
  if (value > 0) return '+' + formatMoney(value)
  if (value < 0) return '-' + formatMoney(Math.abs(value))
  return formatMoney(0)
}

function diffClass(value: number) {
  if (value > 0) return 'text-error'
  if (value < 0) return 'text-success'
  return 'text-muted'
}

function repreviewLineFor(line: TaxPeriodLineState) {
  return repreview.value?.lines.find(item => item.id === line.id) ?? null
}

function openPeriod(period: TaxPeriodState) {
  selectedPeriodId.value = period.id
  repreview.value = null
  correctionReason.value = ''
  periodError.value = ''
  periodDetailOpen.value = true
}

function filePeriod() {
  const period = selectedPeriod.value
  if (!period || period.status !== 'open') return
  period.filingNumber = 'TAX-' + period.period + '-0001'
  period.filedAt = demoStamp
  period.booksLocked = true
  period.status = 'filed'
  period.records = [
    {
      id: period.id + '-record-1',
      number: period.filingNumber,
      kind: 'filing',
      version: 1,
      at: demoStamp,
      basis: calendarBasis.value,
      taxAmount: taxPeriodDeclaredAmount(period)
    }
  ]
  repreview.value = null
  correctionReason.value = ''
  periodError.value = ''
  toast.add({
    title: '首次申报已提交',
    description: period.label + ' 生成申报编号 ' + period.filingNumber + '，账簿已锁定。',
    color: 'success',
    icon: 'i-lucide-send'
  })
}

function generateRepreview() {
  const period = selectedPeriod.value
  if (!period) return
  const basis = calendarBasis.value
  const lines: RepreviewLine[] = period.lines.map((line) => {
    const base = basis === 'accrual' ? line.accrualBase : line.cashBase
    const recomputedTax = taxRound((base * line.rate) / 100)
    return {
      id: line.id,
      taxCode: line.taxCode,
      taxType: line.taxType,
      rate: line.rate,
      declaredBase: line.declaredBase,
      declaredTax: line.declaredTax,
      recomputedBase: base,
      recomputedTax,
      diff: taxRound(recomputedTax - line.declaredTax)
    }
  })
  const declaredTax = taxRound(lines.reduce((sum, line) => sum + line.declaredTax, 0))
  const recomputedTax = taxRound(lines.reduce((sum, line) => sum + line.recomputedTax, 0))
  repreview.value = {
    basis,
    lines,
    total: { declaredTax, recomputedTax, diff: taxRound(recomputedTax - declaredTax) }
  }
  periodError.value = ''
  toast.add({
    title: '重新预览完成',
    description: '按 ' + taxBasisLabels[basis] + ' 口径计算，差异合计 ' + signedMoney(repreview.value.total.diff) + '。',
    color: repreviewHasDiff.value ? 'warning' : 'success',
    icon: 'i-lucide-refresh-cw'
  })
}

function submitCorrection() {
  const period = selectedPeriod.value
  const snapshot = repreview.value
  if (!period) return
  if (!snapshot) {
    periodError.value = '请先重新预览税额并确认差异。'
    return
  }
  if (snapshot.total.diff === 0) {
    periodError.value = '当前没有差异，无需提交更正申报。'
    return
  }
  if (!correctionReason.value.trim()) {
    periodError.value = '更正原因必填，请填写更正原因后再提交。'
    return
  }
  periodError.value = ''
  const traceNumber = period.filingNumber ?? period.records.find(record => record.kind === 'filing')?.number ?? ''
  const correctionIndex = period.records.filter(record => record.kind === 'correction').length + 1
  const newNumber = traceNumber + '-C' + correctionIndex
  const updatedLines = period.lines.map((line) => {
    const matched = snapshot.lines.find(item => item.id === line.id)
    if (!matched) return line
    return {
      ...line,
      declaredBase: matched.recomputedBase,
      declaredTax: matched.recomputedTax,
      rate: matched.rate
    }
  })
  const newTotal = taxRound(updatedLines.reduce((sum, line) => sum + line.declaredTax, 0))
  period.lines = updatedLines
  period.records = [
    {
      id: period.id + '-record-' + (period.records.length + 1),
      number: newNumber,
      kind: 'correction',
      version: period.records.length + 1,
      at: demoStamp,
      basis: snapshot.basis,
      taxAmount: newTotal,
      reason: correctionReason.value.trim(),
      traceOf: traceNumber
    },
    ...period.records
  ]
  period.status = 'corrected'
  repreview.value = null
  correctionReason.value = ''
  toast.add({
    title: '更正申报已提交',
    description: '生成 ' + newNumber + '，追溯原申报 ' + traceNumber + '，原记录保留在申报历史。',
    color: 'success',
    icon: 'i-lucide-clipboard-check'
  })
}

/* -------------------------------------------------------------------------- */
/* 重置                                                                        */
/* -------------------------------------------------------------------------- */

function resetDemo() {
  rateVersions.value = structuredClone(taxCenterRateVersions)
  groups.value = structuredClone(taxCenterTaxGroups)
  productBindings.value = structuredClone(taxCenterProductBindings)
  partnerBindings.value = structuredClone(taxCenterPartnerBindings)
  monthlyCalendar.value = buildTaxCalendarPeriods('monthly', rateVersions.value)
  quarterlyCalendar.value = buildTaxCalendarPeriods('quarterly', rateVersions.value)
  calendarFrequency.value = 'monthly'
  calendarBasis.value = 'accrual'
  periodDetailOpen.value = false
  selectedPeriodId.value = null
  repreview.value = null
  correctionReason.value = ''
  periodError.value = ''
  rateCreateOpen.value = false
  rateDetailOpen.value = false
  groupCreateOpen.value = false
  rateFormError.value = ''
  groupFormError.value = ''
  calcDate.value = '2026-01-15'
  calcMode.value = 'inclusive'
  calcAmount.value = '1130'
  calcDiscount.value = '0'
  calcGroupId.value = 'tg-standard'
  calcRounding.value = '2'
  bindingProductSku.value = 'SKU-1001'
  bindingPartnerId.value = 'partner-001'
  bindingTargetGroupId.value = 'tg-standard'
  toast.add({
    title: '演示数据已重置',
    description: '税率版本、税组、绑定与税历恢复初始种子。',
    color: 'neutral',
    icon: 'i-lucide-rotate-ccw'
  })
}
</script>

<template>
  <section class="space-y-5" data-testid="finance-tax-center">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="text-lg font-semibold text-highlighted">
          税务中心
        </h1>
        <p class="mt-1 max-w-3xl text-sm text-muted">
          维护税率版本与税组绑定，预览税额机械计算，并在税历中完成申报与更正。所有操作仅本次预览生效，刷新页面恢复种子数据。
        </p>
      </div>
      <UButton
        label="重置演示数据"
        icon="i-lucide-rotate-ccw"
        color="neutral"
        variant="outline"
        size="sm"
        data-testid="tax-center-reset"
        @click="resetDemo"
      />
    </div>

    <!-- 1. 税率版本 -->
    <UCard class="rounded-sm nx-reveal">
      <template #header>
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div class="flex items-center gap-2">
              <h2 class="text-base font-semibold text-highlighted">
                税率版本
              </h2>
              <UBadge
                :label="rateVersions.length + ' 个版本'"
                color="neutral"
                variant="subtle"
                size="sm"
              />
            </div>
            <p class="mt-0.5 text-xs text-muted">
              同一税种可维护多个版本：新版本只影响生效日期之后的计算，历史单据保留原版本快照。
            </p>
          </div>
          <UButton
            label="新建税率版本"
            icon="i-lucide-plus"
            size="sm"
            data-testid="tax-rate-create"
            @click="openRateCreate"
          />
        </div>
      </template>

      <ResizableTable
        :data="rateRows"
        :columns="rateColumns"
        :row-activate="openRateDetail"
        class="nx-table"
        :ui="{ th: 'py-2.5', td: 'py-3' }"
        data-testid="tax-rate-table"
      >
        <template #code-cell="{ row }">
          <div class="flex flex-col">
            <span class="font-medium text-highlighted">{{ row.original.taxType }}</span>
            <span class="text-xs text-muted">{{ row.original.name }} · {{ row.original.code }} · v{{ row.original.version }}</span>
          </div>
        </template>
        <template #rate-cell="{ row }">
          {{ taxFormatRate(row.original.rate) }}
        </template>
        <template #effectiveTo-cell="{ row }">
          <span v-if="row.original.effectiveTo">{{ row.original.effectiveTo }}</span>
          <span v-else class="text-muted">持续有效</span>
        </template>
        <template #status-cell="{ row }">
          <UBadge
            :label="taxRateStatusLabels[taxRateVersionStatus(row.original, today)]"
            :color="taxRateStatusColors[taxRateVersionStatus(row.original, today)]"
            variant="subtle"
            size="sm"
          />
        </template>
      </ResizableTable>

      <p class="mt-3 rounded-sm border border-dashed border-default px-3 py-2 text-xs text-muted">
        示例：增值税 13% 版本在 2026-04-30 停用，2026-05-01 起新版本 14% 生效；把下方税额预览的计算日期切到 2026-05-01，同一笔金额会按 14% 重新解析。点击表格行可查看该版本下的历史单据「计算快照」。
      </p>
    </UCard>

    <!-- 2. 税组 -->
    <UCard class="rounded-sm nx-reveal">
      <template #header>
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div class="flex items-center gap-2">
              <h2 class="text-base font-semibold text-highlighted">
                税组管理
              </h2>
              <UBadge
                :label="groups.length + ' 个税组'"
                color="neutral"
                variant="subtle"
                size="sm"
              />
            </div>
            <p class="mt-0.5 text-xs text-muted">
              税组组合多个税种与计税基础占比；启用状态决定能否绑定到商品与往来单位。
            </p>
          </div>
          <UButton
            label="新建税组"
            icon="i-lucide-plus"
            size="sm"
            data-testid="tax-group-create"
            @click="openGroupCreate"
          />
        </div>
      </template>

      <ResizableTable
        :data="groups"
        :columns="groupColumns"
        class="nx-table"
        :ui="{ th: 'py-2.5', td: 'py-3' }"
        data-testid="tax-group-table"
      >
        <template #name-cell="{ row }">
          <div class="flex flex-col">
            <span class="font-medium text-highlighted">{{ row.original.name }}</span>
            <span class="text-xs text-muted">{{ row.original.description }} · 更新于 {{ row.original.updatedAt }}</span>
          </div>
        </template>
        <template #lines-cell="{ row }">
          <div class="flex flex-col">
            <span class="text-xs text-default">{{ groupRateText(row.original) }}</span>
            <span class="text-xs text-muted">合计税率 {{ groupTotalRateText(row.original) }}</span>
          </div>
        </template>
        <template #status-cell="{ row }">
          <UBadge
            :label="taxGroupStatusLabels[row.original.status]"
            :color="taxGroupStatusColors[row.original.status]"
            variant="subtle"
            size="sm"
          />
        </template>
        <template #actions-cell="{ row }">
          <UButton
            :label="row.original.status === 'active' ? '停用' : '启用'"
            size="xs"
            color="neutral"
            variant="ghost"
            :data-testid="'tax-group-toggle-' + row.original.id"
            @click="toggleGroupStatus(row.original)"
          />
        </template>
      </ResizableTable>
    </UCard>

    <!-- 3. 税组绑定 -->
    <UCard class="rounded-sm nx-reveal">
      <template #header>
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 class="text-base font-semibold text-highlighted">
              商品 / 往来单位税组绑定
            </h2>
            <p class="mt-0.5 text-xs text-muted">
              选择商品 SKU 与往来单位，查看当前绑定税组并保存新的绑定；开票与税额预览按绑定税组取税。
            </p>
          </div>
          <UButton
            label="保存绑定"
            icon="i-lucide-link"
            size="sm"
            data-testid="tax-binding-save"
            @click="saveBinding"
          />
        </div>
      </template>

      <div class="grid gap-3 lg:grid-cols-3">
        <UFormField label="商品 SKU">
          <USelect
            :model-value="bindingProductSku"
            :items="productOptions"
            class="w-full"
            data-testid="tax-binding-product"
            @update:model-value="bindingProductSku = String($event)"
          />
        </UFormField>
        <UFormField label="往来单位">
          <USelect
            :model-value="bindingPartnerId"
            :items="partnerOptions"
            class="w-full"
            data-testid="tax-binding-partner"
            @update:model-value="bindingPartnerId = String($event)"
          />
        </UFormField>
        <UFormField label="目标税组">
          <USelect
            :model-value="bindingTargetGroupId"
            :items="groupOptions"
            class="w-full"
            data-testid="tax-binding-group"
            @update:model-value="bindingTargetGroupId = String($event)"
          />
        </UFormField>
      </div>

      <div class="mt-3 grid gap-2 text-xs sm:grid-cols-2">
        <div class="rounded-sm border border-default bg-elevated/40 px-3 py-2">
          <p class="text-muted">
            商品当前绑定
            <span class="font-medium text-highlighted">{{ boundProductGroupName }}</span>
          </p>
          <p class="mt-0.5 text-muted">
            {{ selectedProductBinding?.sku }} · {{ selectedProductBinding?.name }} · {{ selectedProductBinding?.category }}
          </p>
        </div>
        <div class="rounded-sm border border-default bg-elevated/40 px-3 py-2">
          <p class="text-muted">
            往来单位当前绑定
            <span class="font-medium text-highlighted">{{ boundPartnerGroupName }}</span>
          </p>
          <p class="mt-0.5 text-muted">
            {{ selectedPartnerBinding?.name }} · {{ selectedPartnerBinding ? taxPartnerKindLabels[selectedPartnerBinding.kind] : '' }} · {{ selectedPartnerBinding?.region }}
          </p>
        </div>
      </div>

      <div class="mt-3 grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-4">
        <div v-for="product in productBindings" :key="product.sku" class="rounded-sm border border-default px-3 py-2">
          <p class="font-mono text-xs text-highlighted">
            {{ product.sku }}
          </p>
          <p class="mt-0.5 text-muted">
            {{ product.name }}
          </p>
          <p class="mt-0.5 text-xs font-medium text-default">
            {{ groupNameFor(product.groupId) }}
          </p>
        </div>
      </div>
      <div class="mt-2 grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-4">
        <div v-for="partner in partnerBindings" :key="partner.id" class="rounded-sm border border-default px-3 py-2">
          <p class="text-xs text-highlighted">
            {{ partner.name }}
          </p>
          <p class="mt-0.5 text-muted">
            {{ taxPartnerKindLabels[partner.kind] }} · {{ partner.region }}
          </p>
          <p class="mt-0.5 text-xs font-medium text-default">
            {{ groupNameFor(partner.groupId) }}
          </p>
        </div>
      </div>
    </UCard>

    <!-- 4. 税额计算预览 -->
    <UCard class="rounded-sm nx-reveal">
      <template #header>
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 class="text-base font-semibold text-highlighted">
              税额计算预览
            </h2>
            <p class="mt-0.5 text-xs text-muted">
              固定公式：含税 1,130 按 13% 计算 -> 未税 1,000、税额 130；切换计算日期可验证新税率版本只影响生效日之后的计算。
            </p>
          </div>
          <UButton
            label="套用 2026-05 新税率"
            icon="i-lucide-calendar-clock"
            size="sm"
            color="neutral"
            variant="outline"
            data-testid="tax-calc-use-new-rate"
            @click="applyNewRateDate"
          />
        </div>
      </template>

      <div class="grid gap-5 lg:grid-cols-[20rem_minmax(0,1fr)]">
        <div class="space-y-3">
          <UFormField label="金额口径">
            <USelect
              :model-value="calcMode"
              :items="modeOptions"
              class="w-full"
              data-testid="tax-calc-mode"
              @update:model-value="onCalcMode"
            />
          </UFormField>
          <UFormField label="金额（元）">
            <UInput
              v-model="calcAmount"
              type="number"
              min="0"
              step="0.01"
              class="w-full"
              data-testid="tax-calc-amount"
            />
          </UFormField>
          <UFormField label="折扣（元）">
            <UInput
              v-model="calcDiscount"
              type="number"
              min="0"
              step="0.01"
              class="w-full"
              data-testid="tax-calc-discount"
            />
          </UFormField>
          <UFormField label="税组">
            <USelect
              :model-value="calcGroupId"
              :items="groupOptions"
              class="w-full"
              data-testid="tax-calc-group"
              @update:model-value="calcGroupId = String($event)"
            />
          </UFormField>
          <UFormField label="舍入">
            <USelect
              :model-value="calcRounding"
              :items="roundingOptions"
              class="w-full"
              data-testid="tax-calc-rounding"
              @update:model-value="onCalcRounding"
            />
          </UFormField>
          <UFormField label="计算日期">
            <UInput
              v-model="calcDate"
              type="date"
              class="w-full"
              data-testid="tax-calc-date"
            />
          </UFormField>
        </div>

        <div class="space-y-4">
          <div class="grid gap-3 sm:grid-cols-3">
            <div class="rounded-sm border border-default p-3">
              <p class="text-xs text-muted">
                未税金额
              </p>
              <p class="mt-1 text-lg font-semibold tabular-nums text-highlighted" data-testid="tax-calc-net">
                {{ calcResult ? formatMoney(calcResult.netAmount) : '—' }}
              </p>
            </div>
            <div class="rounded-sm border border-default p-3">
              <p class="text-xs text-muted">
                税额
              </p>
              <p class="mt-1 text-lg font-semibold tabular-nums text-highlighted" data-testid="tax-calc-tax">
                {{ calcResult ? formatMoney(calcResult.taxAmount) : '—' }}
              </p>
            </div>
            <div class="rounded-sm border border-default p-3">
              <p class="text-xs text-muted">
                含税金额
              </p>
              <p class="mt-1 text-lg font-semibold tabular-nums text-highlighted" data-testid="tax-calc-gross">
                {{ calcResult ? formatMoney(calcResult.grossAmount) : '—' }}
              </p>
            </div>
          </div>

          <ResizableTable
            v-if="calcResult"
            :data="calcResult.lines"
            :columns="calcColumns"
            class="nx-table"
            :ui="{ th: 'py-2.5', td: 'py-3' }"
            data-testid="tax-calc-breakdown"
          >
            <template #rate-cell="{ row }">
              {{ taxFormatRate(row.original.rate) }}
            </template>
            <template #base-cell="{ row }">
              {{ formatMoney(row.original.base) }}
            </template>
            <template #tax-cell="{ row }">
              {{ formatMoney(row.original.tax) }}
            </template>
          </ResizableTable>

          <div class="rounded-sm border border-default bg-elevated/40 p-3 text-xs" data-testid="tax-calc-snapshot">
            <p class="font-medium text-highlighted">
              计算快照
            </p>
            <p v-if="calcResult" class="mt-1 text-muted">
              计算日期 {{ calcDate }} · {{ calcResult.groupName }} · {{ calcRateSummary }} · 舍入 {{ taxRoundingLabels[calcRounding] }} · 未税 {{ formatMoney(calcResult.netAmount) }} / 税额 {{ formatMoney(calcResult.taxAmount) }} / 含税 {{ formatMoney(calcResult.grossAmount) }}
            </p>
            <p v-else class="mt-1 text-muted">
              请输入有效金额后生成计算快照。
            </p>
            <p class="mt-1 text-muted">
              结果按计算日期解析税率版本；历史单据始终按归档时的版本快照出账，不随新版本变化。
            </p>
          </div>
        </div>
      </div>
    </UCard>

    <!-- 5. 税历 -->
    <UCard class="rounded-sm nx-reveal">
      <template #header>
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 class="text-base font-semibold text-highlighted">
              税历与申报
            </h2>
            <p class="mt-0.5 text-xs text-muted">
              点击期间打开详情：首次申报后锁定账簿；税额变化需重新预览生成差异，填写更正原因后提交更正并追溯原记录。
            </p>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <USelect
              :model-value="calendarFrequency"
              :items="frequencyOptions"
              class="w-40"
              data-testid="tax-calendar-frequency"
              @update:model-value="onFrequency"
            />
            <USelect
              :model-value="calendarBasis"
              :items="basisOptions"
              class="w-40"
              data-testid="tax-calendar-basis"
              @update:model-value="onBasis"
            />
          </div>
        </div>
      </template>

      <div class="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6" data-testid="tax-calendar">
        <button
          v-for="period in calendarPeriods"
          :key="period.id"
          type="button"
          class="rounded-sm border border-default px-3 py-2 text-left transition hover:bg-elevated/60"
          :data-testid="'tax-period-cell-' + period.period"
          @click="openPeriod(period)"
        >
          <div class="flex items-center justify-between gap-2">
            <span class="text-sm font-medium text-highlighted">{{ period.label }}</span>
            <UBadge
              :label="taxPeriodStatusLabels[period.status]"
              :color="taxPeriodStatusColors[period.status]"
              variant="subtle"
              size="sm"
            />
          </div>
          <p class="mt-1 text-xs tabular-nums text-muted">
            {{ formatMoney(taxPeriodDeclaredAmount(period)) }}
          </p>
          <p class="mt-0.5 text-xs text-dimmed">
            {{ period.booksLocked ? '账簿已锁定' : period.status === 'upcoming' ? '未开始' : '待申报' }} · 截止 {{ period.dueAt }}
          </p>
        </button>
      </div>
    </UCard>

    <!-- 税率版本详情 -->
    <UModal v-model:open="rateDetailOpen" title="税率版本详情" :ui="{ content: 'sm:max-w-2xl' }">
      <template #body>
        <div v-if="selectedRate" class="space-y-4" data-testid="tax-rate-detail">
          <div class="grid gap-3 sm:grid-cols-2">
            <div class="rounded-sm border border-default p-3">
              <p class="text-xs text-muted">
                税种 / 版本
              </p>
              <p class="mt-1 text-sm font-medium text-highlighted">
                {{ selectedRate.taxType }} · v{{ selectedRate.version }}
              </p>
              <p class="mt-1 text-xs text-muted">
                {{ selectedRate.name }} · {{ selectedRate.code }}
              </p>
            </div>
            <div class="rounded-sm border border-default p-3">
              <p class="text-xs text-muted">
                税率 / 状态
              </p>
              <p class="mt-1 text-sm font-semibold tabular-nums text-highlighted">
                {{ taxFormatRate(selectedRate.rate) }}
              </p>
              <div class="mt-1">
                <UBadge
                  :label="taxRateStatusLabels[selectedRateStatus]"
                  :color="taxRateStatusColors[selectedRateStatus]"
                  variant="subtle"
                  size="sm"
                />
              </div>
            </div>
          </div>

          <div class="grid gap-2 text-sm sm:grid-cols-2">
            <div class="flex items-center justify-between gap-3 rounded-sm border border-default px-3 py-2">
              <span class="text-muted">生效日期</span>
              <span class="tabular-nums text-highlighted">{{ selectedRate.effectiveFrom }}</span>
            </div>
            <div class="flex items-center justify-between gap-3 rounded-sm border border-default px-3 py-2">
              <span class="text-muted">停用日期</span>
              <span class="tabular-nums text-highlighted">{{ selectedRate.effectiveTo ?? '持续有效' }}</span>
            </div>
          </div>

          <UAlert
            color="info"
            variant="soft"
            icon="i-lucide-info"
            title="版本只影响生效日期之后的计算"
            description="同一税种的新版本不会改写历史单据：已归档单据继续按原版本的税率和金额显示计算快照，新单据按生效日期解析到新版本。"
          />

          <div class="rounded-sm border border-default">
            <div class="border-b border-default px-3 py-2">
              <p class="text-sm font-semibold text-highlighted">
                计算快照
              </p>
              <p class="mt-0.5 text-xs text-muted">
                该税率版本下已归档的历史单据，不随后续换版本变化。
              </p>
            </div>
            <ul class="divide-y divide-default">
              <li
                v-for="snapshot in snapshotsFor(selectedRate)"
                :key="snapshot.id"
                class="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-xs"
              >
                <div>
                  <p class="font-mono text-highlighted">
                    {{ snapshot.document }}
                  </p>
                  <p class="mt-0.5 text-muted">
                    {{ snapshot.date }} · 税率 {{ taxFormatRate(snapshot.rate) }} · 净额 {{ formatMoney(snapshot.netAmount) }}
                  </p>
                </div>
                <div class="text-right">
                  <p class="tabular-nums text-highlighted">
                    税额 {{ formatMoney(snapshot.taxAmount) }}
                  </p>
                  <p class="tabular-nums text-muted">
                    含税 {{ formatMoney(snapshot.grossAmount) }}
                  </p>
                </div>
              </li>
              <li v-if="snapshotsFor(selectedRate).length === 0" class="px-3 py-4 text-center text-xs text-muted">
                该版本暂无历史单据快照。
              </li>
            </ul>
          </div>

          <div class="flex justify-end gap-2">
            <UButton
              v-if="selectedRateStatus === 'active'"
              label="停用该版本"
              color="warning"
              variant="soft"
              size="sm"
              data-testid="tax-rate-retire"
              @click="retireRate(selectedRate)"
            />
            <UButton
              label="关闭"
              color="neutral"
              variant="ghost"
              size="sm"
              data-testid="tax-rate-detail-close"
              @click="rateDetailOpen = false"
            />
          </div>
        </div>
      </template>
    </UModal>

    <!-- 新建税率版本 -->
    <UModal v-model:open="rateCreateOpen" title="新建税率版本" :ui="{ content: 'sm:max-w-xl' }">
      <template #body>
        <form class="space-y-4" data-testid="tax-rate-form" @submit.prevent="saveRateVersion">
          <p class="text-xs text-muted">
            保存后立即加入本地版本列表，并自动把同一税种上一版本的停用日期设为新版本生效日前一天。
          </p>
          <UFormField label="税种" required>
            <USelect
              :model-value="rateFormCode"
              :items="rateTypeOptions"
              class="w-full"
              data-testid="tax-rate-code"
              @update:model-value="rateFormCode = String($event)"
            />
          </UFormField>
          <UFormField label="税率（%）" required>
            <UInput
              v-model="rateFormRate"
              type="number"
              min="0"
              max="100"
              step="0.01"
              class="w-full"
              data-testid="tax-rate-rate"
            />
          </UFormField>
          <div class="grid gap-3 sm:grid-cols-2">
            <UFormField label="生效日期" required>
              <UInput
                v-model="rateFormFrom"
                type="date"
                class="w-full"
                data-testid="tax-rate-from"
              />
            </UFormField>
            <UFormField label="停用日期（留空表示持续有效）">
              <UInput
                v-model="rateFormTo"
                type="date"
                class="w-full"
                data-testid="tax-rate-to"
              />
            </UFormField>
          </div>
          <UAlert
            v-if="rateFormError"
            color="error"
            variant="soft"
            icon="i-lucide-alert-circle"
            :title="rateFormError"
            data-testid="tax-rate-error"
          />
          <div class="flex justify-end gap-2">
            <UButton
              label="取消"
              color="neutral"
              variant="ghost"
              @click="rateCreateOpen = false"
            />
            <UButton type="submit" label="保存版本" data-testid="tax-rate-save" />
          </div>
        </form>
      </template>
    </UModal>

    <!-- 新建税组 -->
    <UModal v-model:open="groupCreateOpen" title="新建税组" :ui="{ content: 'sm:max-w-xl' }">
      <template #body>
        <div class="space-y-4">
          <UFormField label="税组名称" required>
            <UInput
              v-model="groupFormName"
              class="w-full"
              placeholder="例如：出口服务税组"
              data-testid="tax-group-form-name"
            />
          </UFormField>
          <UFormField label="说明">
            <UInput
              v-model="groupFormDescription"
              class="w-full"
              placeholder="可选，说明适用业务"
              data-testid="tax-group-form-description"
            />
          </UFormField>
          <UFormField label="税率组合" required>
            <div class="grid gap-2 sm:grid-cols-2">
              <UCheckbox
                v-for="option in rateCodeOptions"
                :key="option.code"
                :model-value="groupFormRates.includes(option.code)"
                :label="option.label"
                @update:model-value="toggleGroupFormRate(option.code, Boolean($event))"
              />
            </div>
          </UFormField>
          <div class="rounded-sm border border-default bg-elevated/40 px-3 py-2 text-xs">
            <p class="text-muted">
              组合预览：<span class="font-medium text-highlighted">{{ taxGroupRateSummary(groupFormPreview, rateVersions) }}</span>
            </p>
            <p class="mt-1 text-muted">
              合计税率 {{ taxFormatRate(taxGroupTotalRate(groupFormPreview, rateVersions)) }}
            </p>
          </div>
          <UAlert
            v-if="groupFormError"
            color="error"
            variant="soft"
            icon="i-lucide-alert-circle"
            :title="groupFormError"
            data-testid="tax-group-error"
          />
          <div class="flex justify-end gap-2">
            <UButton
              label="取消"
              color="neutral"
              variant="ghost"
              @click="groupCreateOpen = false"
            />
            <UButton label="保存税组" data-testid="tax-group-save" @click="saveGroup" />
          </div>
        </div>
      </template>
    </UModal>

    <!-- 期间详情 -->
    <USlideover v-model:open="periodDetailOpen" :ui="{ content: 'w-full sm:max-w-3xl' }">
      <template #header>
        <div class="flex flex-wrap items-start justify-between gap-2">
          <div v-if="selectedPeriod">
            <p class="font-mono text-xs text-muted">
              {{ selectedPeriod.id }} · {{ selectedPeriod.frequency === 'monthly' ? '按月申报' : '按季度申报' }}
            </p>
            <h2 class="mt-1 text-base font-semibold text-highlighted">
              {{ selectedPeriod.label }} 税务期间
            </h2>
            <p class="mt-0.5 text-xs text-muted">
              {{ selectedPeriod.startDate }} 至 {{ selectedPeriod.endDate }} · 申报截止 {{ selectedPeriod.dueAt }}
            </p>
          </div>
          <UBadge
            v-if="selectedPeriod"
            :label="taxPeriodStatusLabels[selectedPeriod.status]"
            :color="taxPeriodStatusColors[selectedPeriod.status]"
            variant="subtle"
            size="sm"
            data-testid="tax-period-status"
          />
        </div>
      </template>

      <template #body>
        <div v-if="selectedPeriod" class="space-y-5" data-testid="tax-period-detail">
          <div class="grid gap-3 sm:grid-cols-2">
            <div class="rounded-sm border border-default p-3">
              <p class="text-xs text-muted">
                申报编号
              </p>
              <p class="mt-1 font-mono text-sm font-medium text-highlighted" data-testid="tax-period-number">
                {{ selectedPeriod.filingNumber ?? '尚未申报' }}
              </p>
              <p class="mt-1 text-xs text-muted">
                首次申报 {{ selectedPeriod.filedAt ?? '—' }} · 申报记录 {{ selectedPeriod.records.length }} 条
              </p>
            </div>
            <div class="rounded-sm border border-default p-3">
              <p class="text-xs text-muted">
                申报口径 / 账簿
              </p>
              <p class="mt-1 text-sm font-medium text-highlighted">
                {{ taxBasisLabels[calendarBasis] }}
              </p>
              <p class="mt-1 text-xs text-muted">
                状态：<span class="font-medium" :class="selectedPeriod.booksLocked ? 'text-warning' : 'text-success'" data-testid="tax-period-locked">{{ selectedPeriod.booksLocked ? '账簿已锁定' : '账簿未锁定' }}</span>
              </p>
            </div>
          </div>

          <UAlert
            v-if="selectedPeriod.status === 'open'"
            color="info"
            variant="soft"
            icon="i-lucide-info"
            title="期间待申报"
            description="提交首次申报后本期间账簿锁定，后续税额变化只能通过重新预览生成差异，再填写原因提交更正申报。"
          />
          <UAlert
            v-else-if="selectedPeriod.status === 'upcoming'"
            color="neutral"
            variant="soft"
            icon="i-lucide-hourglass"
            title="期间未开始"
            description="期间尚未开始，无法申报；可查看期间口径与预计税额。"
          />
          <UAlert
            v-else
            color="success"
            variant="soft"
            icon="i-lucide-lock"
            :title="'账簿已锁定（' + (selectedPeriod.filingNumber ?? '已申报') + '）'"
            description="申报后账面金额不可直接修改。若税额发生变化，请重新预览生成差异并走更正申报，原申报记录会保留在历史中。"
          />

          <div class="grid gap-3 sm:grid-cols-3">
            <div class="rounded-sm border border-default p-3">
              <p class="text-xs text-muted">
                申报计税基础
              </p>
              <p class="mt-1 text-lg font-semibold tabular-nums text-highlighted" data-testid="tax-period-declared-base">
                {{ formatMoney(declaredBaseTotal) }}
              </p>
            </div>
            <div class="rounded-sm border border-default p-3">
              <p class="text-xs text-muted">
                申报税额
              </p>
              <p class="mt-1 text-lg font-semibold tabular-nums text-highlighted" data-testid="tax-period-tax-amount">
                {{ formatMoney(latestRecord ? latestRecord.taxAmount : declaredTaxTotal) }}
              </p>
            </div>
            <div class="rounded-sm border border-default p-3">
              <p class="text-xs text-muted">
                最近申报版本
              </p>
              <p class="mt-1 text-sm font-medium text-highlighted" data-testid="tax-period-latest">
                {{ latestRecord ? latestRecord.number : '—' }}
              </p>
              <p class="mt-1 text-xs text-muted">
                {{ latestRecord ? taxRecordKindLabels[latestRecord.kind] + ' · ' + latestRecord.at : '尚无申报记录' }}
              </p>
            </div>
          </div>

          <UAlert
            v-if="repreview"
            color="warning"
            variant="soft"
            icon="i-lucide-scale"
            :title="'差异合计 ' + signedMoney(repreview.total.diff)"
            :description="'按 ' + taxBasisLabels[repreview.basis] + ' 口径重新计税：申报税额 ' + formatMoney(repreview.total.declaredTax) + '，当前税额 ' + formatMoney(repreview.total.recomputedTax) + '，差异 ' + signedMoney(repreview.total.diff) + '。'"
            data-testid="tax-period-difference"
          />

          <div class="rounded-sm border border-default">
            <div class="flex flex-wrap items-center justify-between gap-2 border-b border-default px-3 py-2">
              <p class="text-sm font-semibold text-highlighted">
                分税项汇总
              </p>
              <p class="text-xs text-muted">
                按 {{ taxBasisLabels[calendarBasis] }} 口径预览
              </p>
            </div>
            <ResizableTable
              :data="selectedPeriod.lines"
              :columns="periodLineColumns"
              class="nx-table"
              :ui="{ th: 'py-2.5', td: 'py-3' }"
              data-testid="tax-period-lines"
            >
              <template #rate-cell="{ row }">
                {{ taxFormatRate(row.original.rate) }}
              </template>
              <template #declaredBase-cell="{ row }">
                {{ formatMoney(row.original.declaredBase) }}
              </template>
              <template #declaredTax-cell="{ row }">
                {{ formatMoney(row.original.declaredTax) }}
              </template>
              <template #recomputedBase-cell="{ row }">
                <span v-if="repreviewLineFor(row.original)">{{ formatMoney(repreviewLineFor(row.original)?.recomputedBase ?? 0) }}</span>
                <span v-else class="text-muted">—</span>
              </template>
              <template #recomputedTax-cell="{ row }">
                <span v-if="repreviewLineFor(row.original)">{{ formatMoney(repreviewLineFor(row.original)?.recomputedTax ?? 0) }}</span>
                <span v-else class="text-muted">—</span>
              </template>
              <template #diff-cell="{ row }">
                <span v-if="repreviewLineFor(row.original)" :class="diffClass(repreviewLineFor(row.original)?.diff ?? 0)">
                  {{ signedMoney(repreviewLineFor(row.original)?.diff ?? 0) }}
                </span>
                <span v-else class="text-muted">—</span>
              </template>
            </ResizableTable>
          </div>

          <div class="rounded-sm border border-default p-3">
            <p class="text-xs font-medium text-highlighted">
              申报与更正
            </p>
            <div class="mt-2 flex flex-wrap items-center gap-2">
              <UButton
                v-if="selectedPeriod.status === 'open'"
                label="提交首次申报"
                icon="i-lucide-send"
                size="sm"
                data-testid="tax-period-file"
                @click="filePeriod"
              />
              <UButton
                v-if="selectedPeriod.status === 'filed' || selectedPeriod.status === 'corrected'"
                label="重新预览税额"
                icon="i-lucide-refresh-cw"
                size="sm"
                color="neutral"
                variant="outline"
                data-testid="tax-period-repreview"
                @click="generateRepreview"
              />
              <UButton
                label="提交更正申报"
                icon="i-lucide-clipboard-check"
                size="sm"
                color="warning"
                :disabled="!repreviewHasDiff"
                data-testid="tax-period-correct"
                @click="submitCorrection"
              />
            </div>
            <UFormField
              v-if="selectedPeriod.booksLocked"
              label="更正原因"
              required
              class="mt-3"
            >
              <UInput
                v-model="correctionReason"
                class="w-full"
                placeholder="说明税额变化原因，例如新增权责发生制收入"
                data-testid="tax-period-reason"
              />
            </UFormField>
            <p v-if="periodError" class="mt-2 text-xs text-error" data-testid="tax-period-error">
              {{ periodError }}
            </p>
            <p class="mt-2 text-xs text-muted">
              首次申报后账簿锁定；重新预览出现差异并填写更正原因后，才能提交更正申报。
            </p>
          </div>

          <div v-if="latestTrace" class="rounded-sm border border-default bg-elevated/40 p-3" data-testid="tax-period-trace">
            <p class="text-xs font-medium text-highlighted">
              更正追溯
            </p>
            <p class="mt-1 text-xs text-muted">
              更正申报 {{ latestTrace.number }} 追溯原申报 {{ latestTrace.traceOf }}；原记录保留为历史，新记录生效。
            </p>
            <p v-if="latestTrace.reason" class="mt-1 text-xs text-muted">
              更正原因：{{ latestTrace.reason }}
            </p>
          </div>

          <div>
            <p class="text-xs font-medium text-highlighted">
              申报历史
            </p>
            <ul class="mt-2 space-y-2" data-testid="tax-period-history">
              <li
                v-for="record in selectedPeriod.records"
                :key="record.id"
                class="flex flex-wrap items-center justify-between gap-2 rounded-sm border border-default px-3 py-2"
              >
                <div>
                  <p class="font-mono text-xs text-highlighted">
                    {{ record.number }}
                  </p>
                  <p class="mt-0.5 text-xs text-muted">
                    {{ taxRecordKindLabels[record.kind] }} · v{{ record.version }} · {{ record.at }} · {{ taxBasisLabels[record.basis] }}
                    <span v-if="record.traceOf"> · 追溯 {{ record.traceOf }}</span>
                  </p>
                  <p v-if="record.reason" class="mt-0.5 text-xs text-muted">
                    原因：{{ record.reason }}
                  </p>
                </div>
                <div class="flex items-center gap-2">
                  <UBadge
                    :label="record.kind === 'correction' ? '更正' : '已申报'"
                    :color="record.kind === 'correction' ? 'info' : 'success'"
                    variant="subtle"
                    size="sm"
                  />
                  <span class="text-sm font-medium tabular-nums text-highlighted">{{ formatMoney(record.taxAmount) }}</span>
                </div>
              </li>
              <li v-if="selectedPeriod.records.length === 0" class="rounded-sm border border-dashed border-default px-3 py-4 text-center text-xs text-muted">
                尚无申报记录，提交首次申报后生成。
              </li>
            </ul>
          </div>
        </div>
      </template>

      <template #footer>
        <div class="flex w-full items-center justify-between gap-2">
          <p class="text-xs text-muted">
            本地演示：更正只修改当前内存中的期间记录，刷新页面恢复种子。
          </p>
          <UButton
            label="关闭"
            color="neutral"
            variant="ghost"
            @click="periodDetailOpen = false"
          />
        </div>
      </template>
    </USlideover>
  </section>
</template>
