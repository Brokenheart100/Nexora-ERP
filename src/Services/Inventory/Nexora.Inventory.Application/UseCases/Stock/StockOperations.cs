using Nexora.BuildingBlocks.Application;
using Nexora.Inventory.Domain;
using Nexora.Purchasing.Contracts;

namespace Nexora.Inventory.Application;

public sealed partial class InventoryUseCases
{
    public async Task<TransferDestination[]> DestinationsAsync(Guid workspaceId, Guid warehouseId, CancellationToken ct)
    {
        var current = await authority.AccessAsync(workspaceId, ct);
        var source = await RequireWarehouseAsync(current, warehouseId, false, ct);
        if (source.ReceiverId != current.MemberId) throw new AccessDeniedException();
        return (await store.WarehousesAsync(current.Scope, null, ct)).Where(x => x.Id != source.Id && x.ReceiverId is not null && x.ReceiverId != current.MemberId)
            .Select(x => new TransferDestination(x.Id, x.Code, x.Name)).ToArray();
    }

    public async Task<StockOperationView[]> OperationsAsync(Guid workspaceId, Guid warehouseId, IStockOperations operations, CancellationToken ct)
    {
        var current = await authority.AccessAsync(workspaceId, ct);
        var warehouse = await RequireWarehouseAsync(current, warehouseId, false, ct);
        var rows = await operations.ListAsync(current.Scope, warehouseId, ct);
        return rows.Select(x => View(x, current, x.DestinationId == warehouseId && warehouse.ReceiverId == current.MemberId)).ToArray();
    }

    public async Task<StockOperationView> OperationAsync(Guid workspaceId, Guid warehouseId, Guid id, IStockOperations operations, CancellationToken ct)
    {
        var current = await authority.AccessAsync(workspaceId, ct);
        var warehouse = await RequireWarehouseAsync(current, warehouseId, false, ct);
        var operation = await operations.FindAsync(current.Scope, id, ct) ?? throw new ResourceNotFoundException();
        if (operation.WarehouseId != warehouseId && operation.DestinationId != warehouseId) throw new ResourceNotFoundException();
        return View(operation, current, operation.DestinationId == warehouseId && warehouse.ReceiverId == current.MemberId);
    }

    public async Task<InventoryChange> PrepareOperationAsync(PrepareStockOperation command, IStockOperations operations, CancellationToken ct)
    {
        var current = await authority.AccessAsync(command.WorkspaceId, ct);
        var replay = await BeginAsync(current, command.OperationId, command, ct);
        var warehouse = await RequireWarehouseAsync(current, command.WarehouseId, false, ct);
        if (warehouse.ReceiverId != current.MemberId) throw new AccessDeniedException();
        if (replay is not null) return Result(replay);
        var pool = await store.PoolAsync(current.Scope, warehouse.Id, command.ItemId, ct) ?? throw new ResourceNotFoundException();
        if (command.ExpectedSequence != pool.Sequence) throw new RevisionConflictException("The source position changed.");
        if (command.DestinationId is Guid destination)
        {
            var target = await store.WarehouseAsync(current.Scope, destination, ct) ?? throw new ResourceNotFoundException();
            if (target.ReceiverId is null || target.ReceiverId == current.MemberId)
                throw new StockRuleException("Assign an independent destination receiver before transferring stock.");
        }
        await DemandDateAsync(command.On, pool, operations, ct);
        var pending = new StockOperation(pool, current.MemberId, command.DestinationId, command.On, Parse(command.Quantity), command.Reason?.Trim() ?? "");
        operations.Add(pending);
        return Record(current, command.OperationId, command, pending.Id, pending.Version);
    }

    public async Task<(InventoryChange Result, StockAdjustedV1[] Facts)> DecideOperationAsync(DecideStockOperation command,
        IStockOperations operations, CancellationToken ct)
    {
        var current = await authority.AccessAsync(command.WorkspaceId, ct);
        var replay = await BeginAsync(current, command.OperationId, command, ct);
        var pending = await operations.FindAsync(current.Scope, command.Id, ct) ?? throw new ResourceNotFoundException();
        var destination = pending.DestinationId is Guid target
            ? await store.WarehouseAsync(current.Scope, target, ct) ?? throw new ResourceNotFoundException() : null;
        var canConfirm = current.MemberId != pending.MakerId && (current.Manage || destination?.ReceiverId == current.MemberId);
        var canCancel = current.Manage || current.MemberId == pending.MakerId;
        if (command.Confirm ? !canConfirm : !canCancel) throw new AccessDeniedException();
        if (replay is not null) return (Result(replay), []);
        if (command.ExpectedVersion != pending.Version) throw new RevisionConflictException("The operation changed.");
        if (!pending.Pending) throw new BusinessConflictException("The operation is no longer pending.");
        if (!command.Confirm)
        {
            pending.Cancel();
            return (Record(current, command.OperationId, command, pending.Id, pending.Version), []);
        }
        if (destination is not null && (destination.ReceiverId is null || destination.ReceiverId == pending.MakerId))
            throw new StockRuleException("Assign an independent destination receiver before transferring stock.");
        var scope = current.Scope;
        var pool = await store.PoolAsync(scope, pending.WarehouseId, pending.ItemId, ct) ?? throw new ResourceNotFoundException();
        await DemandDateAsync(pending.On, pool, operations, ct);
        var quantity = destination is null ? pending.Quantity - pending.BookQuantity : -pending.Quantity;
        var id = quantity == 0 ? (Guid?)null : Guid.CreateVersion7();
        pending.Confirm(current.MemberId, pool, id);
        var result = Record(current, command.OperationId, command, pending.Id, pending.Version);
        if (id is null) return (result, []);
        var now = clock.GetUtcNow();
        var minorUnits = pool.Currency == "JPY" ? 0 : 2;
        var cost = quantity < 0 ? -pool.Issue(-quantity, minorUnits) : Gain(pool, quantity, minorUnits);
        if (Math.Abs(cost) > 1_000_000_000_000m) throw new StockRuleException("The inventory value exceeds the posting limit.");
        if (destination is not null) pending.RecordDispatch(-cost);
        return (result, [RecordMovement(pending, pool, id.Value, pending.On, quantity, cost, now)]);
    }

    public async Task<(InventoryChange Result, StockAdjustedV1? Fact)> ReceiveTransferAsync(ReceiveStockTransfer command,
        IStockOperations operations, CancellationToken ct)
    {
        var current = await authority.AccessAsync(command.WorkspaceId, ct);
        var replay = await BeginAsync(current, command.OperationId, command, ct);
        var scope = current.Scope;
        var pending = await operations.FindAsync(scope, command.Id, ct) ?? throw new ResourceNotFoundException();
        if (pending.DestinationId is not Guid target) throw new ResourceNotFoundException();
        var destination = await store.WarehouseAsync(scope, target, ct) ?? throw new ResourceNotFoundException();
        if (destination.ReceiverId != current.MemberId || pending.MakerId == current.MemberId) throw new AccessDeniedException();
        if (replay is not null) return (Result(replay), null);
        if (pending.Version != command.ExpectedVersion) throw new RevisionConflictException("The transfer changed.");
        if (!pending.InTransit) throw new BusinessConflictException("The transfer is no longer in transit.");
        var pool = await store.PoolAsync(scope, pending.WarehouseId, pending.ItemId, ct) ?? throw new ResourceNotFoundException();
        var received = await store.PoolAsync(scope, destination.Id, pool.ItemId, ct);
        if (received is null)
        {
            received = new CostPool(pool, destination.Id);
            store.Add(received);
        }
        if (received.UnitId != pool.UnitId || received.Currency != pool.Currency)
            throw new StockRuleException("Warehouse positions use different units or currencies.");
        await DemandDateAsync(command.On, received, operations, ct);
        var arrival = Guid.CreateVersion7();
        var cost = pending.TransitCost!.Value;
        pending.Receive(current.MemberId, arrival, command.On);
        received.Restock(pending.Quantity, cost);
        var fact = RecordMovement(pending, received, arrival, command.On, pending.Quantity, cost, clock.GetUtcNow());
        return (Record(current, command.OperationId, command, pending.Id, pending.Version), fact);
    }

    private StockAdjustedV1 RecordMovement(StockOperation pending, CostPool position, Guid id, DateOnly on,
        decimal quantity, decimal cost, DateTimeOffset now)
    {
        store.Add(new StockMovement(id, position.TenantId, position.WorkspaceId, position.WarehouseId, position.ItemId,
            pending.Id, position.Sequence, on, quantity, cost, now, Reason: pending.Reason));
        return new(id, pending.Id, position.TenantId, position.WorkspaceId, position.WarehouseId, position.ItemId,
            position.Sequence, on, Format(quantity), Format(cost), position.Currency, pending.DestinationId is not null);
    }

    private static decimal Gain(CostPool pool, decimal quantity, int minorUnits)
    {
        if (pool.Quantity == 0) throw new StockRuleException("No cost is established for this count.");
        var cost = Math.Round(pool.Value / pool.Quantity * quantity, minorUnits, MidpointRounding.AwayFromZero);
        if (cost > 1_000_000_000_000m) throw new StockRuleException("The count gain exceeds the posting limit.");
        pool.Restock(quantity, cost);
        return cost;
    }

    private static async Task DemandDateAsync(DateOnly date, CostPool pool, IStockOperations operations, CancellationToken ct)
    {
        var latest = await operations.LatestMovementAsync(new(pool.TenantId, pool.WorkspaceId), pool.WarehouseId, pool.ItemId, ct);
        if (latest > date) throw new StockRuleException("The date precedes an existing movement for this position.");
    }

    private static StockOperationView View(StockOperation x, InventoryAccess actor, bool atDestination) => new(x.Id, x.WarehouseId,
        x.ItemId, x.DestinationId, x.On, Format(x.Quantity), Format(x.BookQuantity), x.Reason,
        x.Cancelled ? "cancelled" : x.Pending ? "pending" : x.InTransit ? "in-transit" : "confirmed",
        x.Pending && x.MakerId != actor.MemberId && (actor.Manage || atDestination),
        x.Pending && (actor.Manage || x.MakerId == actor.MemberId), x.Version, x.MovementId, x.DestinationMovementId,
        x.TransitCost is decimal cost ? Format(cost) : null, x.ReceivedOn, x.InTransit && x.MakerId != actor.MemberId && atDestination);
}
