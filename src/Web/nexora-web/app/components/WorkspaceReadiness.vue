<script setup lang="ts">
import type { BackfillResult, ReadinessView } from '~/utils/readiness'

const props = defineProps<{ workspaceId: string }>()
const path = computed(() => '/bff/api/finance/workspaces/' + props.workspaceId + '/readiness')
const submit = useWorkspaceMutation()
const view = shallowRef<ReadinessView>()
const result = shallowRef<BackfillResult>()
const busy = ref(false)
const notice = ref('')

const money = (value: string) => formatDecimal(value, view.value?.book.minorUnits ?? 2)
const summary = computed(() => view.value
  ? readinessSummary(view.value.ready, view.value.missingDocumentCount, view.value.pendingCostCount)
  : '')

async function check() {
  if (busy.value) return
  busy.value = true
  notice.value = ''
  try {
    view.value = await $fetch<ReadinessView>(path.value, { retry: 0 })
  } catch {
    view.value = undefined
    notice.value = '暂时无法读取开账就绪检查。'
  } finally {
    busy.value = false
  }
}

async function backfill() {
  if (busy.value) return
  busy.value = true
  notice.value = ''
  try {
    const outcome = await submit<BackfillResult>('readiness-backfill', path.value + '/backfill', 'POST', {})
    result.value = outcome
    view.value = outcome.readiness
    notice.value = outcome.blocked.length === 0
      ? '已按业务日期补记 ' + outcome.posted.length + ' 项库存成本。'
      : '已补记 ' + outcome.posted.length + ' 项，另有 ' + outcome.blocked.length + ' 项仍受阻。'
  } catch (error) {
    const status = (error as { statusCode?: number }).statusCode
    notice.value = status === 409
      ? '补记结果已存在，请刷新后查看。'
      : status === 403 ? '当前角色没有补记分录的权限。' : '补记结果尚未确认，保持内容不变重试会复用操作编号。'
  } finally {
    busy.value = false
  }
}

onMounted(check)
</script>

<template>
  <section class="readiness" aria-labelledby="readiness-heading">
    <header class="head">
      <h3 id="readiness-heading">开账就绪检查</h3>
      <button type="button" class="quiet" :disabled="busy" @click="check">{{ view ? '重新检查' : '开始检查' }}</button>
    </header>
    <p class="hint">启用财务过账前，确认已过账发票与账单都有总账分录，并补记尚未入账的库存成本。</p>
    <p v-if="notice" class="notice" role="status">{{ notice }}</p>
    <template v-if="view">
      <p class="summary" :data-ready="view.ready">{{ summary }}</p>
      <dl class="facts">
        <div><dt>币种</dt><dd>{{ view.book.exists ? view.book.currency : '—' }}</dd></div>
        <div><dt>核算起点</dt><dd>{{ view.book.startsOn ?? '—' }}</dd></div>
        <div><dt>最后过账号</dt><dd>{{ view.book.exists ? view.book.lastPostingNumber : '—' }}</dd></div>
        <div><dt>期初余额</dt><dd>{{ view.book.exists ? openingLabel(view.book.opening) : '—' }}</dd></div>
      </dl>
      <ul class="checks">
        <li v-for="item in view.checks" :key="item.code" :data-severity="item.severity">
          <span class="badge" :data-severity="item.severity">{{ severityLabel(item.severity) }}</span>
          <span class="check-label">{{ checkLabel(item.code) }}<template v-if="item.count > 1">（{{ item.count }}）</template></span>
          <span class="check-message">{{ item.message }}</span>
        </li>
      </ul>
      <div v-if="view.pendingCostCount > 0" class="table-block">
        <h4>未入账库存成本（{{ view.pendingCostCount }}）</h4>
        <button type="button" class="primary" :disabled="busy" @click="backfill">按业务日期补记</button>
        <table>
          <thead><tr><th>业务日期</th><th>类型</th><th class="num">金额</th><th>原因</th></tr></thead>
          <tbody>
            <tr v-for="cost in view.pendingCosts" :key="cost.id">
              <td>{{ cost.on }}</td>
              <td>{{ costKindLabel(cost.kind) }}</td>
              <td class="num">{{ money(cost.amount) }}</td>
              <td>{{ cost.reason }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-if="view.missingDocumentCount > 0" class="table-block">
        <h4>缺少分录的已过账单据（{{ view.missingDocumentCount }}）</h4>
        <table>
          <thead><tr><th>业务日期</th><th>编号</th><th>类型</th><th class="num">金额</th></tr></thead>
          <tbody>
            <tr v-for="doc in view.missingDocuments" :key="doc.id">
              <td>{{ doc.on }}</td>
              <td>{{ doc.number }}</td>
              <td>{{ doc.kind === 'bill' ? '账单' : '发票' }}</td>
              <td class="num">{{ money(doc.amount) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-if="result && result.blocked.length > 0" class="table-block">
        <h4>补记受阻（{{ result.blocked.length }}）</h4>
        <ul class="blocked">
          <li v-for="row in result.blocked" :key="row.id">{{ row.on }} · {{ money(row.amount) }} · {{ row.reason }}</li>
        </ul>
      </div>
    </template>
  </section>
</template>

<style scoped>
.readiness { border: 1px solid var(--nx-line, #d9e1ec); border-radius: 12px; padding: 16px 18px; display: grid; gap: 10px; }
.head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.head h3 { margin: 0; font-size: 15px; }
.hint, .notice { margin: 0; font-size: 13px; color: var(--nx-muted, #55637a); }
.notice { color: #8a5b00; }
.summary { margin: 0; font-weight: 600; }
.summary[data-ready='false'] { color: #a12b2b; }
.summary[data-ready='true'] { color: #1c6b3c; }
.facts { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; margin: 0; }
.facts dt { font-size: 12px; color: var(--nx-muted, #55637a); }
.facts dd { margin: 0; font-weight: 600; }
.checks { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
.checks li { display: flex; flex-wrap: wrap; align-items: baseline; gap: 8px; font-size: 13px; }
.badge { border-radius: 999px; padding: 1px 8px; font-size: 12px; background: #e8eef8; }
.badge[data-severity='pass'] { background: #e3f4e9; color: #1c6b3c; }
.badge[data-severity='warn'] { background: #fdf0dc; color: #8a5b00; }
.badge[data-severity='fail'] { background: #fbe3e3; color: #a12b2b; }
.check-label { font-weight: 600; }
.check-message { color: var(--nx-muted, #55637a); }
.table-block { display: grid; gap: 8px; }
.table-block h4 { margin: 0; font-size: 13px; }
table { width: 100%; border-collapse: collapse; font-size: 13px; }
th, td { text-align: left; padding: 4px 6px; border-bottom: 1px solid var(--nx-line, #d9e1ec); }
th { font-weight: 600; color: var(--nx-muted, #55637a); }
.num { text-align: right; font-variant-numeric: tabular-nums; }
.blocked { margin: 0; padding-left: 18px; font-size: 13px; }
.quiet, .primary { border-radius: 8px; padding: 5px 12px; font-size: 13px; cursor: pointer; }
.quiet { border: 1px solid var(--nx-line, #d9e1ec); background: transparent; }
.primary { border: 0; background: #2457a6; color: #fff; justify-self: start; }
button:disabled { opacity: 0.6; cursor: progress; }
</style>
