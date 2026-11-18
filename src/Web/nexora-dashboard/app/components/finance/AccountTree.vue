<script setup lang="ts">
import type { FinanceAccount, FinanceAccountType } from '~/mocks'
import { accountBalanceDirections, accountTypeLabels, accountTypeOrder } from '~/mocks'

function money(value: string | number) {
  return formatMoney(Number(value))
}

const props = defineProps<{
  accounts: FinanceAccount[]
  canEdit: boolean
}>()

const emit = defineEmits<{
  create: [account: FinanceAccount]
  update: [account: FinanceAccount]
}>()

const search = ref('')
const expandedTypes = ref<FinanceAccountType[]>([...accountTypeOrder])

const editorOpen = ref(false)
const editorMode = ref<'create' | 'edit'>('create')
const editingId = ref('')
const errorMessage = ref('')
const { loading: submitting, run: runSubmit } = useMockAsync(async () => undefined, { delay: 500 })

const form = reactive({
  code: '',
  name: '',
  type: 'asset' as FinanceAccountType,
  balance: '0.00'
})

const typeItems = accountTypeOrder.map(type => ({ label: accountTypeLabels[type], value: type }))
const balanceDirection = computed(() => accountBalanceDirections[form.type])

const groups = computed(() => {
  const keyword = search.value.trim().toLowerCase()
  return accountTypeOrder
    .map((type) => {
      const all = props.accounts.filter(account => account.type === type)
      const matched = keyword
        ? all.filter(account => account.code.includes(keyword) || account.name.toLowerCase().includes(keyword))
        : all
      return {
        type,
        label: accountTypeLabels[type],
        direction: accountBalanceDirections[type],
        total: all.reduce((sum, account) => sum + Number(account.balance), 0),
        count: all.length,
        items: matched,
        expanded: keyword.length > 0 || expandedTypes.value.includes(type)
      }
    })
    .filter(group => group.items.length > 0 || keyword.length === 0)
})

const totalAccounts = computed(() => props.accounts.length)

function isExpanded(type: FinanceAccountType) {
  return search.value.trim().length > 0 || expandedTypes.value.includes(type)
}

function toggleGroup(type: FinanceAccountType) {
  expandedTypes.value = isExpanded(type) && !search.value.trim()
    ? expandedTypes.value.filter(item => item !== type)
    : [...new Set([...expandedTypes.value, type])]
}

function openCreate() {
  editorMode.value = 'create'
  editingId.value = ''
  errorMessage.value = ''
  form.code = ''
  form.name = ''
  form.type = 'asset'
  form.balance = '0.00'
  editorOpen.value = true
}

function openEdit(account: FinanceAccount) {
  editorMode.value = 'edit'
  editingId.value = account.id
  errorMessage.value = ''
  form.code = account.code
  form.name = account.name
  form.type = account.type
  form.balance = account.balance
  editorOpen.value = true
}

async function submit() {
  const code = form.code.trim()
  const name = form.name.trim()
  if (!/^\d{4}$/.test(code)) {
    errorMessage.value = '科目编码需为 4 位数字，例如 1001'
    return
  }
  if (name.length === 0) {
    errorMessage.value = '请填写科目名称'
    return
  }
  const duplicate = props.accounts.find(account => account.code === code && account.id !== editingId.value)
  if (duplicate) {
    errorMessage.value = '科目编码 ' + code + ' 已存在：' + duplicate.name
    return
  }
  const balance = Number(form.balance)
  if (!Number.isFinite(balance) || balance < 0) {
    errorMessage.value = '期初余额需为非负数字'
    return
  }

  await runSubmit()
  const account: FinanceAccount = {
    id: editingId.value || 'acc-' + code,
    code,
    name,
    type: form.type,
    balance: balance.toFixed(2)
  }
  if (editorMode.value === 'edit') emit('update', account)
  else emit('create', account)
  editorOpen.value = false
}

function reset() {
  errorMessage.value = ''
}
</script>

<template>
  <UCard class="nx-reveal rounded-sm" :ui="{ body: 'p-0 sm:p-0' }" data-testid="account-tree">
    <template #header>
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 class="text-sm font-semibold text-highlighted">
            科目表
          </h2>
          <p class="mt-0.5 text-xs text-muted">
            共 {{ totalAccounts }} 个科目，按科目类型分组；余额方向随类型自动带出。
          </p>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <UInput
            v-model="search"
            icon="i-carbon-search"
            placeholder="搜索科目编码或名称"
            size="sm"
            class="w-56"
            data-testid="account-search"
          />
          <UTooltip :text="canEdit ? '新增科目（本地演示）' : '当前演示身份没有 finance.post 权限'">
            <UButton
              label="新增科目"
              icon="i-carbon-add"
              size="sm"
              :disabled="!canEdit"
              data-testid="account-add"
              @click="openCreate"
            />
          </UTooltip>
        </div>
      </div>
    </template>

    <div class="grid grid-cols-[5.5rem_minmax(0,1fr)_4.5rem_4.5rem_9rem_4rem] items-center gap-2 border-b border-default px-3 py-2 text-xs font-medium text-muted">
      <span>科目编码</span>
      <span>科目名称</span>
      <span>科目类型</span>
      <span>余额方向</span>
      <span class="text-right">期末余额</span>
      <span class="text-right">操作</span>
    </div>

    <div v-if="groups.length === 0" class="py-6" data-testid="account-empty">
      <UEmpty
        variant="naked"
        icon="i-carbon-list-tree"
        title="没有匹配的科目"
        description="换一个编码或名称关键字再试，或新增一个本地科目。"
        :actions="[{ label: '清空搜索', color: 'neutral', variant: 'outline', size: 'sm', onClick: () => (search = '') }]"
      />
    </div>

    <div v-for="group in groups" :key="group.type" :data-testid="'account-group-' + group.type">
      <button
        type="button"
        class="flex w-full items-center gap-2 border-b border-default bg-elevated/40 px-3 py-2 text-left transition hover:bg-elevated"
        :data-testid="'account-group-toggle-' + group.type"
        @click="toggleGroup(group.type)"
      >
        <UIcon
          :name="group.expanded ? 'i-carbon-chevron-down' : 'i-carbon-chevron-right'"
          class="size-4 shrink-0 text-muted"
        />
        <span class="text-[13px] font-semibold text-highlighted">{{ group.label }}</span>
        <span class="text-xs text-muted">{{ group.count }} 个科目 · 余额方向 {{ group.direction }}</span>
        <span class="ml-auto text-xs tabular-nums text-muted">{{ money(group.total) }}</span>
      </button>

      <template v-if="group.expanded">
        <div
          v-for="account in group.items"
          :key="account.id"
          class="grid grid-cols-[5.5rem_minmax(0,1fr)_4.5rem_4.5rem_9rem_4rem] items-center gap-2 border-b border-default/60 px-3 py-2 last:border-b-0"
          data-testid="account-row"
        >
          <span class="text-xs tabular-nums text-muted">{{ account.code }}</span>
          <span class="truncate text-[13px] text-highlighted">{{ account.name }}</span>
          <UBadge
            :label="accountTypeLabels[account.type]"
            color="neutral"
            variant="subtle"
            size="sm"
          />
          <span class="text-xs text-muted">{{ accountBalanceDirections[account.type] }}方</span>
          <span class="text-right text-[13px] tabular-nums text-highlighted">{{ money(account.balance) }}</span>
          <div class="flex justify-end">
            <UTooltip :text="canEdit ? '编辑科目' : '当前演示身份没有 finance.post 权限'">
              <UButton
                label="编辑"
                color="neutral"
                variant="ghost"
                size="xs"
                :disabled="!canEdit"
                data-testid="account-edit"
                @click="openEdit(account)"
              />
            </UTooltip>
          </div>
        </div>
      </template>
    </div>

    <USlideover
      v-model:open="editorOpen"
      :ui="{ content: 'w-full sm:max-w-lg' }"
      data-testid="account-form"
    >
      <template #header>
        <div>
          <p class="text-xs text-muted">
            科目维护
          </p>
          <h2 class="mt-1 text-base font-semibold text-highlighted">
            {{ editorMode === 'create' ? '新增会计科目' : '编辑会计科目' }}
          </h2>
          <p class="mt-0.5 text-xs text-muted">
            仅修改本地演示数据，保存后刷新页面恢复初始科目表。
          </p>
        </div>
      </template>

      <template #body>
        <div class="space-y-4">
          <UAlert
            v-if="errorMessage"
            color="error"
            variant="soft"
            icon="i-carbon-warning-alt"
            :title="errorMessage"
            data-testid="account-error"
          />

          <div class="grid gap-3 sm:grid-cols-2">
            <UFormField label="科目编码" required>
              <UInput
                v-model="form.code"
                placeholder="如 1001"
                class="w-full"
                data-testid="account-code"
              />
            </UFormField>
            <UFormField label="科目名称" required>
              <UInput
                v-model="form.name"
                placeholder="如 库存现金"
                class="w-full"
                data-testid="account-name"
              />
            </UFormField>
            <UFormField label="科目类型" required>
              <USelect
                v-model="form.type"
                :items="typeItems"
                class="w-full"
                data-testid="account-type"
                @update:model-value="reset"
              />
            </UFormField>
            <UFormField label="期初余额" required>
              <UInput
                v-model="form.balance"
                type="number"
                min="0"
                class="w-full"
                data-testid="account-balance"
              />
            </UFormField>
          </div>

          <div class="flex items-center justify-between gap-2 rounded-sm bg-elevated/60 px-3 py-2">
            <span class="text-xs text-muted">余额方向（按类型自动带出）</span>
            <UBadge
              :label="balanceDirection + '方'"
              color="neutral"
              variant="subtle"
              size="sm"
            />
          </div>

          <p class="text-xs text-muted">
            纯 UI 演示：新增/编辑只写入本地科目列表，不调用后端，也不会影响凭证金额。
          </p>
        </div>
      </template>

      <template #footer>
        <div class="flex w-full items-center justify-between gap-2">
          <UButton
            label="取消"
            color="neutral"
            variant="ghost"
            data-testid="account-cancel"
            @click="editorOpen = false"
          />
          <UButton
            :label="editorMode === 'create' ? '保存科目' : '保存修改'"
            icon="i-carbon-save"
            :loading="submitting"
            data-testid="account-submit"
            @click="submit"
          />
        </div>
      </template>
    </USlideover>
  </UCard>
</template>
