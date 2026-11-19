<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type {
  DeliveryInvoice,
  InvoiceBadgeColor,
  InvoiceLineItem,
  InvoiceMailChannel,
  InvoiceMailRecord,
  InvoiceMailSenderProfile,
  InvoiceNumberPreview,
  InvoiceNumberResetPolicy,
  InvoiceNumberRule,
  InvoiceNumberSettingsInput,
  InvoiceShareRecord,
  InvoiceShareStatus
} from '~/mocks/invoiceDelivery'
import {
  INVOICE_DELIVERY_NOW,
  INVOICE_DELIVERY_TODAY,
  invoiceAddDays,
  invoiceCompanyProfile,
  invoiceDeliveryInvoices,
  invoiceDeliveryMailChannels,
  invoiceDeliveryMailRecords,
  invoiceDeliveryMailSenders,
  invoiceDeliveryNumberRules,
  invoiceDeliveryShares,
  invoiceDisplayNumber,
  invoiceIsOfficial,
  invoiceLifecycleStatusColors,
  invoiceLifecycleStatusLabels,
  invoiceLineAmount,
  invoiceMailChannelStatusColors,
  invoiceMailChannelStatusLabels,
  invoiceMailChannelUsability,
  invoiceMailChain,
  invoiceMailDispositionAvailability,
  invoiceMailRecipientErrors,
  invoiceMailRelationLabel,
  invoiceMailSenderStatusColors,
  invoiceMailSenderStatusLabels,
  invoiceMailStatusColors,
  invoiceMailStatusLabels,
  invoiceMailTimeline,
  invoiceMailWorkspace,
  invoiceNumberFormat,
  invoiceNumberPreview,
  invoiceNumberResetPolicyLabels,
  invoiceNumberRuleForDate,
  invoiceNumberRulesInPeriod,
  invoiceNumberValidateSettings,
  invoicePreviousDay,
  invoiceShareEffectiveStatus,
  invoiceShareStatusColors,
  invoiceShareStatusDescription,
  invoiceShareStatusLabels,
  invoiceShareUrl,
  invoiceTotals
} from '~/mocks/invoiceDelivery'

const toast = useToast()
const { copy, isSupported: clipboardSupported } = useClipboard()
const { actorOptions, actorRole, actor, isApprover, setActorRole } = useDemoActor()

const today = INVOICE_DELIVERY_TODAY
const demoNow = INVOICE_DELIVERY_NOW

const activeTab = ref('number')
const tabItems = [
  { label: '编号规则', value: 'number', icon: 'i-lucide-hash' },
  { label: '样张与分享', value: 'share', icon: 'i-lucide-file-text' },
  { label: '寄送记录', value: 'mail', icon: 'i-lucide-send' }
]
const actorRoleOptions = actorOptions.map(item => ({
  label: item.name + '（' + item.title + '）',
  value: item.role
}))

const invoices = ref<DeliveryInvoice[]>(structuredClone(invoiceDeliveryInvoices))
const numberRules = ref<InvoiceNumberRule[]>(structuredClone(invoiceDeliveryNumberRules))
const shares = ref<InvoiceShareRecord[]>(structuredClone(invoiceDeliveryShares))
const mailRecords = ref<InvoiceMailRecord[]>(structuredClone(invoiceDeliveryMailRecords))
const channels = ref<InvoiceMailChannel[]>(structuredClone(invoiceDeliveryMailChannels))
const senders = ref<InvoiceMailSenderProfile[]>(structuredClone(invoiceDeliveryMailSenders))

let shareSequence = invoiceDeliveryShares.length
let mailSequence = 1099

function invoiceById(id: string): DeliveryInvoice | undefined {
  return invoices.value.find(invoice => invoice.id === id)
}

function channelById(id: string): InvoiceMailChannel | undefined {
  return channels.value.find(channel => channel.id === id)
}

function senderById(id: string): InvoiceMailSenderProfile | undefined {
  return senders.value.find(sender => sender.id === id)
}

function onActorRoleChange(value: unknown) {
  const next = String(value)
  if (next === 'maker' || next === 'approver') {
    setActorRole(next)
    toast.add({
      title: '已切换演示身份',
      description: '当前操作者：' + actor.value.name + '（' + actor.value.title + '）。',
      color: 'info',
      icon: 'i-lucide-user-check'
    })
  }
}

/* -------------------------------------------------------------------------- */
/* 编号规则                                                                    */
/* -------------------------------------------------------------------------- */

const currentRule = computed(() => invoiceNumberRuleForDate(numberRules.value, today))
const sortedRules = computed(() => invoiceNumberRulesInPeriod(numberRules.value))
const officialNumbers = computed(() => invoices.value
  .map(invoice => invoice.officialNumber)
  .filter((value): value is string => typeof value === 'string'))
const pendingReviewCount = computed(() => invoices.value.filter(invoice => invoice.status === 'pending-review').length)

const numberPattern = ref(currentRule.value.pattern)
const numberStart = ref(String(currentRule.value.startNumber))
const numberPadding = ref(String(currentRule.value.padding))
const numberResetPolicy = ref<InvoiceNumberResetPolicy>(currentRule.value.resetPolicy)
const numberEffectiveFrom = ref(today)
const numberFormError = ref('')
const numberPreviewDate = ref(today)
const paddingOptions = ['3', '4', '5', '6', '7', '8'].map(value => ({ label: value + ' 位', value }))
const resetPolicyOptions = (Object.keys(invoiceNumberResetPolicyLabels) as InvoiceNumberResetPolicy[])
  .map(value => ({ label: invoiceNumberResetPolicyLabels[value], value }))

const previewRule = computed(() => invoiceNumberRuleForDate(numberRules.value, numberPreviewDate.value))
const numberPreview = computed<InvoiceNumberPreview>(() => invoiceNumberPreview(
  previewRule.value,
  numberPreviewDate.value,
  officialNumbers.value
))

interface NumberRuleRow {
  rule: InvoiceNumberRule
  state: string
}

const numberRuleStateLabels: Record<string, string> = {
  current: '当前版本',
  scheduled: '待生效',
  history: '历史版本'
}
const numberRuleStateColors: Record<string, InvoiceBadgeColor> = {
  current: 'success',
  scheduled: 'info',
  history: 'neutral'
}

function numberRuleState(rule: InvoiceNumberRule): string {
  if (rule.id === currentRule.value.id) return 'current'
  if (rule.effectiveFrom > today) return 'scheduled'
  return 'history'
}

const ruleRows = computed<NumberRuleRow[]>(() => sortedRules.value.map(rule => ({
  rule,
  state: numberRuleState(rule)
})))

const ruleColumns: TableColumn<NumberRuleRow>[] = [
  { id: 'version', header: '版本', accessorFn: row => row.rule.version, meta: { class: { td: 'whitespace-nowrap' } } },
  { id: 'pattern', header: '编号格式', accessorFn: row => row.rule.pattern },
  { id: 'start', header: '起始号 / 位数', accessorFn: row => String(row.rule.startNumber) + ' / ' + String(row.rule.padding) },
  { id: 'reset', header: '重置方式', accessorFn: row => invoiceNumberResetPolicyLabels[row.rule.resetPolicy] },
  { id: 'effective', header: '生效期间', accessorFn: row => row.rule.effectiveFrom + ' 至 ' + (row.rule.effectiveTo ?? '持续') },
  { id: 'state', header: '状态', accessorFn: row => row.state }
]

const ruleDetailOpen = ref(false)
const ruleDetailId = ref<string | null>(null)
const ruleDetail = computed<InvoiceNumberRule | null>(() => numberRules.value.find(rule => rule.id === ruleDetailId.value) ?? null)

function openRuleDetail(row: NumberRuleRow) {
  ruleDetailId.value = row.rule.id
  ruleDetailOpen.value = true
}

function saveNumberRule() {
  const input: InvoiceNumberSettingsInput = {
    pattern: numberPattern.value,
    startNumber: Number(numberStart.value),
    padding: Number(numberPadding.value),
    resetPolicy: numberResetPolicy.value as InvoiceNumberResetPolicy,
    effectiveFrom: numberEffectiveFrom.value
  }
  const errors = invoiceNumberValidateSettings(input, currentRule.value)
  if (errors.length) {
    numberFormError.value = errors.join('；')
    toast.add({
      title: '编号设置未保存',
      description: errors[0],
      color: 'error',
      icon: 'i-lucide-alert-circle'
    })
    return
  }
  const previousRule = currentRule.value
  const version = Math.max(...numberRules.value.map(rule => rule.version)) + 1
  const newRule: InvoiceNumberRule = {
    id: 'rule-v' + version,
    version,
    pattern: input.pattern.trim(),
    startNumber: input.startNumber,
    padding: input.padding,
    resetPolicy: input.resetPolicy,
    effectiveFrom: input.effectiveFrom,
    note: '演示新建：起始号 ' + input.startNumber + '，序号 ' + input.padding + ' 位，' + invoiceNumberResetPolicyLabels[input.resetPolicy] + '。',
    createdBy: actor.value.name,
    createdAt: demoNow
  }
  numberRules.value = numberRules.value
    .map(rule => rule.id === previousRule.id ? { ...rule, effectiveTo: invoicePreviousDay(input.effectiveFrom) } : rule)
    .concat(newRule)
  invoices.value = invoices.value.map(invoice => invoice.status === 'pending-review'
    ? {
        ...invoice,
        numberConfirmed: false,
        numberStaleReason: '编号规则已更新为 v' + version + '（起始号 ' + input.startNumber + '、序号 ' + input.padding + ' 位、' + invoiceNumberResetPolicyLabels[input.resetPolicy] + '），请复核并重新确认候选编号。'
      }
    : invoice)
  numberFormError.value = ''
  numberPreviewDate.value = input.effectiveFrom
  toast.add({
    title: '编号规则 v' + version + ' 已保存',
    description: '自 ' + input.effectiveFrom + ' 起，首个候选编号为 ' + invoiceNumberFormat(newRule, input.effectiveFrom, input.startNumber) + '；待复核发票需重新确认。',
    color: 'success',
    icon: 'i-lucide-check'
  })
}

/* -------------------------------------------------------------------------- */
/* 复核与过账                                                                  */
/* -------------------------------------------------------------------------- */

const selectedReviewId = ref('inv-review-2019')
const selectedReview = computed<DeliveryInvoice | null>(() => invoiceById(selectedReviewId.value) ?? null)

interface ReviewState {
  preview: InvoiceNumberPreview
  issues: string[]
  needsReconfirm: boolean
  locked: boolean
}

const reviewState = computed<ReviewState | null>(() => {
  const invoice = selectedReview.value
  if (!invoice) return null
  const preview = invoiceNumberPreview(currentRule.value, today, officialNumbers.value)
  if (invoice.status === 'posted' || invoice.status === 'paid') {
    return { preview, issues: [], needsReconfirm: false, locked: true }
  }
  if (invoice.status === 'draft') {
    return { preview, issues: [], needsReconfirm: false, locked: false }
  }
  const issues: string[] = []
  if (!invoice.candidateNumber) issues.push('缺少候选编号，请重新提交复核生成。')
  if (invoice.candidateRuleVersion !== currentRule.value.version) {
    issues.push('候选编号基于 v' + (invoice.candidateRuleVersion ?? '未知') + ' 生成，当前规则为 v' + currentRule.value.version + '（下一个可用编号 ' + preview.number + '），需重新确认。')
  } else if (invoice.candidateNumber && invoice.candidateNumber !== preview.number) {
    issues.push('当前下一个可用编号为 ' + preview.number + '，候选编号 ' + invoice.candidateNumber + ' 已被占用或号段已变化，需重新确认。')
  }
  if (!invoice.numberConfirmed) {
    issues.push(invoice.numberStaleReason ?? '候选编号尚未复核确认，需业务主管确认后才能过账。')
  }
  return {
    preview,
    issues: Array.from(new Set(issues)),
    needsReconfirm: issues.length > 0,
    locked: false
  }
})

const reviewColumns: TableColumn<DeliveryInvoice>[] = [
  { id: 'invoice', header: '发票', accessorFn: row => row.id },
  { id: 'customer', header: '客户', accessorFn: row => row.buyer.name },
  { id: 'status', header: '状态', accessorFn: row => row.status },
  { id: 'number', header: '编号', accessorFn: row => invoiceDisplayNumber(row) },
  { id: 'amount', header: '价税合计', accessorFn: row => invoiceTotals(row).gross, meta: { class: { th: 'text-right', td: 'text-right tabular-nums' } } }
]

function selectReview(invoice: DeliveryInvoice) {
  selectedReviewId.value = invoice.id
}

function submitForReview() {
  const invoice = selectedReview.value
  if (!invoice) return
  if (invoice.status !== 'draft') {
    toast.add({
      title: '当前状态不能提交复核',
      description: '只有草稿发票可以提交复核并生成候选编号。',
      color: 'warning',
      icon: 'i-lucide-info'
    })
    return
  }
  const preview = invoiceNumberPreview(currentRule.value, today, officialNumbers.value)
  invoice.status = 'pending-review'
  invoice.candidateNumber = preview.number
  invoice.candidateRuleVersion = preview.ruleVersion
  invoice.numberConfirmed = false
  invoice.numberStaleReason = '新生成的候选编号，需业务主管复核确认后才能过账。'
  toast.add({
    title: '草稿已提交复核',
    description: invoice.buyer.name + ' 的候选编号为 ' + preview.number + '；请切换为业务主管确认。',
    color: 'info',
    icon: 'i-lucide-send'
  })
}

function confirmCandidate() {
  const invoice = selectedReview.value
  const state = reviewState.value
  if (!invoice || !state || invoice.status !== 'pending-review') return
  if (!isApprover.value) {
    toast.add({
      title: '需要业务主管身份',
      description: '候选编号必须由业务主管（陈立）复核确认，请先切换右上角身份。',
      color: 'warning',
      icon: 'i-lucide-user-check'
    })
    return
  }
  invoice.candidateNumber = state.preview.number
  invoice.candidateRuleVersion = state.preview.ruleVersion
  invoice.numberConfirmed = true
  invoice.numberStaleReason = undefined
  toast.add({
    title: '候选编号已确认',
    description: invoice.buyer.name + '：' + state.preview.number + '（编号规则 v' + state.preview.ruleVersion + '）。过账时会写入正式编号并锁定。',
    color: 'success',
    icon: 'i-lucide-check'
  })
}

function postInvoice() {
  const invoice = selectedReview.value
  const state = reviewState.value
  if (!invoice || !state || invoice.status !== 'pending-review') return
  if (!isApprover.value) {
    toast.add({
      title: '需要业务主管身份',
      description: '过账并锁定正式编号需要业务主管（陈立）操作，请先切换右上角身份。',
      color: 'warning',
      icon: 'i-lucide-user-check'
    })
    return
  }
  if (state.needsReconfirm || !invoice.numberConfirmed || !invoice.candidateNumber) {
    toast.add({
      title: '过账前需要确认编号',
      description: '候选编号已失效或尚未确认，请先点击「确认候选编号」或「重新确认新编号」。',
      color: 'warning',
      icon: 'i-lucide-lock'
    })
    return
  }
  const postedNumber = invoice.candidateNumber
  invoice.status = 'posted'
  invoice.officialNumber = postedNumber
  invoice.candidateNumber = undefined
  invoice.candidateRuleVersion = currentRule.value.version
  invoice.numberConfirmed = true
  invoice.numberStaleReason = undefined
  invoice.postedAt = demoNow
  invoice.postedBy = actor.value.name
  invoices.value.forEach((other) => {
    if (other.id !== invoice.id && other.status === 'pending-review' && other.candidateNumber === postedNumber) {
      other.numberConfirmed = false
      other.numberStaleReason = '候选编号 ' + postedNumber + ' 已被发票 ' + invoice.buyer.name + ' 占用，请重新确认下一个可用编号。'
    }
  })
  toast.add({
    title: '已过账，正式编号锁定',
    description: invoice.buyer.name + '：' + postedNumber + '。该编号不可修改，既有发票保留原编号。',
    color: 'success',
    icon: 'i-lucide-lock'
  })
}

/* -------------------------------------------------------------------------- */
/* 样张与分享                                                                  */
/* -------------------------------------------------------------------------- */

const sampleInvoiceId = ref('inv-posted-2007')
const sampleInvoice = computed<DeliveryInvoice | undefined>(() => invoiceById(sampleInvoiceId.value) ?? invoices.value[0])
const sampleView = ref('official')
const sampleViewItems = [
  { label: '草稿预览', value: 'draft' },
  { label: '正式发票', value: 'official' },
  { label: '公司抬头', value: 'company' }
]
const sampleInvoiceOptions = computed(() => invoices.value.map(invoice => ({
  label: invoice.id + ' · ' + invoice.buyer.name + '（' + invoiceLifecycleStatusLabels[invoice.status] + '）',
  value: invoice.id
})))

const sampleTotals = computed(() => sampleInvoice.value
  ? invoiceTotals(sampleInvoice.value)
  : { net: 0, tax: 0, gross: 0 })
const sampleOfficialAllowed = computed(() => invoiceIsOfficial(sampleInvoice.value))
const sampleStampVisible = computed(() => sampleView.value === 'official' && sampleOfficialAllowed.value)
const sampleNumberText = computed(() => {
  const invoice = sampleInvoice.value
  if (!invoice) return '未选择发票'
  if (sampleView.value === 'official') return invoice.officialNumber ?? '未过账，无正式编号'
  if (sampleView.value === 'draft') return invoice.candidateNumber ?? '草稿未编号'
  return invoiceCompanyProfile.shortName
})

watch(sampleInvoiceId, () => {
  if (sampleView.value === 'official' && !invoiceIsOfficial(sampleInvoice.value)) {
    sampleView.value = 'draft'
  }
})

const sampleLineColumns: TableColumn<InvoiceLineItem>[] = [
  { accessorKey: 'description', header: '项目说明', meta: { class: { td: 'min-w-40' } } },
  { accessorKey: 'quantity', header: '数量', meta: { class: { th: 'text-right', td: 'text-right tabular-nums' } } },
  { accessorKey: 'unitPrice', header: '单价', meta: { class: { th: 'text-right', td: 'text-right tabular-nums' } } },
  { id: 'lineAmount', header: '金额', accessorFn: row => invoiceLineAmount(row), meta: { class: { th: 'text-right', td: 'text-right tabular-nums' } } }
]

interface ShareRow {
  record: InvoiceShareRecord
  invoice: DeliveryInvoice | undefined
  status: InvoiceShareStatus
}

const shareRows = computed<ShareRow[]>(() => shares.value.map((record) => {
  const invoice = invoiceById(record.invoiceId)
  return {
    record,
    invoice,
    status: invoiceShareEffectiveStatus(record, invoice, today)
  }
}).sort((left, right) => right.record.createdAt.localeCompare(left.record.createdAt)))

const shareColumns: TableColumn<ShareRow>[] = [
  { id: 'share', header: '分享编号', accessorFn: row => row.record.id, meta: { class: { td: 'whitespace-nowrap' } } },
  { id: 'invoice', header: '关联发票', accessorFn: row => row.record.invoiceId },
  { id: 'status', header: '状态', accessorFn: row => row.status },
  { id: 'expiry', header: '有效期', accessorFn: row => row.record.expiresAt, meta: { class: { td: 'whitespace-nowrap' } } },
  { id: 'views', header: '访问', accessorFn: row => row.record.views, meta: { class: { th: 'text-right', td: 'text-right tabular-nums' } } },
  { id: 'actions', header: '操作', meta: { class: { th: 'text-right', td: 'text-right' } } }
]

const shareExpiryDays = ref('30')
const shareExpiryOptions = [
  { label: '7 天', value: '7' },
  { label: '30 天', value: '30' },
  { label: '90 天', value: '90' }
]
const shareFormError = ref('')
const canCreateShare = computed(() => invoiceIsOfficial(sampleInvoice.value))

const sampleShareSummary = computed(() => {
  const rows = shareRows.value.filter(row => row.invoice?.id === sampleInvoiceId.value)
  return '有效 ' + rows.filter(row => row.status === 'active').length
    + ' · 已过期 ' + rows.filter(row => row.status === 'expired').length
    + ' · 已撤销 ' + rows.filter(row => row.status === 'revoked').length
    + ' · 不可用 ' + rows.filter(row => row.status === 'unavailable').length
})

const sampleMailSummary = computed(() => {
  const records = mailRecords.value.filter(record => record.invoiceId === sampleInvoiceId.value)
  return '已送达 ' + records.filter(record => record.status === 'sent').length
    + ' · 失败 ' + records.filter(record => record.status === 'failed').length
    + ' · 未知 ' + records.filter(record => record.status === 'unknown').length
    + ' · 已放弃 ' + records.filter(record => record.status === 'abandoned').length
})

const sharePreviewOpen = ref(false)
const sharePreviewId = ref<string | null>(null)

interface SharePreviewState {
  record: InvoiceShareRecord
  invoice: DeliveryInvoice | undefined
  status: InvoiceShareStatus
  description: string
  url: string
}

const sharePreview = computed<SharePreviewState | null>(() => {
  const record = shares.value.find(item => item.id === sharePreviewId.value)
  if (!record) return null
  const invoice = invoiceById(record.invoiceId)
  const status = invoiceShareEffectiveStatus(record, invoice, today)
  return {
    record,
    invoice,
    status,
    description: invoiceShareStatusDescription(record, invoice, status),
    url: invoiceShareUrl(record.token)
  }
})
const sharePreviewAlertColor = computed<InvoiceBadgeColor>(() => sharePreview.value
  ? invoiceShareStatusColors[sharePreview.value.status]
  : 'neutral')
const sharePreviewNumber = computed(() => sharePreview.value?.invoice
  ? invoiceDisplayNumber(sharePreview.value.invoice)
  : '—')
const sharePreviewAmount = computed(() => sharePreview.value?.invoice
  ? formatMoney(invoiceTotals(sharePreview.value.invoice).gross)
  : '—')
const sharePreviewInvoiceStatus = computed(() => sharePreview.value?.invoice
  ? invoiceLifecycleStatusLabels[sharePreview.value.invoice.status]
  : '不可用')

function openSharePreview(record: InvoiceShareRecord) {
  sharePreviewId.value = record.id
  sharePreviewOpen.value = true
}

function createShare() {
  shareFormError.value = ''
  const invoice = sampleInvoice.value
  if (!invoice) {
    shareFormError.value = '请先选择一张发票。'
    return
  }
  if (!invoiceIsOfficial(invoice)) {
    shareFormError.value = '仅已过账或已收款的发票可以创建分享链接；当前发票为「' + invoiceLifecycleStatusLabels[invoice.status] + '」。'
    toast.add({
      title: '不能创建分享链接',
      description: shareFormError.value,
      color: 'warning',
      icon: 'i-lucide-link-2-off'
    })
    return
  }
  shareSequence += 1
  const record: InvoiceShareRecord = {
    id: 'share-' + String(shareSequence).padStart(4, '0'),
    token: 'shr_' + today.replace(/-/g, '') + '_' + String(shareSequence).padStart(4, '0'),
    invoiceId: invoice.id,
    createdBy: actor.value.name,
    createdAt: demoNow,
    expiresAt: invoiceAddDays(today, Number(shareExpiryDays.value)),
    views: 0
  }
  shares.value = [record, ...shares.value]
  toast.add({
    title: '分享链接已创建',
    description: record.id + ' 有效至 ' + record.expiresAt + '；可在分享记录中复制、预览或撤销。',
    color: 'success',
    icon: 'i-lucide-link'
  })
  openSharePreview(record)
}

async function copyShareLink(record: InvoiceShareRecord, status: InvoiceShareStatus) {
  if (status === 'revoked') {
    toast.add({
      title: '链接已撤销，不能复制',
      description: '该分享链接已由 ' + (record.revokedBy ?? '操作者') + ' 撤销，如需继续分享请新建链接。',
      color: 'warning',
      icon: 'i-lucide-ban'
    })
    return
  }
  if (status === 'unavailable') {
    toast.add({
      title: '链接不可用，不能复制',
      description: '关联发票尚未过账或已不可分享，请先完成过账再新建链接。',
      color: 'warning',
      icon: 'i-lucide-ban'
    })
    return
  }
  if (!clipboardSupported.value) {
    toast.add({
      title: '当前浏览器不支持自动复制',
      description: '请打开分享预览页，手动选择链接地址复制。',
      color: 'warning',
      icon: 'i-lucide-clipboard'
    })
    return
  }
  try {
    await copy(invoiceShareUrl(record.token))
    toast.add({
      title: '分享链接已复制',
      description: '演示地址不会访问后端；链接状态为「' + invoiceShareStatusLabels[status] + '」。',
      color: 'success',
      icon: 'i-lucide-copy'
    })
  } catch {
    toast.add({
      title: '复制失败',
      description: '请打开分享预览页，手动选择链接地址复制。',
      color: 'error',
      icon: 'i-lucide-clipboard-x'
    })
  }
}

function copyPreviewLink() {
  if (!sharePreview.value) return
  void copyShareLink(sharePreview.value.record, sharePreview.value.status)
}

function revokeShare(record: InvoiceShareRecord) {
  const invoice = invoiceById(record.invoiceId)
  const status = invoiceShareEffectiveStatus(record, invoice, today)
  if (status !== 'active') {
    toast.add({
      title: '当前状态不能撤销',
      description: '只有有效链接可以撤销；当前状态为「' + invoiceShareStatusLabels[status] + '」。',
      color: 'warning',
      icon: 'i-lucide-info'
    })
    return
  }
  shares.value = shares.value.map(item => item.id === record.id
    ? { ...item, revokedAt: demoNow, revokedBy: actor.value.name }
    : item)
  toast.add({
    title: '分享链接已撤销',
    description: record.id + ' 立即失效；发票详情与分享预览会同步显示已撤销。',
    color: 'warning',
    icon: 'i-lucide-ban'
  })
}

function exportSample() {
  const invoice = sampleInvoice.value
  if (!invoice) return
  if (sampleView.value === 'official' && !invoiceIsOfficial(invoice)) {
    toast.add({
      title: '无法导正式样张',
      description: '该发票尚未过账，只能查看草稿预览；请先完成复核与过账。',
      color: 'warning',
      icon: 'i-lucide-file-lock'
    })
    return
  }
  toast.add({
    title: '已准备本地样张导出（演示）',
    description: '演示环境不生成真实 PDF 文件；' + invoiceDisplayNumber(invoice) + ' 的样张仅在页面内展示。',
    color: 'info',
    icon: 'i-lucide-file-down'
  })
}

/* -------------------------------------------------------------------------- */
/* 寄送                                                                        */
/* -------------------------------------------------------------------------- */

const selectedSenderId = ref<string>(invoiceMailWorkspace.defaultSenderId)
const selectedSender = computed(() => senderById(selectedSenderId.value))
const senderOptions = computed(() => senders.value.map(sender => ({
  label: sender.name + '（' + sender.email + '）',
  value: sender.id
})))
const channelOptions = computed(() => channels.value.map(channel => ({
  label: channel.name + ' · ' + invoiceMailChannelStatusLabels[channel.status],
  value: channel.id,
  disabled: channel.status === 'disabled'
})))

const composeInvoiceId = ref('inv-posted-2007')
const composeInvoice = computed(() => invoiceById(composeInvoiceId.value))
const composeInvoiceOptions = computed(() => invoices.value.map(invoice => ({
  label: invoice.id + ' · ' + invoice.buyer.name + '（' + invoiceLifecycleStatusLabels[invoice.status] + '）',
  value: invoice.id,
  disabled: !invoiceIsOfficial(invoice)
})))
const composeRecipientName = ref('')
const composeRecipientEmail = ref('')
const composeChannelId = ref('channel-platform')
const composeSimulate = ref('sent')
const simulateOptions = [
  { label: '模拟成功送达', value: 'sent' },
  { label: '模拟投递失败', value: 'failed' },
  { label: '模拟结果未知', value: 'unknown' }
]
const composeError = ref('')

const composeVisibility = computed(() => invoiceMailChannelUsability(
  composeChannelId.value,
  selectedSenderId.value,
  channels.value,
  senders.value
))
const composeBlockedReason = computed(() => {
  if (!composeInvoice.value) return '请选择发票。'
  if (!invoiceIsOfficial(composeInvoice.value)) return '仅已过账或已收款的发票可以寄送；待复核发票需先完成过账。'
  if (!composeVisibility.value.canSend) return composeVisibility.value.reasons.join('；')
  return ''
})

function sendMail() {
  composeError.value = ''
  const invoice = composeInvoice.value
  if (!invoice || composeBlockedReason.value) {
    composeError.value = composeBlockedReason.value || '当前配置不可寄送。'
    toast.add({
      title: '不能寄送',
      description: composeError.value,
      color: 'warning',
      icon: 'i-lucide-send-x'
    })
    return
  }
  const recipientErrors = invoiceMailRecipientErrors({
    name: composeRecipientName.value,
    email: composeRecipientEmail.value
  })
  if (recipientErrors.length) {
    composeError.value = recipientErrors.join('；')
    toast.add({
      title: '收件人校验未通过',
      description: recipientErrors[0],
      color: 'error',
      icon: 'i-lucide-user-x'
    })
    return
  }
  mailSequence += 1
  const status = composeSimulate.value as InvoiceMailRecord['status']
  const record: InvoiceMailRecord = {
    id: 'mail-' + mailSequence,
    invoiceId: invoice.id,
    recipientName: composeRecipientName.value.trim(),
    recipientEmail: composeRecipientEmail.value.trim(),
    channelId: composeChannelId.value,
    senderProfileId: selectedSenderId.value,
    status,
    createdAt: demoNow,
    attempts: 1
  }
  if (status === 'sent') {
    record.sentAt = demoNow
  } else if (status === 'failed') {
    record.failureCode = 'DEMO-550'
    record.failureReason = '演示结果：收件服务器拒绝接收（550 5.1.1 收件人不存在）。'
  } else if (status === 'unknown') {
    record.statusReason = '演示结果：平台超时未返回投递回执，结果未知，请稍后在记录中重试或重寄。'
  }
  mailRecords.value = [record, ...mailRecords.value]
  toast.add({
    title: status === 'sent' ? '邮件已模拟送达' : status === 'failed' ? '邮件投递失败' : '投递结果未知',
    description: record.id + ' 已写入寄送记录；可在详情中查看时间线并按需重试、重寄或放弃。',
    color: status === 'sent' ? 'success' : status === 'failed' ? 'error' : 'warning',
    icon: 'i-lucide-mail'
  })
  composeRecipientName.value = ''
  composeRecipientEmail.value = ''
}

const mailFilterOptions = (['all', 'sent', 'failed', 'unknown', 'abandoned'] as const).map(value => ({
  label: value === 'all' ? '全部状态' : invoiceMailStatusLabels[value],
  value
}))
type MailFilterValue = 'all' | 'sent' | 'failed' | 'unknown' | 'abandoned'
const mailFilterValue = ref<MailFilterValue>('all')

interface MailRow {
  record: InvoiceMailRecord
  invoice: DeliveryInvoice | undefined
  channel: InvoiceMailChannel | undefined
}

const mailRows = computed<MailRow[]>(() => mailRecords.value
  .filter(record => mailFilterValue.value === 'all' || record.status === mailFilterValue.value)
  .map(record => ({
    record,
    invoice: invoiceById(record.invoiceId),
    channel: channelById(record.channelId)
  }))
  .sort((left, right) => right.record.createdAt.localeCompare(left.record.createdAt)))

const mailColumns: TableColumn<MailRow>[] = [
  { id: 'record', header: '记录', accessorFn: row => row.record.id, meta: { class: { td: 'whitespace-nowrap' } } },
  { id: 'invoice', header: '发票', accessorFn: row => row.record.invoiceId },
  { id: 'recipient', header: '收件人', accessorFn: row => row.record.recipientName },
  { id: 'channel', header: '渠道', accessorFn: row => row.record.channelId },
  { id: 'status', header: '状态', accessorFn: row => row.record.status },
  { id: 'relation', header: '关联', accessorFn: row => invoiceMailRelationLabel(row.record) },
  { id: 'time', header: '创建时间', accessorFn: row => row.record.createdAt, meta: { class: { td: 'whitespace-nowrap' } } },
  { id: 'actions', header: '操作', meta: { class: { th: 'text-right', td: 'text-right' } } }
]

const mailDetailOpen = ref(false)
const mailDetailId = ref<string | null>(null)
const mailDetailRecord = computed(() => mailRecords.value.find(record => record.id === mailDetailId.value) ?? null)
const mailDetailInvoice = computed(() => mailDetailRecord.value ? invoiceById(mailDetailRecord.value.invoiceId) : undefined)
const mailDetailChannel = computed(() => mailDetailRecord.value ? channelById(mailDetailRecord.value.channelId) : undefined)
const mailDetailSender = computed(() => mailDetailRecord.value ? senderById(mailDetailRecord.value.senderProfileId) : undefined)
const mailDetailChain = computed(() => mailDetailRecord.value
  ? invoiceMailChain(mailRecords.value, mailDetailRecord.value.id)
  : { root: undefined, parent: undefined, children: [] })
const mailDetailParent = computed(() => mailDetailChain.value.parent ?? null)
const mailDetailAvailability = computed(() => mailDetailRecord.value
  ? invoiceMailDispositionAvailability(mailDetailRecord.value, mailRecords.value, channels.value, senders.value)
  : null)
const mailDetailTimeline = computed(() => mailDetailRecord.value
  ? invoiceMailTimeline(
      mailDetailRecord.value,
      mailDetailChannel.value?.name ?? '未知渠道',
      mailDetailSender.value?.name ?? '未知发件人',
      mailDetailChain.value.children
    )
  : [])
const mailDetailAlert = computed<{ color: InvoiceBadgeColor, title: string, description: string } | null>(() => {
  const record = mailDetailRecord.value
  if (!record) return null
  if (record.status === 'failed' && record.failureReason) {
    return {
      color: 'error',
      title: '投递失败：' + (record.failureCode ?? '未知错误'),
      description: record.failureReason
    }
  }
  if (record.status === 'unknown' && record.statusReason) {
    return { color: 'warning', title: '结果未知', description: record.statusReason }
  }
  if (record.status === 'abandoned' && record.abandonedReason) {
    return { color: 'neutral', title: '已放弃投递', description: record.abandonedReason }
  }
  return null
})

const mailAbandonReason = ref('')
const mailAbandonError = ref('')

function openMailDetail(record: InvoiceMailRecord) {
  mailDetailId.value = record.id
  mailDetailOpen.value = true
  mailAbandonReason.value = ''
  mailAbandonError.value = ''
  resendOpen.value = false
  resendError.value = ''
}

function openMailDetailById(id: string) {
  const record = mailRecords.value.find(item => item.id === id)
  if (record) openMailDetail(record)
}

function retryMail() {
  const record = mailDetailRecord.value
  const availability = mailDetailAvailability.value
  if (!record || !availability) return
  if (!availability.retry.enabled) {
    toast.add({
      title: '当前不能重试',
      description: availability.retry.reason,
      color: 'warning',
      icon: 'i-lucide-info'
    })
    return
  }
  mailSequence += 1
  const child: InvoiceMailRecord = {
    id: 'mail-' + mailSequence,
    invoiceId: record.invoiceId,
    recipientName: record.recipientName,
    recipientEmail: record.recipientEmail,
    channelId: record.channelId,
    senderProfileId: record.senderProfileId,
    status: 'sent',
    createdAt: demoNow,
    sentAt: demoNow,
    retryOf: record.id,
    attempts: record.attempts + 1
  }
  mailRecords.value = [...mailRecords.value, child]
  mailDetailId.value = child.id
  toast.add({
    title: '已创建重试记录',
    description: child.id + ' 关联原记录 ' + record.id + '，演示结果为已送达；关联链已更新。',
    color: 'success',
    icon: 'i-lucide-refresh-cw'
  })
}

const resendOpen = ref(false)
const resendName = ref('')
const resendEmail = ref('')
const resendChannelId = ref('channel-platform')
const resendError = ref('')

function openResend() {
  const record = mailDetailRecord.value
  const availability = mailDetailAvailability.value
  if (!record || !availability) return
  if (!availability.resend.enabled) {
    toast.add({
      title: '当前不能重寄',
      description: availability.resend.reason,
      color: 'warning',
      icon: 'i-lucide-info'
    })
    return
  }
  resendName.value = record.recipientName
  resendEmail.value = record.recipientEmail
  resendChannelId.value = record.channelId === 'channel-smtp' ? 'channel-platform' : record.channelId
  resendError.value = ''
  resendOpen.value = true
}

function submitResend() {
  const record = mailDetailRecord.value
  if (!record) return
  const errors = invoiceMailRecipientErrors({
    name: resendName.value,
    email: resendEmail.value
  })
  const usability = invoiceMailChannelUsability(resendChannelId.value, record.senderProfileId, channels.value, senders.value)
  if (!usability.canSend) errors.push(...usability.reasons)
  if (errors.length) {
    resendError.value = errors.join('；')
    return
  }
  mailSequence += 1
  const child: InvoiceMailRecord = {
    id: 'mail-' + mailSequence,
    invoiceId: record.invoiceId,
    recipientName: resendName.value.trim(),
    recipientEmail: resendEmail.value.trim(),
    channelId: resendChannelId.value,
    senderProfileId: record.senderProfileId,
    status: 'sent',
    createdAt: demoNow,
    sentAt: demoNow,
    resendOf: record.id,
    attempts: 1
  }
  mailRecords.value = [...mailRecords.value, child]
  mailDetailId.value = child.id
  resendOpen.value = false
  toast.add({
    title: '已创建重寄记录',
    description: child.id + ' 关联原记录 ' + record.id + '，新收件人 ' + child.recipientEmail + '，演示结果为已送达。',
    color: 'success',
    icon: 'i-lucide-mail-plus'
  })
}

function abandonMail() {
  const record = mailDetailRecord.value
  const availability = mailDetailAvailability.value
  if (!record || !availability) return
  if (!availability.abandon.enabled) {
    toast.add({
      title: '当前不能放弃',
      description: availability.abandon.reason,
      color: 'warning',
      icon: 'i-lucide-info'
    })
    return
  }
  const reason = mailAbandonReason.value.trim()
  if (!reason) {
    mailAbandonError.value = '放弃原因必填，请说明为何不再继续投递。'
    return
  }
  record.status = 'abandoned'
  record.abandonedAt = demoNow
  record.abandonedBy = actor.value.name
  record.abandonedReason = reason
  mailAbandonReason.value = ''
  mailAbandonError.value = ''
  toast.add({
    title: '已放弃投递',
    description: record.id + ' 已标记为已放弃，不再自动重试；关联链保留全部记录。',
    color: 'warning',
    icon: 'i-lucide-ban'
  })
}

/* -------------------------------------------------------------------------- */
/* 重置                                                                        */
/* -------------------------------------------------------------------------- */

function resetDemo() {
  invoices.value = structuredClone(invoiceDeliveryInvoices)
  numberRules.value = structuredClone(invoiceDeliveryNumberRules)
  shares.value = structuredClone(invoiceDeliveryShares)
  mailRecords.value = structuredClone(invoiceDeliveryMailRecords)
  channels.value = structuredClone(invoiceDeliveryMailChannels)
  senders.value = structuredClone(invoiceDeliveryMailSenders)
  shareSequence = invoiceDeliveryShares.length
  mailSequence = 1099
  activeTab.value = 'number'
  selectedReviewId.value = 'inv-review-2019'
  sampleInvoiceId.value = 'inv-posted-2007'
  sampleView.value = 'official'
  numberPattern.value = currentRule.value.pattern
  numberStart.value = String(currentRule.value.startNumber)
  numberPadding.value = String(currentRule.value.padding)
  numberResetPolicy.value = currentRule.value.resetPolicy
  numberEffectiveFrom.value = today
  numberPreviewDate.value = today
  numberFormError.value = ''
  shareFormError.value = ''
  composeError.value = ''
  composeRecipientName.value = ''
  composeRecipientEmail.value = ''
  composeSimulate.value = 'sent'
  composeChannelId.value = 'channel-platform'
  composeInvoiceId.value = 'inv-posted-2007'
  selectedSenderId.value = invoiceMailWorkspace.defaultSenderId
  mailFilterValue.value = 'all'
  mailAbandonReason.value = ''
  mailAbandonError.value = ''
  resendError.value = ''
  sharePreviewOpen.value = false
  sharePreviewId.value = null
  mailDetailOpen.value = false
  mailDetailId.value = null
  resendOpen.value = false
  ruleDetailOpen.value = false
  toast.add({
    title: '演示数据已重置',
    description: '发票、编号规则、分享与寄送记录已恢复为固定种子；刷新页面效果相同。',
    color: 'info',
    icon: 'i-lucide-rotate-ccw'
  })
}
</script>

<template>
  <section class="space-y-5" data-testid="invoice-delivery">
    <div class="flex flex-wrap items-end justify-between gap-3" data-testid="invoice-delivery-header">
      <div>
        <h1 class="text-lg font-semibold text-highlighted">
          发票编号、样张与交付
        </h1>
        <p class="mt-1 max-w-3xl text-sm text-muted">
          演示编号规则、复核确认与过账锁定，查看本地发票样张与分享链接状态，并跟踪寄送失败后的重试、重寄与放弃。
          全部数据来自固定种子，刷新页面恢复初始状态。
        </p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <USelect
          :model-value="actorRole"
          :items="actorRoleOptions"
          size="sm"
          class="w-52"
          data-testid="invoice-delivery-actor-select"
          @update:model-value="onActorRoleChange"
        />
        <UButton
          label="重置演示数据"
          icon="i-lucide-rotate-ccw"
          color="neutral"
          variant="outline"
          size="sm"
          data-testid="invoice-delivery-reset"
          @click="resetDemo"
        />
      </div>
    </div>

    <UAlert
      color="info"
      variant="soft"
      icon="i-lucide-info"
      title="纯 UI 演示"
      description="所有复核、过账、分享与寄送操作只更新当前页面状态，不调用后端；样例公司、发票与邮箱均为虚构数据。"
      data-testid="invoice-delivery-notice"
    />

    <div class="flex flex-wrap items-center justify-between gap-2 border-b border-default pb-2">
      <UTabs
        v-model="activeTab"
        :items="tabItems"
        :content="false"
        size="sm"
        data-testid="invoice-delivery-tabs"
      />
      <UBadge
        :label="'演示身份：' + actor.name + ' · ' + actor.title"
        color="neutral"
        variant="subtle"
        size="sm"
        data-testid="invoice-delivery-actor-badge"
      />
    </div>

    <div v-if="activeTab === 'number'" class="space-y-4">
      <div class="grid gap-4 lg:grid-cols-5">
        <UCard class="rounded-sm nx-reveal lg:col-span-3" data-testid="invoice-number-settings">
          <template #header>
            <div class="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 class="text-base font-semibold text-highlighted">
                  编号规则设置
                </h2>
                <p class="mt-0.5 text-xs text-muted">
                  格式、起始号与重置周期决定候选编号；保存会生成新版本并收尾旧版本。
                </p>
              </div>
              <UBadge
                :label="'当前 v' + currentRule.version + ' · ' + currentRule.effectiveFrom + ' 生效'"
                color="success"
                variant="subtle"
                size="sm"
                data-testid="invoice-number-current-version"
              />
            </div>
          </template>
          <div class="grid gap-3 sm:grid-cols-2">
            <UFormField label="编号格式" class="sm:col-span-2" hint="支持 {yyyy}、{yy}、{yyMM}、{MM} 与 {seq}">
              <UInput
                v-model="numberPattern"
                placeholder="INV-{yyyy}-{seq}"
                class="w-full"
                data-testid="invoice-number-pattern"
              />
            </UFormField>
            <UFormField label="起始号">
              <UInput
                v-model="numberStart"
                type="number"
                class="w-full"
                data-testid="invoice-number-start"
              />
            </UFormField>
            <UFormField label="序号位数">
              <USelect
                v-model="numberPadding"
                :items="paddingOptions"
                class="w-full"
                data-testid="invoice-number-padding"
              />
            </UFormField>
            <UFormField label="重置方式">
              <USelect
                v-model="numberResetPolicy"
                :items="resetPolicyOptions"
                class="w-full"
                data-testid="invoice-number-reset-policy"
              />
            </UFormField>
            <UFormField label="生效日期" hint="不能早于今天，且需晚于当前版本">
              <UInput
                v-model="numberEffectiveFrom"
                type="date"
                class="w-full"
                data-testid="invoice-number-effective-from"
              />
            </UFormField>
          </div>
          <UAlert
            v-if="numberFormError"
            class="mt-3"
            color="error"
            variant="soft"
            icon="i-lucide-alert-circle"
            title="请先修正编号设置"
            :description="numberFormError"
            data-testid="invoice-number-settings-error"
          />
          <div class="mt-3 flex flex-wrap items-center gap-2">
            <UButton
              label="保存为新版本"
              icon="i-lucide-save"
              size="sm"
              data-testid="invoice-number-save"
              @click="saveNumberRule"
            />
            <span class="text-xs text-muted">保存后当前版本自动收尾，待复核发票需重新确认候选编号。</span>
          </div>
        </UCard>

        <UCard class="rounded-sm nx-reveal lg:col-span-2" data-testid="invoice-number-preview-card">
          <template #header>
            <div>
              <h2 class="text-base font-semibold text-highlighted">
                指定日期的下一个编号
              </h2>
              <p class="mt-0.5 text-xs text-muted">
                按指定日期匹配生效规则，并跳过已过账发票占用的编号。
              </p>
            </div>
          </template>
          <div class="space-y-3">
            <UFormField label="指定日期">
              <UInput
                v-model="numberPreviewDate"
                type="date"
                class="w-full"
                data-testid="invoice-number-preview-date"
              />
            </UFormField>
            <div class="rounded-sm border border-default bg-elevated/40 p-3">
              <p class="text-xs text-muted">
                下一个可用编号
              </p>
              <p class="mt-1 font-mono text-xl font-semibold text-highlighted" data-testid="invoice-number-preview-result">
                {{ numberPreview.number }}
              </p>
              <p class="mt-1 text-xs text-muted" data-testid="invoice-number-preview-rule">
                规则 v{{ numberPreview.ruleVersion }} · {{ invoiceNumberResetPolicyLabels[numberPreview.resetPolicy] }} · 周期 {{ numberPreview.periodKey }}
              </p>
              <p class="mt-2 text-xs text-muted" data-testid="invoice-number-preview-detail">
                {{ numberPreview.explanation }}
              </p>
            </div>
            <p class="text-xs text-muted">
              预览不会占号；候选编号在复核面板中确认，过账时才锁定为正式编号。
            </p>
          </div>
        </UCard>
      </div>

      <UCard class="rounded-sm nx-reveal" data-testid="invoice-number-rule-history-card">
        <template #header>
          <div class="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 class="text-base font-semibold text-highlighted">
                编号规则版本
              </h2>
              <p class="mt-0.5 text-xs text-muted">
                历史版本只读；新版本保存后旧版本结束日期自动设为生效日前一天。
              </p>
            </div>
            <UBadge
              :label="'共 ' + sortedRules.length + ' 个版本'"
              color="neutral"
              variant="subtle"
              size="sm"
            />
          </div>
        </template>
        <ResizableTable
          :data="ruleRows"
          :columns="ruleColumns"
          class="nx-table"
          :ui="{ th: 'py-2.5', td: 'py-3' }"
          :row-activate="openRuleDetail"
          data-testid="invoice-number-rule-table"
        >
          <template #version-cell="{ row }">
            <p class="font-mono text-sm text-highlighted">
              v{{ row.original.rule.version }}
            </p>
            <p class="mt-0.5 text-[11px] text-muted">
              {{ row.original.rule.createdBy }} · {{ row.original.rule.createdAt }}
            </p>
          </template>
          <template #pattern-cell="{ row }">
            <span class="font-mono text-xs text-toned">{{ row.original.rule.pattern }}</span>
          </template>
          <template #effective-cell="{ row }">
            <span class="text-xs">{{ row.original.rule.effectiveFrom }} 至 {{ row.original.rule.effectiveTo ?? '持续' }}</span>
          </template>
          <template #state-cell="{ row }">
            <UBadge
              :label="numberRuleStateLabels[row.original.state]"
              :color="numberRuleStateColors[row.original.state]"
              variant="subtle"
              size="sm"
            />
          </template>
        </ResizableTable>
      </UCard>

      <UCard class="rounded-sm nx-reveal" data-testid="invoice-number-review-card">
        <template #header>
          <div class="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 class="text-base font-semibold text-highlighted">
                开票复核与编号锁定
              </h2>
              <p class="mt-0.5 text-xs text-muted">
                点击发票行查看候选编号；规则或号码变化后需重新确认，过账后正式编号锁定。
              </p>
            </div>
            <UBadge
              :label="'待复核 ' + pendingReviewCount"
              color="warning"
              variant="subtle"
              size="sm"
            />
          </div>
        </template>
        <ResizableTable
          :data="invoices"
          :columns="reviewColumns"
          class="nx-table"
          :ui="{ th: 'py-2.5', td: 'py-3' }"
          :row-activate="selectReview"
          data-testid="invoice-number-invoice-table"
        >
          <template #invoice-cell="{ row }">
            <p class="font-mono text-xs text-highlighted">
              {{ row.original.id }}
            </p>
            <p class="mt-0.5 text-[11px] text-muted">
              {{ row.original.issueDate }}
            </p>
          </template>
          <template #customer-cell="{ row }">
            <span class="text-sm text-toned">{{ row.original.buyer.name }}</span>
          </template>
          <template #status-cell="{ row }">
            <UBadge
              :label="invoiceLifecycleStatusLabels[row.original.status]"
              :color="invoiceLifecycleStatusColors[row.original.status]"
              variant="subtle"
              size="sm"
            />
          </template>
          <template #number-cell="{ row }">
            <span class="font-mono text-xs text-toned">{{ invoiceDisplayNumber(row.original) }}</span>
          </template>
          <template #amount-cell="{ row }">
            <span class="text-sm font-medium">{{ formatMoney(invoiceTotals(row.original).gross) }}</span>
          </template>
          <template #empty>
            <UEmpty
              variant="naked"
              icon="i-lucide-file-question"
              title="暂无发票"
              description="重置演示数据可恢复草稿、待复核、已过账与已收款发票样例。"
            />
          </template>
        </ResizableTable>

        <div v-if="selectedReview" class="border-t border-default p-4" data-testid="invoice-number-review-panel">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p class="font-mono text-xs text-muted">
                {{ selectedReview.id }}
              </p>
              <p class="mt-1 text-sm font-medium text-highlighted">
                {{ selectedReview.buyer.name }}
              </p>
              <p class="mt-0.5 text-xs text-muted">
                开票日期 {{ selectedReview.issueDate }} · 到期 {{ selectedReview.dueDate }} · 价税合计 {{ formatMoney(invoiceTotals(selectedReview).gross) }}
              </p>
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <UBadge
                :label="invoiceLifecycleStatusLabels[selectedReview.status]"
                :color="invoiceLifecycleStatusColors[selectedReview.status]"
                variant="subtle"
                size="sm"
                data-testid="invoice-number-review-status"
              />
              <UBadge
                v-if="selectedReview.officialNumber"
                label="编号已锁定"
                color="success"
                variant="subtle"
                size="sm"
                data-testid="invoice-number-locked"
              />
            </div>
          </div>

          <div class="mt-3 grid gap-3 md:grid-cols-3">
            <div class="rounded-sm border border-default p-3">
              <p class="text-xs text-muted">
                编号
              </p>
              <template v-if="selectedReview.officialNumber">
                <p class="mt-1 font-mono text-lg font-semibold text-highlighted" data-testid="invoice-number-official">
                  {{ selectedReview.officialNumber }}
                </p>
                <p class="mt-1 text-xs text-muted">
                  已过账锁定 · {{ selectedReview.postedAt }} · {{ selectedReview.postedBy }}
                </p>
              </template>
              <template v-else-if="selectedReview.candidateNumber">
                <p class="mt-1 font-mono text-lg font-semibold text-highlighted" data-testid="invoice-number-candidate">
                  {{ selectedReview.candidateNumber }}
                </p>
                <p class="mt-1 text-xs text-muted" data-testid="invoice-number-candidate-meta">
                  候选编号 · 基于 v{{ selectedReview.candidateRuleVersion }} · 当前预览 {{ reviewState?.preview.number }}
                </p>
              </template>
              <p v-else class="mt-1 text-sm text-muted">
                草稿尚未生成候选编号。
              </p>
            </div>

            <div class="rounded-sm border border-default p-3">
              <p class="text-xs text-muted">
                复核状态
              </p>
              <div class="mt-1 flex flex-wrap items-center gap-2">
                <UBadge
                  v-if="selectedReview.numberConfirmed && !reviewState?.needsReconfirm"
                  label="编号已确认"
                  color="success"
                  variant="subtle"
                  size="sm"
                />
                <UBadge
                  v-else-if="selectedReview.status === 'pending-review'"
                  label="编号待确认"
                  color="warning"
                  variant="subtle"
                  size="sm"
                />
                <span v-else class="text-xs text-muted">等待生成候选编号</span>
              </div>
              <UAlert
                v-if="reviewState && reviewState.issues.length"
                class="mt-2"
                color="warning"
                variant="soft"
                icon="i-lucide-alert-triangle"
                title="候选编号需要重新确认"
                :description="reviewState.issues.join('；')"
                data-testid="invoice-number-stale-alert"
              />
              <UAlert
                v-else-if="selectedReview.status === 'pending-review'"
                class="mt-2"
                color="success"
                variant="soft"
                icon="i-lucide-check"
                title="候选编号可用"
                :description="'与当前规则下一个可用编号 ' + (reviewState?.preview.number ?? '') + ' 一致，可由业务主管确认后过账。'"
                data-testid="invoice-number-confirm-hint"
              />
            </div>

            <div class="rounded-sm border border-default p-3">
              <p class="text-xs text-muted">
                操作
              </p>
              <UButton
                v-if="selectedReview.status === 'draft'"
                label="提交复核"
                icon="i-lucide-send"
                size="sm"
                class="mt-2 w-full"
                data-testid="invoice-number-submit-review"
                @click="submitForReview"
              />
              <template v-else-if="selectedReview.status === 'pending-review'">
                <UButton
                  :label="reviewState?.needsReconfirm ? '重新确认新编号' : '确认候选编号'"
                  icon="i-lucide-shield-check"
                  size="sm"
                  class="mt-2 w-full"
                  :disabled="!isApprover || (!reviewState?.needsReconfirm && selectedReview.numberConfirmed)"
                  data-testid="invoice-number-confirm"
                  @click="confirmCandidate"
                />
                <UButton
                  label="过账并锁定编号"
                  icon="i-lucide-lock"
                  size="sm"
                  color="success"
                  class="mt-2 w-full"
                  :disabled="!isApprover || !selectedReview.numberConfirmed || !!reviewState?.needsReconfirm"
                  data-testid="invoice-number-post"
                  @click="postInvoice"
                />
              </template>
              <p v-else class="mt-2 text-xs text-muted">
                正式编号已锁定，后续规则调整不会影响该发票编号；既有发票保留原编号。
              </p>
              <UAlert
                v-if="!isApprover"
                class="mt-2"
                color="info"
                variant="soft"
                icon="i-lucide-user-check"
                title="复核与过账需要业务主管"
                description="当前为业务经办（张明远）。请切换右上角身份为陈立后再确认候选编号或过账。"
                data-testid="invoice-number-review-hint"
              />
            </div>
          </div>
        </div>
        <div v-else class="border-t border-default p-4" data-testid="invoice-number-review-empty">
          <UEmpty
            variant="naked"
            icon="i-lucide-file-question"
            title="未选择发票"
            description="在上方发票列表选择一张发票，查看候选编号与复核动作。"
          />
        </div>
      </UCard>
    </div>

    <div v-if="activeTab === 'share'" class="space-y-4">
      <UCard class="rounded-sm nx-reveal" data-testid="invoice-share-workbench">
        <template #header>
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 class="text-base font-semibold text-highlighted">
                本地发票样张与分享
              </h2>
              <p class="mt-0.5 text-xs text-muted">
                草稿预览带草稿水印，正式发票展示公司抬头与发票专用章；分享状态在记录与预览页互核。
              </p>
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <USelect
                v-model="sampleInvoiceId"
                :items="sampleInvoiceOptions"
                size="sm"
                class="w-72"
                data-testid="invoice-share-invoice-select"
              />
              <UTabs
                v-model="sampleView"
                :items="sampleViewItems"
                :content="false"
                size="sm"
                data-testid="invoice-share-view-tabs"
              />
            </div>
          </div>
        </template>

        <div class="grid gap-4 lg:grid-cols-3">
          <div class="lg:col-span-2">
            <div class="relative overflow-hidden rounded-sm border border-default bg-default p-5" data-testid="invoice-share-sample">
              <div v-if="sampleView === 'draft'" class="pointer-events-none absolute inset-0 z-10 flex items-center justify-center" data-testid="invoice-share-watermark">
                <span class="-rotate-12 text-5xl font-bold tracking-widest text-error opacity-10">草稿预览</span>
              </div>
              <div class="relative z-20 space-y-4">
                <div class="flex flex-wrap items-start justify-between gap-3 border-b border-default pb-3">
                  <div>
                    <p class="text-xs text-muted">
                      销售方 / 公司抬头
                    </p>
                    <p class="mt-1 text-base font-semibold text-highlighted">
                      {{ invoiceCompanyProfile.name }}
                    </p>
                    <p class="mt-0.5 text-xs text-muted">
                      税号 {{ invoiceCompanyProfile.taxId }} · {{ invoiceCompanyProfile.address }}
                    </p>
                  </div>
                  <div class="text-right">
                    <p class="text-xs text-muted">
                      {{ sampleView === 'draft' ? '草稿预览' : sampleView === 'official' ? '增值税专用发票（样张）' : '公司抬头' }}
                    </p>
                    <p class="mt-1 font-mono text-lg font-semibold text-highlighted" data-testid="invoice-share-sample-number">
                      {{ sampleNumberText }}
                    </p>
                    <UBadge
                      v-if="sampleInvoice"
                      :label="invoiceLifecycleStatusLabels[sampleInvoice.status]"
                      :color="invoiceLifecycleStatusColors[sampleInvoice.status]"
                      variant="subtle"
                      size="sm"
                      data-testid="invoice-share-sample-status"
                    />
                  </div>
                </div>

                <div v-if="sampleView === 'company'" class="space-y-3" data-testid="invoice-share-company">
                  <div class="grid gap-3 sm:grid-cols-2">
                    <div class="rounded-sm border border-default p-3">
                      <p class="text-xs text-muted">
                        公司名称
                      </p>
                      <p class="mt-1 text-sm font-medium text-highlighted">
                        {{ invoiceCompanyProfile.name }}
                      </p>
                    </div>
                    <div class="rounded-sm border border-default p-3">
                      <p class="text-xs text-muted">
                        纳税人识别号
                      </p>
                      <p class="mt-1 font-mono text-sm text-highlighted">
                        {{ invoiceCompanyProfile.taxId }}
                      </p>
                    </div>
                    <div class="rounded-sm border border-default p-3">
                      <p class="text-xs text-muted">
                        地址
                      </p>
                      <p class="mt-1 text-sm text-toned">
                        {{ invoiceCompanyProfile.address }}
                      </p>
                    </div>
                    <div class="rounded-sm border border-default p-3">
                      <p class="text-xs text-muted">
                        电话 / 邮箱
                      </p>
                      <p class="mt-1 text-sm text-toned">
                        {{ invoiceCompanyProfile.phone }}
                      </p>
                      <p class="mt-0.5 text-sm text-toned">
                        {{ invoiceCompanyProfile.email }}
                      </p>
                    </div>
                    <div class="rounded-sm border border-default p-3">
                      <p class="text-xs text-muted">
                        开户银行
                      </p>
                      <p class="mt-1 text-sm text-toned">
                        {{ invoiceCompanyProfile.bankName }}
                      </p>
                    </div>
                    <div class="rounded-sm border border-default p-3">
                      <p class="text-xs text-muted">
                        银行账号
                      </p>
                      <p class="mt-1 font-mono text-sm text-toned">
                        {{ invoiceCompanyProfile.bankAccount }}
                      </p>
                    </div>
                  </div>
                  <p class="text-xs text-muted">
                    {{ invoiceCompanyProfile.footer }}
                  </p>
                </div>

                <template v-else>
                  <UAlert
                    v-if="sampleView === 'official' && !sampleOfficialAllowed"
                    color="warning"
                    variant="soft"
                    icon="i-lucide-file-lock"
                    title="该发票尚未过账"
                    description="正式发票样张仅对已过账或已收款发票开放，请先完成复核与过账；当前只能查看草稿预览。"
                    data-testid="invoice-share-official-blocked"
                  />
                  <div class="grid gap-3 rounded-sm border border-default p-3 sm:grid-cols-2" data-testid="invoice-share-sample-buyer">
                    <div>
                      <p class="text-xs text-muted">
                        购买方
                      </p>
                      <p class="mt-1 text-sm font-medium text-highlighted">
                        {{ sampleInvoice?.buyer.name ?? '未选择发票' }}
                      </p>
                      <p class="mt-0.5 text-xs text-muted">
                        税号 {{ sampleInvoice?.buyer.taxId ?? '—' }}
                      </p>
                      <p class="mt-0.5 text-xs text-muted">
                        {{ sampleInvoice?.buyer.address ?? '' }}
                      </p>
                    </div>
                    <div class="text-xs text-muted sm:text-right">
                      <p>开票日期：{{ sampleInvoice?.issueDate ?? '—' }}</p>
                      <p class="mt-1">
                        到期日：{{ sampleInvoice?.dueDate ?? '—' }}
                      </p>
                      <p class="mt-1">
                        联系人：{{ sampleInvoice?.buyer.contact ?? '—' }}
                      </p>
                      <p class="mt-1">
                        {{ sampleInvoice?.buyer.email ?? '' }}
                      </p>
                    </div>
                  </div>

                  <ResizableTable
                    :data="sampleInvoice?.lines ?? []"
                    :columns="sampleLineColumns"
                    class="nx-table"
                    :ui="{ th: 'py-2', td: 'py-2' }"
                    data-testid="invoice-share-lines"
                  >
                    <template #quantity-cell="{ row }">
                      <span class="text-xs tabular-nums">{{ formatNumber(row.original.quantity) }}</span>
                    </template>
                    <template #unitPrice-cell="{ row }">
                      <span class="text-xs tabular-nums">{{ formatMoney(row.original.unitPrice) }}</span>
                    </template>
                    <template #lineAmount-cell="{ row }">
                      <span class="text-xs font-medium tabular-nums">{{ formatMoney(invoiceLineAmount(row.original)) }}</span>
                    </template>
                    <template #empty>
                      <UEmpty
                        variant="naked"
                        icon="i-lucide-list"
                        title="暂无发票行"
                        description="选择包含明细的发票后显示。"
                      />
                    </template>
                  </ResizableTable>

                  <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div class="max-w-md space-y-1 text-xs text-muted">
                      <p>备注：{{ sampleInvoice?.note ?? '无' }}</p>
                      <p>{{ invoiceCompanyProfile.footer }}</p>
                      <p>本地样张仅供界面演示，不生成真实 PDF 文件。</p>
                    </div>
                    <div class="w-full max-w-xs space-y-1 text-sm">
                      <div class="flex justify-between gap-4">
                        <span class="text-muted">小计</span>
                        <span class="tabular-nums" data-testid="invoice-share-subtotal">{{ formatMoney(sampleTotals.net) }}</span>
                      </div>
                      <div class="flex justify-between gap-4">
                        <span class="text-muted">税率 {{ sampleInvoice?.taxRate ?? 0 }}%</span>
                        <span class="tabular-nums" data-testid="invoice-share-tax">{{ formatMoney(sampleTotals.tax) }}</span>
                      </div>
                      <div class="flex justify-between gap-4 border-t border-default pt-1 font-semibold">
                        <span>价税合计</span>
                        <span class="tabular-nums" data-testid="invoice-share-total">{{ formatMoney(sampleTotals.gross) }}</span>
                      </div>
                      <UButton
                        label="导出本地样张（演示）"
                        icon="i-lucide-file-down"
                        color="neutral"
                        variant="outline"
                        size="sm"
                        class="mt-2 w-full"
                        :disabled="sampleView === 'official' && !sampleOfficialAllowed"
                        data-testid="invoice-share-export"
                        @click="exportSample"
                      />
                    </div>
                  </div>
                </template>
              </div>
              <div
                v-if="sampleStampVisible"
                class="pointer-events-none absolute bottom-16 right-8 z-20 flex h-28 w-28 -rotate-12 items-center justify-center rounded-full border-2 border-error text-center text-[11px] font-semibold leading-tight text-error"
                data-testid="invoice-share-stamp"
              >
                <span>发票专用章<br>{{ invoiceCompanyProfile.shortName }}</span>
              </div>
            </div>
          </div>

          <div class="space-y-3">
            <div class="rounded-sm border border-default p-3" data-testid="invoice-share-detail">
              <p class="text-xs font-medium text-highlighted">
                发票状态与分享互核
              </p>
              <div class="mt-2 space-y-1.5 text-xs text-muted">
                <p>客户：<span class="text-toned">{{ sampleInvoice?.buyer.name ?? '未选择' }}</span></p>
                <p>编号：<span class="font-mono text-toned" data-testid="invoice-share-detail-number">{{ sampleNumberText }}</span></p>
                <p>价税合计：<span class="tabular-nums text-toned">{{ formatMoney(sampleTotals.gross) }}</span></p>
                <p>分享汇总：<span data-testid="invoice-share-detail-share-summary">{{ sampleShareSummary }}</span></p>
                <p>寄送汇总：<span data-testid="invoice-share-detail-mail-summary">{{ sampleMailSummary }}</span></p>
              </div>
              <p class="mt-2 border-t border-default pt-2 text-xs text-muted">
                撤销分享后，分享记录、本卡片与分享预览会同步显示「已撤销」；进行过账后可核对正式编号。
              </p>
            </div>

            <div class="rounded-sm border border-default p-3" data-testid="invoice-share-create-panel">
              <p class="text-xs font-medium text-highlighted">
                新建分享链接
              </p>
              <p class="mt-0.5 text-xs text-muted">
                仅正式发票可分享；链接为演示地址，不会访问后端。
              </p>
              <div class="mt-2 flex flex-wrap items-end gap-2">
                <UFormField label="有效期">
                  <USelect
                    v-model="shareExpiryDays"
                    :items="shareExpiryOptions"
                    size="sm"
                    class="w-24"
                    data-testid="invoice-share-create-expiry"
                  />
                </UFormField>
                <UButton
                  label="新建分享"
                  icon="i-lucide-link"
                  size="sm"
                  :disabled="!canCreateShare"
                  data-testid="invoice-share-create"
                  @click="createShare"
                />
              </div>
              <UAlert
                v-if="!canCreateShare"
                class="mt-2"
                color="neutral"
                variant="soft"
                icon="i-lucide-link-2-off"
                title="当前发票不能创建分享链接"
                description="仅已过账或已收款的发票可以对外分享；请先在「编号规则」页签完成复核与过账。"
                data-testid="invoice-share-create-blocked"
              />
              <UAlert
                v-if="shareFormError"
                class="mt-2"
                color="error"
                variant="soft"
                icon="i-lucide-alert-circle"
                title="分享操作未完成"
                :description="shareFormError"
                data-testid="invoice-share-create-error"
              />
            </div>
          </div>
        </div>
      </UCard>

      <UCard class="rounded-sm nx-reveal" data-testid="invoice-share-records">
        <template #header>
          <div class="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 class="text-base font-semibold text-highlighted">
                分享记录
              </h2>
              <p class="mt-0.5 text-xs text-muted">
                有效链接可复制、预览或撤销；过期、已撤销与不可用链接保留在记录中供核对。
              </p>
            </div>
            <UBadge
              :label="'共 ' + shareRows.length + ' 条'"
              color="neutral"
              variant="subtle"
              size="sm"
            />
          </div>
        </template>
        <ResizableTable
          :data="shareRows"
          :columns="shareColumns"
          class="nx-table"
          :ui="{ th: 'py-2.5', td: 'py-3' }"
          data-testid="invoice-share-table"
        >
          <template #share-cell="{ row }">
            <p class="font-mono text-xs text-highlighted">
              {{ row.original.record.id }}
            </p>
            <p class="mt-0.5 font-mono text-[11px] text-muted">
              {{ row.original.record.token }}
            </p>
          </template>
          <template #invoice-cell="{ row }">
            <p class="text-xs text-toned">
              {{ row.original.invoice?.buyer.name ?? '关联发票缺失' }}
            </p>
            <p class="mt-0.5 font-mono text-[11px] text-muted">
              {{ row.original.invoice ? invoiceDisplayNumber(row.original.invoice) : row.original.record.invoiceId }}
            </p>
          </template>
          <template #status-cell="{ row }">
            <UBadge
              :label="invoiceShareStatusLabels[row.original.status]"
              :color="invoiceShareStatusColors[row.original.status]"
              variant="subtle"
              size="sm"
              :data-testid="'invoice-share-status-' + row.original.record.id"
            />
          </template>
          <template #expiry-cell="{ row }">
            <p class="text-xs text-toned">
              {{ row.original.record.expiresAt }}
            </p>
            <p class="mt-0.5 text-[11px] text-muted">
              {{ row.original.record.createdBy }} · {{ row.original.record.createdAt }}
            </p>
          </template>
          <template #views-cell="{ row }">
            <p class="text-xs tabular-nums text-toned">
              {{ row.original.record.views }} 次
            </p>
            <p class="mt-0.5 text-[11px] text-muted">
              {{ row.original.record.lastViewedAt ?? '尚未访问' }}
            </p>
          </template>
          <template #actions-cell="{ row }">
            <div class="flex flex-wrap justify-end gap-1">
              <UButton
                label="复制"
                icon="i-lucide-copy"
                size="xs"
                color="neutral"
                variant="ghost"
                :disabled="row.original.status === 'revoked' || row.original.status === 'unavailable'"
                :data-testid="'invoice-share-copy-' + row.original.record.id"
                @click="copyShareLink(row.original.record, row.original.status)"
              />
              <UButton
                label="预览"
                icon="i-lucide-external-link"
                size="xs"
                color="neutral"
                variant="ghost"
                :data-testid="'invoice-share-open-' + row.original.record.id"
                @click="openSharePreview(row.original.record)"
              />
              <UButton
                label="撤销"
                icon="i-lucide-ban"
                size="xs"
                color="error"
                variant="ghost"
                :disabled="row.original.status !== 'active'"
                :data-testid="'invoice-share-revoke-' + row.original.record.id"
                @click="revokeShare(row.original.record)"
              />
            </div>
          </template>
          <template #empty>
            <UEmpty
              variant="naked"
              icon="i-lucide-link"
              title="暂无分享记录"
              description="选择已过账发票并新建分享后，记录会出现在这里。"
              data-testid="invoice-share-empty"
            />
          </template>
        </ResizableTable>
      </UCard>
    </div>

    <div v-if="activeTab === 'mail'" class="space-y-4">
      <div class="grid gap-4 lg:grid-cols-2">
        <UCard class="rounded-sm nx-reveal" data-testid="invoice-mail-channels">
          <template #header>
            <div>
              <h2 class="text-base font-semibold text-highlighted">
                平台渠道能力
              </h2>
              <p class="mt-0.5 text-xs text-muted">
                通道状态来自平台侧演示种子；停用通道会说明原因并禁止选择。
              </p>
            </div>
          </template>
          <ul class="divide-y divide-default">
            <li
              v-for="channel in channels"
              :key="channel.id"
              class="py-2.5 first:pt-0 last:pb-0"
              :data-testid="'invoice-mail-channel-' + channel.id"
            >
              <div class="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p class="text-sm font-medium text-highlighted">
                    {{ channel.name }}
                  </p>
                  <p class="mt-0.5 text-xs text-muted">
                    {{ channel.provider }} · {{ channel.supportsTracking ? '支持投递追踪' : '不支持投递追踪' }} · 日上限 {{ formatNumber(channel.dailyLimit) }}
                  </p>
                </div>
                <UBadge
                  :label="invoiceMailChannelStatusLabels[channel.status]"
                  :color="invoiceMailChannelStatusColors[channel.status]"
                  variant="subtle"
                  size="sm"
                />
              </div>
              <p v-if="channel.reason" class="mt-1 text-xs text-warning">
                {{ channel.reason }}
              </p>
              <p class="mt-1 text-[11px] text-dimmed">
                最近检查 {{ channel.lastCheckedAt }}
              </p>
            </li>
          </ul>
        </UCard>

        <UCard class="rounded-sm nx-reveal" data-testid="invoice-mail-sender-card">
          <template #header>
            <div>
              <h2 class="text-base font-semibold text-highlighted">
                工作区发件人配置
              </h2>
              <p class="mt-0.5 text-xs text-muted">
                发件人验证状态与通道共同决定能否寄送；不可用时给出具体原因。
              </p>
            </div>
          </template>
          <UFormField label="发件人">
            <USelect
              v-model="selectedSenderId"
              :items="senderOptions"
              size="sm"
              class="w-full"
              data-testid="invoice-mail-sender"
            />
          </UFormField>
          <div v-if="selectedSender" class="mt-2 rounded-sm border border-default p-3">
            <div class="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p class="text-sm font-medium text-highlighted">
                  {{ selectedSender.name }}
                </p>
                <p class="mt-0.5 text-xs text-muted">
                  {{ selectedSender.email }}
                </p>
                <p v-if="selectedSender.reason" class="mt-1 text-xs text-warning">
                  {{ selectedSender.reason }}
                </p>
              </div>
              <UBadge
                :label="invoiceMailSenderStatusLabels[selectedSender.status]"
                :color="invoiceMailSenderStatusColors[selectedSender.status]"
                variant="subtle"
                size="sm"
                data-testid="invoice-mail-sender-status"
              />
            </div>
          </div>
          <UAlert
            v-if="selectedSender && selectedSender.status !== 'ready'"
            class="mt-2"
            color="warning"
            variant="soft"
            icon="i-lucide-user-x"
            title="发件人不可用"
            :description="selectedSender.reason ?? '请先在设置中完成发件人配置与域名验证。'"
          />
          <p class="mt-2 text-xs text-muted">
            {{ invoiceMailWorkspace.note }}
          </p>
        </UCard>
      </div>

      <UCard class="rounded-sm nx-reveal" data-testid="invoice-mail-compose">
        <template #header>
          <div class="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 class="text-base font-semibold text-highlighted">
                新建投递
              </h2>
              <p class="mt-0.5 text-xs text-muted">
                收件人姓名与邮箱会先在本地校验；选择停用渠道或不可用发件人时发送按钮禁用并给出原因。
              </p>
            </div>
            <span class="text-xs text-muted">当前发件人：{{ selectedSender?.name ?? '未选择' }} · {{ selectedSender?.email ?? '' }}</span>
          </div>
        </template>
        <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <UFormField label="发票">
            <USelect
              v-model="composeInvoiceId"
              :items="composeInvoiceOptions"
              size="sm"
              class="w-full"
              data-testid="invoice-mail-invoice"
            />
          </UFormField>
          <UFormField label="收件人姓名">
            <UInput
              v-model="composeRecipientName"
              placeholder="例如：孙悦"
              class="w-full"
              data-testid="invoice-mail-recipient-name"
            />
          </UFormField>
          <UFormField label="收件邮箱">
            <UInput
              v-model="composeRecipientEmail"
              placeholder="例如：sunyue@lingang.example"
              class="w-full"
              data-testid="invoice-mail-recipient-email"
            />
          </UFormField>
          <UFormField label="投递渠道">
            <USelect
              v-model="composeChannelId"
              :items="channelOptions"
              size="sm"
              class="w-full"
              data-testid="invoice-mail-channel"
            />
          </UFormField>
          <UFormField label="模拟投递结果">
            <USelect
              v-model="composeSimulate"
              :items="simulateOptions"
              size="sm"
              class="w-full"
              data-testid="invoice-mail-simulate"
            />
          </UFormField>
          <div class="flex items-end">
            <UButton
              label="发送发票邮件"
              icon="i-lucide-send"
              size="sm"
              class="w-full"
              :disabled="!!composeBlockedReason"
              data-testid="invoice-mail-send"
              @click="sendMail"
            />
          </div>
        </div>
        <UAlert
          v-if="composeBlockedReason"
          class="mt-3"
          color="warning"
          variant="soft"
          icon="i-lucide-send-x"
          title="当前配置不能寄送"
          :description="composeBlockedReason"
          data-testid="invoice-mail-compose-blocked"
        />
        <UAlert
          v-if="composeVisibility.warning"
          class="mt-2"
          color="info"
          variant="soft"
          icon="i-lucide-triangle-alert"
          title="渠道降级提示"
          :description="composeVisibility.warning"
          data-testid="invoice-mail-compose-warning"
        />
        <UAlert
          v-if="composeError"
          class="mt-2"
          color="error"
          variant="soft"
          icon="i-lucide-alert-circle"
          title="寄送未完成"
          :description="composeError"
          data-testid="invoice-mail-form-error"
        />
        <p class="mt-3 text-xs text-muted">
          演示不会真正发信；发送后会写入下方寄送记录，可选择成功、失败或结果未知三种模拟结果。
        </p>
      </UCard>

      <UCard class="rounded-sm nx-reveal" data-testid="invoice-mail-records">
        <template #header>
          <div class="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 class="text-base font-semibold text-highlighted">
                寄送记录
              </h2>
              <p class="mt-0.5 text-xs text-muted">
                打开记录查看投递详情与关联链；失败或结果未知可重试、重寄或放弃。
              </p>
            </div>
            <USelect
              v-model="mailFilterValue"
              :items="mailFilterOptions"
              size="sm"
              class="w-36"
              data-testid="invoice-mail-filter"
            />
          </div>
        </template>
        <ResizableTable
          :data="mailRows"
          :columns="mailColumns"
          class="nx-table"
          :ui="{ th: 'py-2.5', td: 'py-3' }"
          data-testid="invoice-mail-table"
        >
          <template #record-cell="{ row }">
            <p class="font-mono text-xs text-highlighted">
              {{ row.original.record.id }}
            </p>
            <p class="mt-0.5 text-[11px] text-muted">
              尝试 {{ row.original.record.attempts }} 次
            </p>
          </template>
          <template #invoice-cell="{ row }">
            <p class="text-xs text-toned">
              {{ row.original.invoice?.buyer.name ?? '发票缺失' }}
            </p>
            <p class="mt-0.5 font-mono text-[11px] text-muted">
              {{ row.original.invoice ? invoiceDisplayNumber(row.original.invoice) : row.original.record.invoiceId }}
            </p>
          </template>
          <template #recipient-cell="{ row }">
            <p class="text-xs text-toned">
              {{ row.original.record.recipientName }}
            </p>
            <p class="mt-0.5 text-[11px] text-muted">
              {{ row.original.record.recipientEmail }}
            </p>
          </template>
          <template #channel-cell="{ row }">
            <p class="text-xs text-toned">
              {{ row.original.channel?.name ?? '渠道缺失' }}
            </p>
            <p class="mt-0.5 text-[11px] text-muted">
              {{ row.original.channel ? invoiceMailChannelStatusLabels[row.original.channel.status] : '—' }}
            </p>
          </template>
          <template #status-cell="{ row }">
            <UBadge
              :label="invoiceMailStatusLabels[row.original.record.status]"
              :color="invoiceMailStatusColors[row.original.record.status]"
              variant="subtle"
              size="sm"
            />
          </template>
          <template #relation-cell="{ row }">
            <span class="text-xs text-muted">{{ invoiceMailRelationLabel(row.original.record) }}</span>
          </template>
          <template #time-cell="{ row }">
            <span class="text-xs tabular-nums text-muted">{{ row.original.record.createdAt }}</span>
          </template>
          <template #actions-cell="{ row }">
            <UButton
              label="详情"
              icon="i-lucide-panel-right"
              size="xs"
              color="neutral"
              variant="ghost"
              :data-testid="'invoice-mail-open-' + row.original.record.id"
              @click="openMailDetail(row.original.record)"
            />
          </template>
          <template #empty>
            <UEmpty
              variant="naked"
              icon="i-lucide-mail"
              title="没有符合条件的寄送记录"
              description="调整状态筛选，或在上方新建投递后查看记录。"
              data-testid="invoice-mail-empty"
            />
          </template>
        </ResizableTable>
      </UCard>
    </div>

    <UModal v-model:open="ruleDetailOpen" title="编号规则版本详情" :ui="{ content: 'sm:max-w-2xl' }">
      <template #body>
        <div v-if="ruleDetail" class="space-y-3" data-testid="invoice-number-rule-detail">
          <div class="grid gap-2 text-sm sm:grid-cols-2">
            <p>版本：v{{ ruleDetail.version }}</p>
            <p>状态：{{ numberRuleStateLabels[numberRuleState(ruleDetail)] }}</p>
            <p>格式：<span class="font-mono text-xs">{{ ruleDetail.pattern }}</span></p>
            <p>起始号：{{ ruleDetail.startNumber }} · 序号 {{ ruleDetail.padding }} 位</p>
            <p>重置：{{ invoiceNumberResetPolicyLabels[ruleDetail.resetPolicy] }}</p>
            <p>生效：{{ ruleDetail.effectiveFrom }} 至 {{ ruleDetail.effectiveTo ?? '持续' }}</p>
            <p>创建人：{{ ruleDetail.createdBy }}</p>
            <p>创建时间：{{ ruleDetail.createdAt }}</p>
          </div>
          <UAlert
            color="neutral"
            variant="soft"
            title="备注"
            :description="ruleDetail.note"
          />
          <div class="flex justify-end">
            <UButton
              label="关闭"
              color="neutral"
              variant="ghost"
              size="sm"
              data-testid="invoice-number-rule-detail-close"
              @click="ruleDetailOpen = false"
            />
          </div>
        </div>
      </template>
    </UModal>

    <UModal v-model:open="sharePreviewOpen" title="发票分享预览（本地模拟）" :ui="{ content: 'sm:max-w-3xl' }">
      <template #body>
        <div v-if="sharePreview" class="space-y-4" data-testid="invoice-share-preview">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p class="text-xs text-muted">
                分享编号
              </p>
              <p class="font-mono text-sm text-highlighted">
                {{ sharePreview.record.id }} · {{ sharePreview.record.token }}
              </p>
            </div>
            <UBadge
              :label="invoiceShareStatusLabels[sharePreview.status]"
              :color="invoiceShareStatusColors[sharePreview.status]"
              variant="subtle"
              data-testid="invoice-share-preview-status"
            />
          </div>
          <div class="overflow-x-auto rounded-sm border border-default bg-elevated/40 px-3 py-2 font-mono text-xs text-muted" data-testid="invoice-share-preview-url">
            {{ sharePreview.url }}
          </div>
          <UAlert
            :color="sharePreviewAlertColor"
            variant="soft"
            icon="i-lucide-link"
            :title="'链接状态：' + invoiceShareStatusLabels[sharePreview.status]"
            :description="sharePreview.description"
            data-testid="invoice-share-preview-reason"
          />
          <div class="rounded-sm border border-default p-3 text-sm" data-testid="invoice-share-preview-invoice">
            <div class="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p class="text-xs text-muted">
                  {{ sharePreview.invoice?.buyer.name ?? '关联发票缺失' }}
                </p>
                <p class="mt-1 font-mono text-base font-semibold text-highlighted">
                  {{ sharePreviewNumber }}
                </p>
              </div>
              <div class="text-right text-xs text-muted">
                <p>有效期至 {{ sharePreview.record.expiresAt }}</p>
                <p class="mt-1">
                  已访问 {{ sharePreview.record.views }} 次
                </p>
              </div>
            </div>
            <div class="mt-3 grid gap-2 border-t border-default pt-3 text-xs text-muted sm:grid-cols-3">
              <p>发票状态：{{ sharePreviewInvoiceStatus }}</p>
              <p>开票日期：{{ sharePreview.invoice?.issueDate ?? '—' }}</p>
              <p>价税合计：{{ sharePreviewAmount }}</p>
            </div>
          </div>
          <div class="flex flex-wrap items-center justify-end gap-2">
            <UButton
              label="复制链接"
              icon="i-lucide-copy"
              size="sm"
              :disabled="sharePreview.status === 'revoked' || sharePreview.status === 'unavailable'"
              data-testid="invoice-share-preview-copy"
              @click="copyPreviewLink"
            />
            <UButton
              label="关闭"
              color="neutral"
              variant="ghost"
              size="sm"
              data-testid="invoice-share-preview-close"
              @click="sharePreviewOpen = false"
            />
          </div>
        </div>
      </template>
    </UModal>

    <UModal v-model:open="mailDetailOpen" title="投递详情" :ui="{ content: 'sm:max-w-3xl' }">
      <template #body>
        <div v-if="mailDetailRecord" class="space-y-4" data-testid="invoice-mail-detail">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p class="font-mono text-sm text-highlighted">
                {{ mailDetailRecord.id }}
              </p>
              <p class="mt-1 text-sm font-medium text-highlighted">
                {{ mailDetailRecord.recipientName }} · {{ mailDetailRecord.recipientEmail }}
              </p>
              <p class="mt-0.5 text-xs text-muted">
                关联发票 {{ mailDetailInvoice?.buyer.name ?? '—' }} · {{ mailDetailInvoice ? invoiceDisplayNumber(mailDetailInvoice) : '—' }}
              </p>
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <UBadge
                :label="invoiceMailStatusLabels[mailDetailRecord.status]"
                :color="invoiceMailStatusColors[mailDetailRecord.status]"
                variant="subtle"
                data-testid="invoice-mail-detail-status"
              />
              <UBadge :label="invoiceMailRelationLabel(mailDetailRecord)" color="neutral" variant="subtle" />
            </div>
          </div>

          <div class="grid gap-3 text-xs sm:grid-cols-2">
            <div class="rounded-sm border border-default p-3">
              <p class="text-muted">
                投递渠道
              </p>
              <p class="mt-1 text-sm text-highlighted">
                {{ mailDetailChannel?.name ?? '渠道缺失' }}
              </p>
              <p class="mt-0.5 text-muted">
                {{ mailDetailChannel?.provider ?? '—' }} · {{ mailDetailChannel ? invoiceMailChannelStatusLabels[mailDetailChannel.status] : '—' }}
              </p>
            </div>
            <div class="rounded-sm border border-default p-3">
              <p class="text-muted">
                发件人
              </p>
              <p class="mt-1 text-sm text-highlighted">
                {{ mailDetailSender?.name ?? '发件人缺失' }}
              </p>
              <p class="mt-0.5 text-muted">
                {{ mailDetailSender?.email ?? '—' }}
              </p>
            </div>
            <div class="rounded-sm border border-default p-3">
              <p class="text-muted">
                创建时间 / 尝试次数
              </p>
              <p class="mt-1 text-sm text-highlighted">
                {{ mailDetailRecord.createdAt }} · {{ mailDetailRecord.attempts }} 次
              </p>
            </div>
            <div class="rounded-sm border border-default p-3">
              <p class="text-muted">
                投递回执 / 关联方式
              </p>
              <p class="mt-1 text-sm text-highlighted">
                {{ mailDetailRecord.sentAt ?? '无送达回执' }} · {{ invoiceMailRelationLabel(mailDetailRecord) }}
              </p>
            </div>
          </div>

          <UAlert
            v-if="mailDetailAlert"
            :color="mailDetailAlert.color"
            variant="soft"
            icon="i-lucide-triangle-alert"
            :title="mailDetailAlert.title"
            :description="mailDetailAlert.description"
            data-testid="invoice-mail-detail-reason"
          />

          <div>
            <p class="text-xs font-medium text-highlighted">
              投递时间线
            </p>
            <ol class="mt-2 space-y-2" data-testid="invoice-mail-detail-timeline">
              <li
                v-for="event in mailDetailTimeline"
                :key="event.at + event.label"
                class="flex flex-wrap items-start gap-2 rounded-sm border border-default px-3 py-2 text-xs"
              >
                <span class="w-36 shrink-0 tabular-nums text-muted">{{ event.at }}</span>
                <div class="min-w-0 flex-1">
                  <p class="font-medium text-highlighted">
                    {{ event.label }}
                  </p>
                  <p class="mt-0.5 text-muted">
                    {{ event.detail }}
                  </p>
                </div>
              </li>
              <li v-if="!mailDetailTimeline.length" class="px-3 py-4 text-center text-xs text-muted">
                暂无时间线事件。
              </li>
            </ol>
          </div>

          <div class="rounded-sm border border-default p-3" data-testid="invoice-mail-detail-chain">
            <p class="text-xs font-medium text-highlighted">
              关联链
            </p>
            <div class="mt-2 space-y-1.5 text-xs">
              <div v-if="mailDetailParent" class="flex flex-wrap items-center justify-between gap-2">
                <span class="text-muted">原记录</span>
                <UButton
                  :label="mailDetailParent.id"
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  :data-testid="'invoice-mail-chain-open-' + mailDetailParent.id"
                  @click="openMailDetailById(mailDetailParent.id)"
                />
              </div>
              <p class="text-muted">
                当前记录：<span class="font-mono text-toned">{{ mailDetailRecord.id }}</span>
              </p>
              <div
                v-for="child in mailDetailChain.children"
                :key="child.id"
                class="flex flex-wrap items-center justify-between gap-2"
              >
                <span class="text-muted">{{ child.retryOf ? '重试记录' : '重寄记录' }} · {{ invoiceMailStatusLabels[child.status] }}</span>
                <UButton
                  :label="child.id"
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  :data-testid="'invoice-mail-chain-open-' + child.id"
                  @click="openMailDetailById(child.id)"
                />
              </div>
              <p v-if="!mailDetailParent && mailDetailChain.children.length === 0" class="text-muted">
                暂无关联记录；重试或重寄后会在此显示关联链。
              </p>
            </div>
          </div>

          <UFormField label="放弃原因（必填）">
            <UInput
              v-model="mailAbandonReason"
              placeholder="例如：客户已线下签收，不再邮件投递"
              class="w-full"
              data-testid="invoice-mail-abandon-reason"
            />
          </UFormField>
          <UAlert
            v-if="mailAbandonError"
            color="error"
            variant="soft"
            icon="i-lucide-alert-circle"
            :title="mailAbandonError"
            data-testid="invoice-mail-abandon-error"
          />

          <div class="flex flex-wrap items-center gap-2">
            <UButton
              label="重试"
              icon="i-lucide-refresh-cw"
              size="sm"
              color="primary"
              variant="soft"
              :disabled="!mailDetailAvailability?.retry.enabled"
              data-testid="invoice-mail-retry"
              @click="retryMail"
            />
            <UButton
              label="重寄"
              icon="i-lucide-mail-plus"
              size="sm"
              color="neutral"
              variant="soft"
              :disabled="!mailDetailAvailability?.resend.enabled"
              data-testid="invoice-mail-resend"
              @click="openResend"
            />
            <UButton
              label="放弃投递"
              icon="i-lucide-ban"
              size="sm"
              color="warning"
              variant="soft"
              :disabled="!mailDetailAvailability?.abandon.enabled"
              data-testid="invoice-mail-abandon"
              @click="abandonMail"
            />
            <UButton
              label="关闭"
              color="neutral"
              variant="ghost"
              size="sm"
              data-testid="invoice-mail-detail-close"
              @click="mailDetailOpen = false"
            />
          </div>
          <p v-if="mailDetailAvailability && !mailDetailAvailability.retry.enabled" class="text-xs text-muted" data-testid="invoice-mail-action-blocked">
            重试不可用：{{ mailDetailAvailability.retry.reason }}
          </p>
        </div>
      </template>
    </UModal>

    <UModal v-model:open="resendOpen" title="重寄发票" :ui="{ content: 'sm:max-w-xl' }">
      <template #body>
        <div class="space-y-4" data-testid="invoice-mail-resend-modal">
          <p class="text-xs text-muted">
            重寄会创建一条新记录并关联原记录 {{ mailDetailRecord?.id ?? '—' }}；原记录状态保持不变。
          </p>
          <UFormField label="收件人姓名">
            <UInput v-model="resendName" class="w-full" data-testid="invoice-mail-resend-name" />
          </UFormField>
          <UFormField label="收件邮箱">
            <UInput v-model="resendEmail" class="w-full" data-testid="invoice-mail-resend-email" />
          </UFormField>
          <UFormField label="投递渠道">
            <USelect
              v-model="resendChannelId"
              :items="channelOptions"
              class="w-full"
              data-testid="invoice-mail-resend-channel"
            />
          </UFormField>
          <UAlert
            v-if="resendError"
            color="error"
            variant="soft"
            icon="i-lucide-alert-circle"
            title="重寄校验未通过"
            :description="resendError"
            data-testid="invoice-mail-resend-error"
          />
          <div class="flex flex-wrap items-center justify-end gap-2">
            <UButton
              label="取消"
              color="neutral"
              variant="ghost"
              size="sm"
              data-testid="invoice-mail-resend-cancel"
              @click="resendOpen = false"
            />
            <UButton
              label="确认重寄"
              icon="i-lucide-mail-plus"
              size="sm"
              data-testid="invoice-mail-resend-submit"
              @click="submitResend"
            />
          </div>
        </div>
      </template>
    </UModal>
  </section>
</template>
