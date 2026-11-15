using Nexora.BuildingBlocks.Application;
using Nexora.Finance.Domain;

namespace Nexora.Finance.Application;

public sealed class TradeAccess(IBookAccess authority, IBookStore books, IChartStore chart)
{
    public async Task<(BookAccess, AccountingBook)> ReadAsync(Guid workspace, CancellationToken ct)
    {
        var current = await authority.DemandAsync(workspace, false, ct);
        current.Demand(LedgerPermissions.Read);
        var book = await books.FindAsync(current.Scope, ct) ?? throw new ResourceNotFoundException();
        return (current, book);
    }

    public async Task<(BookAccess, AccountingBook)> LockAsync(Guid workspace, string permission, CancellationToken ct)
    {
        var current = await authority.DemandAsync(workspace, false, ct);
        current.Demand(permission);
        var book = await chart.LockBookAsync(current.Scope, ct) ?? throw new ResourceNotFoundException();
        return (current, book);
    }
}
