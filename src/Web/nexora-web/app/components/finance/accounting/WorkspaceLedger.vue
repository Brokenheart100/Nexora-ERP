<script setup lang="ts">
interface Period { month: string; state: string; version: number; closingWatermark: number | null }
interface Ledger {
  currency: string; minorUnits: number; startsOn: string; canDraft: boolean; canPost: boolean
  canReverse: boolean; canManagePeriods: boolean; canConfigurePartnership: boolean; periods: Period[]
}
interface PeriodDetail {
  period: Period
  check: { watermark: number; postedCount: number; pendingCount: number; debit: string; credit: string }
  history: { version: number; state: number; reason: string }[]
}
interface Account { id: string; code: string; name: string; category: string; purpose: string; isArchived: boolean }
interface Journal {
  id: string; kind: string; sourceNumber: string; on: string; memo: string; state: string
  version: number; postingNumber: number | null; reversesId: string | null
  importProvider: string | null; externalId: string | null
}
interface Line { accountId: string; debit: string; credit: string }
interface JournalDetail { cashActivity?: string | null; journal: Journal; lines: (Line & { code: string; name: string })[]; isMaker: boolean; approvedVersion: number | null }
interface TrialBalance { debit: string; credit: string; accounts: { accountId: string; code: string; name: string; debit: string; credit: string; balance: string }[] }
interface JournalLink {
  id: string; fromJournalId: string; fromSourceNumber: string; fromOn: string; toJournalId: string
  toSourceNumber: string; toOn: string; kind: string; memo: string; createdByIssuer: string
  createdBySubject: string; createdAtUtc: string; version: number
}
interface JournalLinkIssue { code: string; linkId: string | null; journalId: string | null; message: string }
interface JournalLinkScan { scannedAtUtc: string; linkCount: number; journalCount: number; issues: JournalLinkIssue[] }

const props = defineProps<{ workspaceId: string }>()
const finance = computed(() => `/bff/api/finance/workspaces/${props.workspaceId}`)
const path = computed(() => `${finance.value}/ledger`)
const submit = useWorkspaceMutation()
const home = shallowRef<Ledger>()
const accounts = shallowRef<Account[]>([])
const journals = shallowRef<Journal[]>([])
const detail = shallowRef<JournalDetail>()
const period = shallowRef<PeriodDetail>()
const trial = shallowRef<TrialBalance>()
const links = shallowRef<JournalLink[]>([])
const linkScan = shallowRef<JournalLinkScan>()
const busy = ref(false)
const notice = ref('')
const filter = reactive({ month: '', accountId: '', postedOnly: false, page: 1 })
const periodForm = reactive({ month: '', reason: '' })
const linkForm = reactive({ fromJournalId: '', toJournalId: '', kind: 'related', memo: '' })
const reversal = reactive({ on: '', reason: '' })
const cutoff = ref('')
const blankLine = (): Line => ({ accountId: '', debit: '0', credit: '0' })
const form = reactive({ id: '', version: 0, kind: 'manual', sourceNumber: '', on: '', memo: '', cashActivity: '', lines: [blankLine(), blankLine()] })
const accountOptions = computed(() => accounts.value.filter(x => !x.isArchived && x.purpose === 'posting'
  && (form.kind !== 'opening' || !['income', 'expense'].includes(x.category))))
const kinds: Record<string, string> = { opening: '期初', subledgeropening: '子账期初', manual: '手工', imported: '外部导入', reversal: '冲销', automatic: '自动', fiscalclosing: '年度结转' }
const states: Record<string, string> = { draft: '草稿', submitted: '待复核', posted: '已过账', cancelled: '已作废', open: '开放', closing: '关账检查中', closed: '已关闭' }
const periodStates: Record<number, string> = { 1: '开放', 2: '关账检查中', 3: '已关闭' }
const linkKinds: Record<string, string> = { related: '相关', adjustment: '调整', settlement: '结算' }
const postedJournals = computed(() => journals.value.filter(x => x.state === 'posted'))
const money = (value: string) => formatDecimal(value, home.value?.minorUnits ?? 2)
const formKindOptions = [
  { label: '手工凭证', value: 'manual' },
  { label: '期初单', value: 'opening' },
]
const cashActivityOptions = [
  { label: '按凭证判断', value: '__auto__' },
  { label: '经营活动', value: 'operating' },
  { label: '投资活动', value: 'investing' },
  { label: '筹资活动', value: 'financing' },
]
const linkKindOptions = [
  { label: '相关', value: 'related' },
  { label: '调整', value: 'adjustment' },
  { label: '结算', value: 'settlement' },
]
const accountSelectOptions = computed(() => accountOptions.value.map(account => ({ label: `${account.code} · ${account.name}`, value: account.id })))
const postedJournalOptions = computed(() => postedJournals.value.map(journal => ({ label: `${journal.on} · ${journal.sourceNumber} · ${journal.memo}`, value: journal.id })))
const journalAccountFilterOptions = computed(() => [
  { label: '全部科目', value: '__all__' },
  ...accounts.value.map(account => ({ label: `${account.code} · ${account.name}`, value: account.id })),
])

async function run(action: () => Promise<void>) {
  if (busy.value) return
  busy.value = true
  notice.value = ''
  try { await action() }
  catch (error) {
    const detail = (error as { data?: { detail?: string } }).data?.detail
    notice.value = detail || '请求未完成。请刷新核对状态，或保留原输入手动重试。'
  } finally { busy.value = false }
}
async function readHome() {
  const [result, chart] = await Promise.all([
    $fetch<Ledger>(path.value, { retry: 0 }),
    $fetch<{ accounts: Account[] }>(`${finance.value}/chart`, { retry: 0 }),
  ])
  home.value = result
  accounts.value = chart.accounts
  cutoff.value ||= result.startsOn
  form.on ||= result.startsOn
  periodForm.month ||= result.startsOn.slice(0, 7)
  await readList()
  await readLinks()
}
async function readList() {
  journals.value = await $fetch<Journal[]>(`${path.value}/journals`, { retry: 0, query: {
    month: filter.month ? `${filter.month}-01` : undefined, accountId: filter.accountId || undefined,
    postedOnly: filter.postedOnly, page: filter.page,
  } })
}
async function queryList(page: number) {
  await run(async () => { filter.page = page; await readList() })
}
async function readJournal(id: string) {
  detail.value = await $fetch<JournalDetail>(`${path.value}/journals/${id}`, { retry: 0 })
  reversal.on = detail.value.journal.on
}
function editJournal() {
  if (!detail.value) return
  const { journal, lines } = detail.value
  Object.assign(form, { id: journal.id, version: journal.version, kind: journal.kind, sourceNumber: journal.sourceNumber,
    on: journal.on, memo: journal.memo, cashActivity: detail.value?.cashActivity ?? '', lines: lines.map(({ accountId, debit, credit }) => ({ accountId, debit, credit })) })
}
function resetDraft() {
  Object.assign(form, { id: '', version: 0, kind: 'manual', sourceNumber: '', on: home.value?.startsOn ?? '',
    memo: '', cashActivity: '', lines: [blankLine(), blankLine()] })
}
async function saveDraft() {
  await run(async () => {
    const draft = { on: form.kind === 'opening' ? home.value!.startsOn : form.on, memo: form.memo, cashActivity: form.kind === 'manual' ? form.cashActivity || null : null, lines: form.lines }
    const changed = form.id
      ? await submit<{ id: string }>('edit-journal', `${path.value}/journals/${form.id}`, 'PUT', { expectedVersion: form.version, draft })
      : await submit<{ id: string }>('new-journal', `${path.value}/journals`, 'POST', { kind: form.kind, sourceNumber: form.sourceNumber, draft })
    resetDraft()
    await readList()
    await readJournal(changed.id)
    notice.value = '凭证草稿已保存。'
  })
}
async function decide(decision: 'submit' | 'post' | 'cancel') {
  const journal = detail.value?.journal
  if (!journal) return
  await run(async () => {
    await submit(decision, `${path.value}/journals/${journal.id}/decision`, 'POST', { expectedVersion: journal.version, decision })
    await readList()
    await readJournal(journal.id)
    notice.value = { submit: '凭证已提交复核。', post: '凭证已过账。', cancel: '凭证已作废。' }[decision]
  })
}
async function reverse() {
  const journal = detail.value?.journal
  if (!journal) return
  await run(async () => {
    const result = await submit<{ id: string }>('reverse', `${path.value}/journals/${journal.id}/reversal`, 'POST', {
      expectedVersion: journal.version, ...reversal,
    })
    reversal.reason = ''
    await readList()
    await readJournal(result.id)
    notice.value = '关联冲销已提交复核。'
  })
}
async function readPeriod(month: string) {
  period.value = await $fetch<PeriodDetail>(`${path.value}/periods/${month}`, { retry: 0 })
  periodForm.month = month.slice(0, 7)
}
async function movePeriod(action: 'open' | 'begin-close' | 'close' | 'reopen') {
  await run(async () => {
    const month = action === 'open' ? `${periodForm.month}-01` : period.value!.period.month
    await submit(action, `${path.value}/periods/${month}`, 'POST', {
      expectedVersion: action === 'open' ? 0 : period.value!.period.version, action, reason: periodForm.reason,
    })
    periodForm.reason = ''
    await readHome()
    await readPeriod(month)
    notice.value = '会计期间已更新。'
  })
}
async function readLinks() {
  links.value = await $fetch<JournalLink[]>(`${path.value}/links`, { retry: 0 })
}
async function createLink() {
  await run(async () => {
    await submit('ledger-link-create', `${path.value}/links`, 'POST', {
      fromJournalId: linkForm.fromJournalId, toJournalId: linkForm.toJournalId, kind: linkForm.kind, memo: linkForm.memo,
    })
    Object.assign(linkForm, { fromJournalId: '', toJournalId: '', kind: 'related', memo: '' })
    await readLinks()
    notice.value = '关联分录已建立。'
  })
}
async function deleteLink(link: JournalLink) {
  await run(async () => {
    await submit(`ledger-link-delete-${link.id}`, `${path.value}/links/${link.id}/delete`, 'POST', { expectedVersion: link.version })
    await readLinks()
    notice.value = '关联分录已解除。'
  })
}
async function scanLinks() {
  await run(async () => {
    linkScan.value = await $fetch<JournalLinkScan>(`${path.value}/links/scan`, { retry: 0 })
    notice.value = linkScan.value.issues.length ? '完整性扫描发现异常关联，请核对下方清单。' : '完整性扫描未发现异常。'
  })
}
async function readTrial() {
  await run(async () => { trial.value = await $fetch<TrialBalance>(`${path.value}/trial-balance/${cutoff.value}`, { retry: 0 }) })
}
</script>

<template>
  <section class="ledger" aria-labelledby="ledger-heading">
    <h3 id="ledger-heading">会计期间、期初与凭证</h3>
    <UButton type="button" variant="outline" color="neutral" size="sm" :disabled="busy" @click="run(readHome)">{{ home ? '刷新总账' : '打开总账' }}</UButton>
    <UAlert v-if="notice" role="status" :description="notice" />
    <template v-if="home">
      <p>本位币 {{ home.currency }} · 核算起点 {{ home.startsOn }}</p>
      <h4>会计期间</h4>
      <ul><li v-for="entry in home.periods" :key="entry.month">
        <UButton type="button" variant="outline" color="neutral" size="xs" :disabled="busy" @click="run(() => readPeriod(entry.month))">{{ entry.month.slice(0, 7) }} · {{ states[entry.state] }}</UButton>
      </li></ul>
      <fieldset v-if="home.canManagePeriods" :disabled="busy">
        <legend>管理会计期间</legend>
        <UFormField label="会计月份" name="periodMonth">
          <UInput :model-value="periodForm.month" type="month" @update:model-value="value => periodForm.month = String(value)" />
        </UFormField>
        <UFormField label="期间操作原因" name="periodReason">
          <UInput :model-value="periodForm.reason" maxlength="300" @update:model-value="value => periodForm.reason = String(value)" />
        </UFormField>
        <UButton type="button" variant="outline" color="neutral" size="sm" :disabled="!periodForm.month || !periodForm.reason.trim()" @click="movePeriod('open')">开放期间</UButton>
        <div v-if="period" class="mb-3 mt-2 flex flex-wrap gap-2">
          <UButton v-if="period.period.state === 'open'" type="button" variant="outline" color="neutral" size="sm" :disabled="!periodForm.reason.trim()" @click="movePeriod('begin-close')">开始关账</UButton>
          <UButton v-if="period.period.state === 'closing'" type="button" variant="outline" color="neutral" size="sm" :disabled="!periodForm.reason.trim()" @click="movePeriod('close')">确认关闭</UButton>
          <UButton v-if="period.period.state !== 'open'" type="button" variant="outline" color="neutral" size="sm" :disabled="!periodForm.reason.trim()" @click="movePeriod('reopen')">重开期间</UButton>
        </div>
      </fieldset>
      <template v-if="period">
        <p>{{ period.period.month }} · {{ states[period.period.state] }} · 水位 {{ period.check.watermark }} · 已过账 {{ period.check.postedCount }} 笔 · 待处理 {{ period.check.pendingCount }} 笔 · 借 {{ money(period.check.debit) }} / 贷 {{ money(period.check.credit) }}</p>
        <ul><li v-for="entry in period.history" :key="entry.version">v{{ entry.version }} · {{ periodStates[entry.state] }} · {{ entry.reason }}</li></ul>
      </template>

      <OpeningBalanceImportPanel v-if="home.canDraft" :path="path" :starts-on="home.startsOn" :minor-units="home.minorUnits"
        @imported="id => run(async () => { await readList(); await readJournal(id); notice = '期初导入草稿已创建。' })" />
      <OpeningSubledgerPanel :base="path + '/opening-subledgers'" :minor-units="home.minorUnits" :can-draft="home.canDraft"
        :can-post="home.canPost" :equity="accounts.filter(x => !x.isArchived && x.purpose === 'posting' && x.category === 'equity')"
        @journal="id => run(() => readJournal(id))" />
      <form v-if="home.canDraft" @submit.prevent="saveDraft">
        <fieldset :disabled="busy">
          <legend>{{ form.id ? '修改凭证草稿' : '新建凭证草稿' }}</legend>
          <UFormField label="凭证类型" name="voucherKind">
            <USelect :model-value="form.kind" :items="formKindOptions" :disabled="!!form.id" @update:model-value="value => form.kind = String(value)" />
          </UFormField>
          <UFormField v-if="form.kind === 'manual'" label="来源单号" name="sourceNumber">
            <UInput :model-value="form.sourceNumber" maxlength="80" required :readonly="!!form.id" @update:model-value="value => form.sourceNumber = String(value).trim()" />
          </UFormField>
          <UFormField v-if="form.kind !== 'opening'" label="凭证日期" name="journalOn">
            <UInput :model-value="form.on" type="date" :min="home.startsOn" required @update:model-value="value => form.on = String(value)" />
          </UFormField>
          <p v-else>期初日期 {{ home.startsOn }}</p>
          <UFormField v-if="form.kind === 'manual'" label="现金流分类" name="cashActivity">
            <USelect :model-value="form.cashActivity || '__auto__'" :items="cashActivityOptions" @update:model-value="value => form.cashActivity = value === '__auto__' ? '' : String(value)" />
          </UFormField>
          <UFormField label="凭证摘要" name="journalMemo">
            <UInput :model-value="form.memo" maxlength="300" required @update:model-value="value => form.memo = String(value).trim()" />
          </UFormField>
          <div v-for="(line, index) in form.lines" :key="index" class="journal-line">
            <UFormField :label="`科目 ${index + 1}`" :name="`account-${index}`">
              <USelect :model-value="line.accountId" :items="accountSelectOptions" :aria-label="`科目 ${index + 1}`" placeholder="选择科目" @update:model-value="value => line.accountId = String(value)" />
            </UFormField>
            <UFormField :label="`借方 ${index + 1}`" :name="`debit-${index}`">
              <UInput :model-value="line.debit" inputmode="decimal" maxlength="24" required @update:model-value="value => line.debit = String(value).trim()" />
            </UFormField>
            <UFormField :label="`贷方 ${index + 1}`" :name="`credit-${index}`">
              <UInput :model-value="line.credit" inputmode="decimal" maxlength="24" required @update:model-value="value => line.credit = String(value).trim()" />
            </UFormField>
            <UButton type="button" variant="outline" color="neutral" size="sm" :disabled="form.lines.length <= 2" @click="form.lines.splice(index, 1)">移除分录</UButton>
          </div>
          <div class="mb-3 mt-2 flex flex-wrap gap-2">
            <UButton type="button" variant="outline" color="neutral" size="sm" :disabled="form.lines.length >= 200" @click="form.lines.push(blankLine())">增加分录</UButton>
            <UButton v-if="form.id" type="button" variant="outline" color="neutral" size="sm" @click="resetDraft">放弃编辑</UButton>
            <UButton type="submit" color="primary">保存凭证草稿</UButton>
          </div>
        </fieldset>
      </form>

      <form @submit.prevent="queryList(1)">
        <fieldset :disabled="busy">
          <legend>凭证与科目明细</legend>
          <UFormField label="凭证月份筛选" name="filterMonth">
            <UInput :model-value="filter.month" type="month" @update:model-value="value => filter.month = String(value)" />
          </UFormField>
          <UFormField label="科目筛选" name="filterAccount">
            <USelect :model-value="filter.accountId || '__all__'" :items="journalAccountFilterOptions" @update:model-value="value => filter.accountId = value === '__all__' ? '' : String(value)" />
          </UFormField>
          <UCheckbox v-model="filter.postedOnly" label="仅已过账" />
          <UButton variant="outline" color="neutral" size="sm" type="submit">查询凭证</UButton>
        </fieldset>
      </form>
      <p v-if="!journals.length">没有符合条件的凭证。</p>
      <ul><li v-for="journal in journals" :key="journal.id">
        <UButton type="button" variant="outline" color="neutral" size="xs" :disabled="busy" @click="run(() => readJournal(journal.id))">{{ journal.on }} · {{ journal.sourceNumber }} · {{ journal.memo }} · {{ states[journal.state] }}</UButton>
      </li></ul>
      <ImportedJournalBatch :base="path" :rows="journals.filter(journal => journal.kind === 'imported')"
        :can-draft="home.canDraft" :can-post="home.canPost" @changed="run(readList)" />
      <div class="mb-3 mt-2 flex flex-wrap gap-2">
        <UButton type="button" variant="outline" color="neutral" size="sm" :disabled="busy || filter.page === 1" @click="queryList(filter.page - 1)">上一页凭证</UButton>
        <UButton type="button" variant="outline" color="neutral" size="sm" :disabled="busy || journals.length < 50" @click="queryList(filter.page + 1)">下一页凭证</UButton>
      </div>
      <template v-if="detail">
        <h4>{{ kinds[detail.journal.kind] }}凭证 · {{ detail.journal.sourceNumber }}</h4>
        <p v-if="detail.journal.importProvider">导入来源 {{ detail.journal.importProvider }} / {{ detail.journal.externalId }}</p>
        <p>{{ detail.journal.memo }} · {{ states[detail.journal.state] }} · v{{ detail.journal.version }}<span v-if="detail.journal.postingNumber"> · 过账号 {{ detail.journal.postingNumber }} · 复核版本 {{ detail.approvedVersion }}</span></p>
        <p v-if="detail.journal.reversesId">
          <UButton type="button" variant="outline" color="neutral" size="sm" :disabled="busy" @click="run(() => readJournal(detail!.journal.reversesId!))">查看原凭证</UButton>
        </p>
        <ul><li v-for="(line, index) in detail.lines" :key="index">{{ line.code }} · {{ line.name }} · 借 {{ money(line.debit) }} / 贷 {{ money(line.credit) }}</li></ul>
        <div class="mb-3 mt-2 flex flex-wrap gap-2">
          <UButton v-if="home.canDraft && detail.isMaker && !detail.journal.importProvider && detail.journal.kind !== 'imported' && detail.journal.state === 'draft'" type="button" variant="outline" color="neutral" size="sm" :disabled="busy" @click="editJournal">编辑草稿</UButton>
          <UButton v-if="home.canDraft && detail.isMaker && detail.journal.state === 'draft'" type="button" color="primary" :disabled="busy" @click="decide('submit')">提交复核</UButton>
          <UButton v-if="home.canDraft && detail.isMaker && ['draft', 'submitted'].includes(detail.journal.state)" type="button" variant="outline" color="neutral" size="sm" :disabled="busy" @click="decide('cancel')">作废草稿</UButton>
          <UButton
v-if="home.canPost && !detail.isMaker && detail.journal.state === 'submitted' && (detail.journal.kind !== 'reversal' || home.canReverse)"
            type="button" color="primary" :disabled="busy" @click="decide('post')">复核并过账</UButton>
        </div>
        <form v-if="home.canDraft && ['manual', 'imported'].includes(detail.journal.kind) && detail.journal.state === 'posted'" @submit.prevent="reverse">
          <fieldset :disabled="busy">
            <legend>关联冲销</legend>
            <UFormField label="冲销日期" name="reversalOn">
              <UInput :model-value="reversal.on" type="date" :min="detail.journal.on" required @update:model-value="value => reversal.on = String(value)" />
            </UFormField>
            <UFormField label="冲销原因" name="reversalReason">
              <UInput :model-value="reversal.reason" required maxlength="300" @update:model-value="value => reversal.reason = String(value).trim()" />
            </UFormField>
            <UButton variant="outline" color="neutral" size="sm" type="submit">提交冲销复核</UButton>
          </fieldset>
        </form>
      </template>
      <section class="ledger-links" aria-labelledby="ledger-links-heading">
        <h4 id="ledger-links-heading">关联分录与完整性扫描</h4>
        <p class="mt-2 text-[12px] leading-[1.62] text-nx-ink-3">已过账凭证可建立相关、调整或结算关联；扫描会检查悬挂引用、非过账关联、重复关联与冲销断链。</p>
        <form v-if="home.canDraft" @submit.prevent="createLink">
          <fieldset :disabled="busy">
            <legend>建立关联分录</legend>
            <UFormField label="关联来源凭证" name="linkFrom">
              <USelect :model-value="linkForm.fromJournalId" :items="postedJournalOptions" data-testid="link-from" placeholder="选择已过账凭证" @update:model-value="value => linkForm.fromJournalId = String(value)" />
            </UFormField>
            <UFormField label="关联目标凭证" name="linkTo">
              <USelect :model-value="linkForm.toJournalId" :items="postedJournalOptions" data-testid="link-to" placeholder="选择已过账凭证" @update:model-value="value => linkForm.toJournalId = String(value)" />
            </UFormField>
            <UFormField label="关联类型" name="linkKind">
              <USelect :model-value="linkForm.kind" :items="linkKindOptions" data-testid="link-kind" @update:model-value="value => linkForm.kind = String(value)" />
            </UFormField>
            <UFormField label="关联说明" name="linkMemo">
              <UInput :model-value="linkForm.memo" maxlength="300" data-testid="link-memo" @update:model-value="value => linkForm.memo = String(value).trim()" />
            </UFormField>
            <UButton variant="outline" color="neutral" size="sm" type="submit" data-testid="link-create" :disabled="!linkForm.fromJournalId || !linkForm.toJournalId">建立关联</UButton>
          </fieldset>
        </form>
        <div class="mb-3 mt-2 flex flex-wrap gap-2">
          <UButton type="button" variant="outline" color="neutral" size="sm" :disabled="busy" data-testid="link-refresh" @click="run(readLinks)">刷新关联分录</UButton>
          <UButton type="button" variant="outline" color="neutral" size="sm" :disabled="busy" data-testid="link-scan" @click="scanLinks">运行完整性扫描</UButton>
        </div>
        <p v-if="!links.length" data-testid="link-empty">尚未建立关联分录。</p>
        <ul v-else data-testid="link-list">
          <li v-for="link in links" :key="link.id">
            {{ link.fromOn }} · {{ link.fromSourceNumber }} → {{ link.toOn }} · {{ link.toSourceNumber }} · {{ linkKinds[link.kind] || link.kind }}
            <span v-if="link.memo"> · {{ link.memo }}</span>
            <UButton v-if="home.canDraft" type="button" variant="outline" color="neutral" size="xs" :disabled="busy" data-testid="link-delete" @click="deleteLink(link)">解除关联</UButton>
          </li>
        </ul>
        <template v-if="linkScan">
          <p data-testid="link-scan-summary">关联 {{ linkScan.linkCount }} 条 · 凭证 {{ linkScan.journalCount }} 张 · 异常 {{ linkScan.issues.length }} 项</p>
          <ul v-if="linkScan.issues.length" data-testid="link-scan-issues">
            <li v-for="(issue, index) in linkScan.issues" :key="index">{{ issue.message }}（{{ issue.code }}）</li>
          </ul>
          <p v-else data-testid="link-scan-clean">未发现断链或异常关联。</p>
        </template>
      </section>
      <PartnershipSettings v-if="home.canConfigurePartnership" :base="path" :starts-on="home.startsOn"
        :accounts="accounts.filter(x => x.category === 'equity' && x.purpose === 'posting' && !x.isArchived)" />
      <FiscalYearPanel
:ledger-path="path" :starts-on="home.startsOn" :minor-units="home.minorUnits" :can-prepare="home.canDraft"
        :can-review="home.canManagePeriods" :equity="accounts.filter(x => x.category === 'equity' && x.purpose === 'posting' && !x.isArchived)" />
      <form @submit.prevent="readTrial">
        <fieldset :disabled="busy">
          <legend>试算平衡与期初核对</legend>
          <UFormField label="试算截止日期" name="trialCutoff">
            <UInput :model-value="cutoff" type="date" :min="home.startsOn" required @update:model-value="value => cutoff = String(value)" />
          </UFormField>
          <UButton variant="outline" color="neutral" size="sm" type="submit">查询试算平衡</UButton>
          <template v-if="trial">
            <p>借方合计 {{ money(trial.debit) }} · 贷方合计 {{ money(trial.credit) }}</p>
            <ul><li v-for="row in trial.accounts" :key="row.accountId">
              {{ row.code }} · {{ row.name }} · 借 {{ money(row.debit) }} / 贷 {{ money(row.credit) }} · 借贷差 {{ money(row.balance) }}
            </li></ul>
          </template>
        </fieldset>
      </form>
    </template>
  </section>
</template>

<style scoped>
.ledger { margin-top: 24px }
fieldset { display: grid; gap: 10px; min-width: 0; margin: 12px 0; border: 1px solid #d1d9e6; border-radius: 8px }
.journal-line { display: flex; align-items: end; flex-wrap: wrap; gap: 8px }
li { margin: 6px 0; overflow-wrap: anywhere }
</style>
