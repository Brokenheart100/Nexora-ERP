<script setup lang="ts">
import { useAdministration, useAdministrationMutation } from '~/composables/settings/useAdministration'
import type { CompanySettings } from '#shared/types/workspace-administration'

defineProps<{ setup?: boolean }>()
const { session, api, owner, workspace } = useAdministration()
const company = useWorkspaceQuery('company-settings', '/settings', api.company)
const mutation = useAdministrationMutation<CompanySettings>(owner)
const draft = ref<CompanySettings | null>(null)
const saved = shallowRef<CompanySettings | null>(null)
const logoError = ref('')
const editing = computed(() => company.data?.canManage && !mutation.busy && !mutation.unknown && !saved.value)
const valid = computed(() => draft.value && draft.value.presentation.legalName.trim() && draft.value.presentation.brandName.trim()
  && /^#[\da-f]{6}$/i.test(draft.value.presentation.accentColor) && draft.value.presentation.timeZone.trim()
  && Number.isInteger(draft.value.sessionIdleMinutes) && draft.value.sessionIdleMinutes >= 1 && draft.value.sessionIdleMinutes <= 480)
function adopt(value: CompanySettings | null) {
  draft.value = value ? { ...value, presentation: { ...value.presentation } } : null
  saved.value = null
}
watch(() => company.data, (value) => {
  if (value && !draft.value) adopt(value)
}, { immediate: true })
watch(owner, () => {
  adopt(null)
  logoError.value = ''
}, { flush: 'sync' })

async function selectLogo(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  logoError.value = ''
  if (file.type !== 'image/png' || file.size > 128 * 1024) {
    logoError.value = '请选择 128 KiB 以内的 PNG。'
    return
  }
  const current = draft.value
  const reader = new FileReader()
  reader.onerror = () => {
    if (current === draft.value) logoError.value = '读取图片失败。'
  }
  reader.onload = () => {
    if (current && current === draft.value && typeof reader.result === 'string') current.presentation.logoDataUrl = reader.result
  }
  reader.readAsDataURL(file)
}

async function save() {
  const current = draft.value
  if (!current || !valid.value || !editing.value) return
  await mutation.run(() => api.saveCompany(workspace(), current.version, {
    presentation: current.presentation,
    sessionIdleMinutes: current.sessionIdleMinutes,
    roleGrantApprovals: current.roleGrantApprovals
  }), adopt)
}

async function readCurrent() {
  const current = owner()
  const value = await api.company(workspace())
  if (current === owner() && value.version !== draft.value?.version) saved.value = value
}
</script>

<template>
  <div class="space-y-4" data-testid="live-company-settings">
    <SettingsAdministrationQueryState :query="company" />
    <UCard v-if="draft && company.data">
      <template #header>
        <div class="flex flex-wrap items-center justify-between gap-2">
          <p class="font-medium">
            公司资料
          </p>
          <span class="text-xs text-muted">{{ draft.baseCurrency }} · 版本 {{ draft.version }}</span>
        </div>
      </template>
      <form class="space-y-4" @submit.prevent="save">
        <fieldset :disabled="!editing" class="grid gap-4 md:grid-cols-2">
          <UFormField label="法定名称" required>
            <UInput
              v-model="draft.presentation.legalName"
              required
              maxlength="160"
              class="w-full"
            />
          </UFormField>
          <UFormField label="品牌名称" required>
            <UInput
              v-model="draft.presentation.brandName"
              required
              maxlength="160"
              class="w-full"
              data-testid="live-brand-name"
            />
          </UFormField>
          <UFormField label="品牌色">
            <UInput v-model="draft.presentation.accentColor" placeholder="#274580" maxlength="7" />
          </UFormField>
          <UFormField label="日期格式">
            <USelect v-model="draft.presentation.dateFormat" :items="['yyyy-MM-dd', 'dd/MM/yyyy', 'yyyy年MM月dd日']" class="w-full" />
          </UFormField>
          <UFormField label="时区" required>
            <UInput
              v-model="draft.presentation.timeZone"
              required
              maxlength="80"
              placeholder="Asia/Shanghai"
              class="w-full"
            />
          </UFormField>
          <UFormField label="会话闲置上限（分钟）" required>
            <UInput
              v-model.number="draft.sessionIdleMinutes"
              type="number"
              :min="1"
              :max="480"
              required
            />
          </UFormField>
          <UFormField label="范围授权所需批准人数">
            <USelect v-model="draft.roleGrantApprovals" :items="[1, 2]" class="w-24" />
          </UFormField>
          <UFormField label="公司标志" description="PNG，最大 512 × 512 与 128 KiB" :error="logoError || undefined">
            <div class="flex flex-wrap items-center gap-2">
              <img
                v-if="draft.presentation.logoDataUrl?.startsWith('data:image/png;base64,')"
                :src="draft.presentation.logoDataUrl"
                class="size-10 object-contain"
                alt="公司标志"
              >
              <UInput type="file" accept="image/png" @change="selectLogo" />
              <UButton
                v-if="draft.presentation.logoDataUrl"
                size="sm"
                color="neutral"
                variant="outline"
                label="移除"
                @click="draft.presentation.logoDataUrl = null"
              />
            </div>
          </UFormField>
        </fieldset>
        <div class="flex flex-wrap gap-2">
          <UButton
            v-if="company.data.canManage"
            type="submit"
            label="保存公司资料"
            :disabled="!valid || !editing"
            :loading="mutation.busy"
            data-testid="live-company-save"
          />
          <UButton
            v-if="!setup"
            :to="{ path: '/setup', query: { workspace: session.activeWorkspaceId } }"
            label="继续初始化"
            color="neutral"
            variant="outline"
          />
        </div>
        <SettingsAdministrationStatus :state="mutation" @refresh="mutation.readCurrent(readCurrent)" @acknowledge="mutation.acknowledge" />
        <UAlert
          v-if="saved"
          title="服务端公司资料已更新"
          :description="'版本 ' + saved.version + ' · ' + saved.presentation.legalName + ' · ' + saved.presentation.brandName"
          color="warning"
          variant="subtle"
        >
          <template #actions>
            <UButton
              label="载入已保存资料"
              color="neutral"
              variant="outline"
              size="sm"
              @click="adopt(saved)"
            />
          </template>
        </UAlert>
      </form>
    </UCard>
    <SettingsLivePersonalLinks v-if="!setup && company.data" :can-manage="company.data.canManage" />
  </div>
</template>
