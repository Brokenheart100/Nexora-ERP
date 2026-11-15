using Nexora.BuildingBlocks.Application;
using Nexora.Inventory.Domain;
using Nexora.Sales.Contracts;

namespace Nexora.Inventory.Application;

public sealed partial class InventoryUseCases
{
    private static ShipmentTerms ShipmentTermsOf(FulfillmentTicketV1 ticket)
    {
        var quantity = Parse(ticket.Quantity);
        var price = Parse(ticket.UnitPrice);
        if (quantity is <= 0 or > 1_000_000m || Math.Round(quantity, 6) != quantity || price is <= 0 or > 10_000_000m
            || Math.Round(price, 6) != price || ticket.ApprovedVersion <= 0
            || ticket.Currency is not ("CNY" or "USD" or "EUR" or "JPY") || ticket.MinorUnits != (ticket.Currency == "JPY" ? 0 : 2))
            throw new ArgumentException("Invalid fulfillment ticket.");
        return new ShipmentTerms(ticket.TenantId, ticket.WorkspaceId, ticket.PermitId, ticket.OrderId, ticket.LineId,
            ticket.ApprovedVersion, ticket.WarehouseId, ticket.ItemId, ticket.UnitId, ticket.CustomerId, ticket.OrderDate,
            quantity, price, ticket.Currency, ticket.MinorUnits, ticket.ExpiresAtUtc, ticket.ItemName, ticket.CustomerName);
    }

    public async Task<(FulfillmentProgressV1[] Progress, ExpireSalesReservation[] Expiries)> ReserveAsync(
        FulfillmentTicketV1[] tickets, ISalesStock sales, CancellationToken ct)
    {
        if (tickets.Length is < 1 or > 50) throw new ArgumentException("Invalid fulfillment batch.");
        var batch = tickets.Select(ShipmentTermsOf).ToArray();
        var first = batch[0];
        if (batch.Any(x => x.TenantId != first.TenantId || x.WorkspaceId != first.WorkspaceId || x.OrderId != first.OrderId
            || x.WarehouseId != first.WarehouseId || x.ExpiresAtUtc != first.ExpiresAtUtc)
            || batch.Select(x => x.ItemId).Distinct().Count() != batch.Length
            || batch.Select(x => x.PermitId).Distinct().Count() != batch.Length)
            throw new ArgumentException("Fulfillment lines must be distinct and share a warehouse, order and deadline.");

        var scope = new ResourceScope(first.TenantId, first.WorkspaceId);
        await store.LockAsync(scope, ct);
        var existing = new Dictionary<Guid, SalesReservation>();
        foreach (var terms in batch)
        {
            var row = await sales.FindAsync(scope, terms.PermitId, ct);
            if (row is null) continue;
            if (row.Terms != terms) throw new StockRuleException("Fulfillment ticket differs from the recorded terms.");
            existing.Add(row.Id, row);
        }

        var warehouse = await store.WarehouseAsync(scope, first.WarehouseId, ct);
        var held = existing.Count == 0 && warehouse?.ReceiverId is not null && clock.GetUtcNow() < first.ExpiresAtUtc;
        var pools = new Dictionary<Guid, CostPool?>();
        foreach (var terms in batch)
        {
            var pool = await store.PoolAsync(scope, terms.WarehouseId, terms.ItemId, ct);
            pools.Add(terms.ItemId, pool);
            held &= pool?.CanReserve(terms.UnitId, terms.Currency, terms.Quantity) == true;
        }
        var progress = new List<FulfillmentProgressV1>();
        var expiries = new List<ExpireSalesReservation>();
        foreach (var terms in batch)
        {
            if (!existing.TryGetValue(terms.PermitId, out var reservation))
            {
                reservation = new SalesReservation(terms, held);
                if (held)
                {
                    if (!pools[terms.ItemId]!.TryReserve(terms.UnitId, terms.Currency, terms.Quantity))
                        throw new StockRuleException("Available stock changed during reservation.");
                    expiries.Add(new(terms.TenantId, terms.WorkspaceId, terms.PermitId));
                }
                sales.Add(reservation);
            }
            else if (clock.GetUtcNow() >= terms.ExpiresAtUtc && !reservation.Fenced && reservation.Remaining > 0)
                reservation.Release(pools[terms.ItemId]);
            progress.Add(SalesProgress(reservation));
        }
        return (progress.ToArray(), expiries.ToArray());
    }

    public async Task<FulfillmentProgressV1> FenceAsync(FulfillmentTicketV1 ticket, ISalesStock sales, CancellationToken ct)
    {
        var terms = ShipmentTermsOf(ticket);
        var scope = new ResourceScope(terms.TenantId, terms.WorkspaceId);
        await store.LockAsync(scope, ct);
        var current = await sales.FindAsync(scope, terms.PermitId, ct);
        if (current is null)
        {
            current = new SalesReservation(terms, false);
            sales.Add(current);
        }
        else
        {
            if (current.Terms != terms) throw new StockRuleException("Fulfillment ticket differs from the recorded terms.");
            if (!current.Fenced && current.Remaining > 0)
                current.Release(await store.PoolAsync(scope, terms.WarehouseId, terms.ItemId, ct));
        }
        return SalesProgress(current);
    }

    public async Task<FulfillmentProgressV1?> ExpireAsync(ExpireSalesReservation command, ISalesStock sales, CancellationToken ct)
    {
        var scope = new ResourceScope(command.TenantId, command.WorkspaceId);
        await store.LockAsync(scope, ct);
        var reservation = await sales.FindAsync(scope, command.PermitId, ct);
        if (reservation is null || reservation.Fenced || reservation.Remaining == 0
            || clock.GetUtcNow() < reservation.Terms.ExpiresAtUtc) return null;
        var pool = await store.PoolAsync(scope, reservation.WarehouseId, reservation.Terms.ItemId, ct);
        return reservation.Release(pool) ? SalesProgress(reservation) : null;
    }

    public async Task<ShipmentView[]> ShipmentsAsync(Guid workspaceId, Guid warehouseId, ISalesStock sales, CancellationToken ct)
    {
        var current = await authority.AccessAsync(workspaceId, ct);
        var warehouse = await RequireWarehouseAsync(current, warehouseId, false, ct, salesAccess: true, stockRead: true);
        var now = clock.GetUtcNow();
        return (await sales.ListAsync(current.Scope, warehouseId, ct)).Select(x => new ShipmentView(x.Id, x.Terms.OrderId,
            x.Terms.ItemId, x.Terms.ItemName, Format(x.Terms.Quantity), Format(x.Executed), x.Revision, x.Fenced,
            x.Terms.ExpiresAtUtc, warehouse.ReceiverId == current.MemberId && !x.Fenced && x.Remaining > 0 && now < x.Terms.ExpiresAtUtc)).ToArray();
    }

    public async Task<(InventoryChange, FulfillmentProgressV1?, SalesStockCostedV1?)> ShipAsync(ShipStock command, ISalesStock sales, CancellationToken ct)
    {
        var current = await authority.AccessAsync(command.WorkspaceId, ct);
        var audit = await BeginAsync(current, command.OperationId, command, ct);
        var reservation = await sales.FindAsync(current.Scope, command.PermitId, ct) ?? throw new ResourceNotFoundException();
        var terms = reservation.Terms;
        var warehouse = await store.WarehouseAsync(current.Scope, terms.WarehouseId, ct) ?? throw new ResourceNotFoundException();
        if (warehouse.ReceiverId != current.MemberId) throw new AccessDeniedException();
        if (audit is not null) return (Result(audit), null, null);
        if (command.ExpectedRevision != reservation.Revision) throw new RevisionConflictException("The reservation changed.");
        var pool = await store.PoolAsync(current.Scope, terms.WarehouseId, terms.ItemId, ct) ?? throw new ResourceNotFoundException();
        var now = clock.GetUtcNow();
        var quantity = Parse(command.Quantity);
        var cost = reservation.Ship(pool, command.On, quantity, now);
        var movement = new StockMovement(Guid.CreateVersion7(), terms.TenantId, terms.WorkspaceId, terms.WarehouseId, terms.ItemId,
            reservation.Id, pool.Sequence, command.On, -quantity, -cost, now);
        store.Add(movement);
        return (Record(current, command.OperationId, command, movement.Id, reservation.Revision),
            SalesProgress(reservation), Costed(terms, movement));
    }

    public async Task<InventoryChange> AuthorizeSalesReturnAsync(AuthorizeSalesReturn command, ISalesStock sales, CancellationToken ct)
    {
        var current = await authority.AccessAsync(command.WorkspaceId, ct);
        if (!current.ApproveSales) throw new AccessDeniedException();
        var audit = await BeginAsync(current, command.OperationId, command, ct);
        if (audit is not null) return Result(audit);
        var original = await store.MovementAsync(current.Scope, command.MovementId, ct) ?? throw new ResourceNotFoundException();
        if (original.ReversesId is not null || await sales.FindAsync(current.Scope, original.PermitId, ct) is null)
            throw new ResourceNotFoundException();
        var pending = new StockReturn(original, current.MemberId, command.On, Parse(command.Quantity), command.Reason?.Trim() ?? "", sales: true);
        var returned = await sales.ReturnedAsync(current.Scope, original.Id, ct);
        var reserved = await store.PendingReturnsAsync(current.Scope, original.Id, ct);
        if (pending.Quantity > -original.Quantity - returned.Quantity - reserved)
            throw new StockRuleException("Return exceeds the original shipment.");
        store.Add(pending);
        return Record(current, command.OperationId, command, pending.Id, 1);
    }

    public async Task<(InventoryChange, SalesStockCostedV1?)> DecideSalesReturnAsync(DecideSalesReturn command, ISalesStock sales, CancellationToken ct)
    {
        var current = await authority.AccessAsync(command.WorkspaceId, ct);
        var audit = await BeginAsync(current, command.OperationId, command, ct);
        var pending = await store.ReturnAsync(current.Scope, command.ReturnId, ct) ?? throw new ResourceNotFoundException();
        if (!pending.IsSales) throw new ResourceNotFoundException();
        if (!command.Confirm)
        {
            if (!current.ApproveSales) throw new AccessDeniedException();
            if (audit is not null) return (Result(audit), null);
            pending.Cancel();
            return (Record(current, command.OperationId, command, pending.Id, 2), null);
        }

        var warehouse = await store.WarehouseAsync(current.Scope, pending.WarehouseId, ct) ?? throw new ResourceNotFoundException();
        if (warehouse.ReceiverId != current.MemberId) throw new AccessDeniedException();
        if (audit is not null) return (Result(audit), null);
        var original = await store.MovementAsync(current.Scope, pending.OriginalId, ct) ?? throw new ResourceNotFoundException();
        var reservation = await sales.FindAsync(current.Scope, original.PermitId, ct) ?? throw new ResourceNotFoundException();
        var terms = reservation.Terms;
        var pool = await store.PoolAsync(current.Scope, original.WarehouseId, original.ItemId, ct) ?? throw new ResourceNotFoundException();
        var previous = await sales.ReturnedAsync(current.Scope, original.Id, ct);
        var cost = Math.Round(original.Cost / original.Quantity * (previous.Quantity + pending.Quantity),
            terms.MinorUnits, MidpointRounding.AwayFromZero) - previous.Cost;
        var id = Guid.CreateVersion7();
        pending.Confirm(current.MemberId, id);
        pool.Restock(pending.Quantity, cost);
        var movement = new StockMovement(id, terms.TenantId, terms.WorkspaceId, terms.WarehouseId, terms.ItemId, reservation.Id,
            pool.Sequence, pending.On, pending.Quantity, cost, clock.GetUtcNow(), original.Id, pending.Reason);
        store.Add(movement);
        return (Record(current, command.OperationId, command, movement.Id, pool.Sequence), Costed(terms, movement));
    }

    private FulfillmentProgressV1 SalesProgress(SalesReservation reservation) => new(Guid.CreateVersion7(), reservation.Id,
        reservation.TenantId, reservation.WorkspaceId, reservation.Terms.OrderId, reservation.Revision,
        Format(reservation.Executed), reservation.Fenced, clock.GetUtcNow());

    private static SalesStockCostedV1 Costed(ShipmentTerms terms, StockMovement movement) => new(movement.Id, terms.TenantId,
        terms.WorkspaceId, terms.WarehouseId, terms.ItemId, terms.OrderId, terms.LineId, terms.PermitId, terms.CustomerId,
        movement.Sequence, movement.On, Format(movement.Quantity), Format(movement.Cost), terms.Currency, movement.OccurredAtUtc,
        Format(terms.UnitPrice), terms.ItemName, terms.CustomerName, movement.ReversesId);
}
