<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import { taxRateInputSchema, type TaxRate } from '#shared/types/tax'
import { multiplyDecimals } from '#shared/utils/decimal'
import { taxPath, useTaxSubmission, type useTaxSetup } from '~/composables/api/useTaxApi'

const props = defineProps<{ setup: ReturnType<typeof useTaxSetup> }>()
const submission = useTaxSubmission('tax-rates', () => props.setup.data?.canManage === true)
const toast = useToast()
const open = ref(false)
const blank = () => ({ code: '', name: '', effectiveOn: new Date().toLocaleDateString('en-CA'), rate: '' })
const form = reactive(blank())
const rates = computed(() => [...(props.setup.data?.rates ?? [])].sort((a, b) =>
  a.code.localeCompare(b.code) || b.effectiveOn.localeCompare(a.effectiveOn)))
const columns: TableColumn<TaxRate>[] = [
  { accessorKey: 'code', header: '税码' },
  { accessorKey: 'name', header: '名称' },
  { accessorKey: 'effectiveOn', header: '生效日期' },
  { accessorKey: 'rate', header: '税率' }
]

watch(() => props.setup.owner, () => {
  open.value = false
  Object.assign(form, blank())
}, { flush: 'sync' })

function start() {
  submission.reset()
  Object.assign(form, blank())
  open.value = true
}

async function complete() {
  open.value = false
  toast.add({ title: '税率版本已保存', color: 'success' })
  await props.setup.refresh()
}

async function save() {
  const input = taxRateInputSchema.safeParse(form)
  if (input.success && await submission.send('tax.rate.created', taxPath(props.setup.session.activeWorkspaceId) + '/rates', input.data))
    await complete()
}

async function retry() {
  if (await submission.retry()) await complete()
}
</script>

<template>
  <UCard class="rounded-sm" data-testid="tax-rates">
    <template #header>
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h2 class="text-base font-semibold">
          税率版本
        </h2>
        <UButton
          v-if="setup.data?.canManage"
          label="新建税率版本"
          icon="i-carbon-add"
          size="sm"
          :disabled="!!submission.record"
          data-testid="tax-rate-create"
          @click="start"
        />
      </div>
    </template>

    <SalesOperationStatus
      class="mb-3"
      :submission="submission"
      @check="submission.checkCurrent"
      @retry="retry"
    />
    <ResizableTable
      :columns="columns"
      :data="rates"
      class="nx-table"
      data-testid="tax-rate-table"
    >
      <template #rate-cell="{ row }">
        <span class="tabular-nums">{{ multiplyDecimals(row.original.rate, '100') }}%</span>
      </template>
      <template #empty>
        当前工作区还没有税率版本。
      </template>
    </ResizableTable>

    <USlideover v-model:open="open" title="新建税率版本">
      <template #body>
        <UForm
          :schema="taxRateInputSchema"
          :state="form"
          class="space-y-3"
          @submit="save"
        >
          <UAlert v-if="submission.message" color="warning" :title="submission.message" />
          <UFormField name="code" label="税码" required>
            <UInput
              v-model="form.code"
              maxlength="40"
              class="w-full"
              data-testid="tax-rate-code"
            />
          </UFormField>
          <UFormField name="name" label="名称" required>
            <UInput
              v-model="form.name"
              maxlength="160"
              class="w-full"
              data-testid="tax-rate-name"
            />
          </UFormField>
          <UFormField name="effectiveOn" label="生效日期" required>
            <UInput
              v-model="form.effectiveOn"
              type="date"
              class="w-full"
              data-testid="tax-rate-on"
            />
          </UFormField>
          <UFormField
            name="rate"
            label="税率"
            help="13% 输入 0.13"
            required
          >
            <UInput
              v-model="form.rate"
              inputmode="decimal"
              class="w-full"
              data-testid="tax-rate-value"
            />
          </UFormField>
          <UButton
            label="保存税率版本"
            type="submit"
            :loading="submission.mutation.busy"
            :disabled="!!submission.record"
            data-testid="tax-rate-save"
          />
          <SalesOperationStatus
            v-if="submission.record"
            :submission="submission"
            @check="submission.checkCurrent"
            @retry="retry"
          />
        </UForm>
      </template>
    </USlideover>
  </UCard>
</template>
