using Nexora.Finance.Application;
using Wolverine.Attributes;
using Wolverine.Persistence;

namespace Nexora.Finance.Infrastructure;

public static class TaxHandler
{
    [Transactional(Mode = TransactionMiddlewareMode.Eager)]
    public static Task<TaxCalendarView> Handle(SetTaxCalendar command, FinanceDbContext db, TaxFilings useCases, CancellationToken ct) =>
        useCases.ChangeCalendarAsync(command, ct);

    [Transactional(Mode = TransactionMiddlewareMode.Eager)]
    public static Task<TaxFilingView> Handle(RecordTaxFiling command, FinanceDbContext db, TaxFilings useCases, CancellationToken ct) =>
        useCases.RecordAsync(command, ct);

    [Transactional(Mode = TransactionMiddlewareMode.Eager)]
    public static Task<TaxChange> Handle(SetTaxRate command, FinanceDbContext db, TaxUseCases useCases, CancellationToken ct) =>
        useCases.SaveAsync(command, ct);

    [Transactional(Mode = TransactionMiddlewareMode.Eager)]
    public static Task<TaxChange> Handle(SetTaxGroup command, FinanceDbContext db, TaxUseCases useCases, CancellationToken ct) =>
        useCases.SaveAsync(command, ct);

    [Transactional(Mode = TransactionMiddlewareMode.Eager)]
    public static Task<TaxChange> Handle(ClassifyForTax command, FinanceDbContext db, TaxUseCases useCases, CancellationToken ct) =>
        useCases.ClassifyAsync(command, ct);

    [Transactional(Mode = TransactionMiddlewareMode.Eager)]
    public static Task<TaxSnapshot> Handle(AssessTax command, FinanceDbContext db, TaxUseCases useCases, CancellationToken ct) =>
        useCases.AssessAsync(command, ct);
}
