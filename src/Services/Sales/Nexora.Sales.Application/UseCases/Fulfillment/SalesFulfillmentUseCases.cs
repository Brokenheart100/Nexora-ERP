using Nexora.BuildingBlocks.Application;
using Nexora.Sales.Contracts;
using Nexora.Sales.Domain;

namespace Nexora.Sales.Application;

public sealed class SalesFulfillmentUseCases(ISalesAuthority authority, ISalesOrders orders, ISalesFulfillments fulfillments, TimeProvider clock)
{
    public async Task<FulfillmentAllowances> ListAsync(Guid workspaceId, Guid orderId, CancellationToken ct, PageWindow? page = null)
    {
        var current = await authority.AccessAsync(workspaceId, ct);
        var order = await orders.GetAsync(current.Scope, orderId, ct) ?? throw new ResourceNotFoundException();
        if (!current.CanRead(order))
            throw new ResourceNotFoundException();
        var permits = await fulfillments.ListAsync(current.Scope, orderId, ct, page);
        return new(current.Allows(SalesPermissions.Approve), permits.Select(x => new PermitView(x.Id, x.LineId, x.WarehouseId,
            DecimalText.Format(x.Quantity), DecimalText.Format(x.Executed), x.Revision, x.Fenced ? "cancelled"
                : x.Cancelling ? "cancelling" : x.Executed == x.Quantity ? "completed" : x.Revision == 0 ? "dispatching" : "reserved", x.ExpiresAtUtc, x.BatchId)).ToArray());
    }

    public async Task<(FulfillmentBatchChange, FulfillmentGrantedV1?)> IssueAsync(IssueFulfillmentPermit command, CancellationToken ct)
    {
        const string action = "fulfillment.issued";
        var (current, audit, fingerprint) = await BeginAsync(command.WorkspaceId, command.OperationId, action, command, ct);
        if (audit is not null)
        {
            var issued = await fulfillments.ListAsync(current.Scope, audit.OrderId, ct);
            return (new(audit.TargetId!.Value, issued.Where(x => x.BatchId == audit.TargetId).Select(x => x.Id).Order().ToArray(), audit.ResultVersion), null);
        }
        var order = await LoadAsync(current, command.OrderId, command, ct);
        var permits = await fulfillments.ListAsync(current.Scope, order.Id, ct);
        if (command.Lines is not { Length: >= 1 and <= 50 } || command.Lines.Any(x => x is null)
            || command.Lines.Select(x => x.LineId).Distinct().Count() != command.Lines.Length)
            throw new ArgumentException("Choose one to fifty distinct fulfillment lines.");
        if (command.HoldSeconds is < 5 or > 86400) throw new ArgumentException("Reserve for five seconds to one day.");
        await authority.DemandWarehouseAsync(current.Scope, command.WarehouseId, ct);
        var now = clock.GetUtcNow();
        var batch = Guid.CreateVersion7();
        var tickets = new List<FulfillmentTicketV1>();
        foreach (var input in command.Lines)
        {
            var line = order.Lines.SingleOrDefault(x => x.Id == input.LineId) ?? throw new ResourceNotFoundException();
            var permit = new FulfillmentPermit(order, line, command.WarehouseId, DecimalText.Parse(input.Quantity),
                permits.Where(x => x.LineId == line.Id).Sum(x => x.Occupied), now.AddSeconds(command.HoldSeconds), batch);
            fulfillments.Add(permit);
            tickets.Add(Ticket(order, line, permit));
        }
        order.FulfillmentsChanged(false);
        orders.Add(new SalesAudit(Guid.CreateVersion7(), order.TenantId, order.WorkspaceId, order.Id, current.Actor.Issuer,
            current.Actor.Subject, command.OperationId, action, fingerprint, order.Version, null, now, batch));
        return (new(batch, tickets.Select(x => x.PermitId).Order().ToArray(), order.Version), new(Guid.CreateVersion7(), tickets.ToArray(), now));
    }

    public async Task<(PermitChange, FulfillmentFenceV1?)> FenceAsync(FenceFulfillmentPermit command, CancellationToken ct)
    {
        const string action = "fulfillment.cancel-requested";
        var (current, audit, fingerprint) = await BeginAsync(command.WorkspaceId, command.OperationId, action, command, ct);
        if (audit is not null) return (Replay(audit), null);
        var reason = command.Reason?.Trim() ?? "";
        if (reason.Length is < 1 or > 300) throw new ArgumentException("A cancellation reason is required.");
        var order = await LoadAsync(current, command.OrderId, command, ct);
        var permits = await fulfillments.ListAsync(current.Scope, order.Id, ct);
        var permit = permits.SingleOrDefault(x => x.Id == command.PermitId) ?? throw new ResourceNotFoundException();
        var line = order.Lines.Single(x => x.Id == permit.LineId);
        permit.RequestFence();
        order.FulfillmentsChanged(false);
        var result = Commit(current, command.OperationId, action, fingerprint, order, permit, reason);
        return (result, new(Guid.CreateVersion7(), Ticket(order, line, permit), clock.GetUtcNow()));
    }

    public async Task ApplyAsync(FulfillmentProgressV1 progress, CancellationToken ct)
    {
        var scope = new ResourceScope(progress.TenantId, progress.WorkspaceId);
        var order = await orders.LockAsync(scope, progress.OrderId, ct) ?? throw new ResourceNotFoundException();
        var permits = await fulfillments.ListAsync(scope, order.Id, ct);
        var permit = permits.SingleOrDefault(x => x.Id == progress.Id) ?? throw new ResourceNotFoundException();
        if (!permit.Advance(progress.Revision, DecimalText.Parse(progress.Executed), progress.Fenced)) return;
        var complete = order.Lines.All(line => permits.Where(x => x.LineId == line.Id).Sum(x => x.Executed) == line.Quantity);
        order.FulfillmentsChanged(complete);
    }

    public async Task<SalesChange> CloseAsync(CloseFulfilling command, CancellationToken ct)
    {
        const string action = "fulfillment.order-closed";
        var (current, audit, fingerprint) = await BeginAsync(command.WorkspaceId, command.OperationId, action, command, ct);
        if (audit is not null) return new(audit.OrderId, audit.ResultVersion);
        var reason = command.Reason?.Trim() ?? "";
        if (reason.Length is < 1 or > 300) throw new ArgumentException("A closing reason is required.");
        var order = await LoadAsync(current, command.OrderId, command, ct);
        var permits = await fulfillments.ListAsync(current.Scope, order.Id, ct);
        order.CloseFulfilling(permits.Any(x => x.Cancelling || (!x.Fenced && x.Executed < x.Quantity)));
        orders.Add(new SalesAudit(Guid.CreateVersion7(), order.TenantId, order.WorkspaceId, order.Id, current.Actor.Issuer,
            current.Actor.Subject, command.OperationId, action, fingerprint, order.Version, reason, clock.GetUtcNow()));
        return new(order.Id, order.Version);
    }

    private async Task<SalesOrder> LoadAsync(SalesAccess access, Guid id, ISalesOrderMutation command, CancellationToken ct)
    {
        var order = await orders.LockAsync(access.Scope, id, ct) ?? throw new ResourceNotFoundException();
        SalesOrderCondition.Check(order, access.Actor, command.ExpectedVersion, command.Condition);
        return order;
    }

    private async Task<(SalesAccess, SalesAudit?, string)> BeginAsync(Guid workspace, Guid operation, string action, object input, CancellationToken ct)
    {
        var current = await authority.AccessAsync(workspace, ct);
        current.Demand(SalesPermissions.Approve);
        if (operation == Guid.Empty) throw new ArgumentException("Operation identifier required.");
        await orders.LockOperationAsync(current, operation, ct);
        var fingerprint = SalesOperationFingerprint.Compute(input);
        var fulfillment = await orders.FindOperationAsync(current, operation, ct);
        if (fulfillment is not null && (fulfillment.Action != action || fulfillment.Fingerprint != fingerprint)) throw new IdempotencyConflictException();
        return (current, fulfillment, fingerprint);
    }

    private PermitChange Commit(SalesAccess access, Guid operation, string action, string fingerprint, SalesOrder order, FulfillmentPermit permit,
        string? reason = null)
    {
        orders.Add(new SalesAudit(Guid.CreateVersion7(), order.TenantId, order.WorkspaceId, order.Id, access.Actor.Issuer,
            access.Actor.Subject, operation, action, fingerprint, order.Version, reason, clock.GetUtcNow(), permit.Id));
        return new(permit.Id, order.Version);
    }

    private static PermitChange Replay(SalesAudit audit) => new(audit.TargetId!.Value, audit.ResultVersion);
    private static FulfillmentTicketV1 Ticket(SalesOrder order, SalesOrderLine line, FulfillmentPermit permit) =>
        new(order.TenantId, order.WorkspaceId, permit.Id, order.Id, line.Id, order.ApprovedVersion!.Value, permit.WarehouseId,
            line.ItemId, line.UnitId, order.CustomerId, order.On, DecimalText.Format(permit.Quantity), DecimalText.Format(line.UnitPrice),
            order.Currency, order.MinorUnits, permit.ExpiresAtUtc, line.ItemName, order.CustomerName);
}
