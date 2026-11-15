using System.Globalization;
using System.Security.Cryptography;
using System.Text.Json;
using Nexora.BuildingBlocks.Application;
using Nexora.Inventory.Domain;
using Nexora.Purchasing.Contracts;

namespace Nexora.Inventory.Application;

public sealed partial class InventoryUseCases(IInventoryAuthority authority, IStockStore store, TimeProvider clock)
{
    public async Task<WarehousesView> WarehousesAsync(Guid workspaceId, CancellationToken ct)
    {
        var current = await authority.AccessAsync(workspaceId, ct);
        var fullDirectory = current.Manage || current.ApprovePurchases || current.ApproveSales || current.ReadCompanyStock;
        var warehouses = await store.WarehousesAsync(current.Scope, fullDirectory ? null : current.MemberId, ct, current.StockWarehouses);
        return new(current.Manage, warehouses.Select(x => View(x, current)).ToArray());
    }

    public async Task<WarehouseView> ReferenceAsync(Guid workspaceId, Guid id, CancellationToken ct)
    {
        var current = await authority.AccessAsync(workspaceId, ct);
        return View(await RequireWarehouseAsync(current, id, true, ct, salesAccess: true, stockRead: true), current);
    }

    public async Task<ReceiptView[]> ReceiptsAsync(Guid workspaceId, Guid warehouseId, CancellationToken ct)
    {
        var current = await authority.AccessAsync(workspaceId, ct);
        await RequireWarehouseAsync(current, warehouseId, true, ct, stockRead: true);
        return (await store.ExecutionsAsync(current.Scope, warehouseId, ct)).Select(x =>
            new ReceiptView(Ticket(x.Terms), Format(x.Executed), Format(x.Cost), x.Fenced, x.Revision)).ToArray();
    }

    public async Task<PoolView[]> PoolsAsync(Guid workspaceId, Guid warehouseId, CancellationToken ct, PageWindow? page = null)
    {
        var current = await authority.AccessAsync(workspaceId, ct);
        await RequireWarehouseAsync(current, warehouseId, false, ct, stockRead: true);
        return (await store.PoolsAsync(current.Scope, warehouseId, ct, page)).Select(x =>
            new PoolView(x.ItemId, x.UnitId, x.Currency, Format(x.Quantity), Format(x.Value),
                Format(x.Quantity == 0 ? 0 : Math.Round(x.Value / x.Quantity, 6, MidpointRounding.AwayFromZero)), x.Sequence, Format(x.Reserved), Format(x.Available))).ToArray();
    }

    public async Task<MovementView[]> MovementsAsync(Guid workspaceId, Guid warehouseId, Guid? itemId, PageWindow page, CancellationToken ct)
    {
        var current = await authority.AccessAsync(workspaceId, ct);
        var warehouse = await RequireWarehouseAsync(current, warehouseId, true, ct, salesAccess: true, stockRead: true);
        var salesOnly = !current.Manage && !current.ApprovePurchases && warehouse.ReceiverId != current.MemberId
            && !current.CanReadStock(warehouseId);
        return (await store.MovementsAsync(current.Scope, warehouseId, itemId, page, salesOnly, ct)).Select(x =>
            new MovementView(x.Id, x.ItemId, x.PermitId, x.Sequence, x.On, Format(x.Quantity), Format(x.Cost), x.ReversesId)).ToArray();
    }

    public async Task<InventoryChange> AddAsync(AddWarehouse command, CancellationToken ct)
    {
        var current = await authority.AccessAsync(command.WorkspaceId, ct);
        if (!current.Manage) throw new AccessDeniedException();
        var receipt = await BeginAsync(current, command.OperationId, command, ct);
        if (receipt is not null) return Result(receipt);
        var warehouse = new Warehouse(current.Scope.TenantId, current.Scope.WorkspaceId, command.Code, command.Name);
        store.Add(warehouse);
        return Record(current, command.OperationId, command, warehouse.Id, warehouse.Version);
    }

    public async Task<InventoryChange> AssignAsync(AssignWarehouse command, CancellationToken ct)
    {
        var current = await authority.AccessAsync(command.WorkspaceId, ct);
        if (!current.Manage) throw new AccessDeniedException();
        var receipt = await BeginAsync(current, command.OperationId, command, ct);
        if (receipt is not null) return Result(receipt);
        var warehouse = await RequireWarehouseAsync(current, command.WarehouseId, false, ct);
        if (warehouse.Version != command.ExpectedVersion) throw new RevisionConflictException("Warehouse version changed.");
        if (command.MemberId is Guid member) await authority.DemandActiveMemberAsync(command.WorkspaceId, member, ct);
        warehouse.Assign(command.MemberId);
        return Record(current, command.OperationId, command, warehouse.Id, warehouse.Version);
    }

    private async Task<Warehouse> RequireWarehouseAsync(InventoryAccess access, Guid id, bool purchaseAccess, CancellationToken ct,
        bool salesAccess = false, bool stockRead = false)
    {
        var warehouse = await store.WarehouseAsync(access.Scope, id, ct) ?? throw new ResourceNotFoundException();
        if (!access.Manage && warehouse.ReceiverId != access.MemberId && !(purchaseAccess && access.ApprovePurchases) &&
            !(salesAccess && access.ApproveSales) && !(stockRead && access.CanReadStock(id)))
            throw new ResourceNotFoundException();
        return warehouse;
    }

    private async Task<InventoryAudit?> BeginAsync(InventoryAccess access, Guid operation, object input, CancellationToken ct)
    {
        if (operation == Guid.Empty) throw new ArgumentException("Operation identifier required.");
        await store.LockAsync(access.Scope, ct);
        var audit = await store.AuditAsync(access, operation, ct);
        if (audit is not null && audit.Fingerprint != Fingerprint(input)) throw new IdempotencyConflictException();
        return audit;
    }

    private InventoryChange Record(InventoryAccess access, Guid operation, object input, Guid id, long version)
    {
        store.Add(new InventoryAudit(Guid.CreateVersion7(), access.Scope.TenantId, access.Scope.WorkspaceId, access.Actor.Issuer,
            access.Actor.Subject, operation, Fingerprint(input), id, version, clock.GetUtcNow()));
        return new(id, version);
    }

    private ReceiptProgressV1 Progress(ReceiptExecution execution) => new(Guid.CreateVersion7(), execution.Id, execution.TenantId,
        execution.WorkspaceId, execution.Terms.OrderId, execution.Revision, Format(execution.Executed), execution.Fenced, clock.GetUtcNow());
    private static WarehouseView View(Warehouse x, InventoryAccess access) =>
        new(x.Id, x.Code, x.Name, access.Manage ? x.ReceiverId : null, x.Version, access.MemberId == x.ReceiverId,
            access.ApprovePurchases, access.ApproveSales, access.CanReadStock(x.Id));
    private static InventoryChange Result(InventoryAudit audit) => new(audit.TargetId, audit.ResultVersion);
    private static string Fingerprint(object input) => Convert.ToHexString(SHA256.HashData(JsonSerializer.SerializeToUtf8Bytes(input)));
    private static decimal Parse(string? text) => text is { Length: >= 1 and <= 26 }
        && decimal.TryParse(text, NumberStyles.AllowLeadingSign | NumberStyles.AllowDecimalPoint, CultureInfo.InvariantCulture, out var value)
        ? value : throw new ArgumentException("A decimal string is required.");
    private static string Format(decimal value) => value.ToString("0.######", CultureInfo.InvariantCulture);

    private static ReceiptTerms Terms(ReceiptTicketV1 ticket)
    {
        var quantity = Parse(ticket.Quantity);
        var price = Parse(ticket.UnitPrice);
        if (quantity is <= 0 or > 1_000_000m || Math.Round(quantity, 6) != quantity || price is <= 0 or > 10_000_000m
            || Math.Round(price, 6) != price || ticket.ApprovedVersion <= 0
            || ticket.Currency is not ("CNY" or "USD" or "EUR" or "JPY") || ticket.MinorUnits != (ticket.Currency == "JPY" ? 0 : 2))
            throw new ArgumentException("Invalid receipt ticket.");
        return new(ticket.TenantId, ticket.WorkspaceId, ticket.PermitId, ticket.OrderId, ticket.LineId, ticket.ApprovedVersion, ticket.WarehouseId,
            ticket.ItemId, ticket.UnitId, ticket.SupplierId, ticket.OrderDate, quantity, price, ticket.Currency, ticket.MinorUnits);
    }

    private static ReceiptTicketV1 Ticket(ReceiptTerms terms) => new(terms.TenantId, terms.WorkspaceId, terms.PermitId, terms.OrderId, terms.LineId,
        terms.ApprovedVersion, terms.WarehouseId, terms.ItemId, terms.UnitId, terms.SupplierId, terms.OrderDate,
        Format(terms.Quantity), Format(terms.UnitPrice), terms.Currency, terms.MinorUnits);
}
