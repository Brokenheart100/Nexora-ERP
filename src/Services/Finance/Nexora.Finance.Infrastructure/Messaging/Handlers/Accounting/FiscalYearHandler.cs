using Nexora.Finance.Application;
using Wolverine.Attributes;
using Wolverine.Persistence;

namespace Nexora.Finance.Infrastructure;

public static class FiscalYearHandler
{
    [Transactional(Mode = TransactionMiddlewareMode.Eager)]
    public static Task<FiscalYearView> Handle(PrepareFiscalYear command, FinanceDbContext db, FiscalYearCloses service, CancellationToken ct) =>
        service.PrepareAsync(command, ct);

    [Transactional(Mode = TransactionMiddlewareMode.Eager)]
    public static Task<FiscalYearView> Handle(DecideFiscalYear command, FinanceDbContext db, FiscalYearCloses service, CancellationToken ct) =>
        service.DecideAsync(command, ct);
}
