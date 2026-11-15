using Nexora.BuildingBlocks.Application;
using Nexora.Purchasing.Domain;

namespace Nexora.Purchasing.Application;

public sealed class PurchaseQueries(IPurchaseAuthority authority, IPurchaseOrders orders)
{
    public async Task<PurchaseList> PageAsync(Guid workspaceId, PageWindow page, CancellationToken ct)
    {
        var current = await ReadAccess(workspaceId, ct);
        var rows = await orders.PageAsync(current, page, ct);
        return new(current.HasPermission(PurchasePermissions.Create), current.HasPermission(PurchasePermissions.Approve), rows.Count > page.Size,
            rows.Take(page.Size).Select(Summary).ToArray());
    }

    public async Task<PurchaseDetail> DetailAsync(Guid workspaceId, Guid id, CancellationToken ct)
    {
        var current = await ReadAccess(workspaceId, ct);
        var order = await orders.GetAsync(current.Scope, id, ct) ?? throw new ResourceNotFoundException();
        if (!current.CanRead(order)) throw new ResourceNotFoundException();
        return new(Summary(order), order.SupplierId, order.SupplierCode, order.SupplierVersion, order.Note, order.MinorUnits,
            order.Lines.OrderBy(x => x.Ordinal).Select(x => new PurchaseLineView(x.Id, x.ItemId, x.ItemCode, x.ItemName, x.ItemVersion,
                x.UnitCode, x.UnitVersion, DecimalText.Format(x.Quantity), DecimalText.Format(x.UnitPrice), DecimalText.Format(x.Amount))).ToArray(),
            DecimalText.Format(order.Lines.Sum(x => x.Amount)), order.MadeBy(current.Actor), order.ApprovedVersion, order.ApprovedAtUtc);
    }

    private async Task<PurchaseAccess> ReadAccess(Guid workspaceId, CancellationToken ct)
    {
        var current = await authority.AccessAsync(workspaceId, ct);
        if (!current.HasPermission(PurchasePermissions.Read) && !current.HasPermission(PurchasePermissions.OwnRead)) throw new AccessDeniedException();
        return current;
    }

    private static PurchaseSummary Summary(PurchaseOrder order) =>
        new(order.Id, order.Number, order.On, order.Currency, order.SupplierName, order.State.ToString().ToLowerInvariant(), order.Version, order.DepartmentId);
}
