<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'

const roleLabels = { customer: '客户', supplier: '供应商', donor: '捐赠人' }
type Role = keyof typeof roleLabels
interface Contact { id: string | null; name: string; email: string | null; phone: string | null }
interface Partner {
  id: string
  code: string
  name: string
  roles: Role[]
  isActive: boolean
  version: number
}
interface PartnerDetail extends Partner { taxNumber: string | null; address: string | null; contacts: Contact[] }
interface PartnerList { items: Partner[]; hasMore: boolean; canManage: boolean }
interface PartnerDraft {
  id?: string
  expectedVersion?: number
  code: string
  name: string
  taxNumber: string
  address: string
  roles: Role[]
  isActive: boolean
  contacts: (Contact & { key: string })[]
}

const props = defineProps<{ workspaceId: string }>()
const path = computed(() => `/bff/api/masterdata/workspaces/${props.workspaceId}/partners`)
const submit = useWorkspaceMutation()
function setText<T extends object>(target: T | undefined, key: keyof T, value: string | number) {
  if (!target) return
  ;(target as Record<string, unknown>)[key as string] = String(value).trim()
}
const page = ref(1)
const open = ref(false)
const busy = ref(false)
const notice = ref('')
const list = shallowRef<PartnerList>()
const selected = shallowRef<PartnerDetail>()
const draft = ref<PartnerDraft>()
const columns: TableColumn<Partner>[] = [
  { accessorKey: 'code', header: '编码' },
  { accessorKey: 'name', header: '名称' },
  { id: 'roles', header: '身份', accessorFn: partner => partner.roles.map(role => roleLabels[role]).join(' / ') },
  { id: 'state', header: '状态', accessorFn: partner => partner.isActive ? '启用' : '已停用' },
  { id: 'detail', header: '档案' },
]

async function refresh(target = page.value) {
  list.value = await $fetch<PartnerList>(path.value, { query: { page: target }, retry: 0 })
  page.value = target
}

async function show(target = page.value) {
  open.value = true
  busy.value = true
  notice.value = ''
  selected.value = undefined
  try { await refresh(target) }
  catch { list.value = undefined; draft.value = undefined; notice.value = '暂时无法读取往来单位。' }
  finally { busy.value = false }
}

async function view(id: string) {
  busy.value = true
  notice.value = ''
  draft.value = undefined
  try { selected.value = await $fetch<PartnerDetail>(`${path.value}/${id}`, { retry: 0 }) }
  catch { selected.value = undefined; notice.value = '暂时无法读取该档案。' }
  finally { busy.value = false }
}

function create() {
  selected.value = undefined
  draft.value = { code: '', name: '', taxNumber: '', address: '', roles: [], isActive: true, contacts: [] }
}

function edit(partner: PartnerDetail) {
  draft.value = {
    id: partner.id, expectedVersion: partner.version, code: partner.code, name: partner.name,
    taxNumber: partner.taxNumber ?? '', address: partner.address ?? '', roles: [...partner.roles],
    isActive: partner.isActive, contacts: partner.contacts.map(contact => ({ ...contact, key: crypto.randomUUID() })),
  }
}

function toggleRole(role: string, checked: boolean | 'indeterminate') {
  const value = draft.value
  if (!value) return
  const roles = new Set(value.roles)
  if (checked === true) roles.add(role as Role)
  else roles.delete(role as Role)
  value.roles = [...roles]
}

function addContact() {
  draft.value?.contacts.push({ key: crypto.randomUUID(), id: null, name: '', email: '', phone: '' })
}

async function save() {
  const value = draft.value
  if (!value || busy.value) return
  if (value.roles.length === 0) {
    notice.value = '请至少选择一种往来身份。'
    return
  }
  busy.value = true
  notice.value = ''
  const profile = {
    name: value.name, roles: value.roles, taxNumber: value.taxNumber, address: value.address,
    contacts: value.contacts.map(({ id, name, email, phone }) => ({ id, name, email, phone })),
  }
  try {
    const saved = value.id
      ? await submit<{ id: string }>('edit', `${path.value}/${value.id}`, 'PUT',
          { profile, expectedVersion: value.expectedVersion, isActive: value.isActive })
      : await submit<{ id: string }>('create', path.value, 'POST', { profile, code: value.code })
    draft.value = undefined
    notice.value = '往来单位已保存。'
    try {
      await refresh()
      selected.value = await $fetch<PartnerDetail>(`${path.value}/${saved.id}`, { retry: 0 })
    } catch {
      selected.value = undefined
      list.value = undefined
      notice.value = '往来单位已保存，刷新失败。'
    }
  } catch (error) {
    const status = (error as { statusCode?: number }).statusCode
    if (status === 400) notice.value = '请核对编码、档案资料和联系人。'
    else if (status === 409) notice.value = '编码重复或版本冲突，请刷新后核对。'
    else if (status === 403 || status === 404) {
      selected.value = undefined
      list.value = undefined
      draft.value = undefined
      notice.value = '当前账号没有此工作区的档案管理权限。'
    } else notice.value = '保存结果尚未确认。保持内容不变手动重试会复用操作编号。'
  } finally { busy.value = false }
}

onMounted(() => { void show().catch(() => { /* 首屏加载失败时保留空状态，可用模块内按钮重试 */ }) })
</script>

<template>
  <section class="partners rounded-nx border border-nx-border bg-nx-surface p-6 shadow-nx-sm" aria-labelledby="partners-heading">
    <h2 id="partners-heading"><UIcon class="mr-2 inline-block size-[1.08em] align-[-0.16em] text-nx-primary" name="i-lucide-contact" aria-hidden="true" />往来单位</h2>
    <div class="partner-actions">
      <UButton variant="outline" color="neutral" size="sm" :disabled="busy" @click="show()">{{ open ? '刷新往来单位' : '打开往来单位' }}</UButton>
      <UButton v-if="list?.canManage" color="primary" :disabled="busy" @click="create">新增往来单位</UButton>
    </div>
    <UAlert v-if="notice" role="status" :description="notice" />

    <template v-if="list">
      <p v-if="!list.items.length">当前页暂无往来单位。</p>
      <UTable
        v-else
        data-testid="partner-list"
        :loading="busy"
        :data="list.items"
        :columns="columns"
        :get-row-id="partner => partner.id"
        :ui="{ td: 'align-top whitespace-normal', th: 'whitespace-nowrap' }"
      >
        <template #detail-cell="{ row }">
          <UButton variant="outline" color="neutral" size="xs" :disabled="busy" @click="view(row.original.id)">查看 {{ row.original.code }}</UButton>
        </template>
      </UTable>
      <div v-if="page > 1 || list.hasMore" class="partner-actions">
        <UButton variant="outline" color="neutral" size="sm" :disabled="busy || page === 1" @click="show(page - 1)">上一页</UButton>
        <span>第 {{ page }} 页</span>
        <UButton variant="outline" color="neutral" size="sm" :disabled="busy || !list.hasMore" @click="show(page + 1)">下一页</UButton>
      </div>

      <section v-if="selected && !draft" class="partner-detail">
        <h3>{{ selected.name }}</h3>
        <dl>
          <dt>税号</dt><dd>{{ selected.taxNumber || '—' }}</dd>
          <dt>地址</dt><dd>{{ selected.address || '—' }}</dd>
        </dl>
        <h4>联系人</h4>
        <p v-if="!selected.contacts.length">暂无联系人。</p>
        <ul v-else>
          <li v-for="contact in selected.contacts" :key="contact.id!">
            {{ [contact.name, contact.email, contact.phone].filter(Boolean).join(' · ') }}
          </li>
        </ul>
        <UButton v-if="list.canManage" variant="outline" color="neutral" size="sm" :disabled="busy" @click="edit(selected)">编辑往来单位</UButton>
      </section>

      <form v-if="list.canManage && draft" @submit.prevent="save">
        <fieldset :disabled="busy">
          <legend>{{ draft.id ? '编辑往来档案' : '新建往来档案' }}</legend>
          <UFormField label="往来编码" name="partnerCode" required>
            <UInput :model-value="draft.code" :readonly="!!draft.id" required maxlength="40" @update:model-value="value => setText(draft, 'code', value)" />
          </UFormField>
          <UFormField label="往来名称" name="partnerName" required>
            <UInput :model-value="draft.name" required maxlength="160" @update:model-value="value => setText(draft, 'name', value)" />
          </UFormField>
          <UFormField label="往来税号" name="partnerTaxNumber">
            <UInput :model-value="draft.taxNumber" maxlength="64" @update:model-value="value => setText(draft, 'taxNumber', value)" />
          </UFormField>
          <UFormField label="往来地址" name="partnerAddress">
            <UInput :model-value="draft.address" maxlength="300" @update:model-value="value => setText(draft, 'address', value)" />
          </UFormField>
          <fieldset class="partner-actions">
            <legend>往来身份</legend>
            <UCheckbox v-for="(label, role) in roleLabels" :key="role" :model-value="draft.roles.includes(role as Role)" :value="role" :label="label"
              @update:model-value="checked => toggleRole(role, checked)" />
          </fieldset>
          <UCheckbox v-if="draft.id" v-model="draft.isActive" label="档案启用" />
          <fieldset v-for="(contact, index) in draft.contacts" :key="contact.key">
            <legend>联系人 {{ index + 1 }}</legend>
            <UFormField label="联系人姓名" name="contactName" required>
              <UInput :model-value="contact.name" required maxlength="160" @update:model-value="value => setText(contact, 'name', value)" />
            </UFormField>
            <UFormField label="联系人邮箱" name="contactEmail">
              <UInput :model-value="contact.email ?? ''" type="email" maxlength="254" @update:model-value="value => setText(contact, 'email', value)" />
            </UFormField>
            <UFormField label="联系人电话" name="contactPhone">
              <UInput :model-value="contact.phone ?? ''" type="tel" maxlength="40" @update:model-value="value => setText(contact, 'phone', value)" />
            </UFormField>
            <UButton type="button" variant="outline" color="neutral" size="sm" @click="draft.contacts.splice(index, 1)">移除联系人 {{ index + 1 }}</UButton>
          </fieldset>
          <div class="partner-actions">
            <UButton type="button" variant="outline" color="neutral" size="sm" :disabled="draft.contacts.length >= 20" @click="addContact">添加联系人</UButton>
            <UButton type="submit" color="primary">保存往来单位</UButton>
            <UButton type="button" variant="outline" color="neutral" size="sm" @click="draft = undefined">取消</UButton>
          </div>
        </fieldset>
      </form>
    </template>
  </section>
</template>

<style scoped>
.partners { margin-top: 20px; min-width: 0 }
.partner-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; min-width: 0 }
fieldset { min-width: 0; border: 1px solid #e0e5ee; border-radius: 8px; padding: 12px; display: grid; gap: 10px }
legend { font-weight: 600 }

form, .partner-detail { margin-top: 16px; overflow-wrap: anywhere; min-width: 0 }

dl { margin: 12px 0; font-size: 13px }
dt { color: var(--nx-ink-3) }
dd { margin: 0; color: var(--nx-ink-2); overflow-wrap: anywhere }
li { overflow-wrap: anywhere }
</style>
