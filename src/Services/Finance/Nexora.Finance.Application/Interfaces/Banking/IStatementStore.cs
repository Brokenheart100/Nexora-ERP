using Nexora.BuildingBlocks.Application;
using Nexora.Finance.Domain;

namespace Nexora.Finance.Application;

public interface IStatementStore
{
    Task<BankImportPreview?> PreviewAsync(BookAccess access, Guid id, CancellationToken ct);
    Task<StatementLine[]> ExistingAsync(ResourceScope scope, Guid bankId, string[] ids, CancellationToken ct);
    Task<StatementLine[]> ListAsync(ResourceScope scope, Guid bankId, int page, CancellationToken ct);
    Task<StatementLine?> LineAsync(ResourceScope scope, Guid id, CancellationToken ct);
    Task<StatementMatch?> MatchAsync(ResourceScope scope, Guid id, CancellationToken ct);
    Task<StatementMatch[]> MatchesAsync(ResourceScope scope, Guid lineId, CancellationToken ct);
    void Add(BankImportPreview preview);
    void Add(StatementLine line);
    void Add(StatementMatch match);
}
