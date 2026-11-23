<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import { taxGroupInputSchema, type TaxGroup } from '#shared/types/tax'
import { taxPath, useTaxSubmission, type useTaxSetup } from '~/composables/api/useTaxApi'

const props = defineProps<{ setup: ReturnType<typeof useTaxSetup> }>()
const canManage = () => props.setup.data?.canManage === true
const groups = useTaxSubmission('tax-groups', canManage)
const bindings = useTaxSubmission('tax-classifications', canManage)
const toast = useToast()
const groupOpen = ref(false)
const groupVersion = ref(0)
const groupForm = reactive({ code: '', name: '', rateCodes: [] as string[] })
const kind = ref<'item' | 'partner'>('item')
const resourceId = ref('')
const bindingGroup = ref('')
const bindingVersion = ref(0)
const binding = computed(() => props.setup.data?.classifications.find(row => row.kind === kind.value && row.resourceId === resourceId.value))
const rateCodes = computed(() => [...new Set(props.setup.data?.rates.map(row => row.code))].sort())
const groupOptions = computed(() => (props.setup.data?.groups ?? []).map(row => ({ value: row.code, label: row.code + ' · ' + row.name })))
const kindOptions = [{ value: 'item', label: '商品' }, { value: 'partner', label: '往来单位' }]
const columns: TableColumn<TaxGroup>[] = [
  { accessorKey: 'code', header: '税组编码' },
  { accessorKey: 'name', header: '名称' },
  { accessorKey: 'rateCodes', header: '税码' },
  { accessorKey: 'version', header: '版本' },
  { id: 'actions', header: '操作' }
]

watch(() => props.setup.owner, () => {
  groupOpen.value = false
  Object.assign(groupForm, { code: '', name: '', rateCodes: [] })
  resourceId.value = ''
  bindingGroup.value = ''
  bindingVersion.value = 0
}, { flush: 'sync' })

function openGroup(group?: TaxGroup) {
  groups.reset()
  groupVersion.value = Number(group?.version ?? 0)
  Object.assign(groupForm, { code: group?.code ?? '', name: group?.name ?? '', rateCodes: [...group?.rateCodes ?? []] })
  groupOpen.value = true
}

function readBinding() {
  bindings.reset()
  bindingGroup.value = binding.value?.groupCode ?? ''
  bindingVersion.value = Number(binding.value?.version ?? 0)
}

watch([kind, resourceId], readBinding)

async function completeGroup() {
  groupOpen.value = false
  toast.add({ title: '税组已保存', color: 'success' })
  await props.setup.refresh()
}

async function saveGroup() {
  const input = taxGroupInputSchema.safeParse(groupForm)
  if (input.success && await groups.send('tax.group.saved', taxPath(props.setup.session.activeWorkspaceId) + '/groups', {
    ...input.data, expectedVersion: groupVersion.value
  })) await completeGroup()
}

async function completeBinding() {
  toast.add({ title: '税组绑定已保存', color: 'success' })
  const owner = props.setup.owner
  await props.setup.refresh()
  if (owner === props.setup.owner) readBinding()
}

async function saveBinding() {
  if (!resourceId.value || !bindingGroup.value) return
  if (await bindings.send('tax.classification.saved', taxPath(props.setup.session.activeWorkspaceId) + '/classifications', {
    kind: kind.value, resourceId: resourceId.value, groupCode: bindingGroup.value, expectedVersion: bindingVersion.value
  })) await completeBinding()
}

async function retryGroup() {
  if (await groups.retry()) await completeGroup()
}

async function retryBinding() {
  if (await bindings.retry()) await completeBinding()
}

async function refreshBinding() {
  const owner = props.setup.owner
  await props.setup.refresh()
  if (owner === props.setup.owner) readBinding()
}

async function refreshGroups() {
  groupOpen.value = false
  await props.setup.refresh()
}
</script>

<template>
  <UCard class="rounded-sm">
    <template #header>
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h2 class="text-base font-semibold">
          税组
        </h2>
        <UButton
          v-if="setup.data?.canManage"
          label="新建税组"
          icon="i-carbon-add"
          size="sm"
          :disabled="!rateCodes.length || !!groups.record"
          data-testid="tax-group-create"
          @click="openGroup()"
        />
      </div>
    </template>
    <SalesOperationStatus
      class="mb-3"
      :submission="groups"
      @check="groups.checkCurrent"
      @retry="retryGroup"
    />
    <ResizableTable
      :columns="columns"
      :data="setup.data?.groups ?? []"
      class="nx-table"
      data-testid="tax-group-table"
    >
      <template #rateCodes-cell="{ row }">
        {{ row.original.rateCodes.join(' · ') }}
      </template>
      <template #actions-cell="{ row }">
        <UButton
          v-if="setup.data?.canManage"
          label="编辑"
          size="xs"
          variant="ghost"
          :disabled="!!groups.record"
          :data-testid="'tax-group-edit-' + row.original.code"
          @click="openGroup(row.original)"
        />
      </template>
      <template #empty>
        当前工作区还没有税组。
      </template>
    </ResizableTable>
  </UCard>

  <UCard class="rounded-sm" data-testid="tax-bindings">
    <template #header>
      <h2 class="text-base font-semibold">
        商品与伙伴税组绑定
      </h2>
    </template>
    <div class="grid gap-3 sm:grid-cols-3">
      <UFormField label="档案类型">
        <USelect
          v-model="kind"
          :items="kindOptions"
          :disabled="!!bindings.record"
          class="w-full"
          data-testid="tax-binding-kind"
        />
      </UFormField>
      <FinanceTaxReferenceSelect
        v-model="resourceId"
        :kind="kind"
        :label="kind === 'item' ? '商品' : '往来单位'"
        input-id="tax-binding-resource"
        :disabled="!!bindings.record"
      />
      <UFormField label="税组">
        <USelect
          v-model="bindingGroup"
          :items="groupOptions"
          :disabled="!resourceId || !setup.data?.canManage || !!bindings.record"
          class="w-full"
          data-testid="tax-binding-group"
        />
      </UFormField>
    </div>
    <div v-if="resourceId" class="mt-3 flex flex-wrap items-center gap-3">
      <p class="text-sm text-muted" data-testid="tax-binding-current">
        {{ binding ? '当前税组 ' + binding.groupCode + ' · v' + binding.version : '当前档案尚未绑定税组。' }}
      </p>
      <UButton
        v-if="setup.data?.canManage"
        label="保存绑定"
        :disabled="!bindingGroup || !!bindings.record"
        :loading="bindings.mutation.busy"
        data-testid="tax-binding-save"
        @click="saveBinding"
      />
      <UButton
        v-if="bindings.failure?.status === 409 || bindings.failure?.status === 412"
        label="读取最新绑定"
        variant="outline"
        @click="refreshBinding"
      />
    </div>
    <SalesOperationStatus
      class="mt-3"
      :submission="bindings"
      @check="bindings.checkCurrent"
      @retry="retryBinding"
    />
  </UCard>

  <USlideover v-model:open="groupOpen" :title="groupVersion ? '编辑税组' : '新建税组'">
    <template #body>
      <UForm
        :schema="taxGroupInputSchema"
        :state="groupForm"
        class="space-y-3"
        @submit="saveGroup"
      >
        <UAlert v-if="groups.message" color="warning" :title="groups.message" />
        <UFormField name="code" label="税组编码" required>
          <UInput
            v-model="groupForm.code"
            :disabled="groupVersion > 0"
            maxlength="40"
            class="w-full"
            data-testid="tax-group-code"
          />
        </UFormField>
        <UFormField name="name" label="名称" required>
          <UInput
            v-model="groupForm.name"
            maxlength="160"
            class="w-full"
            data-testid="tax-group-name"
          />
        </UFormField>
        <UFormField name="rateCodes" label="税码" required>
          <USelectMenu
            v-model="groupForm.rateCodes"
            :items="rateCodes"
            multiple
            class="w-full"
            data-testid="tax-group-rates"
          />
        </UFormField>
        <UButton
          label="保存税组"
          type="submit"
          :loading="groups.mutation.busy"
          :disabled="!!groups.record"
          data-testid="tax-group-save"
        />
        <UButton
          v-if="groups.failure?.status === 409 || groups.failure?.status === 412"
          label="关闭并刷新税组"
          variant="outline"
          @click="refreshGroups"
        />
        <SalesOperationStatus
          v-if="groups.record"
          :submission="groups"
          @check="groups.checkCurrent"
          @retry="retryGroup"
        />
      </UForm>
    </template>
  </USlideover>
</template>
