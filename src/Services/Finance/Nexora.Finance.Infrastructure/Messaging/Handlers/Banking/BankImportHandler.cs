using Nexora.Finance.Application;
using Wolverine.Attributes;
using Wolverine.Persistence;

namespace Nexora.Finance.Infrastructure;

public static class BankImportHandler
{
    [Transactional(Mode = TransactionMiddlewareMode.Eager)]
    public static Task<BankPreviewView> Handle(PreviewBankImport command, FinanceDbContext db, BankImportUseCases service, CancellationToken ct) =>
        service.PreviewAsync(command, ct);
    [Transactional(Mode = TransactionMiddlewareMode.Eager)]
    public static Task<BankImportResult> Handle(CommitBankImport command, FinanceDbContext db, BankImportUseCases service, CancellationToken ct) =>
        service.CommitAsync(command, ct);
    [Transactional(Mode = TransactionMiddlewareMode.Eager)]
    public static Task<TradeChange> Handle(MatchStatement command, FinanceDbContext db, BankImportUseCases service, CancellationToken ct) =>
        service.MatchAsync(command, ct);
    [Transactional(Mode = TransactionMiddlewareMode.Eager)]
    public static Task<TradeChange> Handle(ReleaseMatch command, FinanceDbContext db, BankImportUseCases service, CancellationToken ct) =>
        service.ReleaseAsync(command, ct);
    [Transactional(Mode = TransactionMiddlewareMode.Eager)]
    public static Task<TradeChange> Handle(ExcludeStatement command, FinanceDbContext db, BankImportUseCases service, CancellationToken ct) =>
        service.ExcludeAsync(command, ct);
}
