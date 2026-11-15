using Nexora.Finance.Application;
using Wolverine.Attributes;

namespace Nexora.Finance.Infrastructure;

public static class InitializeBookHandler
{
    [Transactional]
    public static Task<BookView> Handle(InitializeBook command, FinanceDbContext db, BookUseCases useCases, CancellationToken ct) =>
        useCases.InitializeAsync(command, ct);
}
