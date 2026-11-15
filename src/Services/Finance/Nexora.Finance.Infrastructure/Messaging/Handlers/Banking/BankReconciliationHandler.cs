using Nexora.Finance.Application;
using Wolverine.Attributes;
using Wolverine.Persistence;

namespace Nexora.Finance.Infrastructure;

public static class BankReconciliationHandler
{
    [Transactional(Mode = TransactionMiddlewareMode.Eager)]
    public static Task<ReconciliationView> Handle(PrepareReconciliation command, FinanceDbContext db,
        BankReconciliations service, CancellationToken ct) => service.PrepareAsync(command, ct);

    [Transactional(Mode = TransactionMiddlewareMode.Eager)]
    public static Task<ReconciliationView> Handle(DecideReconciliation command, FinanceDbContext db,
        BankReconciliations service, CancellationToken ct) => service.DecideAsync(command, ct);
}
