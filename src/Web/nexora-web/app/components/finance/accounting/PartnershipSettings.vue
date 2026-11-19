<script setup lang="ts">
interface Partner { code: string; name: string; capitalAccountId: string; drawingsAccountId: string; share: string }
interface Config { year: number; version: number; partners: Partner[] }
const props = defineProps<{ base: string; startsOn: string; accounts: { id: string; code: string; name: string }[] }>()
const year = ref(Number(props.startsOn.slice(0, 4)))
const config = shallowRef<Config>()
const draft = ref<Partner[]>([])
const status = ref('')
const busy = ref(false)
const submit = useWorkspaceMutation()
const path = computed(() => props.base + '/partnerships/' + year.value)
const accounts = computed(() => props.accounts.map(account => ({ label: account.code + ' · ' + account.name, value: account.id })))
const blank = (): Partner => ({ code: '', name: '', capitalAccountId: '', drawingsAccountId: '', share: '' })
watch(year, () => { config.value = undefined })
async function run(save: boolean) {
  if (busy.value) return
  busy.value = true
  status.value = ''
  try {
    const value = save && config.value
      ? await submit<Config>('partnership-policy', path.value, 'PUT', { expectedVersion: config.value.version, partners: draft.value })
      : await $fetch<Config>(path.value, { retry: 0 })
    config.value = value
    draft.value = value.partners.length ? value.partners.map(row => ({ ...row })) : [blank(), blank()]
    if (save) status.value = '合伙人设置已保存。'
  } catch (error) {
    status.value = (error as { data?: { detail?: string } }).data?.detail ?? '无法读取或保存合伙人设置。'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <details class="my-4">
    <summary>财年合伙人设置</summary>
    <form class="my-3 flex flex-wrap items-end gap-3" @submit.prevent="run(false)">
      <UFormField label="合伙财年起始年份"><UInput v-model.number="year" type="number" min="1899" max="9997" required :disabled="busy" /></UFormField>
      <UButton variant="outline" type="submit" :disabled="busy">读取合伙人设置</UButton>
    </form>
    <form v-if="config" @submit.prevent="run(true)">
      <fieldset v-for="(row, i) in draft" :key="i" class="my-3 flex flex-wrap items-end gap-3" :disabled="busy">
        <legend>合伙人 {{ i + 1 }}</legend>
        <UFormField label="编码"><UInput v-model="row.code" required maxlength="24" /></UFormField>
        <UFormField label="姓名"><UInput v-model="row.name" required maxlength="100" /></UFormField>
        <UFormField label="资本科目"><USelect v-model="row.capitalAccountId" :items="accounts" /></UFormField>
        <UFormField label="提款科目"><USelect v-model="row.drawingsAccountId" :items="accounts" /></UFormField>
        <UFormField label="分润比例" description="例如 0.6 表示 60%"><UInput v-model="row.share" inputmode="decimal" required /></UFormField>
        <UButton v-if="draft.length > 2" variant="outline" type="button" @click="draft.splice(i, 1)">移除</UButton>
      </fieldset>
      <div class="flex gap-2">
        <UButton variant="outline" type="button" :disabled="busy || draft.length >= 40" @click="draft.push(blank())">添加合伙人</UButton>
        <UButton type="submit" :disabled="busy">保存合伙人设置</UButton>
      </div>
    </form>
    <p v-if="status" role="status">{{ status }}</p>
  </details>
</template>
