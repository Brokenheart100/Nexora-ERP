<script setup lang="ts">
import { z } from 'zod'
import { taxAssessmentInputSchema, taxSnapshotSchema } from '#shared/types/tax'
import { taxPath, useTaxSubmission, type useTaxSetup } from '~/composables/api/useTaxApi'

const props = defineProps<{ setup: ReturnType<typeof useTaxSetup> }>()
const submission = useTaxSubmission('tax-assessments', () => props.setup.data?.canManage === true, taxSnapshotSchema.parse)
const blank = () => ({ on: new Date().toLocaleDateString('en-CA'), groupCode: null as string | null, itemId: null as string | null,
  partnerId: null as string | null, unitPrice: '', quantity: '1', discount: '0', includesTax: false })
const form = reactive(blank())
const lookup = ref('')
const lookupId = computed(() => z.uuid().safeParse(lookup.value.trim()).data)
const item = computed({
  get: () => form.itemId ?? '',
  set: (value) => { form.itemId = value || null }
})
const partner = computed({
  get: () => form.partnerId ?? '',
  set: (value) => { form.partnerId = value || null }
})
const group = computed({
  get: () => form.groupCode ?? 'automatic',
  set: (value) => { form.groupCode = value === 'automatic' ? null : value }
})
const groupOptions = computed(() => [
  { value: 'automatic', label: '按伙伴、商品绑定解析' },
  ...(props.setup.data?.groups ?? []).map(row => ({ value: row.code, label: row.code + ' · ' + row.name }))
])

watch(() => props.setup.owner, () => {
  Object.assign(form, blank())
  lookup.value = ''
}, { flush: 'sync' })

async function assess() {
  const input = taxAssessmentInputSchema.safeParse(form)
  if (input.success) await submission.send('tax.assessed', taxPath(props.setup.session.activeWorkspaceId) + '/assessments', input.data)
}
</script>

<template>
  <UCard class="rounded-sm" data-testid="tax-assessment">
    <template #header>
      <h2 class="text-base font-semibold">
        税额评估
      </h2>
    </template>
    <div class="space-y-4">
      <UForm
        v-if="setup.data?.canManage"
        :schema="taxAssessmentInputSchema"
        :state="form"
        class="space-y-3"
        @submit="assess"
      >
        <fieldset :disabled="!!submission.record" class="space-y-3">
          <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <UFormField name="on" label="计税日期" required>
              <UInput
                v-model="form.on"
                type="date"
                class="w-full"
                data-testid="tax-assess-on"
              />
            </UFormField>
            <UFormField name="groupCode" label="税组">
              <USelect
                v-model="group"
                :items="groupOptions"
                class="w-full"
                data-testid="tax-assess-group"
              />
            </UFormField>
            <FinanceTaxReferenceSelect
              v-model="item"
              kind="item"
              label="商品"
              input-id="tax-assess-item"
              :disabled="!!submission.record"
            />
            <FinanceTaxReferenceSelect
              v-model="partner"
              kind="partner"
              label="往来单位"
              input-id="tax-assess-partner"
              :disabled="!!submission.record"
            />
          </div>
          <div class="grid gap-3 sm:grid-cols-3">
            <UFormField name="unitPrice" label="单价" required>
              <UInput
                v-model="form.unitPrice"
                inputmode="decimal"
                class="w-full"
                data-testid="tax-assess-price"
              />
            </UFormField>
            <UFormField name="quantity" label="数量" required>
              <UInput
                v-model="form.quantity"
                inputmode="decimal"
                class="w-full"
                data-testid="tax-assess-quantity"
              />
            </UFormField>
            <UFormField name="discount" label="折扣率" help="10% 输入 0.10">
              <UInput
                v-model="form.discount"
                inputmode="decimal"
                class="w-full"
                data-testid="tax-assess-discount"
              />
            </UFormField>
          </div>
          <div class="flex flex-wrap items-center gap-3">
            <UCheckbox v-model="form.includesTax" label="单价含税" data-testid="tax-assess-inclusive" />
            <UButton
              label="计算并保存快照"
              type="submit"
              :loading="submission.mutation.busy"
              data-testid="tax-assess-save"
            />
          </div>
        </fieldset>
      </UForm>
      <SalesOperationStatus :submission="submission" @check="submission.checkCurrent" @retry="submission.retry()" />
      <div v-if="submission.result" class="space-y-2 rounded-sm border border-default p-3" data-testid="tax-assessment-result">
        <FinanceTaxSnapshotSummary :snapshot="submission.result" />
        <FinanceTaxSnapshotDetail :id="submission.result.id" :key="submission.result.id" />
      </div>
      <div class="flex flex-wrap items-end gap-2">
        <UFormField label="快照 ID" :error="lookup && !lookupId ? '请输入有效的快照 ID。' : undefined">
          <UInput v-model="lookup" class="w-80 max-w-full" data-testid="tax-assessment-id" />
        </UFormField>
        <FinanceTaxSnapshotDetail v-if="lookupId" :id="lookupId" :key="lookupId" />
      </div>
    </div>
  </UCard>
</template>
