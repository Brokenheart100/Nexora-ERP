using Nexora.BuildingBlocks.Application;
using Nexora.Inventory.Domain;
using Nexora.Purchasing.Contracts;

namespace Nexora.Inventory.Application;

public sealed partial class InventoryUseCases
{
    public async Task<ReceiptProgressV1> AcceptAsync(ReceiptTicketV1 ticket, bool fence, CancellationToken ct)
    {
        var scope = new ResourceScope(ticket.TenantId, ticket.WorkspaceId);
        await store.LockAsync(scope, ct);
        if (await store.WarehouseAsync(scope, ticket.WarehouseId, ct) is null) throw new ResourceNotFoundException();
        var terms = Terms(ticket);
        var execution = await store.ExecutionAsync(scope, ticket.PermitId, ct);
        if (execution is null)
        {
            execution = new(terms);
            store.Add(execution);
        }
        else if (execution.Terms != terms) throw new BusinessConflictException("Permit identity was reused with different terms.");
        if (fence) execution.Fence();
        return Progress(execution);
    }

    public async Task<ReceiptApplied> ReceiveAsync(ReceiveStock command, CancellationToken ct)
    {
        var current = await authority.AccessAsync(command.WorkspaceId, ct);
        var audit = await BeginAsync(current, command.OperationId, command, ct);
        var execution = await store.ExecutionAsync(current.Scope, command.PermitId, ct) ?? throw new ResourceNotFoundException();
        var terms = execution.Terms;
        var warehouse = await store.WarehouseAsync(current.Scope, terms.WarehouseId, ct) ?? throw new ResourceNotFoundException();
        if (warehouse.ReceiverId != current.MemberId) throw new AccessDeniedException();
        if (audit is not null) return new(Result(audit), null, null);
        if (execution.Revision != command.ExpectedRevision) throw new RevisionConflictException("Receipt permit version changed.");
        var quantity = Parse(command.Quantity);
        var cost = execution.Receive(quantity, command.On);
        var pool = await store.PoolAsync(current.Scope, terms.WarehouseId, terms.ItemId, ct);
        if (pool is null)
        {
            pool = new(terms);
            store.Add(pool);
        }
        pool.Receive(terms, quantity, cost);
        var now = clock.GetUtcNow();
        var movement = new StockMovement(Guid.CreateVersion7(), terms.TenantId, terms.WorkspaceId, terms.WarehouseId, terms.ItemId,
            execution.Id, pool.Sequence, command.On, quantity, cost, now);
        store.Add(movement);
        var change = Record(current, command.OperationId, command, movement.Id, execution.Revision);
        return new(change, Progress(execution), new(movement.Id, terms.TenantId, terms.WorkspaceId, terms.WarehouseId,
            terms.ItemId, terms.OrderId, terms.LineId, terms.PermitId, terms.SupplierId, pool.Sequence, command.On, Format(quantity), Format(cost), terms.Currency, now));
    }

    public async Task<StockReturnView[]> ReturnsAsync(Guid workspaceId, Guid warehouseId, CancellationToken ct, bool sales = false)
    {
        var current = await authority.AccessAsync(workspaceId, ct);
        var warehouse = await RequireWarehouseAsync(current, warehouseId, !sales, ct, salesAccess: sales, stockRead: true);
        return (await store.ReturnsAsync(current.Scope, warehouseId, ct, sales)).Select(x => new StockReturnView(x.Id, x.OriginalId, x.On,
            Format(x.Quantity), x.Reason, x.MovementId, x.Cancelled, warehouse.ReceiverId == current.MemberId && x.ApproverId != current.MemberId)).ToArray();
    }

    public async Task<InventoryChange> AuthorizeReturnAsync(AuthorizeStockReturn command, CancellationToken ct)
    {
        var current = await authority.AccessAsync(command.WorkspaceId, ct);
        if (!current.ApprovePurchases) throw new AccessDeniedException();
        var audit = await BeginAsync(current, command.OperationId, command, ct);
        if (audit is not null) return Result(audit);
        var original = await store.MovementAsync(current.Scope, command.MovementId, ct) ?? throw new ResourceNotFoundException();
        if (await store.ExecutionAsync(current.Scope, original.PermitId, ct) is null) throw new ResourceNotFoundException();
        var pending = new StockReturn(original, current.MemberId, command.On, Parse(command.Quantity), command.Reason?.Trim() ?? "");
        var occupied = await store.ReturnedAsync(current.Scope, original.Id, ct) + await store.PendingReturnsAsync(current.Scope, original.Id, ct);
        if (pending.Quantity > original.Quantity - occupied)
            throw new StockRuleException("The return exceeds the quantity of the original receipt.");
        store.Add(pending);
        return Record(current, command.OperationId, command, pending.Id, 1);
    }

    public async Task<(InventoryChange, InventoryCostedV1?)> DecideReturnAsync(DecideStockReturn command, CancellationToken ct)
    {
        var current = await authority.AccessAsync(command.WorkspaceId, ct);
        var audit = await BeginAsync(current, command.OperationId, command, ct);
        var pending = await store.ReturnAsync(current.Scope, command.ReturnId, ct) ?? throw new ResourceNotFoundException();
        if (pending.IsSales) throw new ResourceNotFoundException();
        if (!command.Confirm)
        {
            if (!current.ApprovePurchases) throw new AccessDeniedException();
            if (audit is not null) return (Result(audit), null);
            pending.Cancel();
            return (Record(current, command.OperationId, command, pending.Id, 2), null);
        }
        var warehouse = await store.WarehouseAsync(current.Scope, pending.WarehouseId, ct) ?? throw new ResourceNotFoundException();
        if (warehouse.ReceiverId != current.MemberId) throw new AccessDeniedException();
        if (audit is not null) return (Result(audit), null);
        var original = await store.MovementAsync(current.Scope, pending.OriginalId, ct) ?? throw new ResourceNotFoundException();
        var execution = await store.ExecutionAsync(current.Scope, original.PermitId, ct) ?? throw new ResourceNotFoundException();
        var terms = execution.Terms;
        var pool = await store.PoolAsync(current.Scope, original.WarehouseId, original.ItemId, ct) ?? throw new ResourceNotFoundException();
        var id = Guid.CreateVersion7();
        pending.Confirm(current.MemberId, id);
        var cost = pool.Issue(pending.Quantity, terms.MinorUnits);
        var now = clock.GetUtcNow();
        var movement = new StockMovement(id, terms.TenantId, terms.WorkspaceId, terms.WarehouseId, terms.ItemId,
            execution.Id, pool.Sequence, pending.On, -pending.Quantity, -cost, now, original.Id, pending.Reason);
        store.Add(movement);
        var change = Record(current, command.OperationId, command, movement.Id, pool.Sequence);
        return (change, new(movement.Id, terms.TenantId, terms.WorkspaceId, terms.WarehouseId, terms.ItemId, terms.OrderId, terms.LineId,
            execution.Id, terms.SupplierId, pool.Sequence, pending.On, Format(-pending.Quantity), Format(-cost), terms.Currency, now, original.Id));
    }

    public async Task<InventoryCostedV1> ApplyVarianceAsync(PurchaseVarianceV1 variance, CancellationToken ct)
    {
        var scope = new ResourceScope(variance.TenantId, variance.WorkspaceId);
        await store.LockAsync(scope, ct);
        var original = await store.MovementAsync(scope, variance.ReceiptId, ct) ?? throw new ResourceNotFoundException();
        var execution = await store.ExecutionAsync(scope, original.PermitId, ct) ?? throw new ResourceNotFoundException();
        var terms = execution.Terms;
        var billed = Parse(variance.Quantity);
        var amount = Parse(variance.Amount);
        var sourceQuantity = variance.SourceQuantity is null ? original.Quantity : Parse(variance.SourceQuantity);
        if (original.Quantity <= 0 || billed <= 0 || billed > sourceQuantity || sourceQuantity > original.Quantity
            || variance.Currency != terms.Currency || variance.On < original.On
            || Math.Round(amount, terms.MinorUnits) != amount)
            throw new StockRuleException("Variance differs from the referenced receipt.");
        var adjustmentId = variance.AdjustmentId ?? variance.BillId;
        var movement = await store.MovementAsync(scope, adjustmentId, ct);
        if (movement is null)
        {
            var pool = await store.PoolAsync(scope, original.WarehouseId, original.ItemId, ct) ?? throw new ResourceNotFoundException();
            var remaining = Math.Min(sourceQuantity, Math.Min(pool.Quantity, original.Quantity - await store.ReturnedAsync(scope, original.Id, ct)));
            var cost = pool.AdjustPurchaseCost(amount, sourceQuantity, remaining, terms.MinorUnits);
            movement = new(adjustmentId, scope.TenantId, scope.WorkspaceId, original.WarehouseId, original.ItemId, terms.PermitId,
                pool.Sequence, variance.On, 0, cost, clock.GetUtcNow(), Reason: "Purchase price variance");
            store.Add(movement);
        }
        return new(movement.Id, scope.TenantId, scope.WorkspaceId, original.WarehouseId, original.ItemId, terms.OrderId, terms.LineId,
            terms.PermitId, terms.SupplierId, movement.Sequence, variance.On, "0", Format(movement.Cost), terms.Currency,
            movement.OccurredAtUtc, AdjustmentForBillId: variance.BillId);
    }
}
