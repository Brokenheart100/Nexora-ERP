using Nexora.BuildingBlocks.Application;
using Nexora.Sales.Domain;

namespace Nexora.Sales.Application;

public sealed class SalesQueries(ISalesAuthority authority, ISalesOrders orders)
{
    public async Task<SalesList> PageAsync(Guid workspaceId, PageWindow page, CancellationToken ct)
    {
        var current = await ReadAccess(workspaceId, ct);
        var rows = await orders.PageAsync(current, page, ct);
        return new(current.HasPermission(SalesPermissions.Create), current.HasPermission(SalesPermissions.Approve), rows.Count > page.Size,
            rows.Take(page.Size).Select(Summary).ToArray());
    }

    public async Task<SalesDetail> DetailAsync(Guid workspaceId, Guid id, CancellationToken ct)
    {
        var current = await ReadAccess(workspaceId, ct);
        var order = await orders.GetAsync(current.Scope, id, ct) ?? throw new ResourceNotFoundException();
        if (!current.CanRead(order)) throw new ResourceNotFoundException();
        return new(Summary(order), order.CustomerId, order.CustomerCode, order.CustomerVersion, order.Note, order.MinorUnits,
            order.Lines.OrderBy(x => x.Ordinal).Select(x => new SalesLineView(x.Id, x.ItemId, x.ItemCode, x.ItemName, x.ItemVersion,
                x.UnitCode, x.UnitVersion, DecimalText.Format(x.Quantity), DecimalText.Format(x.UnitPrice), DecimalText.Format(x.Amount))).ToArray(),
            DecimalText.Format(order.Lines.Sum(x => x.Amount)), order.MadeBy(current.Actor), order.ApprovedVersion, order.ApprovedAtUtc);
    }

    private async Task<SalesAccess> ReadAccess(Guid workspaceId, CancellationToken ct)
    {
        var current = await authority.AccessAsync(workspaceId, ct);
        if (!current.HasPermission(SalesPermissions.Read) && !current.HasPermission(SalesPermissions.OwnRead)) throw new AccessDeniedException();
        return current;
    }

    private static SalesSummary Summary(SalesOrder order) =>
        new(order.Id, order.Number, order.On, order.Currency, order.CustomerName, order.State.ToString().ToLowerInvariant(), order.Version, order.IsQuote, order.QuoteId, order.DepartmentId);
}
