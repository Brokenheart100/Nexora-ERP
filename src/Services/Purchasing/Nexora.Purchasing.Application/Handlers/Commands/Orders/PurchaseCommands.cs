using System.Security.Cryptography;
using System.Text.Json;
using Nexora.BuildingBlocks.Application;
using Nexora.Purchasing.Domain;

namespace Nexora.Purchasing.Application;

public sealed class PurchaseCommands(IPurchaseAuthority authority, IPurchaseOrders orders, TimeProvider clock)
{
    public async Task<PurchaseChange> CreateAsync(CreatePurchase command, CancellationToken ct)
    {
        const string action = "purchase.created";
        var (current, receipt, fingerprint) = await BeginAsync(command.WorkspaceId, command.OperationId, PurchasePermissions.Create, action, command, ct);
        var departmentId = command.Draft?.DepartmentId;
        if (!current.Allows(PurchasePermissions.Create, departmentId)) throw new AccessDeniedException();
        if (departmentId is { } department && current.DepartmentIds?.Contains(department) != true)
            throw new ResourceNotFoundException();
        if (receipt is not null) return Replay(receipt);
        var draft = await ResolveAsync(current.Scope, command.Draft, ct);
        var order = PurchaseOrder.Start(current.Scope.TenantId, current.Scope.WorkspaceId, command.Number, draft.Terms,
            command.Draft!.On, draft.Supplier, draft.Lines, command.Draft.Note, current.Actor, clock.GetUtcNow(), departmentId);
        orders.Add(order);
        return Commit(current, command.OperationId, action, fingerprint, order);
    }

    public async Task<PurchaseChange> EditAsync(EditPurchase command, CancellationToken ct)
    {
        const string action = "purchase.edited";
        var (current, receipt, fingerprint) = await BeginAsync(command.WorkspaceId, command.OperationId, PurchasePermissions.Create, action, command, ct);
        if (receipt is not null) return await ReplayAsync(current, receipt, PurchasePermissions.Create, ct);
        var order = await LoadAsync(current, command.Id, PurchasePermissions.Create, command.ExpectedVersion, ct);
        if (command.Draft?.DepartmentId is { } department && department != order.DepartmentId)
            throw new ArgumentException("The order department is fixed when the draft is created.");
        var draft = await ResolveAsync(current.Scope, command.Draft, ct);
        order.Edit(draft.Terms, command.Draft!.On, draft.Supplier, draft.Lines, command.Draft.Note, current.Actor);
        return Commit(current, command.OperationId, action, fingerprint, order);
    }

    public async Task<PurchaseChange> DecideAsync(DecidePurchase command, CancellationToken ct)
    {
        var permission = command.Decision switch
        {
            "submit" or "withdraw" or "cancel" => PurchasePermissions.Submit,
            "approve" or "return" => PurchasePermissions.Approve,
            _ => throw new ArgumentException("Invalid purchase decision.")
        };
        var action = $"purchase.{command.Decision}";
        var (current, receipt, fingerprint) = await BeginAsync(command.WorkspaceId, command.OperationId, permission, action, command, ct);
        if (receipt is not null) return await ReplayAsync(current, receipt, permission, ct);
        var order = await LoadAsync(current, command.Id, permission, command.ExpectedVersion, ct);
        var reason = command.Reason?.Trim();
        if (reason?.Length > 300 || command.Decision is "cancel" or "return" && string.IsNullOrEmpty(reason))
            throw new ArgumentException("Provide a reason of up to 300 characters.");
        if (command.Decision is "submit" or "approve")
        {
            var supplier = await authority.SupplierAsync(current.Scope, order.SupplierId, ct);
            var stock = new Dictionary<Guid, StockReference>();
            foreach (var line in order.Lines)
                stock.Add(line.ItemId, await authority.StockAsync(current.Scope, line.ItemId, ct));
            order.VerifyReferences(supplier, stock);
        }
        switch (command.Decision)
        {
            case "submit": order.Submit(current.Actor); break;
            case "withdraw": order.Withdraw(current.Actor); break;
            case "approve": order.Approve(current.Actor, clock.GetUtcNow()); break;
            case "return": order.Return(current.Actor); break;
            case "cancel": order.CancelDraft(current.Actor); break;
        }
        return Commit(current, command.OperationId, action, fingerprint, order, reason);
    }

    private async Task<(PurchaseTerms Terms, SupplierReference Supplier, LineTerms[] Lines)> ResolveAsync(ResourceScope scope, PurchaseDraft? draft, CancellationToken ct)
    {
        if (draft?.Lines is not { Length: >= 1 and <= 50 } || draft.SupplierId == Guid.Empty
            || draft.Lines.Any(x => x is null || x.ItemId == Guid.Empty) || draft.Lines.Select(x => x.ItemId).Distinct().Count() != draft.Lines.Length)
            throw new ArgumentException("A supplier and one to fifty distinct stock items are required.");
        var inputs = draft.Lines.Select(x => (x.ItemId, Quantity: DecimalText.Parse(x.Quantity), Price: DecimalText.Parse(x.UnitPrice))).ToArray();
        var terms = await authority.TermsAsync(scope, ct);
        var supplier = await authority.SupplierAsync(scope, draft.SupplierId, ct);
        var lines = new List<LineTerms>();
        foreach (var input in inputs)
            lines.Add(new(await authority.StockAsync(scope, input.ItemId, ct), input.Quantity, input.Price));
        return (terms, supplier, lines.ToArray());
    }

    private async Task<PurchaseOrder> LoadAsync(PurchaseAccess current, Guid id, string permission, long version, CancellationToken ct)
    {
        var order = await orders.LockAsync(current.Scope, id, ct) ?? throw new ResourceNotFoundException();
        if (!current.Allows(permission, order.DepartmentId) ||
            !current.Allows(PurchasePermissions.Read, order.DepartmentId) && !order.MadeBy(current.Actor))
            throw new ResourceNotFoundException();
        if (order.Version != version) throw new RevisionConflictException("The purchase order version changed. Refresh and retry.");
        return order;
    }

    private async Task<(PurchaseAccess Access, PurchaseAudit? Audit, string Fingerprint)> BeginAsync(Guid workspaceId,
        Guid operationId, string permission, string action, object input, CancellationToken ct)
    {
        var current = await authority.AccessAsync(workspaceId, ct);
        if (!current.HasPermission(permission)) throw new AccessDeniedException();
        if (operationId == Guid.Empty) throw new ArgumentException("An operation identifier is required.");
        await orders.LockOperationAsync(current, operationId, ct);
        var fingerprint = Convert.ToHexString(SHA256.HashData(JsonSerializer.SerializeToUtf8Bytes(input)));
        var audit = await orders.FindOperationAsync(current, operationId, ct);
        if (audit is not null && (audit.Action != action || audit.Fingerprint != fingerprint)) throw new IdempotencyConflictException();
        return (current, audit, fingerprint);
    }

    private PurchaseChange Commit(PurchaseAccess current, Guid operation, string action, string fingerprint, PurchaseOrder order, string? reason = null)
    {
        orders.Add(new PurchaseAudit(Guid.CreateVersion7(), order.TenantId, order.WorkspaceId, order.Id,
            current.Actor.Issuer, current.Actor.Subject, operation, action, fingerprint, order.Version, reason, clock.GetUtcNow()));
        return new(order.Id, order.Version);
    }

    private static PurchaseChange Replay(PurchaseAudit audit) => new(audit.OrderId, audit.ResultVersion);

    private async Task<PurchaseChange> ReplayAsync(PurchaseAccess current, PurchaseAudit audit, string permission, CancellationToken ct)
    {
        var order = await orders.GetAsync(current.Scope, audit.OrderId, ct) ?? throw new ResourceNotFoundException();
        if (!current.Allows(permission, order.DepartmentId)) throw new ResourceNotFoundException();
        return Replay(audit);
    }
}
