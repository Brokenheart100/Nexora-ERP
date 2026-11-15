using Nexora.BuildingBlocks.Application;
using Nexora.Sales.Domain;

namespace Nexora.Sales.Application;

public sealed class SalesCommands(ISalesAuthority authority, ISalesOrders orders, TimeProvider clock)
{
    public async Task<SalesChange> CreateAsync(CreateSales command, CancellationToken ct)
    {
        const string action = "sales.created";
        var (current, fulfillment, fingerprint) = await BeginAsync(command.WorkspaceId, command.OperationId, SalesPermissions.Create, action, command, ct);
        var departmentId = command.Draft?.DepartmentId;
        if (!current.Allows(SalesPermissions.Create, departmentId)) throw new AccessDeniedException();
        if (departmentId is { } department && current.DepartmentIds?.Contains(department) != true)
            throw new ResourceNotFoundException();
        if (fulfillment is not null) return Replay(fulfillment);
        var draft = await ResolveAsync(current.Scope, command.Draft, ct);
        var order = SalesOrder.Start(current.Scope.TenantId, current.Scope.WorkspaceId, command.Number, draft.Terms,
            command.Draft!.On, draft.Customer, draft.Lines, command.Draft.Note, current.Actor, clock.GetUtcNow(), command.IsQuote, departmentId);
        orders.Add(order);
        return Commit(current, command.OperationId, action, fingerprint, order);
    }

    public async Task<SalesChange> ConvertAsync(ConvertQuote command, CancellationToken ct)
    {
        const string action = "sales.quote-converted";
        var (current, audit, fingerprint) = await BeginAsync(command.WorkspaceId, command.OperationId, SalesPermissions.Create, action, command, ct);
        if (audit is not null) return await ReplayAsync(current, audit, SalesPermissions.Create, ct);
        var quote = await LoadAsync(current, command.Id, SalesPermissions.Create, command, ct);
        var order = quote.ConvertToOrder(command.OrderNumber, current.Actor, clock.GetUtcNow());
        orders.Add(order);
        return Commit(current, command.OperationId, action, fingerprint, order);
    }

    public async Task<SalesChange> EditAsync(EditSales command, CancellationToken ct)
    {
        const string action = "sales.edited";
        var (current, fulfillment, fingerprint) = await BeginAsync(command.WorkspaceId, command.OperationId, SalesPermissions.Create, action, command, ct);
        if (fulfillment is not null) return await ReplayAsync(current, fulfillment, SalesPermissions.Create, ct);
        var order = await LoadAsync(current, command.Id, SalesPermissions.Create, command, ct);
        if (command.Draft?.DepartmentId is { } department && department != order.DepartmentId)
            throw new ArgumentException("The order department is fixed when the draft is created.");
        var draft = await ResolveAsync(current.Scope, command.Draft, ct);
        order.Edit(draft.Terms, command.Draft!.On, draft.Customer, draft.Lines, command.Draft.Note, current.Actor);
        return Commit(current, command.OperationId, action, fingerprint, order);
    }

    public async Task<SalesChange> DecideAsync(DecideSales command, CancellationToken ct)
    {
        var permission = command.Decision switch
        {
            "submit" or "withdraw" or "cancel" or "issue-quote" => SalesPermissions.Submit,
            "approve" or "return" => SalesPermissions.Approve,
            _ => throw new ArgumentException("Invalid sales decision.")
        };
        var action = $"sales.{command.Decision}";
        var (current, fulfillment, fingerprint) = await BeginAsync(command.WorkspaceId, command.OperationId, permission, action, command, ct);
        if (fulfillment is not null) return await ReplayAsync(current, fulfillment, permission, ct);
        var order = await LoadAsync(current, command.Id, permission, command, ct);
        var reason = command.Reason?.Trim();
        if (reason?.Length > 300 || command.Decision is "cancel" or "return" && string.IsNullOrEmpty(reason))
            throw new ArgumentException("Provide a reason of up to 300 characters.");
        if (command.Decision is "submit" or "approve" or "issue-quote")
        {
            var customer = await authority.CustomerAsync(current.Scope, order.CustomerId, ct);
            var stock = new Dictionary<Guid, StockReference>();
            foreach (var line in order.Lines)
                stock.Add(line.ItemId, await authority.StockAsync(current.Scope, line.ItemId, ct));
            order.VerifyReferences(customer, stock);
        }
        switch (command.Decision)
        {
            case "issue-quote": order.IssueQuote(current.Actor); break;
            case "submit": order.Submit(current.Actor); break;
            case "withdraw": order.Withdraw(current.Actor); break;
            case "approve": order.Approve(current.Actor, clock.GetUtcNow()); break;
            case "return": order.Return(current.Actor); break;
            case "cancel": order.CancelDraft(current.Actor); break;
        }
        return Commit(current, command.OperationId, action, fingerprint, order, reason);
    }

    private async Task<(SalesTerms Terms, CustomerReference Customer, LineTerms[] Lines)> ResolveAsync(ResourceScope scope, SalesDraft? draft, CancellationToken ct)
    {
        if (draft?.Lines is not { Length: >= 1 and <= 50 } || draft.CustomerId == Guid.Empty
            || draft.Lines.Any(x => x is null || x.ItemId == Guid.Empty) || draft.Lines.Select(x => x.ItemId).Distinct().Count() != draft.Lines.Length)
            throw new ArgumentException("A customer and one to fifty distinct stock items are required.");
        var inputs = draft.Lines.Select(x => (x.ItemId, Quantity: DecimalText.Parse(x.Quantity), Price: DecimalText.Parse(x.UnitPrice))).ToArray();
        var terms = await authority.TermsAsync(scope, ct);
        var customer = await authority.CustomerAsync(scope, draft.CustomerId, ct);
        var lines = new List<LineTerms>();
        foreach (var input in inputs)
            lines.Add(new(await authority.StockAsync(scope, input.ItemId, ct), input.Quantity, input.Price));
        return (terms, customer, lines.ToArray());
    }

    private async Task<SalesOrder> LoadAsync(SalesAccess current, Guid id, string permission, ISalesOrderMutation command, CancellationToken ct)
    {
        var order = await orders.LockAsync(current.Scope, id, ct) ?? throw new ResourceNotFoundException();
        if (!current.Allows(permission, order.DepartmentId) ||
            !current.Allows(SalesPermissions.Read, order.DepartmentId) && !order.MadeBy(current.Actor))
            throw new ResourceNotFoundException();
        SalesOrderCondition.Check(order, current.Actor, command.ExpectedVersion, command.Condition);
        return order;
    }

    private async Task<(SalesAccess Access, SalesAudit? Audit, string Fingerprint)> BeginAsync(Guid workspaceId,
        Guid operationId, string permission, string action, object input, CancellationToken ct)
    {
        var current = await authority.AccessAsync(workspaceId, ct);
        if (!current.HasPermission(permission)) throw new AccessDeniedException();
        if (operationId == Guid.Empty) throw new ArgumentException("An operation identifier is required.");
        await orders.LockOperationAsync(current, operationId, ct);
        var fingerprint = SalesOperationFingerprint.Compute(input);
        var audit = await orders.FindOperationAsync(current, operationId, ct);
        if (audit is not null && (audit.Action != action || audit.Fingerprint != fingerprint)) throw new IdempotencyConflictException();
        return (current, audit, fingerprint);
    }

    private SalesChange Commit(SalesAccess current, Guid operation, string action, string fingerprint, SalesOrder order, string? reason = null)
    {
        orders.Add(new SalesAudit(Guid.CreateVersion7(), order.TenantId, order.WorkspaceId, order.Id,
            current.Actor.Issuer, current.Actor.Subject, operation, action, fingerprint, order.Version, reason, clock.GetUtcNow()));
        return new(order.Id, order.Version);
    }

    private static SalesChange Replay(SalesAudit audit) => new(audit.OrderId, audit.ResultVersion);

    private async Task<SalesChange> ReplayAsync(SalesAccess current, SalesAudit audit, string permission, CancellationToken ct)
    {
        var order = await orders.GetAsync(current.Scope, audit.OrderId, ct) ?? throw new ResourceNotFoundException();
        if (!current.Allows(permission, order.DepartmentId)) throw new ResourceNotFoundException();
        return Replay(audit);
    }
}
