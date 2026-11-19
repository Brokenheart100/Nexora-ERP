<script setup lang="ts">
const props = defineProps<{ workspaceId: string }>()
const {
  home, busy, notice, newWarehouse, selectedId, warehouseOptions, selected, receiver, memberOptions,
  permits, receipt, receivablePermitOptions, shipments, shipment, shippablePermitOptions, saleReturn,
  salesReturnMovementOptions, salesReturns, positions, correction, positionOptions, destinationOptions,
  operations, arrivalOn, movements, returned, returnMovementOptions, returns, exporting, exportNotice,
  exportError, run, readHome, exportPositions, add, changeWarehouse, assign, receive, ship, authorizeSalesReturn,
  decideSalesReturn, prepareOperation, decideOperation, receiveTransfer, authorizeReturn, decideReturn,
} = useWarehouseInventory(() => props.workspaceId)

const card = ref<HTMLElement>()

function printView() {
  printSection(card.value)
}
</script>

<template>
  <section ref="card" class="inventory rounded-nx border border-nx-border bg-nx-surface p-6 shadow-nx-sm" aria-labelledby="inventory-heading">
    <h2 id="inventory-heading"><UIcon class="mr-2 inline-block size-[1.08em] align-[-0.16em] text-nx-primary" name="i-lucide-warehouse" aria-hidden="true" />仓库、收货与库存</h2>
    <UButton variant="outline" color="neutral" size="sm" type="button" :disabled="busy" @click="run(readHome)">{{ home ? '刷新库存工作台' : '打开库存工作台' }}</UButton>
    <div class="mb-3 mt-2 flex flex-wrap gap-2">
      <UButton variant="outline" color="neutral" size="sm" type="button" :disabled="busy || exporting" @click="run(exportPositions)">导出库存 CSV</UButton>
      <UButton variant="outline" color="neutral" size="sm" type="button" @click="printView">打印当前视图</UButton>
    </div>
    <UAlert v-if="notice" role="status" :description="notice" />
    <UAlert v-if="exportNotice" role="status" :description="exportNotice" />
    <UAlert v-if="exportError" role="alert" color="error" icon="i-lucide-circle-alert" :description="exportError" />
    <template v-if="home">
      <form v-if="home.canManage" @submit.prevent="add">
        <fieldset :disabled="busy">
          <legend>新增仓库</legend>
          <UFormField label="仓库编码" name="warehouseCode">
            <UInput :model-value="newWarehouse.code" maxlength="40" required @update:model-value="value => newWarehouse.code = String(value).trim()" />
          </UFormField>
          <UFormField label="仓库名称" name="warehouseName">
            <UInput :model-value="newWarehouse.name" maxlength="160" required @update:model-value="value => newWarehouse.name = String(value).trim()" />
          </UFormField>
          <UButton type="submit" color="primary">保存仓库</UButton>
        </fieldset>
      </form>
      <UFormField label="库存仓库" name="warehouseId">
        <USelect :model-value="selectedId" :items="warehouseOptions" :disabled="busy" placeholder="选择仓库" @update:model-value="value => { selectedId = String(value); changeWarehouse() }" />
      </UFormField>
      <template v-if="selected">
        <form v-if="home.canManage" @submit.prevent="assign">
          <fieldset :disabled="busy">
            <legend>指定仓库收货人</legend>
            <UFormField label="收货成员" name="receiverId">
              <USelect :model-value="receiver || '__none__'" :items="memberOptions" @update:model-value="value => { receiver = String(value) === '__none__' ? '' : String(value) }" />
            </UFormField>
            <UButton variant="outline" color="neutral" size="sm" type="submit">保存仓库范围</UButton>
          </fieldset>
        </form>
        <ul><li v-for="permit in permits" :key="permit.ticket.permitId">
          {{ permit.ticket.itemId }} · 实收 {{ permit.executed }} / {{ permit.ticket.quantity }} · 成本 {{ permit.cost }}{{ permit.fenced ? ' · 已取消余量' : '' }}
        </li></ul>
        <form v-if="selected.canReceive" @submit.prevent="receive">
          <fieldset :disabled="busy">
            <legend>确认实收</legend>
            <UFormField label="库存收货许可" name="receiptPermitId">
              <USelect :model-value="receipt.id" :items="receivablePermitOptions" placeholder="选择许可" required @update:model-value="value => receipt.id = String(value)" />
            </UFormField>
            <UFormField label="实收日期" name="receiptDate">
              <UInput :model-value="receipt.on" type="date" required @update:model-value="value => receipt.on = String(value)" />
            </UFormField>
            <UFormField label="实收数量" name="receiptQuantity">
              <UInput :model-value="receipt.quantity" inputmode="decimal" required @update:model-value="value => receipt.quantity = String(value).trim()" />
            </UFormField>
            <UButton type="submit" color="primary">确认收货</UButton>
          </fieldset>
        </form>
        <template v-if="shipments.length">
          <h3>销售预留与发货</h3>
          <ul><li v-for="permit in shipments" :key="permit.id">
            {{ permit.itemName }} · 已发 {{ permit.executed }} / {{ permit.quantity }}{{ permit.fenced ? ' · 已释放余量' : '' }}
          </li></ul>
          <form v-if="selected.canReceive" @submit.prevent="ship">
            <fieldset :disabled="busy"><legend>确认销售发货</legend>
              <UFormField label="销售发货许可" name="shipmentId">
                <USelect :model-value="shipment.id" :items="shippablePermitOptions" placeholder="选择许可" required @update:model-value="value => shipment.id = String(value)" />
              </UFormField>
              <UFormField label="发货日期" name="shipmentDate">
                <UInput :model-value="shipment.on" type="date" required @update:model-value="value => shipment.on = String(value)" />
              </UFormField>
              <UFormField label="发货数量" name="shipmentQuantity">
                <UInput :model-value="shipment.quantity" inputmode="decimal" required @update:model-value="value => shipment.quantity = String(value).trim()" />
              </UFormField>
              <UButton type="submit" color="primary">确认发货</UButton>
            </fieldset>
          </form>
        </template>
        <form v-if="selected.canApproveSalesReturns" @submit.prevent="authorizeSalesReturn">
          <fieldset :disabled="busy"><legend>授权销售退货</legend>
            <UFormField label="原发货流水" name="salesReturnMovementId">
              <USelect :model-value="saleReturn.movement" :items="salesReturnMovementOptions" placeholder="选择发货" required @update:model-value="value => saleReturn.movement = String(value)" />
            </UFormField>
            <UFormField label="销售退货日期" name="salesReturnDate">
              <UInput :model-value="saleReturn.on" type="date" required @update:model-value="value => saleReturn.on = String(value)" />
            </UFormField>
            <UFormField label="销售退货数量" name="salesReturnQuantity">
              <UInput :model-value="saleReturn.quantity" inputmode="decimal" required @update:model-value="value => saleReturn.quantity = String(value).trim()" />
            </UFormField>
            <UFormField label="销售退货原因" name="salesReturnReason">
              <UInput :model-value="saleReturn.reason" maxlength="300" required @update:model-value="value => saleReturn.reason = String(value).trim()" />
            </UFormField>
            <UButton type="submit" color="primary">签发销售退货许可</UButton>
          </fieldset>
        </form>
        <ul><li v-for="entry in salesReturns" :key="entry.id">
          销售退货 {{ entry.on }} · {{ entry.quantity }} · {{ entry.reason }} · {{ entry.cancelled ? '已撤销' : entry.movementId ? '已入库' : '待确认' }}
          <UButton
v-if="!entry.movementId && !entry.cancelled && entry.canConfirm" variant="outline" color="neutral" size="xs" type="button"
            :disabled="busy" @click="decideSalesReturn(entry, true)">确认销售退货</UButton>
          <UButton
v-if="!entry.movementId && !entry.cancelled && selected.canApproveSalesReturns" variant="outline" color="neutral" size="xs" type="button"
            :disabled="busy" @click="decideSalesReturn(entry, false)">撤销销售退货许可</UButton>
        </li></ul>
        <h3>库存与移动加权成本</h3>
        <ul><li v-for="pool in positions" :key="pool.itemId">
          {{ pool.itemId }} · 在库 {{ pool.quantity }} · 价值 {{ pool.value }} {{ pool.currency }} · 平均成本 {{ pool.average }} · 序列 {{ pool.sequence }} · 预留 {{ pool.reserved }} · 可用 {{ pool.available }}
        </li></ul>
        <h3 v-if="home.canManage || selected.canReceive">盘点与仓间调拨</h3>
        <form v-if="selected.canReceive && positions.length" @submit.prevent="prepareOperation">
          <fieldset :disabled="busy"><legend>提交库存复核</legend>
            <UFormField label="库存商品" name="correctionItemId">
              <USelect :model-value="correction.itemId" :items="positionOptions" placeholder="选择商品" required @update:model-value="value => correction.itemId = String(value)" />
            </UFormField>
            <UFormField label="盘点或调拨" name="correctionDestinationId">
              <USelect :model-value="correction.destinationId || '__none__'" :items="destinationOptions" @update:model-value="value => { correction.destinationId = String(value) === '__none__' ? '' : String(value) }" />
            </UFormField>
            <UFormField label="库存操作日期" name="correctionDate">
              <UInput :model-value="correction.on" type="date" required @update:model-value="value => correction.on = String(value)" />
            </UFormField>
            <UFormField :label="correction.destinationId ? '调拨数量' : '盘点实数'" name="correctionQuantity">
              <UInput :model-value="correction.quantity" inputmode="decimal" required @update:model-value="value => correction.quantity = String(value).trim()" />
            </UFormField>
            <UFormField label="库存操作原因" name="correctionReason">
              <UInput :model-value="correction.reason" maxlength="300" required @update:model-value="value => correction.reason = String(value).trim()" />
            </UFormField>
            <UButton type="submit" color="primary">提交库存复核</UButton>
          </fieldset>
        </form>
        <ul><li v-for="entry in operations" :key="entry.id">
          {{ entry.destinationId ? '仓间调拨' : '库存盘点' }} · {{ entry.on }} · {{ entry.itemId }}
          · 账面 {{ entry.bookQuantity }} · {{ entry.destinationId ? '调拨' : '实盘' }} {{ entry.quantity }} · {{ entry.reason }}
          · {{ entry.state === 'confirmed' ? '已确认' : entry.state === 'in-transit' ? '在途' : entry.state === 'cancelled' ? '已取消' : '待复核' }}
          <span v-if="entry.transitCost !== null"> · 调拨成本 {{ entry.transitCost }}</span>
          <span v-if="entry.receivedOn"> · 签收 {{ entry.receivedOn }}</span>
          <UButton v-if="entry.canConfirm" variant="outline" color="neutral" size="xs" type="button" :disabled="busy" @click="decideOperation(entry, true)">
            {{ entry.destinationId ? '复核并出库' : '确认库存复核' }}
          </UButton>
          <form v-if="entry.canReceive" @submit.prevent="receiveTransfer(entry)">
            <UFormField label="调拨到仓日期" name="arrivalOn">
              <UInput :model-value="arrivalOn" :min="entry.on" type="date" required :disabled="busy" @update:model-value="value => arrivalOn = String(value)" />
            </UFormField>
            <UButton variant="outline" color="neutral" size="xs" type="submit" :disabled="busy">签收调拨</UButton>
          </form>
          <UButton v-if="entry.canCancel" variant="outline" color="neutral" size="xs" type="button" :disabled="busy" @click="decideOperation(entry, false)">取消库存复核</UButton>
        </li></ul>
        <h3>变动流水</h3>
        <ul><li v-for="movement in movements" :key="movement.id">{{ movement.on }} · {{ movement.itemId }} · 数量 {{ movement.quantity }} · 成本 {{ movement.cost }}</li></ul>
        <form v-if="selected.canApproveReturns" @submit.prevent="authorizeReturn">
          <fieldset :disabled="busy">
            <legend>授权采购退货</legend>
            <UFormField label="原收货流水" name="returnMovementId">
              <USelect :model-value="returned.movement" :items="returnMovementOptions" placeholder="选择实收流水" required @update:model-value="value => returned.movement = String(value)" />
            </UFormField>
            <UFormField label="退货日期" name="returnDate">
              <UInput :model-value="returned.on" type="date" required @update:model-value="value => returned.on = String(value)" />
            </UFormField>
            <UFormField label="退货数量" name="returnQuantity">
              <UInput :model-value="returned.quantity" inputmode="decimal" required @update:model-value="value => returned.quantity = String(value).trim()" />
            </UFormField>
            <UFormField label="退货原因" name="returnReason">
              <UInput :model-value="returned.reason" maxlength="300" required @update:model-value="value => returned.reason = String(value).trim()" />
            </UFormField>
            <UButton type="submit" color="primary">授权退货</UButton>
          </fieldset>
        </form>
        <ul><li v-for="entry in returns" :key="entry.id">
          {{ entry.on }} · {{ entry.reason }} · {{ entry.quantity }} · {{ entry.cancelled ? '已取消' : entry.movementId ? '已确认' : '待确认' }}
          <template v-if="!entry.cancelled && !entry.movementId">
            <UButton v-if="entry.canConfirm" color="primary" type="button" :disabled="busy" @click="decideReturn(entry, true)">确认退货出库</UButton>
            <UButton v-if="selected.canApproveReturns" variant="outline" color="neutral" size="xs" type="button" :disabled="busy" @click="decideReturn(entry, false)">取消退货授权</UButton>
          </template>
        </li></ul>
      </template>
    </template>
  </section>
</template>

<style scoped>
.inventory { margin-top: 24px }
fieldset, label { display: grid; gap: 6px; min-width: 0 }
fieldset { margin: 12px 0; border: 1px solid #d1d9e6; border-radius: 8px }
select { max-width: 100% }
li { overflow-wrap: anywhere }
</style>
