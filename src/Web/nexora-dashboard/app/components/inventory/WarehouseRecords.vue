<script setup lang="ts">
import type { WarehouseOperationsConnection } from '~/composables/inventory/useWarehouseOperations'
import type { StockOperation } from '#shared/types/inventory'

const props = defineProps<{ work: WarehouseOperationsConnection }>()
const work = computed(() => props.work)
const form = computed(() => work.value.stock)
const warehouseForm = computed(() => work.value.management)
const selectedPool = computed(() => work.value.queries.pools.find(row => row.itemId === form.value.itemId))
const warehouseName = (id: string) => work.value.warehouse.query.data?.warehouses.warehouses.find(row => row.id === id)?.name ?? id
const stateLabel = (state: string) => ({ 'pending': '待复核', 'in-transit': '在途', 'confirmed': '已完成', 'cancelled': '已取消' })[state] ?? state
const movementLink = (row: StockOperation, destination: boolean) => ({
  path: '/inventory',
  query: { workspace: work.value.workspace(), tab: 'movements', item: row.itemId,
    warehouse: destination ? row.destinationId : row.warehouseId, movement: destination ? row.destinationMovementId : row.movementId }
})
</script>

<template>
  <div class="space-y-4" data-testid="warehouse-operations">
    <SalesOperationStatus
      v-if="!work.stockOpen && !work.managementOpen"
      :message="work.error"
      :submission="work.submission"
      @check="work.check()"
      @retry="work.retry()"
    />
    <UCard class="rounded-sm">
      <template #header>
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 class="text-sm font-semibold">
              仓库档案与执行人
            </h3>
            <p v-if="work.warehouse.query.data?.selected" class="text-xs text-muted">
              {{ work.warehouse.query.data.selected.name }} · {{ work.warehouse.query.data.selected.receiverId ? '已设置执行人' : '待设置执行人' }}
            </p>
          </div>
          <div v-if="work.manageAllowed" class="flex gap-2">
            <UButton
              label="新增仓库"
              size="xs"
              :disabled="work.frozen"
              data-testid="warehouse-ops-add"
              @click="work.openManagement(false)"
            />
            <UButton
              label="指定执行人"
              variant="outline"
              size="xs"
              :disabled="work.frozen || !work.warehouse.warehouseId"
              data-testid="warehouse-ops-assign"
              @click="work.openManagement(true)"
            />
          </div>
        </div>
      </template>
      <div class="flex flex-wrap gap-2">
        <UButton
          v-for="row in work.warehouse.query.data?.warehouses.warehouses"
          :key="row.id"
          :label="row.code + ' ' + row.name"
          :variant="row.id === work.warehouse.warehouseId ? 'solid' : 'outline'"
          size="xs"
          @click="work.warehouse.warehouseId = row.id"
        />
      </div>
    </UCard>

    <UCard class="rounded-sm">
      <template #header>
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h3 class="text-sm font-semibold">
            盘点与调拨
          </h3>
          <div class="flex gap-2">
            <UButton
              label="新建盘点"
              variant="outline"
              size="xs"
              :disabled="!work.prepareAllowed || work.frozen"
              data-testid="stocktake-ops-new"
              @click="work.openStock(false)"
            />
            <UButton
              label="新建调拨"
              size="xs"
              :disabled="!work.prepareAllowed || work.frozen"
              data-testid="transfer-ops-new"
              @click="work.openStock(true)"
            />
          </div>
        </div>
      </template>
      <USkeleton v-if="work.query.loading" class="h-12 w-full" />
      <UAlert
        v-else-if="work.query.problem"
        color="warning"
        variant="soft"
        :title="work.query.problem"
      />
      <p v-else-if="!work.query.data?.length" class="text-sm text-muted">
        当前仓库暂无盘点或调拨记录。
      </p>
      <div
        v-for="record in work.query.data"
        :key="record.id"
        class="flex flex-wrap items-center justify-between gap-2 border-b border-default py-2 text-sm"
        :data-testid="'stock-operation-' + record.id"
      >
        <div>
          <p>{{ record.destinationId ? '调拨' : '盘点' }} · {{ work.warehouse.itemName(record.itemId) }} · {{ record.quantity }}</p>
          <p class="text-xs text-muted">
            {{ record.on }} · {{ warehouseName(record.warehouseId) }}{{ record.destinationId ? ' → ' + warehouseName(record.destinationId) : '' }}
          </p>
        </div>
        <div class="flex items-center gap-2">
          <UBadge :label="stateLabel(record.state)" variant="subtle" :color="record.state === 'confirmed' ? 'success' : 'neutral'" />
          <UButton
            label="查看"
            size="xs"
            variant="ghost"
            @click="work.openDetail(record.id)"
          />
        </div>
      </div>
    </UCard>

    <USlideover v-model:open="work.managementOpen" :title="warehouseForm.assign ? '指定仓库执行人' : '新增仓库'" :ui="{ content: 'w-full sm:max-w-lg' }">
      <template #body>
        <div class="space-y-3">
          <SalesOperationStatus
            :message="work.error"
            :submission="work.submission"
            @check="work.check()"
            @retry="work.retry()"
          />
          <UFormField v-if="warehouseForm.assign" label="工作区成员">
            <USelect
              v-if="work.queries.members.length"
              :model-value="warehouseForm.memberId || undefined"
              :items="work.queries.members.map(row => ({ label: row.email || row.subject, value: row.id }))"
              placeholder="选择执行人"
              :disabled="work.frozen"
              class="w-full"
              data-testid="warehouse-ops-receiver"
              @update:model-value="warehouseForm.memberId = $event ?? ''"
            />
            <UInput
              v-else
              v-model="warehouseForm.memberId"
              placeholder="工作区成员 ID"
              :disabled="work.frozen"
              class="w-full"
              data-testid="warehouse-ops-receiver-id"
            />
            <UButton
              v-if="warehouseForm.memberId"
              label="清除执行人"
              variant="link"
              size="xs"
              :disabled="work.frozen"
              @click="warehouseForm.memberId = ''"
            />
          </UFormField>
          <template v-else>
            <UFormField label="仓库编码" required>
              <UInput
                v-model="warehouseForm.code"
                maxlength="30"
                class="w-full"
                data-testid="warehouse-ops-code"
              />
            </UFormField>
            <UFormField label="仓库名称" required>
              <UInput
                v-model="warehouseForm.name"
                maxlength="150"
                class="w-full"
                data-testid="warehouse-ops-name"
              />
            </UFormField>
          </template>
        </div>
      </template>
      <template #footer>
        <UButton label="关闭" variant="ghost" @click="work.managementOpen = false" />
        <UButton
          label="保存"
          :disabled="work.frozen"
          data-testid="warehouse-ops-save"
          @click="work.saveManagement()"
        />
      </template>
    </USlideover>

    <USlideover v-model:open="work.stockOpen" :title="work.selection ? '库存单据详情' : form.transfer ? '新建调拨' : '新建盘点'" :ui="{ content: 'w-full sm:max-w-xl' }">
      <template #body>
        <div class="space-y-4">
          <SalesOperationStatus
            :message="work.error"
            :submission="work.submission"
            @check="work.check()"
            @retry="work.retry()"
          />
          <USkeleton v-if="work.loading" class="h-12 w-full" />
          <div v-if="work.selection" class="space-y-3 text-sm" data-testid="stock-operation-detail">
            <UBadge :label="stateLabel(work.selection.state)" variant="subtle" data-testid="stock-operation-state" />
            <p class="break-all text-muted">
              {{ work.selection.id }}
            </p>
            <p>{{ work.warehouse.itemName(work.selection.itemId) }} · {{ work.selection.on }} · 数量 {{ work.selection.quantity }}</p>
            <p>源仓 {{ warehouseName(work.selection.warehouseId) }} · 制单时账面 {{ work.selection.bookQuantity }}</p>
            <p v-if="work.selection.destinationId">
              目标仓 {{ warehouseName(work.selection.destinationId) }} · 在途 {{ work.selection.state === 'in-transit' ? work.selection.quantity : '0' }} 件
            </p>
            <p v-if="work.selection.transitCost != null" data-testid="transfer-ops-cost">
              源仓出库成本 {{ work.selection.transitCost }}
            </p>
            <p>{{ work.selection.reason }}</p>
            <div class="flex flex-wrap gap-2">
              <UButton
                v-if="work.selection.movementId"
                label="查看源仓流水"
                variant="outline"
                size="xs"
                :to="movementLink(work.selection, false)"
                @click="work.stockOpen = false"
              />
              <UButton
                v-if="work.selection.destinationMovementId"
                label="查看目标仓流水"
                variant="outline"
                size="xs"
                :to="movementLink(work.selection, true)"
                @click="work.stockOpen = false"
              />
            </div>
            <UFormField v-if="work.selection.canReceive" label="实际到仓日期" required>
              <UInput
                v-model="work.arrival"
                type="date"
                :min="work.selection.on"
                data-testid="stock-operation-arrival"
              />
            </UFormField>
            <p v-else-if="work.selection.state === 'in-transit'" class="text-muted">
              由目标仓执行人在目标仓确认入库。
            </p>
          </div>
          <template v-else-if="!work.loading">
            <UFormField label="商品" required>
              <USelectMenu
                v-model="form.itemId"
                :items="work.queries.pools.map(row => ({ label: work.warehouse.itemName(row.itemId) + ' · 可用 ' + row.available, value: row.itemId }))"
                value-key="value"
                :disabled="work.frozen"
                class="w-full"
                data-testid="stock-operation-item"
              />
            </UFormField>
            <div v-if="work.poolPage > 1 || work.queries.pools.length >= 20" class="flex gap-2">
              <UButton
                label="上一批商品"
                size="xs"
                variant="outline"
                :disabled="work.frozen || work.poolPage <= 1"
                @click="work.changePoolPage(-1)"
              />
              <UButton
                label="下一批商品"
                size="xs"
                variant="outline"
                :disabled="work.frozen || work.queries.pools.length < 20"
                @click="work.changePoolPage(1)"
              />
            </div>
            <p v-if="selectedPool" class="text-xs text-muted">
              账面 {{ selectedPool.quantity }} · 已预留 {{ selectedPool.reserved }} · 库存序号 {{ selectedPool.sequence }}
            </p>
            <UFormField v-if="form.transfer" label="目标仓" required>
              <USelectMenu
                v-model="form.destinationId"
                :items="work.queries.destinations.map(row => ({ label: row.code + ' ' + row.name, value: row.id }))"
                value-key="value"
                :disabled="work.frozen"
                class="w-full"
                data-testid="stock-operation-destination"
              />
            </UFormField>
            <div class="grid gap-3 sm:grid-cols-2">
              <UFormField label="业务日期" required>
                <UInput
                  v-model="form.on"
                  type="date"
                  class="w-full"
                  data-testid="stock-operation-date"
                />
              </UFormField>
              <UFormField :label="form.transfer ? '调拨数量' : '盘点实数'" required>
                <UInput
                  v-model="form.quantity"
                  inputmode="decimal"
                  class="w-full"
                  data-testid="stock-operation-quantity"
                />
              </UFormField>
            </div>
            <UFormField label="原因" required>
              <UTextarea
                v-model="form.reason"
                maxlength="300"
                class="w-full"
                data-testid="stock-operation-reason"
              />
            </UFormField>
          </template>
        </div>
      </template>
      <template #footer>
        <UButton label="关闭" variant="ghost" @click="work.stockOpen = false" />
        <template v-if="work.selection">
          <UButton
            v-if="work.selection.canCancel"
            label="取消待复核单据"
            variant="outline"
            :disabled="work.frozen"
            data-testid="stock-operation-cancel"
            @click="work.decide('cancel')"
          />
          <UButton
            v-if="work.selection.canConfirm"
            :label="work.selection.destinationId ? '确认出库' : '确认盘点'"
            :disabled="work.frozen"
            data-testid="stock-operation-confirm"
            @click="work.decide('confirm')"
          />
          <UButton
            v-if="work.selection.canReceive"
            label="确认入库"
            :disabled="work.frozen"
            data-testid="stock-operation-receive"
            @click="work.decide('receive')"
          />
        </template>
        <UButton
          v-else
          label="提交复核"
          :disabled="work.frozen || !work.prepareAllowed"
          data-testid="stock-operation-submit"
          @click="work.prepare()"
        />
      </template>
    </USlideover>
  </div>
</template>
