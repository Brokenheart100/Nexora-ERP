<script setup lang="ts">
import { financePath, useLedgerApi } from '~/composables/api/useLedgerApi'
import { useScopedSubmission } from '~/composables/api/useScopedSubmission'
import type { AccountingBookConnection } from '~/composables/finance/useAccountingBook'
import { bookSchema } from '#shared/types/prerequisites'
import { z } from 'zod'

const props = defineProps<{ live: AccountingBookConnection }>()
const api = useLedgerApi()
const form = reactive({ baseCurrency: 'CNY', startsOn: new Date().toLocaleDateString('en-CA'), fiscalYearStartMonth: 1 })
const submission = useScopedSubmission('initialize-book', () => props.live.query.enabled, bookSchema.parse)
const error = ref('')
const book = computed(() => props.live.query.data?.book)
const readBook = () => props.live.query.refresh()
async function check() {
  if (!submission.mutation.unknown) submission.resume()
  await submission.check(async (saved) => {
    await api.book(saved.workspaceId)
    return null
  })
}
async function retry() {
  if (await submission.retry()) await readBook()
}
async function initialize() {
  if (!book.value?.canInitialize || book.value.settings) return
  error.value = ''
  const month = Number(form.fiscalYearStartMonth)
  if (!z.iso.date().safeParse(form.startsOn).success || !Number.isInteger(month) || month < 1 || month > 12) {
    error.value = '请输入启用日期和 1 到 12 的财年起始月。'
    return
  }
  if (await submission.send('book.initialize', financePath(props.live.workspace()) + '/book', { ...form, fiscalYearStartMonth: month })) await readBook()
}
watch(() => props.live.query.owner, () => {
  error.value = ''
})
</script>

<template>
  <UCard class="rounded-sm" data-testid="finance-workbench">
    <template #header>
      <h2 class="text-sm font-semibold">
        账簿设置
      </h2>
    </template>
    <SalesOperationStatus
      :message="error || live.query.problem"
      :submission="submission"
      @check="check"
      @retry="retry"
    />
    <USkeleton v-if="live.query.loading" class="h-16 w-full" />
    <div v-else-if="book?.settings" class="space-y-3" data-testid="finance-book-status">
      <p class="text-sm">
        {{ book.settings.baseCurrency }} · 启用日 {{ book.settings.startsOn }} · 财年从 {{ book.settings.fiscalYearStartMonth }} 月开始
      </p>
      <div class="flex flex-wrap gap-2">
        <UButton
          label="维护科目表"
          size="xs"
          variant="outline"
          :to="{ path: '/finance', query: { workspace: live.workspace(), tab: 'accounts' } }"
        />
        <UButton
          label="期初导入"
          size="xs"
          variant="outline"
          :to="{ path: '/finance', query: { workspace: live.workspace(), tab: 'opening' } }"
        />
        <UButton
          label="关账与年结"
          size="xs"
          variant="outline"
          :to="{ path: '/finance', query: { workspace: live.workspace(), tab: 'closing' } }"
        />
      </div>
    </div>
    <div v-else-if="book?.canInitialize" class="space-y-3">
      <div class="grid gap-3 sm:grid-cols-3">
        <UFormField label="账簿币种" required>
          <USelect v-model="form.baseCurrency" :items="['CNY', 'USD', 'EUR', 'JPY']" class="w-full" />
        </UFormField>
        <UFormField label="启用日期" required>
          <UInput
            v-model="form.startsOn"
            type="date"
            class="w-full"
            data-testid="finance-book-start"
          />
        </UFormField>
        <UFormField label="财年起始月" required>
          <UInput
            v-model="form.fiscalYearStartMonth"
            type="number"
            min="1"
            max="12"
            class="w-full"
          />
        </UFormField>
      </div>
      <UButton
        label="初始化账簿"
        :disabled="!!submission.record || submission.mutation.busy"
        data-testid="finance-book-initialize"
        @click="initialize"
      />
    </div>
    <p v-else-if="book" class="text-sm text-muted">
      账簿待初始化。具备建账权限的成员可在这里启用。
    </p>
  </UCard>
</template>
