<script setup lang="ts">
interface Permit { id: string; lineId: string; warehouseId: string; quantity: string; executed: string; revision: number; state: string }
interface Allowances { canManage: boolean; permits: Permit[] }
interface Warehouse { id: string; name: string }
const props = defineProps<{ workspaceId: string; orderId: string; version: number; orderState: string; lines: { id: string; itemCode: string; itemName: string }[] }>()
const emit = defineEmits<{ changed: [] }>()
const path = computed(() => `/bff/api/purchasing/workspaces/${props.workspaceId}/orders/${props.orderId}/receipts`)
const list = shallowRef<Allowances>()
const warehouses = shallowRef<Warehouse[]>([])
const form = reactive({ lineId: '', warehouseId: '', quantity: '', reason: '' })
const busy = ref(false)
const notice = ref('')
const submit = useWorkspaceMutation()
const labels: Record<string, string> = { dispatching: '下发中', issued: '已签发', completed: '已收齐', cancelling: '等待库存取消回执', cancelled: '已取消剩余额度' }
const lineOptions = computed(() => props.lines.map(line => ({ label: `${line.itemCode} · ${line.itemName}`, value: line.id })))
const warehouseOptions = computed(() => warehouses.value.map(warehouse => ({ label: warehouse.name, value: warehouse.id })))

async function refresh() {
  list.value = await $fetch<Allowances>(path.value, { retry: 0 })
  if (list.value.canManage) {
    const inventory = await $fetch<{ warehouses: Warehouse[] }>(`/bff/api/inventory/workspaces/${props.workspaceId}/warehouses`, { retry: 0 })
    warehouses.value = inventory.warehouses
  }
}
async function run(action: () => Promise<void>) {
  if (busy.value) return
  busy.value = true; notice.value = ''
  try { await action(); await refresh(); emit('changed') }
  catch (error) {
    notice.value = (error as { data?: { detail?: string } }).data?.detail || '请求结果待确认，请刷新或保留输入手动重试。'
  } finally { busy.value = false }
}
function issue() {
  return run(async () => {
    await submit('issue-permit', path.value, 'POST', {
      expectedVersion: props.version, lineId: form.lineId, warehouseId: form.warehouseId, quantity: form.quantity,
    })
    form.quantity = ''
  })
}
function cancel(permit: Permit) {
  return run(async () => {
    await submit('cancel-permit', `${path.value}/${permit.id}/cancel`, 'POST', { expectedVersion: props.version, reason: form.reason })
    form.reason = ''
  })
}
function closeOrder() {
  return run(async () => {
    await submit('close-receiving', `${path.value}/close`, 'POST', { expectedVersion: props.version, reason: form.reason })
    form.reason = ''
  })
}
</script>

<template>
  <section aria-label="采购收货许可">
    <h4>收货许可</h4>
    <UButton variant="outline" color="neutral" size="sm" type="button" :disabled="busy" @click="run(async () => {})">{{ list ? '刷新收货进度' : '打开收货许可' }}</UButton>
    <UAlert v-if="notice" role="status" :description="notice" />
    <template v-if="list">
      <form v-if="list.canManage && !['received', 'closed'].includes(orderState)" @submit.prevent="issue">
        <fieldset :disabled="busy">
          <legend>按审批订单行签发</legend>
          <UFormField label="采购行" name="lineId">
            <USelect :model-value="form.lineId" :items="lineOptions" placeholder="选择采购行" required @update:model-value="value => form.lineId = String(value)" />
          </UFormField>
          <UFormField label="收货仓库" name="warehouseId">
            <USelect :model-value="form.warehouseId" :items="warehouseOptions" placeholder="选择仓库" required @update:model-value="value => form.warehouseId = String(value)" />
          </UFormField>
          <UFormField label="许可数量" name="quantity">
            <UInput :model-value="form.quantity" inputmode="decimal" maxlength="24" required @update:model-value="value => form.quantity = String(value).trim()" />
          </UFormField>
          <UButton color="primary" type="submit">签发收货许可</UButton>
        </fieldset>
      </form>
      <UFormField v-if="list.canManage && orderState !== 'closed'" label="取消许可或关单原因" name="reason">
        <UInput :model-value="form.reason" maxlength="300" @update:model-value="value => form.reason = String(value).trim()" />
      </UFormField>
      <ul><li v-for="permit in list.permits" :key="permit.id">
        {{ lines.find(x => x.id === permit.lineId)?.itemCode }} · {{ labels[permit.state] }} · 已收 {{ permit.executed }} / {{ permit.quantity }}
        <UButton
v-if="list.canManage && ['issued', 'dispatching'].includes(permit.state)" variant="outline" color="neutral" size="sm" type="button"
          :disabled="busy || !form.reason" @click="cancel(permit)">取消未收货额度</UButton>
      </li></ul>
      <UButton
v-if="list.canManage && orderState !== 'closed'" type="button" variant="outline" color="neutral" size="sm"
        :disabled="busy || !form.reason || list.permits.some(x => !['completed', 'cancelled'].includes(x.state))"
        @click="closeOrder">关闭采购收货</UButton>
    </template>
  </section>
</template>

<style scoped>
fieldset { display: grid; gap: 6px; min-width: 0; margin: 12px 0; border: 1px solid #d1d9e6; border-radius: 8px }
li { overflow-wrap: anywhere }
</style>
