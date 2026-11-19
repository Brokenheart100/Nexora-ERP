<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { ProvisionalBill, TradeDocument, TradeDocumentKind } from '~/mocks'
import {
  provisionalBillStatusColors,
  provisionalBillStatusLabels,
  tradeDocumentKindDescriptions,
  tradeDocumentKindLabels,
  tradeDocumentStatusColors,
  tradeDocumentStatusLabels
} from '~/mocks'

const props = defineProps<{ canPost?: boolean }>()

const toast = useToast()
const trade = useTradeDocumentsStore()
const { actor: demoActor, isMaker, isApprover, setActorRole } = useDemoActor()

const kind = ref<TradeDocumentKind>('bill')
const kindItems = [
  { label: '供应商账单', value: 'bill' },
  { label: '客户收款', value: 'receipt' },
  { label: '收款核销', value: 'allocation' }
]
const rows = computed(() => trade.documents.filter(row => row.kind === kind.value))
const kindDescription = computed(() => tradeDocumentKindDescriptions[kind.value])

const detailOpen = ref(false)
const selectedId = ref<string | null>(null)
const selected = computed(() => selectedId.value ? trade.documentOf(selectedId.value) : null)
const cancelOpen = ref(false)
const cancelReason = ref('')
const actionError = ref('')

const canSubmit = computed(() => Boolean(selected.value && props.canPost && selected.value.status === 'draft' && isMaker.value && selected.value.maker === demoActor.value.name))
const canReview = computed(() => Boolean(selected.value && props.canPost && selected.value.status === 'submitted' && isApprover.value))
const canPostDoc = computed(() => Boolean(selected.value && props.canPost && selected.value.status === 'reviewed' && isApprover.value))
const canCancel = computed(() => Boolean(selected.value
  && !['posted', 'cancelled'].includes(selected.value.status)
  && isMaker.value
  && selected.value.maker === demoActor.value.name))

function openDetail(row: TradeDocument) {
  selectedId.value = row.id
  cancelOpen.value = false
  cancelReason.value = ''
  actionError.value = ''
  detailOpen.value = true
}

function run(result: { ok: boolean, message: string }, successTitle: string) {
  if (!result.ok) {
    actionError.value = result.message
    toast.add({ title: '操作未完成', description: result.message, color: 'error', icon: 'i-carbon-warning' })
    return false
  }
  actionError.value = ''
  toast.add({ title: successTitle, description: result.message, color: 'success', icon: 'i-carbon-checkmark' })
  return true
}

function submit() {
  if (!selected.value) return
  run(trade.submitDocument(selected.value.id, demoActor.value.name), '已提交复核')
}

function review(decision: 'approve' | 'reject') {
  if (!selected.value) return
  const ok = run(trade.reviewDocument(selected.value.id, demoActor.value.name, decision), decision === 'approve' ? '已完成独立复核' : '已退回草稿')
  if (ok && decision === 'reject') detailOpen.value = false
}

function post() {
  if (!selected.value) return
  run(trade.postDocument(selected.value.id, demoActor.value.name), '已过账')
}

function openCancel() {
  cancelReason.value = ''
  actionError.value = ''
  cancelOpen.value = true
}

function confirmCancel() {
  if (!selected.value) return
  const ok = run(trade.cancelDocument(selected.value.id, demoActor.value.name, cancelReason.value), '已取消单据')
  if (ok) cancelOpen.value = false
}

function confirmProvisional(row: ProvisionalBill) {
  run(trade.confirmProvisional(row.id, demoActor.value.name), '已确认暂估')
}

function reverseProvisional(row: ProvisionalBill) {
  run(trade.reverseProvisional(row.id, demoActor.value.name), '已冲回暂估')
}

const columns: TableColumn<TradeDocument>[] = [{
  accessorKey: 'id',
  header: '单据编号',
  meta: { class: { td: 'whitespace-nowrap font-mono text-[12px]' } }
}, {
  accessorKey: 'party',
  header: '往来单位',
  meta: { class: { td: 'min-w-[180px] whitespace-normal' } }
}, {
  accessorKey: 'amount',
  header: '金额',
  meta: { class: { th: 'text-right', td: 'text-right tabular-nums whitespace-nowrap' } }
}, {
  accessorKey: 'sourceRef',
  header: '来源单据',
  meta: { class: { td: 'whitespace-nowrap font-mono text-[11px] text-muted' } }
}, {
  accessorKey: 'status',
  header: '状态'
}, {
  accessorKey: 'maker',
  header: '制单人',
  meta: { class: { td: 'whitespace-nowrap' } }
}, {
  id: 'reviewer',
  header: '复核人',
  meta: { class: { td: 'whitespace-nowrap' } }
}, {
  id: 'actions',
  header: '操作',
  meta: { class: { th: 'w-20', td: 'w-20 text-right' } }
}]

const provisionalColumns: TableColumn<ProvisionalBill>[] = [{
  accessorKey: 'id',
  header: '暂估单',
  meta: { class: { td: 'whitespace-nowrap font-mono text-[12px]' } }
}, {
  accessorKey: 'supplier',
  header: '供应商',
  meta: { class: { td: 'min-w-[160px] whitespace-normal' } }
}, {
  accessorKey: 'amount',
  header: '暂估金额',
  meta: { class: { th: 'text-right', td: 'text-right tabular-nums' } }
}, {
  accessorKey: 'status',
  header: '状态'
}, {
  id: 'actions',
  header: '处理',
  meta: { class: { th: 'w-32', td: 'w-32 text-right' } }
}]
</script>

<template>
  <div class="space-y-4" data-testid="finance-documents">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 class="text-sm font-semibold text-highlighted">
          单据流转与暂估
        </h2>
        <p class="mt-0.5 text-xs text-muted">
          提交、独立复核、过账与取消分开记录；复核人不能与制单人相同。
        </p>
      </div>
      <div class="flex items-center gap-1 rounded-lg border border-default p-0.5" data-testid="trade-actor-switch">
        <UButton
          label="张明远 · 制单"
          size="xs"
          :color="isMaker ? 'primary' : 'neutral'"
          :variant="isMaker ? 'solid' : 'ghost'"
          data-testid="trade-actor-maker"
          @click="setActorRole('maker')"
        />
        <UButton
          label="陈立 · 复核"
          size="xs"
          :color="isApprover ? 'primary' : 'neutral'"
          :variant="isApprover ? 'solid' : 'ghost'"
          data-testid="trade-actor-reviewer"
          @click="setActorRole('approver')"
        />
      </div>
    </div>

    <div class="grid gap-4 xl:grid-cols-2" data-testid="trade-overview">
      <UCard class="rounded-sm" :ui="{ body: 'space-y-3' }">
        <template #header>
          <div class="flex items-center justify-between">
            <h3 class="text-sm font-medium text-highlighted">
              应付 / 应收科目映射
            </h3>
            <UBadge
              color="success"
              variant="subtle"
              size="sm"
              label="映射就绪"
              data-testid="trade-mapping-status"
            />
          </div>
        </template>
        <div
          v-for="mapping in trade.accountMappings"
          :key="mapping.id"
          class="flex items-start justify-between gap-3 rounded-sm border border-default px-3 py-2"
          :data-testid="'trade-mapping-' + mapping.kind.toLowerCase()"
        >
          <div>
            <p class="text-[13px] text-default">
              {{ mapping.kind === 'AR' ? '应收账款' : '应付账款' }} · {{ mapping.accountCode }} {{ mapping.accountName }}
            </p>
            <p class="mt-0.5 text-[11px] text-muted">
              {{ mapping.note }}
            </p>
          </div>
          <UBadge
            :color="mapping.status === 'mapped' ? 'success' : 'error'"
            variant="subtle"
            size="sm"
            :label="mapping.status === 'mapped' ? '已映射' : '未映射'"
          />
        </div>
        <p class="text-[11px] text-dimmed">
          未映射时账单与核销不能过账；本原型固定展示两项已映射科目。
        </p>
      </UCard>

      <UCard class="rounded-sm" :ui="{ body: 'space-y-3' }" data-testid="trade-provisional">
        <template #header>
          <div class="flex items-center justify-between">
            <h3 class="text-sm font-medium text-highlighted">
              采购暂估
            </h3>
            <UBadge
              color="warning"
              variant="subtle"
              size="sm"
              label="货到票未到"
            />
          </div>
        </template>
        <div class="grid grid-cols-2 gap-3">
          <div class="rounded-sm border border-default p-3">
            <p class="text-[11px] text-muted">
              待处理暂估金额
            </p>
            <p class="mt-1 text-lg font-semibold tabular-nums" data-testid="trade-provisional-pending">
              {{ formatMoney(trade.provisionalPendingTotal) }}
            </p>
          </div>
          <div class="rounded-sm border border-default p-3">
            <p class="text-[11px] text-muted">
              已过账库存金额
            </p>
            <p class="mt-1 text-lg font-semibold tabular-nums" data-testid="trade-provisional-posted">
              {{ formatMoney(trade.provisionalPostedTotal) }}
            </p>
          </div>
        </div>
        <ResizableTable
          :data="trade.provisionals"
          :columns="provisionalColumns"
          :ui="{ th: 'py-2', td: 'py-2' }"
          data-testid="trade-provisional-table"
        >
          <template #amount-cell="{ row }">
            {{ formatMoney(row.original.amount) }}
          </template>
          <template #status-cell="{ row }">
            <UBadge
              :color="provisionalBillStatusColors[row.original.status]"
              variant="subtle"
              size="sm"
              :label="provisionalBillStatusLabels[row.original.status]"
              :data-testid="'trade-provisional-status-' + row.original.id"
            />
          </template>
          <template #actions-cell="{ row }">
            <div class="flex justify-end gap-1">
              <UButton
                v-if="row.original.status === 'pending'"
                label="确认暂估"
                size="xs"
                color="primary"
                variant="ghost"
                :disabled="!isApprover"
                :data-testid="'trade-provisional-confirm-' + row.original.id"
                @click="confirmProvisional(row.original)"
              />
              <UButton
                v-else-if="row.original.status === 'confirmed'"
                label="冲回"
                size="xs"
                color="error"
                variant="ghost"
                :disabled="!isApprover"
                :data-testid="'trade-provisional-reverse-' + row.original.id"
                @click="reverseProvisional(row.original)"
              />
              <span v-else class="text-[11px] text-muted">已冲回</span>
            </div>
          </template>
        </ResizableTable>
        <p class="text-[11px] text-dimmed">
          确认前暂估金额只影响待处理口径；确认后才把库存暂估金额更新为已过账金额。
        </p>
      </UCard>
    </div>

    <UCard class="rounded-sm" :ui="{ body: 'p-0 sm:p-0' }" data-testid="trade-docs">
      <div class="flex flex-wrap items-end justify-between gap-3 border-b border-default px-4 py-3">
        <div>
          <h3 class="text-sm font-medium text-highlighted">
            {{ tradeDocumentKindLabels[kind] }}
          </h3>
          <p class="mt-0.5 max-w-2xl text-xs text-muted">
            {{ kindDescription }}
          </p>
        </div>
        <UTabs
          v-model="kind"
          :items="kindItems"
          :content="false"
          size="sm"
          data-testid="trade-tabs"
        />
      </div>

      <ResizableTable
        :data="rows"
        :columns="columns"
        :row-activate="openDetail"
        class="nx-table"
        :ui="{ th: 'py-2.5', td: 'py-3' }"
        data-testid="trade-doc-table"
      >
        <template #amount-cell="{ row }">
          {{ formatMoney(row.original.amount) }}
        </template>
        <template #status-cell="{ row }">
          <UBadge
            :color="tradeDocumentStatusColors[row.original.status]"
            variant="subtle"
            size="sm"
            :label="tradeDocumentStatusLabels[row.original.status]"
            :data-testid="'trade-doc-status-' + row.original.id"
          />
        </template>
        <template #reviewer-cell="{ row }">
          {{ row.original.reviewer ?? '—' }}
        </template>
        <template #actions-cell="{ row }">
          <div class="flex justify-end">
            <UButton
              label="详情"
              size="xs"
              color="neutral"
              variant="ghost"
              :data-testid="'trade-doc-open-' + row.original.id"
              @click="openDetail(row.original)"
            />
          </div>
        </template>
        <template #empty>
          <UEmpty
            variant="naked"
            icon="i-carbon-document"
            :title="'暂无' + tradeDocumentKindLabels[kind]"
            description="切换单据类型或刷新模拟数据后重试。"
          />
        </template>
      </ResizableTable>
    </UCard>

    <UModal v-model:open="detailOpen" :ui="{ content: 'sm:max-w-xl' }" data-testid="trade-doc-detail">
      <template #header>
        <div class="flex w-full items-start justify-between gap-3">
          <div>
            <p class="font-mono text-xs text-muted">
              {{ selected?.id }}
            </p>
            <h2 class="mt-1 text-base font-semibold text-highlighted">
              {{ selected ? tradeDocumentKindLabels[selected.kind] : '' }} · {{ selected?.party }}
            </h2>
          </div>
          <UBadge
            v-if="selected"
            :color="tradeDocumentStatusColors[selected.status]"
            variant="subtle"
            size="sm"
            :label="tradeDocumentStatusLabels[selected.status]"
            data-testid="trade-doc-detail-status"
          />
        </div>
      </template>

      <template #body>
        <div v-if="selected" class="space-y-4">
          <dl class="grid grid-cols-2 gap-x-4 gap-y-2 text-[13px]">
            <div>
              <dt class="text-xs text-muted">
                金额
              </dt>
              <dd class="mt-0.5 tabular-nums text-default" data-testid="trade-doc-detail-amount">
                {{ formatMoney(selected.amount) }}
              </dd>
            </div>
            <div>
              <dt class="text-xs text-muted">
                来源单据
              </dt>
              <dd class="mt-0.5 font-mono text-[11px] text-default">
                {{ selected.sourceRef }}
              </dd>
            </div>
            <div>
              <dt class="text-xs text-muted">
                制单人
              </dt>
              <dd class="mt-0.5 text-default">
                {{ selected.maker }}
              </dd>
            </div>
            <div>
              <dt class="text-xs text-muted">
                复核人
              </dt>
              <dd class="mt-0.5 text-default">
                {{ selected.reviewer ?? '尚未复核' }}
              </dd>
            </div>
            <div>
              <dt class="text-xs text-muted">
                版本
              </dt>
              <dd class="mt-0.5 tabular-nums text-default">
                v{{ selected.version }}
              </dd>
            </div>
            <div>
              <dt class="text-xs text-muted">
                过账时间
              </dt>
              <dd class="mt-0.5 text-default">
                {{ selected.postedAt ?? '未过账' }}
              </dd>
            </div>
          </dl>

          <p class="text-[13px] text-muted">
            {{ selected.note }}
          </p>
          <p v-if="selected.cancelReason" class="rounded-sm bg-error/10 px-3 py-2 text-xs text-error">
            取消原因：{{ selected.cancelReason }}
          </p>

          <UAlert
            v-if="actionError"
            color="error"
            variant="soft"
            icon="i-carbon-warning-alt"
            :description="actionError"
            data-testid="trade-doc-error"
          />

          <div v-if="cancelOpen" class="space-y-2 rounded-sm border border-error/30 p-3" data-testid="trade-cancel-form">
            <p class="text-xs text-default">
              取消后单据保留原单与原因，不能继续复核或过账。
            </p>
            <UInput
              v-model="cancelReason"
              placeholder="填写取消原因"
              class="w-full"
              data-testid="trade-cancel-reason"
            />
            <div class="flex justify-end gap-2">
              <UButton
                label="返回"
                size="xs"
                color="neutral"
                variant="ghost"
                @click="cancelOpen = false"
              />
              <UButton
                label="确认取消"
                size="xs"
                color="error"
                data-testid="trade-cancel-submit"
                @click="confirmCancel"
              />
            </div>
          </div>
        </div>
      </template>

      <template #footer>
        <div class="flex w-full flex-wrap items-center justify-between gap-2">
          <UButton
            label="关闭"
            color="neutral"
            variant="ghost"
            data-testid="trade-doc-close"
            @click="detailOpen = false"
          />
          <div class="flex flex-wrap items-center gap-2">
            <UButton
              v-if="canSubmit"
              label="提交复核"
              size="sm"
              data-testid="trade-doc-submit"
              @click="submit"
            />
            <UButton
              v-if="canReview"
              label="退回"
              size="sm"
              color="error"
              variant="outline"
              data-testid="trade-doc-reject"
              @click="review('reject')"
            />
            <UButton
              v-if="canReview"
              label="独立复核通过"
              size="sm"
              color="primary"
              data-testid="trade-doc-review"
              @click="review('approve')"
            />
            <UButton
              v-if="canPostDoc"
              label="过账"
              size="sm"
              color="primary"
              data-testid="trade-doc-post"
              @click="post"
            />
            <UButton
              v-if="canCancel && !cancelOpen"
              label="取消单据"
              size="sm"
              color="error"
              variant="ghost"
              data-testid="trade-doc-cancel"
              @click="openCancel"
            />
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>
