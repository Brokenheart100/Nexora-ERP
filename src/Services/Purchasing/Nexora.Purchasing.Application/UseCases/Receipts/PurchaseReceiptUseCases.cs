using System.Security.Cryptography;
using System.Text.Json;
using Nexora.BuildingBlocks.Application;
using Nexora.Purchasing.Contracts;
using Nexora.Purchasing.Domain;

namespace Nexora.Purchasing.Application;

public sealed class PurchaseReceiptUseCases(IPurchaseAuthority authority, IPurchaseOrders orders, IPurchaseReceipts receipts, TimeProvider clock)
{
    public async Task<ReceiptAllowances> ListAsync(Guid workspaceId, Guid orderId, CancellationToken ct, PageWindow? page = null)
    {
        var current = await authority.AccessAsync(workspaceId, ct);
        var order = await orders.GetAsync(current.Scope, orderId, ct) ?? throw new ResourceNotFoundException();
        if (!current.CanRead(order))
            throw new ResourceNotFoundException();
        var permits = await receipts.ListAsync(current.Scope, orderId, ct, page);
        return new(current.Allows(PurchasePermissions.Approve, order.DepartmentId), permits.Select(x => new PermitView(x.Id, x.LineId, x.WarehouseId,
            DecimalText.Format(x.Quantity), DecimalText.Format(x.Executed), x.Revision, x.Fenced ? "cancelled"
                : x.Cancelling ? "cancelling" : x.Executed == x.Quantity ? "completed" : x.Revision == 0 ? "dispatching" : "issued")).ToArray());
    }

    public async Task<(PermitChange, ReceiptGrantedV1?)> IssueAsync(IssueReceiptPermit command, CancellationToken ct)
    {
        const string action = "receipt.issued";
        var (current, audit, fingerprint) = await BeginAsync(command.WorkspaceId, command.OperationId, action, command, ct);
        var order = await LoadAsync(current, command.OrderId, audit is null ? command.ExpectedVersion : (long?)null, ct);
        if (audit is not null) return (Replay(audit), null);
        var line = order.Lines.SingleOrDefault(x => x.Id == command.LineId) ?? throw new ResourceNotFoundException();
        await authority.DemandWarehouseAsync(current.Scope, command.WarehouseId, ct);
        var permits = await receipts.ListAsync(current.Scope, order.Id, ct);
        var permit = new ReceiptPermit(order, line, command.WarehouseId, DecimalText.Parse(command.Quantity),
            permits.Where(x => x.LineId == line.Id).Sum(x => x.Occupied));
        receipts.Add(permit);
        order.ReceiptsChanged(false);
        var result = Commit(current, command.OperationId, action, fingerprint, order, permit);
        return (result, new(Guid.CreateVersion7(), Ticket(order, line, permit), clock.GetUtcNow()));
    }

    public async Task<(PermitChange, ReceiptFenceV1?)> FenceAsync(FenceReceiptPermit command, CancellationToken ct)
    {
        const string action = "receipt.cancel-requested";
        var (current, audit, fingerprint) = await BeginAsync(command.WorkspaceId, command.OperationId, action, command, ct);
        var order = await LoadAsync(current, command.OrderId, audit is null ? command.ExpectedVersion : (long?)null, ct);
        if (audit is not null) return (Replay(audit), null);
        var reason = command.Reason?.Trim() ?? "";
        if (reason.Length is < 1 or > 300) throw new ArgumentException("A cancellation reason is required.");
        var permits = await receipts.ListAsync(current.Scope, order.Id, ct);
        var permit = permits.SingleOrDefault(x => x.Id == command.PermitId) ?? throw new ResourceNotFoundException();
        var line = order.Lines.Single(x => x.Id == permit.LineId);
        permit.RequestFence();
        order.ReceiptsChanged(false);
        var result = Commit(current, command.OperationId, action, fingerprint, order, permit, reason);
        return (result, new(Guid.CreateVersion7(), Ticket(order, line, permit), clock.GetUtcNow()));
    }

    public async Task ApplyAsync(ReceiptProgressV1 progress, CancellationToken ct)
    {
        var scope = new ResourceScope(progress.TenantId, progress.WorkspaceId);
        var order = await orders.LockAsync(scope, progress.OrderId, ct) ?? throw new ResourceNotFoundException();
        var permits = await receipts.ListAsync(scope, order.Id, ct);
        var permit = permits.SingleOrDefault(x => x.Id == progress.Id) ?? throw new ResourceNotFoundException();
        if (!permit.Advance(progress.Revision, DecimalText.Parse(progress.Executed), progress.Fenced)) return;
        var complete = order.Lines.All(line => permits.Where(x => x.LineId == line.Id).Sum(x => x.Executed) == line.Quantity);
        order.ReceiptsChanged(complete);
    }

    public async Task<PurchaseChange> CloseAsync(CloseReceiving command, CancellationToken ct)
    {
        const string action = "receipt.order-closed";
        var (current, audit, fingerprint) = await BeginAsync(command.WorkspaceId, command.OperationId, action, command, ct);
        var order = await LoadAsync(current, command.OrderId, audit is null ? command.ExpectedVersion : (long?)null, ct);
        if (audit is not null) return new(audit.OrderId, audit.ResultVersion);
        var reason = command.Reason?.Trim() ?? "";
        if (reason.Length is < 1 or > 300) throw new ArgumentException("A closing reason is required.");
        var permits = await receipts.ListAsync(current.Scope, order.Id, ct);
        order.CloseReceiving(permits.Any(x => x.Cancelling || (!x.Fenced && x.Executed < x.Quantity)));
        orders.Add(new PurchaseAudit(Guid.CreateVersion7(), order.TenantId, order.WorkspaceId, order.Id, current.Actor.Issuer,
            current.Actor.Subject, command.OperationId, action, fingerprint, order.Version, reason, clock.GetUtcNow()));
        return new(order.Id, order.Version);
    }

    private async Task<PurchaseOrder> LoadAsync(PurchaseAccess current, Guid id, long? version, CancellationToken ct)
    {
        var order = await orders.LockAsync(current.Scope, id, ct) ?? throw new ResourceNotFoundException();
        if (!current.CanRead(order) || !current.Allows(PurchasePermissions.Approve, order.DepartmentId))
            throw new ResourceNotFoundException();
        if (version is { } expected && order.Version != expected) throw new RevisionConflictException("The purchase order version changed.");
        return order;
    }

    private async Task<(PurchaseAccess, PurchaseAudit?, string)> BeginAsync(Guid workspace, Guid operation, string action, object input, CancellationToken ct)
    {
        var current = await authority.AccessAsync(workspace, ct);
        if (!current.HasPermission(PurchasePermissions.Approve)) throw new AccessDeniedException();
        if (operation == Guid.Empty) throw new ArgumentException("Operation identifier required.");
        await orders.LockOperationAsync(current, operation, ct);
        var fingerprint = Convert.ToHexString(SHA256.HashData(JsonSerializer.SerializeToUtf8Bytes(input)));
        var receipt = await orders.FindOperationAsync(current, operation, ct);
        if (receipt is not null && (receipt.Action != action || receipt.Fingerprint != fingerprint)) throw new IdempotencyConflictException();
        return (current, receipt, fingerprint);
    }

    private PermitChange Commit(PurchaseAccess access, Guid operation, string action, string fingerprint, PurchaseOrder order, ReceiptPermit permit,
        string? reason = null)
    {
        orders.Add(new PurchaseAudit(Guid.CreateVersion7(), order.TenantId, order.WorkspaceId, order.Id, access.Actor.Issuer,
            access.Actor.Subject, operation, action, fingerprint, order.Version, reason, clock.GetUtcNow(), permit.Id));
        return new(permit.Id, order.Version);
    }

    private static PermitChange Replay(PurchaseAudit audit) => new(audit.TargetId!.Value, audit.ResultVersion);
    private static ReceiptTicketV1 Ticket(PurchaseOrder order, PurchaseOrderLine line, ReceiptPermit permit) =>
        new(order.TenantId, order.WorkspaceId, permit.Id, order.Id, line.Id, order.ApprovedVersion!.Value, permit.WarehouseId,
            line.ItemId, line.UnitId, order.SupplierId, order.On, DecimalText.Format(permit.Quantity), DecimalText.Format(line.UnitPrice),
            order.Currency, order.MinorUnits);
}
