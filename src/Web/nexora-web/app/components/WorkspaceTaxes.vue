<script setup lang="ts">
interface TaxRate { id: string; code: string; name: string; effectiveOn: string; rate: string }
interface TaxGroup { code: string; name: string; version: number; rateCodes: string[] }
interface Classification { id: string; kind: string; resourceId: string; groupCode: string; version: number }
interface TaxSetup { canManage: boolean; rates: TaxRate[]; groups: TaxGroup[]; classifications: Classification[] }
interface Snapshot {
  id: string; on: string; currency: string; minorUnits: number; group: TaxGroup
  amounts: { net: string; tax: string; total: string; components: { rateId: string; code: string; rate: string; amount: string }[] }
}

const props = defineProps<{ workspaceId: string }>()
const path = computed(() => `/bff/api/finance/workspaces/${props.workspaceId}/tax`)
const setup = shallowRef<TaxSetup>()
const snapshot = shallowRef<Snapshot>()
const snapshotId = ref('')
const busy = ref(false)
const notice = ref('')
const submit = useWorkspaceMutation()
const rate = reactive({ code: '', name: '', effectiveOn: '', rate: '0' })
const group = reactive({ code: '', name: '', rateCodes: [] as string[] })
const classification = reactive({ kind: 'item', resourceId: '', groupCode: '' })
const calculation = reactive({ on: '', groupCode: '', itemId: '', partnerId: '', unitPrice: '0', quantity: '1', discount: '0', includesTax: false })
const rateCodes = computed(() => [...new Set(setup.value?.rates.map(x => x.code))])
const rateCodeOptions = computed(() => rateCodes.value.map(code => ({ label: code, value: code })))
const groupOptions = computed(() => (setup.value?.groups ?? []).map(entry => ({ label: entry.code, value: entry.code })))
const kindOptions = [{ label: '商品 / 服务', value: 'item' }, { label: '往来单位', value: 'partner' }]
const groupSelection = computed({
  get: () => calculation.groupCode || 'default',
  set: value => { calculation.groupCode = value === 'default' ? '' : value },
})
function setText(target: Record<string, unknown>, key: string, value: string | number) {
  target[key] = String(value).trim()
}

async function refresh() {
  setup.value = await $fetch<TaxSetup>(path.value, { retry: 0 })
}
async function run(work: () => Promise<void>) {
  if (busy.value) return
  busy.value = true
  notice.value = ''
  try { await work() }
  catch (error) {
    const detail = (error as { data?: { detail?: string } }).data?.detail
    notice.value = detail || '请求未完成，请刷新查看，或保留原输入手动重试。'
  } finally { busy.value = false }
}
async function save(kind: string, input: object) {
  await run(async () => {
    await submit(kind, `${path.value}/${kind}`, 'POST', input)
    await refresh()
    notice.value = '税务配置已保存。'
  })
}
function saveGroup() {
  const expectedVersion = setup.value?.groups.find(x => x.code === group.code.trim().toUpperCase())?.version ?? 0
  return save('groups', { ...group, expectedVersion })
}
function saveClassification() {
  const expectedVersion = setup.value?.classifications.find(x => x.kind === classification.kind
    && x.resourceId === classification.resourceId.trim().toLowerCase())?.version ?? 0
  return save('classifications', { ...classification, expectedVersion })
}
function assess() {
  return run(async () => {
    snapshot.value = await submit<Snapshot>('assess', `${path.value}/assessments`, 'POST', {
      ...calculation, groupCode: calculation.groupCode || null,
      itemId: calculation.itemId || null, partnerId: calculation.partnerId || null,
    })
    snapshotId.value = snapshot.value.id
  })
}
function readSnapshot() {
  return run(async () => {
    snapshot.value = await $fetch<Snapshot>(`${path.value}/assessments/${encodeURIComponent(snapshotId.value)}`, { retry: 0 })
  })
}
function selectGroup(value: TaxGroup) {
  Object.assign(group, { code: value.code, name: value.name, rateCodes: [...value.rateCodes] })
}
</script>

<template>
  <section class="tax" aria-labelledby="tax-heading">
    <h3 id="tax-heading">税项、税组与计算快照</h3>
    <button type="button" class="quiet" :disabled="busy" @click="run(refresh)">{{ setup ? '刷新税务配置' : '打开税务配置' }}</button>
    <UAlert v-if="notice" role="status" :description="notice" />
    <template v-if="setup">
      <ul><li v-for="entry in setup.rates" :key="entry.id">{{ entry.code }} · {{ entry.name }} · {{ entry.effectiveOn }} · {{ entry.rate }}</li></ul>
      <ul><li v-for="entry in setup.groups" :key="entry.code">
        {{ entry.code }} · {{ entry.name }} · {{ entry.rateCodes.join('、') }} · v{{ entry.version }}
        <button v-if="setup.canManage" type="button" class="quiet" @click="selectGroup(entry)">编辑税组 {{ entry.code }}</button>
      </li></ul>
      <template v-if="setup.canManage">
        <form @submit.prevent="save('rates', rate)">
          <fieldset :disabled="busy">
            <legend>新增税率版本</legend>
            <UFormField label="税项编码" name="rateCode" required>
              <UInput v-model="rate.code" required maxlength="40" />
            </UFormField>
            <UFormField label="税项名称" name="rateName" required>
              <UInput v-model="rate.name" required maxlength="160" />
            </UFormField>
            <UFormField label="生效日期" name="effectiveOn" required>
              <UInput v-model="rate.effectiveOn" type="date" required />
            </UFormField>
            <UFormField label="税率（13% 填 0.13）" name="rate" required>
              <UInput :model-value="rate.rate" inputmode="decimal" maxlength="16" required @update:model-value="value => setText(rate, 'rate', value)" />
            </UFormField>
            <button class="primary">保存税率版本</button>
          </fieldset>
        </form>
        <form @submit.prevent="saveGroup">
          <fieldset :disabled="busy">
            <legend>维护税组</legend>
            <UFormField label="税组编码" name="groupCode" required>
              <UInput v-model="group.code" required maxlength="40" />
            </UFormField>
            <UFormField label="税组名称" name="groupName" required>
              <UInput v-model="group.name" required maxlength="160" />
            </UFormField>
            <UFormField label="税项" name="rateCodes">
              <USelect v-model="group.rateCodes" :items="rateCodeOptions" multiple />
            </UFormField>
            <button class="primary">保存税组</button>
          </fieldset>
        </form>
        <form @submit.prevent="saveClassification">
          <fieldset :disabled="busy">
            <legend>商品或往来单位的默认税组</legend>
            <UFormField label="分类对象" name="kind">
              <USelect v-model="classification.kind" :items="kindOptions" />
            </UFormField>
            <UFormField label="主数据 ID" name="resourceId" required>
              <UInput :model-value="classification.resourceId" required @update:model-value="value => setText(classification, 'resourceId', value)" />
            </UFormField>
            <UFormField label="默认税组" name="groupCode" required>
              <USelect v-model="classification.groupCode" :items="groupOptions" />
            </UFormField>
            <button class="primary">保存税分类</button>
            <ul><li v-for="entry in setup.classifications" :key="entry.id">{{ entry.kind }} · {{ entry.resourceId }} · {{ entry.groupCode }} · v{{ entry.version }}</li></ul>
          </fieldset>
        </form>
        <form @submit.prevent="assess">
          <fieldset :disabled="busy">
            <legend>按行计算并保存快照</legend>
            <UFormField label="计税日期" name="on" required>
              <UInput v-model="calculation.on" type="date" required />
            </UFormField>
            <UFormField label="指定税组" name="assessmentGroup">
              <USelect v-model="groupSelection" :items="[{ label: '按往来单位、商品顺序取默认税组', value: 'default' }, ...groupOptions]" />
            </UFormField>
            <UFormField label="商品 / 服务 ID（可选）" name="itemId">
              <UInput :model-value="calculation.itemId" @update:model-value="value => setText(calculation, 'itemId', value)" />
            </UFormField>
            <UFormField label="往来单位 ID（可选）" name="partnerId">
              <UInput :model-value="calculation.partnerId" @update:model-value="value => setText(calculation, 'partnerId', value)" />
            </UFormField>
            <UFormField label="单价" name="unitPrice" required>
              <UInput :model-value="calculation.unitPrice" inputmode="decimal" maxlength="24" required @update:model-value="value => setText(calculation, 'unitPrice', value)" />
            </UFormField>
            <UFormField label="数量" name="quantity" required>
              <UInput :model-value="calculation.quantity" inputmode="decimal" maxlength="20" required @update:model-value="value => setText(calculation, 'quantity', value)" />
            </UFormField>
            <UFormField label="折扣比例" name="discount" required>
              <UInput :model-value="calculation.discount" inputmode="decimal" maxlength="16" required @update:model-value="value => setText(calculation, 'discount', value)" />
            </UFormField>
            <UCheckbox v-model="calculation.includesTax" label="单价含税" />
            <button class="primary">计算并保存税额</button>
          </fieldset>
        </form>
      </template>
      <form @submit.prevent="readSnapshot">
        <fieldset :disabled="busy">
          <legend>查看历史税额快照</legend>
          <UFormField label="税额快照 ID" name="snapshotId" required>
            <UInput :model-value="snapshotId" required maxlength="36" @update:model-value="value => snapshotId = String(value).trim()" />
          </UFormField>
          <button class="quiet">查询税额快照</button>
        </fieldset>
      </form>
      <template v-if="snapshot">
        <p role="status">
          {{ snapshot.on }} · {{ snapshot.group.code }} v{{ snapshot.group.version }} ·
          未税 {{ formatDecimal(snapshot.amounts.net, snapshot.minorUnits) }} · 税额 {{ formatDecimal(snapshot.amounts.tax, snapshot.minorUnits) }} ·
          含税 {{ formatDecimal(snapshot.amounts.total, snapshot.minorUnits) }} {{ snapshot.currency }}
        </p>
        <ul><li v-for="component in snapshot.amounts.components" :key="component.rateId">
          {{ component.code }} · {{ component.rate }} · {{ formatDecimal(component.amount, snapshot.minorUnits) }}
        </li></ul>
      </template>
    </template>
  </section>
</template>

<style scoped>
.tax { margin-top: 24px }
fieldset { display: grid; gap: 10px; min-width: 0; margin: 12px 0; border: 1px solid #d1d9e6; border-radius: 8px }

</style>
