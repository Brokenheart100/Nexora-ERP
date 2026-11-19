using Nexora.Finance.Application;
using Wolverine.Attributes;
using Wolverine.Persistence;

namespace Nexora.Finance.Infrastructure;

public static class LedgerHandler
{
    [Transactional(Mode = TransactionMiddlewareMode.Eager)]
    public static Task<PartnershipView> Handle(ConfigurePartnership command, FinanceDbContext db, Partnerships service, CancellationToken ct) =>
        service.ConfigureAsync(command, ct);

    [Transactional(Mode = TransactionMiddlewareMode.Eager)]
    public static Task<LedgerChange> Handle(ImportJournal command, FinanceDbContext db, LedgerUseCases useCases, CancellationToken ct) =>
        useCases.ImportAsync(command, ct);

    [Transactional(Mode = TransactionMiddlewareMode.Eager)]
    public static Task<LedgerChange[]> Handle(DecideImportedJournals command, FinanceDbContext db, LedgerUseCases useCases, CancellationToken ct) =>
        useCases.DecideImportedAsync(command, ct);

    [Transactional(Mode = TransactionMiddlewareMode.Eager)]
    public static Task<LedgerChange> Handle(StartJournal command, FinanceDbContext db, LedgerUseCases useCases, CancellationToken ct) =>
        useCases.StartAsync(command, ct);

    [Transactional(Mode = TransactionMiddlewareMode.Eager)]
    public static Task<LedgerChange> Handle(ImportOpeningBalances command, FinanceDbContext db, LedgerUseCases useCases, CancellationToken ct) =>
        useCases.ImportOpeningAsync(command, ct);
    [Transactional(Mode = TransactionMiddlewareMode.Eager)]
    public static Task<LedgerChange> Handle(EditJournal command, FinanceDbContext db, LedgerUseCases useCases, CancellationToken ct) =>
        useCases.EditAsync(command, ct);
    [Transactional(Mode = TransactionMiddlewareMode.Eager)]
    public static Task<LedgerChange> Handle(DecideJournal command, FinanceDbContext db, LedgerUseCases useCases, CancellationToken ct) =>
        useCases.DecideAsync(command, ct);
    [Transactional(Mode = TransactionMiddlewareMode.Eager)]
    public static Task<LedgerChange> Handle(ReverseJournal command, FinanceDbContext db, LedgerUseCases useCases, CancellationToken ct) =>
        useCases.ReverseAsync(command, ct);
    [Transactional(Mode = TransactionMiddlewareMode.Eager)]
    public static Task<PeriodChange> Handle(MoveFiscalPeriod command, FinanceDbContext db, LedgerUseCases useCases, CancellationToken ct) =>
        useCases.MoveAsync(command, ct);
    [Transactional(Mode = TransactionMiddlewareMode.Eager)]
    public static Task<JournalLinkChange> Handle(CreateJournalLink command, FinanceDbContext db, LedgerUseCases useCases, CancellationToken ct) =>
        useCases.CreateLinkAsync(command, ct);
    [Transactional(Mode = TransactionMiddlewareMode.Eager)]
    public static Task<JournalLinkChange> Handle(DeleteJournalLink command, FinanceDbContext db, LedgerUseCases useCases, CancellationToken ct) =>
        useCases.DeleteLinkAsync(command, ct);
}
