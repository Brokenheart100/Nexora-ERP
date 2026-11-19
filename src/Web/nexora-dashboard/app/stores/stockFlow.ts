import { defineStore } from 'pinia'
import type {
  PurchaseOrder,
  SalesOrder,
  StockPermit,
  StockPermitExecution,
  StockPermitStatus,
  StockReturn,
  StockReturnLine
} from '~/mocks'
import { purchaseOrders, salesOrders, stockReturnSeeds } from '~/mocks'
import { useInventoryStore } from './inventory'
import { useReceivablesStore } from './receivables'
import { useSupplierTradeStore } from './supplierTrade'

export interface StockFlowResult {
  ok: boolean
  message: string
  execution?: StockPermitExecution
  stockReturn?: StockReturn
}

export interface StockReturnLineView extends StockReturnLine {
  returned: number
  pending: number
  returnable: number
}

function pad(value: number) {
  return String(value).padStart(2, '0')
}

function nowStamp() {
  const now = new Date()
  return now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate()) + ' ' + pad(now.getHours()) + ':' + pad(now.getMinutes())
}

function permitStatusOf(lines: { permitted: number, executed: number }[]): StockPermitStatus {
  const permitted = lines.reduce((sum, line) => sum + line.permitted, 0)
  const executed = lines.reduce((sum, line) => sum + line.executed, 0)
  if (executed <= 0) return 'pending'
  if (executed >= permitted) return 'completed'
  return 'partial'
}

function cloneReturn(row: StockReturn): StockReturn {
  return { ...row, lines: row.lines.map(line => ({ ...line })) }
}

function buildPermitSeeds() {
  const purchasePermits: StockPermit[] = purchaseOrders
    .filter((order: PurchaseOrder) => ['approved', 'partial', 'received', 'closed'].includes(order.status))
    .map((order: PurchaseOrder) => ({
      id: 'SP-IN-' + order.id.replace('PO-2026-', '') + '-01',
      workspaceId: order.workspaceId,
      direction: 'inbound' as const,
      sourceType: 'purchase' as const,
      sourceId: order.id,
      sourceNo: order.id,
      partner: order.supplier,
      status: permitStatusOf(order.lines.map(line => ({ permitted: line.quantity, executed: line.received }))),
      createdAt: order.orderedAt + ' 09:00',
      createdBy: '系统签发',
      note: '按采购订单剩余量签发入库许可。',
      lines: order.lines.map(line => ({ lineNo: line.lineNo, sku: line.sku, name: line.name, permitted: line.quantity, executed: line.received }))
    }))
  const salesPermits: StockPermit[] = salesOrders
    .filter((order: SalesOrder) => ['approved', 'partial', 'fulfilled', 'closed'].includes(order.status))
    .map((order: SalesOrder) => ({
      id: 'SP-OUT-' + order.id.replace('SO-2026-', '') + '-01',
      workspaceId: order.workspaceId,
      direction: 'outbound' as const,
      sourceType: 'sales' as const,
      sourceId: order.id,
      sourceNo: order.id,
      partner: order.customerName,
      status: permitStatusOf(order.lines.map(line => ({ permitted: line.quantity, executed: line.shipped }))),
      createdAt: order.orderedAt + ' 09:00',
      createdBy: '系统签发',
      note: '按销售订单剩余量签发出库许可。',
      lines: order.lines.map(line => ({ lineNo: line.lineNo, sku: line.sku, name: line.name, permitted: line.quantity, executed: line.shipped }))
    }))
  return [...purchasePermits, ...salesPermits]
}

function buildExecutionSeeds(permits: StockPermit[]) {
  const rows: StockPermitExecution[] = []
  for (const order of purchaseOrders) {
    const permit = permits.find(item => item.sourceType === 'purchase' && item.sourceId === order.id)
    if (!permit) continue
    for (const receipt of order.receipts ?? []) {
      rows.push({
        id: 'EXE-' + receipt.id,
        permitId: permit.id,
        sourceType: 'receipt',
        sourceId: receipt.id,
        warehouseId: 'wh-east',
        operator: receipt.receiver,
        at: receipt.receivedAt,
        lines: receipt.lines.map(line => ({
          lineNo: line.lineNo,
          sku: line.sku,
          name: line.name,
          quantity: line.quantity,
          unitPrice: Number(order.lines.find(item => item.lineNo === line.lineNo)?.unitPrice ?? 0)
        }))
      })
    }
  }
  for (const order of salesOrders) {
    const permit = permits.find(item => item.sourceType === 'sales' && item.sourceId === order.id)
    if (!permit) continue
    for (const fulfillment of order.fulfillments ?? []) {
      rows.push({
        id: 'EXE-' + fulfillment.id,
        permitId: permit.id,
        sourceType: 'fulfillment',
        sourceId: fulfillment.id,
        warehouseId: 'wh-east',
        operator: fulfillment.shipper,
        at: fulfillment.shippedAt,
        lines: fulfillment.lines.map(line => ({
          lineNo: line.lineNo,
          sku: line.sku,
          name: line.name,
          quantity: line.quantity,
          unitPrice: Number(order.lines.find(item => item.lineNo === line.lineNo)?.unitPrice ?? 0)
        }))
      })
    }
  }
  return rows
}

export const useStockFlowStore = defineStore('stock-flow', () => {
  const permits = ref<StockPermit[]>(buildPermitSeeds())
  const executions = ref<StockPermitExecution[]>(buildExecutionSeeds(permits.value))
  const returns = ref<StockReturn[]>(stockReturnSeeds.map(cloneReturn))

  const pendingPermits = computed(() => permits.value.filter(permit => permit.status === 'pending' || permit.status === 'partial'))

  function permitsFor(sourceType: 'purchase' | 'sales', sourceId: string) {
    return permits.value
      .filter(permit => permit.sourceType === sourceType && permit.sourceId === sourceId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  function executionsFor(permitId: string) {
    return executions.value
      .filter(execution => execution.permitId === permitId)
      .sort((a, b) => b.at.localeCompare(a.at))
  }

  function returnsFor(executionId: string) {
    return returns.value
      .filter(row => row.executionId === executionId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  function returnedQuantityOf(executionId: string, lineNo: number, status: 'confirmed' | 'pending') {
    return returns.value
      .filter(row => row.executionId === executionId && row.status === status)
      .flatMap(row => row.lines)
      .filter(line => line.lineNo === lineNo)
      .reduce((sum, line) => sum + line.quantity, 0)
  }

  function returnableLines(executionId: string): StockReturnLineView[] {
    const execution = executions.value.find(row => row.id === executionId)
    if (!execution) return []
    return execution.lines.map((line) => {
      const returned = returnedQuantityOf(executionId, line.lineNo, 'confirmed')
      const pending = returnedQuantityOf(executionId, line.lineNo, 'pending')
      return {
        lineNo: line.lineNo,
        sku: line.sku,
        name: line.name,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        returned,
        pending,
        returnable: Math.max(0, line.quantity - returned - pending)
      }
    })
  }

  function nextExecutionId() {
    const numbers = executions.value
      .map(row => row.id)
      .filter(id => id.startsWith('EXE-2026-'))
      .map(id => Number(id.replace('EXE-2026-', '')))
      .filter(value => Number.isFinite(value))
    const next = (numbers.length ? Math.max(...numbers) : 0) + 1
    return 'EXE-2026-' + String(next).padStart(4, '0')
  }

  function nextReturnId(direction: 'purchase' | 'sales') {
    const prefix = direction === 'sales' ? 'SR-2026-' : 'PR-2026-'
    const numbers = returns.value
      .map(row => row.id)
      .filter(id => id.startsWith(prefix))
      .map(id => Number(id.replace(prefix, '')))
      .filter(value => Number.isFinite(value))
    const next = (numbers.length ? Math.max(...numbers) : 1200) + 1
    return prefix + String(next)
  }

  function execute(permitId: string, input: {
    warehouseId: string
    operator: string
    at: string
    lines: { lineNo: number, quantity: number }[]
  }): StockFlowResult {
    const permit = permits.value.find(row => row.id === permitId)
    if (!permit) return { ok: false, message: '未找到收发货许可。' }
    if (permit.status === 'cancelled') return { ok: false, message: '许可已取消，不能继续执行。' }
    if (permit.status === 'closed') return { ok: false, message: '许可剩余额度已关闭。' }
    if (permit.status === 'completed') return { ok: false, message: '许可已执行完毕。' }
    if (!input.warehouseId) return { ok: false, message: '请选择仓库。' }
    if (!input.operator.trim()) return { ok: false, message: '请填写经办人。' }
    if (!input.at) return { ok: false, message: '请选择业务日期。' }
    const cleaned = input.lines.filter(line => line.quantity > 0)
    if (!cleaned.length) return { ok: false, message: '至少填写一行执行数量。' }
    const seen = new Set<number>()
    for (const line of cleaned) {
      if (seen.has(line.lineNo)) return { ok: false, message: '同一行不能重复执行。' }
      seen.add(line.lineNo)
      const permitLine = permit.lines.find(row => row.lineNo === line.lineNo)
      if (!permitLine) return { ok: false, message: '明细行不属于该许可。' }
      if (!Number.isInteger(line.quantity) || line.quantity <= 0) return { ok: false, message: '执行数量必须是大于 0 的整数。' }
      const remaining = permitLine.permitted - permitLine.executed
      if (line.quantity > remaining) return { ok: false, message: '第 ' + line.lineNo + ' 行超过许可剩余 ' + remaining + '。' }
    }
    const order = permit.sourceType === 'purchase'
      ? purchaseOrders.find(row => row.id === permit.sourceId)
      : salesOrders.find(row => row.id === permit.sourceId)
    const execution: StockPermitExecution = {
      id: nextExecutionId(),
      permitId: permit.id,
      sourceType: 'manual',
      sourceId: permit.sourceNo,
      warehouseId: input.warehouseId,
      operator: input.operator.trim(),
      at: input.at,
      lines: cleaned.map((line) => {
        const permitLine = permit.lines.find(row => row.lineNo === line.lineNo)!
        const sourceLine = order?.lines.find(row => row.lineNo === line.lineNo)
        return {
          lineNo: line.lineNo,
          sku: permitLine.sku,
          name: permitLine.name,
          quantity: line.quantity,
          unitPrice: sourceLine && 'unitPrice' in sourceLine ? Number(sourceLine.unitPrice) : 0
        }
      })
    }
    for (const line of cleaned) {
      const permitLine = permit.lines.find(row => row.lineNo === line.lineNo)!
      permitLine.executed += line.quantity
    }
    permit.status = permitStatusOf(permit.lines)
    executions.value = [execution, ...executions.value]
    return { ok: true, message: '已登记执行 ' + execution.id + '，许可剩余量同步扣减。', execution }
  }

  function cancelPermit(permitId: string): StockFlowResult {
    const permit = permits.value.find(row => row.id === permitId)
    if (!permit) return { ok: false, message: '未找到收发货许可。' }
    if (permit.status !== 'pending') return { ok: false, message: '仅未执行的许可可以取消；已有执行记录请关闭剩余额度。' }
    permit.status = 'cancelled'
    return { ok: true, message: '许可已取消，订单未执行额度释放。' }
  }

  function closePermit(permitId: string): StockFlowResult {
    const permit = permits.value.find(row => row.id === permitId)
    if (!permit) return { ok: false, message: '未找到收发货许可。' }
    if (permit.status !== 'pending' && permit.status !== 'partial') return { ok: false, message: '当前许可状态不能关闭剩余额度。' }
    permit.status = 'closed'
    return { ok: true, message: '许可剩余额度已关闭，已执行记录保留。' }
  }

  function createReturn(executionId: string, lines: { lineNo: number, quantity: number }[], reason: string): StockFlowResult {
    if (!reason.trim()) return { ok: false, message: '请填写退货原因。' }
    const execution = executions.value.find(row => row.id === executionId)
    if (!execution) return { ok: false, message: '未找到原收发货记录。' }
    const permit = permits.value.find(row => row.id === execution.permitId)
    if (!permit) return { ok: false, message: '原记录缺少许可信息。' }
    const available = returnableLines(executionId)
    const cleaned = lines.filter(line => line.quantity > 0)
    if (!cleaned.length) return { ok: false, message: '至少填写一行退货数量。' }
    for (const line of cleaned) {
      const view = available.find(row => row.lineNo === line.lineNo)
      if (!view) return { ok: false, message: '明细行不属于原记录。' }
      if (!Number.isInteger(line.quantity) || line.quantity <= 0) return { ok: false, message: '退货数量必须是大于 0 的整数。' }
      if (line.quantity > view.returnable) return { ok: false, message: '第 ' + line.lineNo + ' 行超过可退数量 ' + view.returnable + '。' }
    }
    const direction = permit.sourceType === 'sales' ? 'sales' as const : 'purchase' as const
    const stockReturn: StockReturn = {
      id: nextReturnId(direction),
      workspaceId: permit.workspaceId,
      direction,
      executionId,
      sourceType: execution.sourceType === 'fulfillment' ? 'fulfillment' : 'receipt',
      sourceId: execution.sourceId,
      orderId: permit.sourceId,
      partner: permit.partner,
      warehouseId: execution.warehouseId,
      status: 'pending',
      reason: reason.trim(),
      createdAt: nowStamp(),
      lines: cleaned.map((line) => {
        const view = available.find(row => row.lineNo === line.lineNo)!
        return { lineNo: line.lineNo, sku: view.sku, name: view.name, quantity: line.quantity, unitPrice: view.unitPrice }
      })
    }
    returns.value = [stockReturn, ...returns.value]
    return { ok: true, message: '已创建退货单 ' + stockReturn.id + '，确认后生成关联贷项。', stockReturn }
  }

  /** 同一退货行已经生成过的贷项数量，避免重复确认或多次退货重复冲减开票额度。 */
  function creditedReturnQuantity(stockReturn: StockReturn, lineNo: number) {
    if (stockReturn.direction === 'sales') {
      return useReceivablesStore().credits
        .filter(credit => credit.orderId === stockReturn.orderId && credit.lineNo === lineNo)
        .reduce((sum, credit) => sum + credit.quantity, 0)
    }
    return useSupplierTradeStore().credits
      .filter(credit => credit.receiptId === stockReturn.sourceId && credit.receiptLineNo === lineNo)
      .reduce((sum, credit) => sum + credit.quantity, 0)
  }

  /**
   * 确认退货：按原明细开票状态拆分，已开票部分生成贷项，未开票部分冲减可匹配/可开票数量，
   * 同时把退货数量写回库存位置与流水。库存先行校验，避免账务已生成但库存不足。
   */
  function confirmReturn(returnId: string): StockFlowResult {
    const stockReturn = returns.value.find(row => row.id === returnId)
    if (!stockReturn) return { ok: false, message: '未找到退货单。' }
    if (stockReturn.status !== 'pending') return { ok: false, message: '仅待确认退货可以确认。' }

    const inventory = useInventoryStore()
    const receivables = useReceivablesStore()
    const supplier = useSupplierTradeStore()
    const stockCheck = inventory.canApplyReturn(stockReturn)
    if (!stockCheck.ok) return { ok: false, message: stockCheck.message }

    const invoicedLines: StockReturnLine[] = []
    for (const line of stockReturn.lines) {
      const billed = stockReturn.direction === 'sales'
        ? receivables.invoicedQuantityOf(stockReturn.orderId, line.lineNo)
        : supplier.billedQuantityOf(stockReturn.sourceId, line.lineNo)
      const credited = creditedReturnQuantity(stockReturn, line.lineNo)
      const invoiced = Math.min(line.quantity, Math.max(0, billed - credited))
      line.invoicedQuantity = invoiced
      line.uninvoicedQuantity = line.quantity - invoiced
      if (invoiced > 0) invoicedLines.push(line)
    }

    const confirmedAt = nowStamp()
    const stockResult = inventory.applyReturn({ ...stockReturn, status: 'confirmed', confirmedAt })
    if (!stockResult.ok) return { ok: false, message: stockResult.message }

    let creditId = ''
    if (invoicedLines.length && stockReturn.direction === 'sales') {
      const invoice = receivables.invoices.find(row => row.sourceOrderId === stockReturn.orderId && row.status !== 'cancelled')
      const result = receivables.createCreditFromReturn({
        workspaceId: stockReturn.workspaceId,
        customerName: stockReturn.partner,
        invoiceId: invoice?.id ?? '',
        orderId: stockReturn.orderId,
        fulfillmentId: stockReturn.sourceId,
        reason: stockReturn.reason,
        confirmedAt,
        lines: invoicedLines.map(line => ({
          lineNo: line.lineNo,
          sku: line.sku,
          name: line.name,
          quantity: line.invoicedQuantity!,
          unitPrice: line.unitPrice
        }))
      })
      if (!result.ok) return { ok: false, message: result.message }
      creditId = result.creditId ?? ''
    } else if (invoicedLines.length) {
      const billId = supplier.billIdWithReceiptLine(stockReturn.sourceId, invoicedLines[0]!.lineNo)
        || supplier.bills.find(row => row.orderId === stockReturn.orderId)?.id
        || ''
      const result = supplier.createCreditFromReturn({
        workspaceId: stockReturn.workspaceId,
        billId,
        orderId: stockReturn.orderId,
        receiptId: stockReturn.sourceId,
        reason: stockReturn.reason,
        confirmedAt,
        lines: invoicedLines.map(line => ({
          lineNo: line.lineNo,
          sku: line.sku,
          name: line.name,
          quantity: line.invoicedQuantity!,
          unitPrice: line.unitPrice
        }))
      })
      if (!result.ok) return { ok: false, message: result.message }
      creditId = result.creditId ?? ''
    }

    let uninvoicedTotal = 0
    for (const line of stockReturn.lines) {
      if (!line.uninvoicedQuantity) continue
      uninvoicedTotal += line.uninvoicedQuantity
      const result = stockReturn.direction === 'sales'
        ? receivables.recordReturnReduction(stockReturn.orderId, line.lineNo, line.uninvoicedQuantity)
        : supplier.recordReturnReduction(stockReturn.sourceId, line.lineNo, line.uninvoicedQuantity)
      if (!result.ok) return { ok: false, message: result.message }
    }

    stockReturn.status = 'confirmed'
    stockReturn.confirmedAt = confirmedAt
    stockReturn.creditId = creditId || undefined

    const invoicedTotal = invoicedLines.reduce((sum, line) => sum + (line.invoicedQuantity ?? 0), 0)
    const balanceText = stockReturn.lines.map((line) => {
      const unit = inventory.positions.find(position => position.sku === line.sku)?.unit ?? '件'
      return line.name + ' 结存 ' + inventory.totalQuantityIn(stockReturn.warehouseId, line.sku) + ' ' + unit
    }).join('、')
    let message = '退货 ' + stockReturn.id + ' 已确认：' + balanceText + '。'
    message += invoicedTotal > 0 ? '已开票 ' + invoicedTotal + ' 件生成贷项 ' + creditId + '。' : '本单没有已开票数量，不生成贷项。'
    if (uninvoicedTotal > 0) message += '未开票 ' + uninvoicedTotal + ' 件已冲减可匹配数量。'
    return { ok: true, message, stockReturn }
  }

  function cancelReturn(returnId: string): StockFlowResult {
    const stockReturn = returns.value.find(row => row.id === returnId)
    if (!stockReturn) return { ok: false, message: '未找到退货单。' }
    if (stockReturn.status !== 'pending') return { ok: false, message: '仅待确认退货可以取消。' }
    stockReturn.status = 'cancelled'
    return { ok: true, message: '退货单已取消，退货数量释放。', stockReturn }
  }

  function reset() {
    permits.value = buildPermitSeeds()
    executions.value = buildExecutionSeeds(permits.value)
    returns.value = stockReturnSeeds.map(cloneReturn)
  }

  return {
    permits,
    executions,
    returns,
    pendingPermits,
    permitsFor,
    executionsFor,
    returnsFor,
    returnableLines,
    execute,
    cancelPermit,
    closePermit,
    createReturn,
    confirmReturn,
    cancelReturn,
    reset
  }
})
