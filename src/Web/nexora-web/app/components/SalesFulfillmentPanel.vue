<script setup lang="ts">
interface Permit { id: string; lineId: string; quantity: string; executed: string; state: string; expiresAtUtc: string }
interface Warehouse { id: string; code: string; name: string }
const props = defineProps<{ workspaceId: string; orderId: string; version: number; orderState: string;
  lines: { id: string; itemName: string; quantity: string }[] }>()
const emit = defineEmits<{ changed: [] }>()
const base = computed(() => '/bff/api/sales/workspaces/' + props.workspaceId + '/orders/' + props.orderId + '/fulfillments')
const state = shallowRef<{ canManage: boolean; permits: Permit[] }>()
const warehouses = shallowRef<Warehouse[]>([])
const quantities = reactive<Record<string, string>>({})
const warehouse = ref('')
const reason = ref('')
const busy = ref(false)
const message = ref('')
const submit = useWorkspaceMutation()
const warehouseOptions = computed(() => warehouses.value.map(item => ({ label: `${item.code} · ${item.name}`, value: item.id })))
async function read() {
  state.value = await $fetch(base.value, { retry: 0 })
  if (state.value?.canManage && !warehouses.value.length) {
    const result = await $fetch<{ warehouses: Warehouse[] }>('/bff/api/inventory/workspaces/' + props.workspaceId + '/warehouses', { retry: 0 })
    warehouses.value = result.warehouses
  }
}
async function run(task: () => Promise<void>) {
  if (busy.value) return
  busy.value = true; message.value = ''
  try { await task(); await read(); emit('changed') }
  catch (error) { message.value = (error as { data?: { detail?: string } }).data?.detail ?? '请刷新并核对履约状态。' }
  finally { busy.value = false }
}
function reserve() {
  const lines = Object.entries(quantities).filter(([, quantity]) => quantity).map(([lineId, quantity]) => ({ lineId, quantity }))
  if (!lines.length) { message.value = '请填写至少一行履约数量。'; return }
  return run(async () => {
    await submit('reserve-sales', base.value, 'POST', { expectedVersion: props.version, warehouseId: warehouse.value, lines })
    for (const line of lines) Reflect.deleteProperty(quantities, line.lineId)
  })
}
function finish(path: string) {
  return run(async () => {
    await submit('sales-fulfillment-decision', base.value + path, 'POST', { expectedVersion: props.version, reason: reason.value })
    reason.value = ''
  })
}
const labels: Record<string, string> = { dispatching: '等待库存确认', reserved: '已预留', cancelling: '等待释放',
  cancelled: '预留被拒绝或余量已释放', completed: '已发完' }
</script>

<template>
  <section aria-label="销售履约">
    <UButton variant="outline" color="neutral" size="sm" type="button" :disabled="busy" @click="run(async () => {})">刷新销售履约</UButton>
    <UAlert v-if="message" role="status" :description="message" />
    <template v-if="state">
      <ul><li v-for="permit in state.permits" :key="permit.id">
        {{ lines.find(x => x.id === permit.lineId)?.itemName }} · {{ permit.executed }} / {{ permit.quantity }} · {{ labels[permit.state] }}
        · 到期 {{ new Date(permit.expiresAtUtc).toLocaleString('zh-CN') }}
        <UButton
v-if="state.canManage && ['reserved', 'dispatching'].includes(permit.state)" type="button" variant="outline" color="neutral" size="sm"
          :disabled="busy || !reason" @click="finish('/' + permit.id + '/cancel')">释放该行余量</UButton>
      </li></ul>
      <form v-if="state.canManage && ['approved', 'fulfilling'].includes(orderState)" @submit.prevent="reserve">
        <fieldset :disabled="busy">
          <legend>签发销售履约许可</legend>
          <UFormField label="销售发货仓库" name="warehouse">
            <USelect :model-value="warehouse" :items="warehouseOptions" placeholder="选择仓库" required @update:model-value="value => warehouse = String(value)" />
          </UFormField>
          <UFormField v-for="line in lines" :key="line.id" :label="`${line.itemName} 履约数量`" name="quantity">
            <UInput :model-value="quantities[line.id]" inputmode="decimal" maxlength="26" @update:model-value="value => quantities[line.id] = String(value).trim()" />
          </UFormField>
          <UButton color="primary" type="submit">预留所选商品</UButton>
        </fieldset>
      </form>
      <fieldset v-if="state.canManage && orderState !== 'closed'" :disabled="busy">
        <legend>销售履约处理</legend>
        <UFormField label="释放或关单原因" name="reason">
          <UInput :model-value="reason" maxlength="300" @update:model-value="value => reason = String(value).trim()" />
        </UFormField>
        <UButton variant="outline" color="neutral" size="sm" type="button" :disabled="!reason" @click="finish('/close')">关闭销售履约</UButton>
      </fieldset>
    </template>
  </section>
</template>

<style scoped>
fieldset { display: grid; gap: 8px; min-width: 0; margin: 12px 0; border: 1px solid #d1d9e6; border-radius: 8px }
li { margin: 6px 0 }
</style>
