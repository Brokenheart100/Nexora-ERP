using Nexora.BuildingBlocks.Application;
using Nexora.Finance.Domain;

namespace Nexora.Finance.Application;

public interface IBookAccess
{
    Task<BookAccess> DemandAsync(Guid workspaceId, bool initialize, CancellationToken cancellationToken);
}

public interface IBookStore
{
    Task<AccountingBook?> FindAsync(ResourceScope scope, CancellationToken cancellationToken);
    Task<IReadOnlyList<ChartAccount>> ListAccountsAsync(ResourceScope scope, CancellationToken cancellationToken);
    void Add(AccountingBook book, IReadOnlyList<ChartAccount> accounts);
}
