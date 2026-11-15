using Nexora.Finance.Application;
using Wolverine.Attributes;
using Wolverine.Persistence;

namespace Nexora.Finance.Infrastructure;

public static class ReadinessHandler
{
    [Transactional(Mode = TransactionMiddlewareMode.Eager)]
    public static Task<BackfillResult> Handle(BackfillReadiness command, FinanceDbContext db, ReadinessUseCases useCases, CancellationToken ct) =>
        useCases.BackfillAsync(command, ct);
}
