<script setup lang="ts">
interface Choice { id: string; code: string; name: string }
interface Schedule {
  id: string; version: number; paused: boolean; nextOn: string | null; lastOn: string | null; preview: string[]; pendingReason: string | null
  terms: {
    customerId: string; customerName: string; serviceId: string; serviceName: string; quantity: string; unitPrice: string
    intervalMonths: number; dueDays: number; endsOn: string | null; brand: { timeZone: string }
  }
}
interface Occurrence { on: string; templateVersion: number; documentId: string | null }
const props = defineProps<{ base: string; canDraft: boolean; customers: Choice[]; services: Choice[] }>()
const emit = defineEmits<{ changed: [] }>()
const path = computed(() => props.base + '/schedules')
const schedules = shallowRef<Schedule[]>()
const history = shallowRef<Occurrence[]>([])
const selected = ref('')
const editing = shallowRef<Schedule>()
const blank = () => ({ customerId: '', serviceId: '', quantity: '1', unitPrice: '', nextOn: '', endsOn: '', intervalMonths: 1, dueDays: 15 })
const form = reactive(blank())
const busy = ref(false)
const notice = ref('')
const customerOptions = computed(() => props.customers.map(entry => ({ label: entry.code + ' · ' + entry.name, value: entry.id })))
const serviceOptions = computed(() => props.services.map(entry => ({ label: entry.code + ' · ' + entry.name, value: entry.id })))
const submit = useWorkspaceMutation()
async function read() {
  schedules.value = await $fetch<Schedule[]>(path.value, { retry: 0 })
  if (selected.value) history.value = await $fetch<Occurrence[]>(path.value + '/' + selected.value + '/occurrences', { retry: 0 })
}
async function run(task: () => Promise<void>) {
  if (busy.value) return
  busy.value = true; notice.value = ''
  try { await task(); await read() }
  catch (error) { notice.value = (error as { data?: { detail?: string } }).data?.detail ?? '请核对周期开票计划。' }
  finally { busy.value = false }
}
function reset() { editing.value = undefined; Object.assign(form, blank()) }
function edit(row: Schedule) {
  editing.value = row
  const { customerId, serviceId, quantity, unitPrice, intervalMonths, dueDays, endsOn } = row.terms
  Object.assign(form, { customerId, serviceId, quantity, unitPrice, intervalMonths, dueDays, endsOn: endsOn ?? '', nextOn: row.nextOn ?? '' })
}
function save() {
  return run(async () => {
    const current = editing.value
    await submit('save-schedule', current ? path.value + '/' + current.id : path.value, current ? 'PUT' : 'POST',
      { expectedVersion: current?.version ?? 0, input: { ...form, endsOn: form.endsOn || null } })
    reset()
  })
}
function change(row: Schedule, action: 'pause' | 'run' | 'skip') {
  return run(async () => {
    await submit('change-schedule', path.value + '/' + row.id + '/' + action, 'POST',
      action === 'pause' ? { expectedVersion: row.version, paused: !row.paused }
        : action === 'skip' ? { expectedVersion: row.version, on: row.nextOn } : { on: row.nextOn })
    selected.value = row.id
    emit('changed')
  })
}
</script>

<template>
  <section aria-label="周期开票计划">
    <h3>周期开票</h3>
    <UButton variant="outline" color="neutral" size="sm" type="button" :disabled="busy" @click="run(async () => { })">{{ schedules ? '刷新周期开票' : '打开周期开票'
      }}</UButton>
    <UAlert v-if="notice" role="status" :description="notice" />
    <template v-if="schedules">
      <form v-if="canDraft" @submit.prevent="save">
        <fieldset :disabled="busy">
          <legend>{{ editing ? '编辑周期计划' : '创建周期计划' }}</legend>
          <UFormField label="周期客户" name="customerId">
            <USelect :model-value="form.customerId" :items="customerOptions" placeholder="选择客户" required @update:model-value="value => form.customerId = String(value)" />
          </UFormField>
          <UFormField label="周期服务项目" name="serviceId">
            <USelect :model-value="form.serviceId" :items="serviceOptions" placeholder="选择非库存服务" required @update:model-value="value => form.serviceId = String(value)" />
          </UFormField>
          <UFormField label="周期数量" name="quantity">
            <UInput :model-value="form.quantity" inputmode="decimal" required @update:model-value="value => form.quantity = String(value).trim()" />
          </UFormField>
          <UFormField label="周期未税单价" name="unitPrice">
            <UInput :model-value="form.unitPrice" inputmode="decimal" required @update:model-value="value => form.unitPrice = String(value).trim()" />
          </UFormField>
          <UFormField label="下次开票日期" name="nextOn">
            <UInput :model-value="form.nextOn" type="date" required @update:model-value="value => form.nextOn = String(value)" />
          </UFormField>
          <UFormField label="计划截止日期" name="endsOn">
            <UInput :model-value="form.endsOn" type="date" @update:model-value="value => form.endsOn = String(value)" />
          </UFormField>
          <UFormField label="间隔月数" name="intervalMonths">
            <UInput :model-value="form.intervalMonths" type="number" min="1" max="24" required @update:model-value="value => form.intervalMonths = Number(value) || 0" />
          </UFormField>
          <UFormField label="付款期限天数" name="dueDays">
            <UInput :model-value="form.dueDays" type="number" min="0" max="180" required @update:model-value="value => form.dueDays = Number(value) || 0" />
          </UFormField>
          <UButton type="submit" color="primary">保存周期计划</UButton>
          <UButton v-if="editing" variant="outline" color="neutral" size="sm" type="button" @click="reset">退出计划编辑</UButton>
        </fieldset>
      </form>
      <ul>
        <li v-for="row in schedules" :key="row.id">
          {{ row.terms.customerName }} · {{ row.terms.serviceName }} · {{ row.paused ? '已暂停' : row.nextOn ? '运行中' :
          '已完成' }}
          · 每 {{ row.terms.intervalMonths }} 个月 · {{ row.terms.brand.timeZone }} · v{{ row.version }}
          <p>日期预览 {{ row.preview.join('、') || '无剩余日期' }}</p>
          <p v-if="row.pendingReason">{{ row.pendingReason }}</p>
          <UButton variant="outline" color="neutral" size="xs" type="button" :disabled="busy"
            @click="run(async () => { selected = row.id })">查看执行记录</UButton>
          <template v-if="canDraft">
            <UButton variant="outline" color="neutral" size="xs" type="button" :disabled="busy" @click="edit(row)">编辑计划</UButton>
            <UButton v-if="row.nextOn" variant="outline" color="neutral" size="xs" type="button" :disabled="busy" @click="change(row, 'pause')">{{
              row.paused ? '恢复计划' : '暂停计划' }}</UButton>
            <UButton v-if="row.nextOn && !row.paused" variant="outline" color="neutral" size="xs" type="button" :disabled="busy"
              @click="change(row, 'run')">执行到期计划</UButton>
            <UButton v-if="row.nextOn && !row.paused" variant="outline" color="neutral" size="xs" type="button" :disabled="busy"
              @click="change(row, 'skip')">跳过下次开票</UButton>
          </template>
          <ul v-if="selected === row.id">
            <li v-for="entry in history" :key="entry.on">
              {{ entry.on }} · 模板 v{{ entry.templateVersion }} · {{ entry.documentId ? '单据 ' + entry.documentId : '已跳过' }}
            </li>
          </ul>
        </li>
      </ul>
    </template>
  </section>
</template>

<style scoped>
fieldset {
  display: grid;
  gap: 8px;
  border: 1px solid #d1d9e6;
  border-radius: 8px;
  min-width: 0;
  margin: 10px 0
}

label {
  display: grid;
  gap: 4px
}

li {
  margin: 6px 0;
  overflow-wrap: anywhere
}
</style>
